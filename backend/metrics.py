"""API 請求統計（供後台監控頁使用）。

為什麼是記憶體內計數而不是 Prometheus 之類的方案：
後端只有一個 uvicorn process，需要的也只是「近一小時錯誤率」這一個數字，
為此多跑一個監控系統，維運成本遠大於得到的資訊。

代價要講清楚：**重啟後端計數會歸零**。這是可接受的——
監控頁看的是「現在健不健康」，不是長期報表。

## 為什麼用分鐘桶而不是存每一筆請求

存每一筆請求，記憶體用量會隨流量成長，高流量時反而是後端自己先被拖垮。
分鐘桶的記憶體上限是固定的（60 個桶），跟流量完全無關。
代價是時間精度只到分鐘，但「近一小時錯誤率」本來就不需要秒級精度。
"""

import threading
import time
from dataclasses import dataclass, field

WINDOW_MINUTES = 60


@dataclass
class _Bucket:
    """一分鐘內的請求計數。"""

    minute: int
    total: int = 0
    client_errors: int = 0  # 4xx
    server_errors: int = 0  # 5xx


@dataclass
class RequestCounter:
    """滾動時間窗的請求計數器。

    以「分鐘」為鍵存放，讀取時只加總還在時間窗內的桶，
    過期的桶在寫入時順手清掉，不需要另外跑清理排程。
    """

    _buckets: dict[int, _Bucket] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, status_code: int) -> None:
        minute = int(time.time() // 60)
        with self._lock:
            bucket = self._buckets.get(minute)
            if bucket is None:
                bucket = _Bucket(minute=minute)
                self._buckets[minute] = bucket
                # 順手清掉過期的桶，避免長期執行後字典無限增長
                cutoff = minute - WINDOW_MINUTES
                for stale in [m for m in self._buckets if m <= cutoff]:
                    del self._buckets[stale]

            bucket.total += 1
            if 400 <= status_code < 500:
                bucket.client_errors += 1
            elif status_code >= 500:
                bucket.server_errors += 1

    def snapshot(self) -> dict[str, float | int]:
        """回傳近一小時的統計。沒有任何請求時各項為 0。"""
        cutoff = int(time.time() // 60) - WINDOW_MINUTES
        with self._lock:
            recent = [b for b in self._buckets.values() if b.minute > cutoff]

        total = sum(b.total for b in recent)
        client_errors = sum(b.client_errors for b in recent)
        server_errors = sum(b.server_errors for b in recent)
        errors = client_errors + server_errors

        return {
            "windowMinutes": WINDOW_MINUTES,
            "total": total,
            "clientErrors": client_errors,
            "serverErrors": server_errors,
            # 沒有請求時錯誤率是 0，不是 100 —— 分母為 0 要當作「沒有錯誤」處理
            "errorRate": round(errors / total, 4) if total else 0.0,
            "serverErrorRate": round(server_errors / total, 4) if total else 0.0,
        }


request_counter = RequestCounter()

# 這些路徑不計入統計：它們是監控自己發出的探測，不是真實使用者流量。
# 後台監控頁每 30 秒打一次 /api/health，一個開著的分頁每小時就是 120 筆，
# 全部算進分母會把錯誤率稀釋到看不出問題。
EXCLUDED_PATHS = frozenset({"/api/health", "/api/admin/metrics"})


async def count_requests(request, call_next):
    """FastAPI middleware：記錄每個回應的狀態碼。

    例外情況也要記到（算 500）—— 未處理的例外正是最需要被看見的錯誤，
    若讓它直接往上拋而不計數，錯誤率反而在系統最不健康時顯示為 0。
    """
    if request.url.path in EXCLUDED_PATHS:
        return await call_next(request)

    try:
        response = await call_next(request)
    except Exception:
        request_counter.record(500)
        raise

    request_counter.record(response.status_code)
    return response
