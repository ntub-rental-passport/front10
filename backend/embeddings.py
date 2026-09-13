"""向量檢索用的 embedding：桌機在線時用組員的模型，不在線時退回 NVIDIA。

## 兩個來源

    local   桌機上的 embedding 服務，跑組員建庫時用的
            shibing624/text2vec-base-chinese（768 維）
    nvidia  雲端 API，nvidia/nemotron-3-embed-1b（2048 維）

順序由 EMBEDDING_PROVIDER 決定，預設 "nvidia"（不必架桌機就能跑）。
桌機架好後改成 "local,nvidia"。

為什麼要 local：組員花時間建的向量庫用的是那個模型。要讓那份成果
真的被用到，查詢就得用同一個模型。但桌機會關機，所以不能只有它。

## ⚠️ 絕對不能混用向量空間

不同模型產生的向量在不同的語意空間。拿 A 模型的查詢向量去比對
B 模型的語料向量，餘弦相似度是**沒有意義的亂數** —— 而且不會報錯，
只會安靜地檢索到錯的法條。這比檢索失敗糟得多，因為看起來正常。

所以：

    1. 語料的每個空間各存一份向量（law_corpus.json 的 embeddings 欄位）
    2. 用哪個 provider 查詢，就比對哪一份
    3. 空間記下建立時的模型名稱，與查詢時的模型不符就停用該空間
       （law_corpus.py 在載入時就檢查，不等到查詢才發現）
    4. 桌機回報的模型與設定不符時，這一次呼叫視為失敗

第 3、4 點是各自獨立的兩道 —— 一道防「改了設定忘記重建語料」，
一道防「桌機上載入的其實是別的模型」。

## 模型選擇的實測依據

2026-09-09 用 5 個真實租客提問測試 4 個 NVIDIA 候選模型：

    nvidia/nemotron-3-embed-1b          5/5 命中（維度 2048）
    nvidia/llama-3.2-nv-embedqa-1b-v1   404，端點叫不動
    nvidia/nv-embedqa-mistral-7b-v2     404
    snowflake/arctic-embed-l            404

「列在模型清單上」不等於「這個端點可用」—— 這是第二次遇到
（先前 moonshotai/kimi-k2.6 的 chat 端點也是 404）。

## query 與 passage 要分開

NVIDIA 這類模型的慣例：查詢與被檢索文件使用不同的 input_type，
向量空間帶有不同偏置，混用會讓相似度失準。
text2vec-base-chinese 是對稱模型，兩者同樣處理（見 desktop/proxy.py）。
"""

import logging
import os

import httpx

import upstream_state
from http_retry import with_retry

logger = logging.getLogger(__name__)

NVIDIA = "nvidia"
LOCAL = "local"
PROVIDERS = (LOCAL, NVIDIA)

NVIDIA_MODEL_DEFAULT = "nvidia/nemotron-3-embed-1b"
# 組員建 rag/rental_law_db 時用的模型。改這個就必須重建語料向量。
LOCAL_MODEL_DEFAULT = "shibing624/text2vec-base-chinese"

# 冷卻機制用的名稱（見 upstream_state.py）
_LOCAL_ENDPOINT = "embedding:local"


class EmbeddingUnavailable(RuntimeError):
    """無法取得向量。呼叫端應換下一個 provider，全部失敗則退回「全部給」。"""


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def provider_order() -> list[str]:
    """嘗試順序。預設只有 nvidia —— 桌機是加分項，不是必要條件。"""
    raw = _env("EMBEDDING_PROVIDER", NVIDIA)
    names = [n.strip().lower() for n in raw.split(",") if n.strip()]
    order = [n for n in names if n in PROVIDERS]
    if len(order) != len(names):
        unknown = [n for n in names if n not in PROVIDERS]
        logger.warning("EMBEDDING_PROVIDER 有不認得的值 %s，已忽略", unknown)
    return order or [NVIDIA]


def model_for(provider: str) -> str:
    """該 provider 查詢時會用的模型名稱。

    law_corpus.py 拿這個跟語料記錄的模型比對 ——
    不符就停用該空間，而不是算出亂數相似度。
    """
    if provider == LOCAL:
        return _env("LOCAL_EMBEDDING_MODEL", LOCAL_MODEL_DEFAULT)
    return _env("EMBEDDING_MODEL", NVIDIA_MODEL_DEFAULT)


def _local_base() -> str:
    """桌機 embedding 服務的網址。

    預設沿用 LLM_TUNNEL_URL：生成與檢索走的是同一台桌機、同一個代理、
    同一條隧道，分成兩個變數只會多一個打錯的機會。
    真要分開時才設 LOCAL_EMBEDDING_URL。

    最後才退到 OLLAMA_URL，那是本機開發用的（VM 上那個是 OCR 在用，
    指向別的地方，見 llm_provider.ollama_base 的說明）。
    """
    return _env("LOCAL_EMBEDDING_URL") or _env("LLM_TUNNEL_URL") or _env("OLLAMA_URL")


def is_configured(provider: str) -> bool:
    """有沒有設定到可以嘗試的程度。沒設定就直接跳過，不算一次失敗。"""
    if provider == LOCAL:
        return bool(_local_base())
    return bool(_env("NVIDIA_API_KEY"))


