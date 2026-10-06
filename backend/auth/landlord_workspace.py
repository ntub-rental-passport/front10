"""房東工作區：團隊成員以自己的房東帳號登入，切換到擁有者的工作區操作。

所有房東端點都依「工作區擁有者」的 id 篩選資料（landlord_id）。這個依賴回傳的
就是擁有者，所以既有端點換成它之後，成員看到的就是擁有者的資料，不必每支端點
各自改查詢條件。

- 沒帶 `X-Landlord-Workspace`，或帶的是自己的 id：就是自己的工作區（擁有者）。
- 帶別人的 id：必須是那個工作區 active 的成員，權限依角色：
    manager     除了團隊與設定之外都能讀寫
    accounting  全部可讀，只能寫帳務（/api/landlord/finance）
    viewer      只能讀
- 實際操作的人放在 request.state.landlord_actor，寫操作紀錄時用。
"""
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from auth.security import get_current_landlord
from db.database import get_db
from db.models import LandlordAuditEvent, LandlordTeamMember, User

WORKSPACE_HEADER = "X-Landlord-Workspace"
READ_METHODS = {"GET", "HEAD", "OPTIONS"}
# 只有擁有者能動：成員不能邀請別人、改擁有者的帳號與通知設定。
OWNER_ONLY_PREFIXES = ("/api/landlord/team", "/api/landlord/settings")
ACCOUNTING_WRITE_PREFIXES = ("/api/landlord/finance",)
ROLE_LABELS = {"owner": "擁有者", "manager": "管理員", "accounting": "帳務", "viewer": "檢視者"}


def _permitted(role: str, method: str, path: str) -> bool:
    if role == "owner":
        return True
    if path.startswith(OWNER_ONLY_PREFIXES):
        return False
    if method in READ_METHODS:
        return True
    if role == "manager":
        return True
    if role == "accounting":
        return path.startswith(ACCOUNTING_WRITE_PREFIXES)
    return False


def resolve_workspace(db: Session, user: User, requested: str | None) -> tuple[User, str]:
    """回傳（工作區擁有者, 角色）。不是成員一律 403，不透露那個工作區存不存在。"""
    if not requested or requested.strip() in ("", str(user.id)):
        return user, "owner"
    try:
        owner_id = int(requested)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "工作區代碼不正確。") from error
    membership = db.query(LandlordTeamMember).filter(
        LandlordTeamMember.owner_id == owner_id,
        LandlordTeamMember.member_user_id == user.id,
        LandlordTeamMember.status == "active",
    ).first()
    owner = db.get(User, owner_id) if membership else None
    if not membership or not owner or owner.status != "active" or not owner.has_role("landlord"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "你不是這個工作區的成員，或成員資格已被移除。")
    return owner, membership.role


def get_landlord_workspace(
    request: Request,
    authorization: str | None = Header(default=None),
    x_landlord_workspace: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    user = get_current_landlord(authorization, db)
    owner, role = resolve_workspace(db, user, x_landlord_workspace)
    if not _permitted(role, request.method, request.url.path):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"你在這個工作區的權限是「{ROLE_LABELS[role]}」，不能執行這個操作。",
        )
    request.state.landlord_actor = user
    request.state.landlord_role = role
    return owner


def landlord_actor(request: Request, owner: User) -> User:
    return getattr(request.state, "landlord_actor", None) or owner


def record_audit(
    db: Session,
    owner: User,
    actor: User | None,
    category: str,
    title: str,
    detail: str = "",
    result: str = "success",
) -> None:
    """寫一筆操作紀錄。呼叫端負責 commit（跟著那個動作同一筆交易）。"""
    db.add(LandlordAuditEvent(
        landlord_id=owner.id,
        actor_user_id=actor.id if actor else owner.id,
        category=category,
        title=title[:200],
        detail=detail,
        result=result,
    ))
