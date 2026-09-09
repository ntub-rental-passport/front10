"""LLM 生成來源的抽象與備援。

## 架構

    使用者 → VM（去識別化）→ ① 自架 Ollama（經 Cloudflare Tunnel 到桌機）
                            → ② NVIDIA 免費 API（①不可用時的備援）
                            → 兩者皆失敗 → LlmUnavailable → 呼叫端回 503

為什麼要備援：主要路徑是跑在家裡桌機上的 Ollama。桌機會睡眠、
家裡會斷網、口試那天人可能把電腦關了帶去學校 —— 這些都不是假設，
是一定會發生的。沒有備援的話，功能就會在最需要它的時候不見。

## 絕對不做的事

**任何情況下都不得回傳「預設的分析內容」。** 兩條路都失敗時就丟
LlmUnavailable，讓呼叫端回 503。曾經的作法是失敗時回一段寫死的
法律分析，使用者無從分辨那不是針對自己合約的結果 —— 那比沒有功能更糟。

## 設定

    LLM_PROVIDER_ORDER   嘗試順序，預設 "ollama,nvidia"
    OLLAMA_URL           Ollama 位址（或 Cloudflare Tunnel 的網址）
    OLLAMA_MODEL         預設 gemma3:4b
    LLM_TUNNEL_API_KEY   桌機端代理的 API key（走隧道時才需要）
    CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
                         Cloudflare Access service token
    NVIDIA_API_KEY       沒設定就自動跳過這個 provider
    NVIDIA_MODEL         例如 meta/llama-3.1-70b-instruct
    NVIDIA_BASE_URL      預設 https://integrate.api.nvidia.com/v1

沒有設定的 provider 會被自動跳過，不會變成一次失敗的嘗試。
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = float(os.getenv("LLM_CONNECT_TIMEOUT", "5"))


class LlmUnavailable(RuntimeError):
    """所有 provider 都無法產生可用結果。呼叫端一律轉 503，不得以預設內容填補。"""


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


# ---------------------------------------------------------------
# Provider 實作
# ---------------------------------------------------------------


async def _call_ollama(prompt: str, *, read_timeout: float, force_json: bool) -> str:
    """呼叫 Ollama（本機，或經 Cloudflare Tunnel 連到桌機）。

    憑證以標頭夾帶：
      - CF-Access-Client-Id / Secret：Cloudflare Access 在邊緣就會驗，
        沒帶的請求根本不會進到家裡的網路
      - X-API-Key：桌機端代理的第二道，Access 設定被改壞時仍擋得住
    """
    base = _env("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    if not base:
        raise LlmUnavailable

    headers: dict[str, str] = {}
    if api_key := _env("LLM_TUNNEL_API_KEY"):
        headers["X-API-Key"] = api_key
    cf_id, cf_secret = _env("CF_ACCESS_CLIENT_ID"), _env("CF_ACCESS_CLIENT_SECRET")
    if cf_id and cf_secret:
        headers["CF-Access-Client-Id"] = cf_id
        headers["CF-Access-Client-Secret"] = cf_secret

    payload: dict = {
        "model": _env("OLLAMA_MODEL", "gemma3:4b"),
        "prompt": prompt,
        "stream": False,
    }
    if force_json:
        payload["format"] = "json"

    timeout = httpx.Timeout(read_timeout, connect=CONNECT_TIMEOUT)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{base}/api/generate", json=payload, headers=headers)
        if response.status_code in (401, 403):
            # 這是設定問題不是服務問題，值得單獨標示 —— 否則會被誤判成「桌機關機」
            logger.error("Ollama 端點拒絕存取（%s）：檢查 Access service token 與 API key",
                         response.status_code)
        response.raise_for_status()
        return (response.json().get("response") or "").strip()


async def _call_nvidia(prompt: str, *, read_timeout: float, force_json: bool) -> str:
    """呼叫 NVIDIA 的 OpenAI 相容端點。

    免費方案是給開發與評估用的，額度有限（約 1,000 credits、40 req/分）。
    額度用完會回 401/402/429 —— 這時**必須**往上丟 LlmUnavailable，
    絕不能默默退回預設內容。
    """
    api_key = _env("NVIDIA_API_KEY")
    if not api_key:
        raise LlmUnavailable  # 未設定，視為不可用（呼叫端會跳過並記錄）

    base = _env("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    payload: dict = {
        "model": _env("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct"),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "stream": False,
    }
    if force_json:
        # 部分模型不支援這個參數；不支援時仍會照 prompt 的指示輸出 JSON，
        # 呼叫端本來就有寬鬆解析，所以加上去是淨收益。
        payload["response_format"] = {"type": "json_object"}

    timeout = httpx.Timeout(read_timeout, connect=CONNECT_TIMEOUT)
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


_PROVIDERS = {
    "ollama": _call_ollama,
    "nvidia": _call_nvidia,
}


def provider_order() -> list[str]:
    raw = _env("LLM_PROVIDER_ORDER", "ollama,nvidia")
    names = [n.strip().lower() for n in raw.split(",") if n.strip()]
    return [n for n in names if n in _PROVIDERS] or ["ollama"]


def configured_providers() -> list[str]:
    """實際可用的 provider（有設定必要環境變數的）。供健康檢查與除錯。"""
    available = []
    for name in provider_order():
        if name == "nvidia" and not _env("NVIDIA_API_KEY"):
            continue
        if name == "ollama" and not _env("OLLAMA_URL", "http://127.0.0.1:11434"):
            continue
        available.append(name)
    return available


async def generate(prompt: str, *, read_timeout: float, force_json: bool = False) -> str:
    """依序嘗試各 provider，第一個成功就回傳。

    全部失敗才丟 LlmUnavailable。錯誤只寫進 log ——
    對外訊息不可包含內部位址、金鑰狀態或套件錯誤字串。
    """
    last_error: Exception | None = None

    for name in provider_order():
        call = _PROVIDERS[name]
        try:
            text = await call(prompt, read_timeout=read_timeout, force_json=force_json)
        except LlmUnavailable:
            # provider 未設定，跳過不算失敗
            logger.debug("LLM provider %s 未設定，略過", name)
            continue
        except Exception as error:
            logger.warning("LLM provider %s 失敗：%s", name, error)
            last_error = error
            continue

        if text:
            logger.info("LLM provider %s 產生回應（%d 字）", name, len(text))
            return text
        logger.warning("LLM provider %s 回傳空字串", name)

    logger.error("所有 LLM provider 皆不可用（順序：%s）", ",".join(provider_order()))
    raise LlmUnavailable from last_error
