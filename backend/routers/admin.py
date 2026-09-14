"""後台專用 API。

⚠️ 這個檔案裡的每一支端點都必須掛 `Depends(get_current_admin)`。
不可以靠「前端沒有給連結」當防護 —— 攻擊者是直接對 API 發請求，
根本不會經過你的畫面。

為什麼監控數據要鎖起來：連線池快滿了、錯誤率正在飆高，
這些是在告訴攻擊者「現在正是打的好時機」。健康度資訊本身就是情報。
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from database import engine, get_db
from metrics import request_counter
from models import PendingAdminLogin, User, UserRole
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


# ==========================================
# 使用者管理
# ==========================================


class AdminUserRow(BaseModel):
    """後台使用者清單的一列。

    刻意不回傳的欄位：
      - 密碼雜湊：後台永遠不需要看到，回傳只會多一條外洩管道
      - Google sub / 第三方識別碼：同上，只回「綁了哪些登入方式」的名稱
    """

    id: int
    email: str
    displayName: str | None
    avatarUrl: str | None
    roles: list[str]
    status: str
    emailVerified: bool
    hasPassword: bool
    providers: list[str]
    createdAt: str | None
    lastLoginAt: str | None


class UpdateStatusRequest(BaseModel):
    status: str


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _row(user: User) -> AdminUserRow:
    return AdminUserRow(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        avatarUrl=user.avatar_url,
        roles=sorted(r.role for r in user.roles),
        status=user.status or "active",
        emailVerified=user.email_verified_at is not None,
        hasPassword=user.password_credential is not None,
        providers=sorted({i.provider for i in user.identities}),
        createdAt=_iso(user.created_at),
        lastLoginAt=_iso(user.last_login_at),
    )


@router.get("/users", response_model=list[AdminUserRow])
def list_users(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> list[AdminUserRow]:
    """列出所有真實帳號。僅限管理員。

    用 selectinload 一次把 roles / identities / password_credential 撈齊：
    否則每一列都會各發一次查詢（N+1），帳號一多就會把資料庫拖垮 ——
    後台頁面一開就打爆自己的資料庫，等於給了攻擊者一個免費的 DoS 開關。
    """
    users = (
        db.query(User)
        .options(
            selectinload(User.roles),
            selectinload(User.identities),
            selectinload(User.password_credential),
        )
        .order_by(User.id)
        .all()
    )
    return [_row(u) for u in users]


@router.patch("/users/{user_id}/status", response_model=AdminUserRow)
def update_user_status(
    user_id: int,
    payload: UpdateStatusRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> AdminUserRow:
    """停用或啟用帳號。

    兩個防呆，理由都是「避免把所有人鎖在門外」：

      1. 不能停用自己 —— 按下去的瞬間自己就被登出，且如果你是唯一的管理員，
         沒有人能把你啟用回來，只能進伺服器改資料庫。
      2. 不能停用最後一位還在啟用中的管理員 —— 同上，後台會變成沒有人進得去。

    停用會立即生效：security.py 的三個守門員每次請求都會查資料庫，
    不是只看 token，所以不必等對方的憑證過期。
    """
    if payload.status not in {"active", "suspended"}:
        raise HTTPException(status_code=422, detail="狀態只能是 active 或 suspended。")

    user = (
        db.query(User)
        .options(
            selectinload(User.roles),
            selectinload(User.identities),
            selectinload(User.password_credential),
        )
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=404, detail="找不到這個帳號。")

    if payload.status == "suspended":
        if user.id == admin.id:
            raise HTTPException(status_code=400, detail="不能停用自己的帳號。")

        is_admin = any(r.role == "admin" for r in user.roles)
        if is_admin:
            remaining = (
                db.query(User)
                .join(UserRole, UserRole.user_id == User.id)
                .filter(
                    UserRole.role == "admin",
                    User.status == "active",
                    User.id != user.id,
                )
                .count()
            )
            if remaining == 0:
                raise HTTPException(
                    status_code=400, detail="這是最後一位啟用中的管理員，停用後將無人能進入後台。"
                )

        # 停用的同時作廢進行中的登入挑戰：
        # 否則「已通過帳密、驗證碼還在手上」的人仍能在挑戰有效期內完成登入
        db.query(PendingAdminLogin).filter(PendingAdminLogin.user_id == user.id).delete()

    user.status = payload.status
    db.commit()
    db.refresh(user)
    return _row(user)
