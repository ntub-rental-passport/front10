"""LLM 生成來源的抽象與備援。

## 架構

    使用者 → VM（去識別化）→ ① NVIDIA NIM（主要模型）
                            → 正式環境 NVIDIA 失敗時可退回 CPU Ollama 備援
                            → 本機預設只用 NVIDIA，可選 Ollama（LLM_PROVIDER_ORDER=nvidia,ollama）

正式環境設定 NVIDIA → Ollama；VM 的 Ollama 只有 CPU，Law Chat 約 7–29 秒，合約分析
約 265 秒並超過 Cloudflare 100 秒 origin timeout。兩者都失敗時回傳 503，絕不回傳預設的分析內容。
本機預設只用 NVIDIA；本機開發可選 Ollama。NVIDIA 是免費額度
（約 1,000 credits、40 req/分），用完可能回 401/402/429。

## 絕對不做的事

**任何情況下都不得回傳「預設的分析內容」。** 可用 provider 都失敗時就丟
LlmUnavailable，讓呼叫端回 503。曾經的作法是失敗時回一段寫死的
法律分析，使用者無從分辨那不是針對自己合約的結果 —— 那比沒有功能更糟。

## 設定

    LLM_PROVIDER_ORDER   嘗試順序，預設 "nvidia"（正式環境 nvidia,ollama；本機可選）
    OLLAMA_URL           Ollama 位址，本機開發預設 http://127.0.0.1:11434
                         正式環境的 Ollama 備援位址由 compose 設定。
    OLLAMA_MODEL         合約分析用的模型，預設 gemma3:4b
    OLLAMA_CHAT_MODEL    Law Chat 用的模型（未設定就沿用 OLLAMA_MODEL）
    NVIDIA_API_KEY       沒設定就自動跳過這個 provider
    NVIDIA_MODEL         合約分析用的模型
    NVIDIA_CHAT_MODEL    Law Chat 用的模型（未設定就沿用 NVIDIA_MODEL）
    NVIDIA_BASE_URL      預設 https://integrate.api.nvidia.com/v1
    NVIDIA_DISABLE_THINKING
                         模型預設會輸出思考過程時設 true（例如 DeepSeek V4 Pro）。
                         不認得這個參數的模型會回 400，所以預設不送。
    NVIDIA_CHAT_DISABLE_THINKING
                         同上，但用於 Law Chat。**不會**沿用上面那個設定 ——
                         兩條線常用不同模型，盲目沿用會讓不支援的模型回 400。

## 為什麼兩條線可以用不同模型

實測（2026-09-09）：DeepSeek V4 Pro 的法條引用會給實際條號，
品質明顯好，但要 90 秒；Nemotron 3 Super 只有 13-25 秒，
但引用只是把 prompt 裡的規則抄回來。

合約分析是「上傳後等結果」，90 秒可以接受；
Law Chat 是對話，等 90 秒沒有人受得了。
所以分開設定 —— 各取所長，而不是被迫二選一。

沒有設定的 provider 會被自動跳過，不會變成一次失敗的嘗試。
"""

import logging
import os

import httpx

from common import upstream_state
from common.http_retry import is_http_transient, with_retry

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = float(os.getenv("LLM_CONNECT_TIMEOUT", "5"))

# 冷卻機制用的名稱（見 upstream_state.py）
_OLLAMA_ENDPOINT = "llm:ollama"


class LlmUnavailable(RuntimeError):
    """所有 provider 都無法產生可用結果。呼叫端一律轉 503，不得以預設內容填補。"""


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _model_for(provider: str, purpose: str) -> str:
    """依用途挑模型。未設定專用模型時沿用主設定。"""
    if provider == "nvidia":
        if purpose == "chat" and (model := _env("NVIDIA_CHAT_MODEL")):
            return model
        # ⚠️ 預設模型會被 NVIDIA 下架。meta/llama-3.1-70b-instruct 在
        # 2026-09-29 已從 /v1/models 消失，呼叫回 410 Gone —— 症狀是
        # 每次分析都退到 Ollama，看起來像「備援很好用」而不是「主線壞了」。
        # 換模型前先用 scripts/check_llm.py --models 確認它還在清單上。
        return _env("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")
    if purpose == "chat" and (model := _env("OLLAMA_CHAT_MODEL")):
        return model
    return _env("OLLAMA_MODEL", "gemma3:4b")


