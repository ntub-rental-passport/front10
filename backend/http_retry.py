"""暫時性錯誤的重試。

## 為什麼需要

2026-09-10 實測 NVIDIA 免費 API：連續三次呼叫，第三次回
`503 Service Unavailable`。免費方案是「盡力而為」等級，沒有可用性保證。

沒有重試的話，使用者大約每幾次就會遇到一次「AI 分析服務暫時無法使用」。
目前的行為是正確的（回 503 而不是捏造內容），但體驗很差 ——
而這類錯誤多半重試一次就成功。

## 什麼該重試、什麼不該

**該重試（對方暫時忙不過來，等一下就好）**
    429 太多請求、500/502/503/504 伺服器端錯誤
    連線失敗、連線逾時

**不該重試（重試幾次結果都一樣，只是白燒額度與時間）**
    400 參數錯誤 —— 例如送了模型不認得的 chat_template_kwargs
    401/403 金鑰無效或權限不足
    404 模型代號不存在

**刻意不重試：讀取逾時（ReadTimeout）**
    合約分析的逾時設 180 秒。讀取逾時代表模型真的在慢慢跑，
    重試很可能再逾時一次，把使用者的等待時間變成兩倍。
    這種情況該做的是換模型或調參數，不是重試。
"""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# 對方暫時忙不過來，等一下重試有意義
TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})


def _max_attempts() -> int:
    raw = (os.getenv("LLM_MAX_ATTEMPTS") or "").strip()
    if raw.isdigit() and 1 <= int(raw) <= 5:
        return int(raw)
    return 3


def is_transient(error: Exception) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in TRANSIENT_STATUS
    # ConnectTimeout 是 ConnectError 的手足，兩者都代表「還沒開始講話就失敗」，
    # 重試有意義；ReadTimeout 則是「講到一半太久」，重試只會再等一次。
    return isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout))


async def with_retry(operation, *, label: str):
    """執行 operation()，遇到暫時性錯誤時重試。

    退避時間刻意短（1 秒、3 秒）：使用者正在畫面前面等，
    指數退避那套是給背景工作用的，不是給互動請求用的。
    """
    attempts = _max_attempts()
    delays = [1.0, 3.0, 5.0]

    for attempt in range(1, attempts + 1):
        try:
            return await operation()
        except Exception as error:
            if attempt >= attempts or not is_transient(error):
                raise
            delay = delays[min(attempt - 1, len(delays) - 1)]
            logger.warning(
                "%s 第 %d/%d 次失敗（%s），%.0f 秒後重試",
                label, attempt, attempts, type(error).__name__, delay,
            )
            await asyncio.sleep(delay)
