"""上游端點的「暫時聯絡不上」記錄。

## 要解決的問題

主要的生成與檢索都指向家裡的桌機。桌機會睡眠、會被關機、會被帶出門 ——
這不是假設，是一定會發生的。

沒有這個模組時，桌機關機的每一個請求都要先把連線逾時與重試整套走完
才會退到 NVIDIA：

    連線逾時 5 秒 → 等 1 秒 → 5 秒 → 等 3 秒 → 5 秒 ≈ 19 秒

使用者付的這 19 秒不是在等答案，是在等一個**已經知道會失敗**的嘗試。
而且分析與對話各付一次。

作法：某個端點因為「連不上」而失敗之後，在冷卻時間內直接跳過它，
不再嘗試連線。桌機正常開著的時候，這個模組完全不介入。

## 只針對「連不上」，不針對 HTTP 錯誤

    連線失敗 / 連線逾時  → 記冷卻。主機不在那裡，一分鐘內多半還是不在
    401 / 403            → 不記。這是設定錯誤，冷卻只會延後你發現它
    429 / 503            → 不記。對方活著、只是忙，交給 http_retry 重試
    讀取逾時             → 不記。對方活著、只是慢

## 每個 worker 各自記

狀態在記憶體裡，uvicorn 開多個 worker 時各自獨立學習。
這是刻意的：多寫一個共享儲存（Redis）只為了省幾秒的逾時，
不划算，而且多一個會壞的東西。
"""

import logging
import os
import time

logger = logging.getLogger(__name__)

DEFAULT_COOLDOWN_SECONDS = 60.0

# name -> 冷卻到期的 monotonic 時間
_down_until: dict[str, float] = {}


def cooldown_seconds() -> float:
    """冷卻長度。設 0 等於停用這個機制（除錯時想看真實的逾時行為）。"""
    raw = (os.getenv("UPSTREAM_COOLDOWN_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_COOLDOWN_SECONDS
    try:
        value = float(raw)
    except ValueError:
        logger.warning("UPSTREAM_COOLDOWN_SECONDS 不是數字（%r），改用預設 %.0f 秒",
                       raw, DEFAULT_COOLDOWN_SECONDS)
        return DEFAULT_COOLDOWN_SECONDS
    return value if value >= 0 else DEFAULT_COOLDOWN_SECONDS


def mark_unreachable(name: str) -> None:
    """記下「這個端點連不上」。只有連線層級的失敗該呼叫這個。"""
    seconds = cooldown_seconds()
    if seconds <= 0:
        return
    _down_until[name] = time.monotonic() + seconds
    logger.info("%s 連不上，接下來 %.0f 秒直接跳過", name, seconds)


def mark_reachable(name: str) -> None:
    """成功連上就立刻解除冷卻 —— 桌機一開機就該馬上恢復使用，
    不該因為冷卻還沒到期而繼續走備援。"""
    if _down_until.pop(name, None) is not None:
        logger.info("%s 恢復連線", name)


def is_cooling(name: str) -> bool:
    until = _down_until.get(name)
    if until is None:
        return False
    if time.monotonic() >= until:
        _down_until.pop(name, None)
        return False
    return True


def remaining(name: str) -> float:
    """還要冷卻幾秒。供健康檢查顯示。"""
    until = _down_until.get(name)
    return max(0.0, until - time.monotonic()) if until else 0.0


def snapshot() -> dict[str, float]:
    """目前在冷卻中的端點與剩餘秒數。供 check_llm.py 與後台監控。"""
    return {name: round(remaining(name), 1) for name in list(_down_until) if is_cooling(name)}


def reset() -> None:
    """清空。測試用，也可在手動確認桌機已上線時呼叫。"""
    _down_until.clear()
