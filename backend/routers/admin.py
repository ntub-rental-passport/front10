"""後台專用 API。

⚠️ 這個檔案裡的每一支端點都必須掛 `Depends(get_current_admin)`。
不可以靠「前端沒有給連結」當防護 —— 攻擊者是直接對 API 發請求，
根本不會經過你的畫面。

為什麼監控數據要鎖起來：連線池快滿了、錯誤率正在飆高，
這些是在告訴攻擊者「現在正是打的好時機」。健康度資訊本身就是情報。
"""

from fastapi import APIRouter, Depends

from database import engine
from metrics import request_counter
from models import User
from security import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _pool_snapshot() -> dict[str, object]:
    """讀取 SQLAlchemy 連線池的即時狀態。

    ⚠️ `pool.overflow()` 的語意容易誤解：它回傳的是
    「已建立的連線數 − pool_size」，池子還沒被用滿時是**負數**
    （例如 pool_size=10、只建了 2 條，會得到 -8）。
    直接顯示這個數字會讓人以為出錯了，所以這裡轉成
    「實際超額使用中的連線數」= max(0, overflow())。
    """
    if engine is None:
        return {"configured": False}

    pool = engine.pool
    size = pool.size()
    max_overflow = getattr(pool, "_max_overflow", 0)
    in_use = pool.checkedout()
    overflow_in_use = max(0, pool.overflow())
    capacity = size + max_overflow

    return {
        "configured": True,
        "size": size,
        "maxOverflow": max_overflow,
        "capacity": capacity,
        "inUse": in_use,
        "idle": pool.checkedin(),
        "overflowInUse": overflow_in_use,
        # 使用率以「池子 + 可追加」的總量為分母：這才是真正會被耗盡的上限
        "utilization": round(in_use / capacity, 4) if capacity else 0.0,
    }


@router.get("/metrics")
def read_metrics(admin: User = Depends(get_current_admin)) -> dict[str, object]:
    """後台監控頁的數據來源。僅限管理員。

    刻意只回「量得到的事實」，判定健不健康交給前端 ——
    門檻（幾 % 算異常）屬於營運政策，會隨經驗調整，
    寫死在後端要改就得重新部署。
    """
    return {
        "dbPool": _pool_snapshot(),
        "requests": request_counter.snapshot(),
    }