def ollama_base() -> str:
    """fastapi 的 Ollama 位址。正式環境由 compose 指向私有網路上的容器。"""
    return _env("OLLAMA_URL", "http://127.0.0.1:11434")


def _disable_thinking(purpose: str) -> bool:
    """是否送出關閉思考模式的參數。

    ⚠️ chat 不沿用 analyze 的設定：兩條線常用不同模型，
    而這個參數不是每個模型都認得，盲目沿用會讓對方直接回 400 ——
    那會被誤判成「模型壞掉」，實際上只是多送了一個它不懂的欄位。
    """
    key = "NVIDIA_CHAT_DISABLE_THINKING" if purpose == "chat" else "NVIDIA_DISABLE_THINKING"
    return _env(key).lower() in ("1", "true", "yes")


# ---------------------------------------------------------------
# Provider 實作
# ---------------------------------------------------------------


async def _call_ollama(prompt: str, *, read_timeout: float, force_json: bool, purpose: str) -> str:
    """以 HTTP 呼叫 Ollama；正式環境容器只在私有 Docker 網路上提供服務。"""
    base = ollama_base().rstrip("/")
    if not base:
        raise LlmUnavailable("未設定 OLLAMA_URL")
    if upstream_state.is_cooling(_OLLAMA_ENDPOINT):
        # 剛剛才確認連不上。再試一次只是讓使用者多等一個連線逾時，
        # 直接跳過，讓呼叫端繼續嘗試其他 provider 或回 503。
        raise LlmUnavailable(
            f"Ollama 容器冷卻中（還有 {upstream_state.remaining(_OLLAMA_ENDPOINT):.0f} 秒）"
        )

    payload: dict = {
        "model": _model_for("ollama", purpose),
        "prompt": prompt,
        "stream": False,
    }
    if force_json:
        payload["format"] = "json"
    # Opt in per deployment; not every Ollama model supports thinking controls.
    thinking = _env("OLLAMA_THINK").lower()
    if thinking in ("true", "false"):
        payload["think"] = thinking == "true"

    timeout = httpx.Timeout(read_timeout, connect=CONNECT_TIMEOUT)

    async def send() -> str:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{base}/api/generate", json=payload)
            if response.status_code == 404:
                logger.error(
                    "Ollama 回 404：請用 ollama list 確認 OLLAMA_MODEL=%s 已安裝，並檢查 OLLAMA_URL 是否指向 Ollama 服務",
                    payload["model"],
                )
            response.raise_for_status()
            return (response.json().get("response") or "").strip()

    # should_retry 排除連線失敗：容器連不上時重試只是多等十幾秒。
    # 對方活著只是忙才值得重試。
    try:
        text = await with_retry(send, label="Ollama", should_retry=is_http_transient)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        upstream_state.mark_unreachable(_OLLAMA_ENDPOINT)
        raise
    upstream_state.mark_reachable(_OLLAMA_ENDPOINT)
    return text


