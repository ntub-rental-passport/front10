"""向量檢索用的 embedding。

## 為什麼不用原本的 text2vec-base-chinese

組員建向量庫時用的是 HuggingFace 的 shibing624/text2vec-base-chinese。
要用它查詢，就得在後端裝 sentence-transformers + torch（約 2GB image、
1GB 記憶體）—— 學校 VM 只剩 5.4GB，塞不下。

改用 NVIDIA 的 embedding API：語料的向量一次性算好存進 JSON，
查詢時只呼叫 API 算一個向量。不需要 torch，VM 就跑得動。

⚠️ **不能混用兩種 embedding。** 不同模型產生的向量在不同的語意空間，
拿 A 模型的查詢向量去比對 B 模型的語料向量，相似度是沒有意義的亂數。
所以語料必須用同一個模型重新算過（見 rag/build_vectors.py）。

## 模型選擇的實測依據

2026-09-09 用 5 個真實租客提問測試 4 個候選模型：

    nvidia/nemotron-3-embed-1b          5/5 命中（維度 2048）
    nvidia/llama-3.2-nv-embedqa-1b-v1   404，端點叫不動
    nvidia/nv-embedqa-mistral-7b-v2     404
    snowflake/arctic-embed-l            404

「列在模型清單上」不等於「這個端點可用」—— 這是第二次遇到
（先前 moonshotai/kimi-k2.6 的 chat 端點也是 404）。

## query 與 passage 要分開

這類模型的慣例：查詢與被檢索文件使用不同的 input_type，
向量空間帶有不同偏置。混用會讓相似度失準。
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "nvidia/nemotron-3-embed-1b"


class EmbeddingUnavailable(RuntimeError):
    """無法取得向量。呼叫端應退回「全部給」而非中斷服務。"""


def _config() -> tuple[str, str, str]:
    api_key = (os.getenv("NVIDIA_API_KEY") or "").strip()
    if not api_key:
        raise EmbeddingUnavailable("未設定 NVIDIA_API_KEY")
    base = (os.getenv("NVIDIA_BASE_URL") or "https://integrate.api.nvidia.com/v1").rstrip("/")
    model = (os.getenv("EMBEDDING_MODEL") or DEFAULT_MODEL).strip()
    return api_key, base, model


async def embed_texts(
    texts: list[str], *, input_type: str, timeout: float = 30.0
) -> list[list[float]]:
    """把文字轉成向量。input_type 只能是 "query" 或 "passage"。"""
    if input_type not in ("query", "passage"):
        raise ValueError("input_type 只能是 query 或 passage")
    if not texts:
        return []

    api_key, base, model = _config()
    try:
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
            return [item["embedding"] for item in response.json()["data"]]
    except EmbeddingUnavailable:
        raise
    except Exception as error:
        # 印出例外類別：httpx 的逾時類例外 str() 是空字串
        logger.warning(
            "Embedding 失敗：%s: %s", type(error).__name__, error or "（無訊息）"
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