def _tunnel_headers() -> dict[str, str]:
    """走隧道到桌機時的兩道憑證。

    與 llm_provider.py 完全相同的一組 —— 同一個代理、同一把鑰匙。
      CF-Access-*：Cloudflare 在邊緣就驗，沒帶的請求進不到家裡的網路
      X-API-Key  ：桌機端代理的第二道，Access 設定被改壞時仍擋得住
    """
    headers: dict[str, str] = {}
    if api_key := _env("LLM_TUNNEL_API_KEY"):
        headers["X-API-Key"] = api_key
    cf_id, cf_secret = _env("CF_ACCESS_CLIENT_ID"), _env("CF_ACCESS_CLIENT_SECRET")
    if cf_id and cf_secret:
        headers["CF-Access-Client-Id"] = cf_id
        headers["CF-Access-Client-Secret"] = cf_secret
    return headers


def _parse_vectors(payload: dict) -> list[list[float]]:
    """解析回應。兩邊都用 OpenAI 的 data[].embedding 形狀。"""
    data = payload.get("data") or []
    vectors = [item.get("embedding") for item in data if isinstance(item, dict)]
    if not vectors or any(not v for v in vectors):
        raise EmbeddingUnavailable("回應沒有向量")
    return vectors


async def _embed_local(
    texts: list[str], *, input_type: str, timeout: float
) -> list[list[float]]:
    """打桌機上的 embedding 服務。

    **不重試**（attempts=1）：桌機關機的話，一秒內重試三次還是關機，
    只是把使用者的等待時間變三倍。連不上就記冷卻、換下一個 provider。
    """
    base = _local_base().rstrip("/")
    if not base:
        raise EmbeddingUnavailable("未設定 LOCAL_EMBEDDING_URL / OLLAMA_URL")
    if upstream_state.is_cooling(_LOCAL_ENDPOINT):
        raise EmbeddingUnavailable(
            f"桌機 embedding 冷卻中（還有 {upstream_state.remaining(_LOCAL_ENDPOINT):.0f} 秒）"
        )

    expected_model = model_for(LOCAL)

    async def send() -> list[list[float]]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=5)) as client:
            response = await client.post(
                f"{base}/embed",
                json={"input": texts, "input_type": input_type},
                headers=_tunnel_headers(),
            )
            if response.status_code in (401, 403):
                # 設定問題，不是桌機關機。單獨標示，否則會被誤判。
                logger.error("桌機 embedding 拒絕存取（%s）：檢查 Access service token 與 API key",
                             response.status_code)
            response.raise_for_status()
            payload = response.json()

            # 桌機上實際載入的模型必須與設定相符。
            # 不符的話向量空間就不是語料那個空間 —— 算出來會是亂數。
            reported = str(payload.get("model") or "").strip()
            if reported and reported != expected_model:
                raise EmbeddingUnavailable(
                    f"桌機載入的是 {reported}，設定要求 {expected_model}"
                )
            return _parse_vectors(payload)

    try:
        vectors = await with_retry(send, label="Embedding(local)", attempts=1)
    except (httpx.ConnectError, httpx.ConnectTimeout) as error:
        upstream_state.mark_unreachable(_LOCAL_ENDPOINT)
        raise EmbeddingUnavailable("桌機 embedding 連不上") from error
    upstream_state.mark_reachable(_LOCAL_ENDPOINT)
    return vectors


async def _embed_nvidia(
    texts: list[str], *, input_type: str, timeout: float
) -> list[list[float]]:
    api_key = _env("NVIDIA_API_KEY")
    if not api_key:
        raise EmbeddingUnavailable("未設定 NVIDIA_API_KEY")
    base = _env("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    model = model_for(NVIDIA)

    async def send() -> list[list[float]]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=10)) as client:
            response = await client.post(
                f"{base}/embeddings",
                json={
                    "input": texts,
                    "model": model,
                    "input_type": input_type,
                    "encoding_format": "float",
                    # 合約可能很長，超過模型上限時從尾端截斷而非報錯
                    "truncate": "END",
                },
                headers={"Authorization": f"Bearer {api_key}"},
            )
            response.raise_for_status()
            return _parse_vectors(response.json())

    return await with_retry(send, label="Embedding(nvidia)")


_IMPL = {LOCAL: _embed_local, NVIDIA: _embed_nvidia}


async def embed_texts(
    texts: list[str],
    *,
    input_type: str,
    timeout: float = 30.0,
    provider: str = NVIDIA,
) -> list[list[float]]:
    """把文字轉成向量。

    provider 必須明確指定 —— 呼叫端要知道自己拿到的是哪個空間的向量，
    預設值只是為了不讓舊呼叫點壞掉。input_type 只能是 "query" 或 "passage"。
    """
    if input_type not in ("query", "passage"):
        raise ValueError("input_type 只能是 query 或 passage")
    if provider not in _IMPL:
        raise ValueError(f"不認得的 embedding provider：{provider}")
    if not texts:
        return []

    try:
        return await _IMPL[provider](texts, input_type=input_type, timeout=timeout)
    except EmbeddingUnavailable:
        raise
    except Exception as error:
        # 印出例外類別：httpx 的逾時類例外 str() 是空字串，
        # 只印訊息會得到「失敗：」什麼線索都沒有
        logger.warning(
            "Embedding(%s) 失敗：%s: %s", provider, type(error).__name__, error or "（無訊息）"
        )
        raise EmbeddingUnavailable from error


def cosine(a: list[float], b: list[float]) -> float:
    """餘弦相似度。

    不用 numpy：只有 29 個向量，純 Python 的成本可以忽略，
    而少一個依賴就少一個要維護、要更新、可能有漏洞的套件。
    """
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))