async def _call_nvidia(prompt: str, *, read_timeout: float, force_json: bool, purpose: str) -> str:
    """呼叫 NVIDIA 的 OpenAI 相容端點。

    免費方案是給開發與評估用的，額度有限（約 1,000 credits、40 req/分）。
    額度用完會回 401/402/429 —— 這時**必須**往上丟 LlmUnavailable，
    絕不能默默退回預設內容。
    """
    api_key = _env("NVIDIA_API_KEY")
    if not api_key:
        raise LlmUnavailable("未設定 NVIDIA_API_KEY")  # 呼叫端會跳過並記錄

    base = _env("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    payload: dict = {
        "model": _model_for("nvidia", purpose),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "stream": False,
    }
    if force_json:
        # 部分模型不支援這個參數；不支援時仍會照 prompt 的指示輸出 JSON，
        # 呼叫端本來就有寬鬆解析，所以加上去是淨收益。
        payload["response_format"] = {"type": "json_object"}

    # 關閉思考模式。
    #
    # 有些模型（例如 DeepSeek V4 Pro）預設會先輸出一長串推理過程再給答案。
    # 對我們有三個壞處：思考文字混進正文會讓 JSON 解析失敗、
    # 回應時間拉長、輸出 token 暴增而免費額度燒得更快。
    #
    # 預設不送這個參數 —— 不認得它的模型會直接回 400，
    # 反而讓「模型其實可用」被誤判成「模型壞掉」。
    # 需要時才由 .env 開啟（NVIDIA_DISABLE_THINKING=true）。
    if _disable_thinking(purpose):
        payload["chat_template_kwargs"] = {"thinking": False}

    timeout = httpx.Timeout(read_timeout, connect=CONNECT_TIMEOUT)

    async def send() -> str:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code in (401, 402, 429):
                logger.error(
                    "NVIDIA API 回 %s —— 可能是額度用盡、超過每分鐘上限或金鑰失效",
                    response.status_code,
                )
            response.raise_for_status()
            choices = response.json().get("choices") or []
            if not choices:
                return ""
            return (choices[0].get("message", {}).get("content") or "").strip()

    # 免費方案會間歇性回 503（實測三次中一次），重試多半就過了
    return await with_retry(send, label="NVIDIA")


_PROVIDERS = {
    "ollama": _call_ollama,
    "nvidia": _call_nvidia,
}


def provider_order() -> list[str]:
    # 預設只用 NVIDIA，避免沒有 Ollama 的本機開發環境等待失敗；正式 VM 明確設 nvidia,ollama。
    # CPU Ollama 合約分析約 265 秒，可能超過 Cloudflare 100 秒，但作為展示用備援保留。
    raw = _env("LLM_PROVIDER_ORDER", "nvidia")
    names = [n.strip().lower() for n in raw.split(",") if n.strip()]
    return [n for n in names if n in _PROVIDERS] or ["nvidia"]


def configured_providers() -> list[str]:
    """實際可用的 provider（有設定必要環境變數的）。供健康檢查與除錯。"""
    available = []
    for name in provider_order():
        if name == "nvidia" and not _env("NVIDIA_API_KEY"):
            continue
        if name == "ollama" and not ollama_base():
            continue
        available.append(name)
    return available


async def generate(
    prompt: str, *, read_timeout: float, force_json: bool = False, purpose: str = "analyze"
) -> str:
    """依序嘗試各 provider，第一個成功就回傳。

    全部失敗才丟 LlmUnavailable。錯誤只寫進 log ——
    對外訊息不可包含內部位址、金鑰狀態或套件錯誤字串。
    """
    last_error: Exception | None = None

    for name in provider_order():
        call = _PROVIDERS[name]
        try:
            text = await call(prompt, read_timeout=read_timeout, force_json=force_json, purpose=purpose)
        except LlmUnavailable as error:
            # 未設定或正在冷卻，跳過不算失敗
            logger.info("LLM provider %s 略過：%s（非本次 API 呼叫失敗）", name, error or "未設定")
            continue
        except Exception as error:
            # 一定要印例外類別名稱：httpx 的逾時類例外 str() 是空字串，
            # 只印訊息會得到「失敗：」什麼線索都沒有（2026-09-09 實際踩到）。
            logger.warning(
                "LLM provider %s 失敗：%s: %s", name, type(error).__name__, error or "（無訊息）"
            )
            last_error = error
            continue

        if text:
            logger.info("LLM provider %s / %s 產生回應（%d 字）",
                        name, _model_for(name, purpose), len(text))
            return text
        logger.warning("LLM provider %s 回傳空字串", name)

    logger.error("已設定的 LLM provider 皆未產生可用結果（已設定：%s；順序：%s）",
                 ",".join(configured_providers()) or "無", ",".join(provider_order()))
    raise LlmUnavailable from last_error
