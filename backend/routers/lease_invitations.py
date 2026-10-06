"""房東邀請租客加入租約（docs/landlord-audit-and-tenant-invitation.md 的流程）。

一份邀請指向一份具體租約。QR code、連結、邀請碼是三種入口，最後都走同一個
「租客確認加入」動作：在同一筆交易裡把租客帳號綁到租約上、消耗邀請。

- token（連結／QR）與邀請碼只在建立當下回傳一次，資料庫只存 SHA-256。
- 邀請一定指定收件 email：租客登入的信箱必須相同才能接受。持有連結的其他人
  只看得到遮罩過的概要，拿不到租約。
- 預覽（GET）不消耗邀請；同一人重送接受回傳原本的結果；別人搶先接受則失敗。
- 重發會讓同一份租約先前的邀請失效。
"""
import hashlib
import secrets
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from auth.security import get_current_tenant
from db.database import get_db
from db.models import (
    LandlordLease,
    LandlordTenant,
    LandlordTenantActivity,
    LeaseInvitation,
    User,
)
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules

landlord_router = APIRouter(prefix="/api/landlord/invitations", tags=["Lease invitations (landlord)"])
public_router = APIRouter(prefix="/api/invitations", tags=["Lease invitations"])

INVITATION_DAYS = 7
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉 0/O、1/I 這些容易看錯的字
CODE_ATTEMPTS = 8
CODE_WINDOW_SECONDS = 600
_code_attempts: dict[int, list[float]] = defaultdict(list)


class CreateInvitationPayload(BaseModel):
    email: str | None = Field(default=None, max_length=254)


class CodePayload(BaseModel):
    code: str = Field(min_length=4, max_length=20)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    name, domain = email.split("@", 1)
    return f"{name[:2]}{'*' * max(1, len(name) - 2)}@{domain}"


def _state(invitation: LeaseInvitation | None) -> str:
    if not invitation:
        return "none"
    if invitation.status != "pending":
        return invitation.status
    return "expired" if invitation.expires_at <= datetime.utcnow() else "pending"


def _owned_lease(db: Session, landlord_id: int, lease_id: int) -> LandlordLease:
    lease = (
        db.query(LandlordLease)
        .options(joinedload(LandlordLease.tenant), joinedload(LandlordLease.property), joinedload(LandlordLease.room))
        .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .filter(LandlordLease.id == lease_id, LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None))
        .first()
    )
    if not lease:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到房東名下的這份租約。")
    return lease


def _landlord_view(db: Session, lease: LandlordLease) -> dict:
    latest = (
        db.query(LeaseInvitation).filter(LeaseInvitation.lease_id == lease.id)
        .order_by(LeaseInvitation.id.desc()).first()
    )
    bound_user = db.get(User, lease.tenant_user_id) if lease.tenant_user_id else None
    return {
        "lease_id": lease.id,
        "bound": bool(bound_user),
        "bound_email": bound_user.email if bound_user else None,
        "bound_at": lease.tenant_bound_at,
        "invitation": None if not latest else {
            "id": latest.id,
            "state": _state(latest),
            "invited_email": latest.invited_email,
            "expires_at": latest.expires_at,
            "created_at": latest.created_at,
            "accepted_at": latest.accepted_at,
        },
    }


@landlord_router.get("/leases/{lease_id}")
def invitation_status(lease_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    return _landlord_view(db, _owned_lease(db, landlord.id, lease_id))


@landlord_router.post("/leases/{lease_id}", status_code=status.HTTP_201_CREATED)
def create_invitation(
    lease_id: int,
    payload: CreateInvitationPayload,
    request: Request,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
):
    lease = _owned_lease(db, landlord.id, lease_id)
    today = date.today()
    if rules.moved_out(lease, today) or rules.occupied_until(lease) < today:
        raise HTTPException(status.HTTP_409_CONFLICT, "這份租約已結束，不能再邀請租客加入。")
    if lease.tenant_user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "這份租約已有租客帳號加入；要換人請先解除綁定。")
    email = (payload.email or lease.tenant.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "請填寫租客的 Email，只有用這個信箱登入的租客帳號能接受邀請。")

    now = datetime.utcnow()
    for previous in db.query(LeaseInvitation).filter(LeaseInvitation.lease_id == lease.id, LeaseInvitation.status == "pending"):
        previous.status = "revoked"
        previous.revoked_at = now

    token = secrets.token_urlsafe(32)
    code = _new_code()
    while db.query(LeaseInvitation.id).filter(LeaseInvitation.code_hash == _hash(code)).first():
        code = _new_code()
    invitation = LeaseInvitation(
        landlord_id=landlord.id, lease_id=lease.id, invited_email=email,
        token_hash=_hash(token), code_hash=_hash(code), status="pending",
        expires_at=now + timedelta(days=INVITATION_DAYS),
    )
    db.add(invitation)
    if not lease.tenant.email:
        lease.tenant.email = email
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind="invited", detail=f"產生租約邀請（{email}）"))
    record_audit(db, landlord, landlord_actor(request, landlord), "租客", "產生租約邀請",
                 f"{lease.tenant.name}（{lease.property.name} {lease.room.number}）→ {email}")
    db.commit()
    db.refresh(invitation)
    return {
        **_landlord_view(db, lease),
        # 只有這一次拿得到原文；之後只能重發
        "token": token,
        "code": f"{code[:4]}-{code[4:]}",
        "path": f"/invite/{token}",
    }


@landlord_router.post("/leases/{lease_id}/revoke")
def revoke_invitation(lease_id: int, request: Request, db: Session = Depends(get_db),
                      landlord: User = Depends(get_landlord_workspace)):
    lease = _owned_lease(db, landlord.id, lease_id)
    now = datetime.utcnow()
    revoked = 0
    for invitation in db.query(LeaseInvitation).filter(LeaseInvitation.lease_id == lease.id, LeaseInvitation.status == "pending"):
        invitation.status = "revoked"
        invitation.revoked_at = now
        revoked += 1
    if revoked:
        record_audit(db, landlord, landlord_actor(request, landlord), "租客", "撤銷租約邀請", lease.tenant.name, "warning")
    db.commit()
    return _landlord_view(db, lease)


@landlord_router.post("/leases/{lease_id}/unbind")
def unbind_tenant(lease_id: int, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    """解除租客帳號綁定（例如綁錯人）。歷史紀錄留在操作紀錄與租客動態。"""
    lease = _owned_lease(db, landlord.id, lease_id)
    if not lease.tenant_user_id:
        return _landlord_view(db, lease)
    bound = db.get(User, lease.tenant_user_id)
    lease.tenant_user_id = None
    lease.tenant_bound_at = None
    detail = f"解除租客帳號綁定（{bound.email if bound else '帳號已刪除'}）"
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind="unbound", detail=detail))
    record_audit(db, landlord, landlord_actor(request, landlord), "租客", "解除租客帳號綁定", f"{lease.tenant.name}：{detail}", "warning")
    db.commit()
    return _landlord_view(db, lease)


# ---------------------------------------------------------------
# 租客端
# ---------------------------------------------------------------

def _find_by_token(db: Session, token: str, lock: bool = False) -> LeaseInvitation:
    query = db.query(LeaseInvitation).filter(LeaseInvitation.token_hash == _hash(token))
    if lock:
        query = query.with_for_update()
    invitation = query.first()
    if not invitation:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "邀請不存在，請向房東確認連結是否完整。")
    return invitation


def _preview(db: Session, invitation: LeaseInvitation, viewer: User | None = None) -> dict:
    lease = (
        db.query(LandlordLease)
        .options(joinedload(LandlordLease.property), joinedload(LandlordLease.room))
        .filter(LandlordLease.id == invitation.lease_id).first()
    )
    landlord = db.get(User, invitation.landlord_id)
    state = _state(invitation)
    result = {
        "state": state,
        "landlord_name": (landlord.display_name or "房東") if landlord else "房東",
        "property_name": lease.property.name if lease else "",
        "room_number": lease.room.number if lease else "",
        "lease_start": lease.start_date if lease else None,
        "lease_end": lease.end_date if lease else None,
        "invited_email_masked": _mask_email(invitation.invited_email),
        "expires_at": invitation.expires_at,
    }
    if viewer is not None:
        result["email_matches"] = (viewer.email or "").strip().lower() == (invitation.invited_email or "")
        result["accepted_by_you"] = invitation.accepted_by == viewer.id
    return result


@public_router.get("/{token}")
def preview_invitation(token: str, db: Session = Depends(get_db)):
    """未登入也能看的概要：房東稱呼、物件、房號、租期，不含個資與帳款。"""
    return _preview(db, _find_by_token(db, token))


@public_router.get("/{token}/me")
def preview_for_tenant(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    """已登入的租客：多回傳「信箱對不對」「是不是你已經接受過」，畫面才知道該顯示哪個按鈕。"""
    return _preview(db, _find_by_token(db, token), user)


def _accept(db: Session, invitation: LeaseInvitation, user: User) -> dict:
    if invitation.status == "accepted":
        if invitation.accepted_by == user.id:
            return {**_preview(db, invitation, user), "lease_id": invitation.lease_id}
        raise HTTPException(status.HTTP_409_CONFLICT, "這份邀請已被其他帳號接受，請聯絡房東處理。")
    state = _state(invitation)
    if state == "revoked":
        raise HTTPException(status.HTTP_410_GONE, "這份邀請已被房東撤銷或重發，請向房東索取新的邀請。")
    if state == "expired":
        raise HTTPException(status.HTTP_410_GONE, "這份邀請已過期，請向房東索取新的邀請。")
    if (user.email or "").strip().lower() != (invitation.invited_email or ""):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"這份邀請是寄給 {_mask_email(invitation.invited_email)} 的，請改用該信箱的租客帳號登入。",
        )
    lease = db.query(LandlordLease).filter(LandlordLease.id == invitation.lease_id).with_for_update().first()
    if not lease:
        raise HTTPException(status.HTTP_410_GONE, "這份租約已不存在。")
    if lease.tenant_user_id and lease.tenant_user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "這份租約已有其他租客帳號加入，請聯絡房東處理。")
    now = datetime.utcnow()
    lease.tenant_user_id = user.id
    lease.tenant_bound_at = now
    invitation.status = "accepted"
    invitation.accepted_by = user.id
    invitation.accepted_at = now
    lease_tenant = db.get(LandlordTenant, lease.tenant_id)
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind="bound", detail=f"租客以 {user.email} 接受邀請，帳號已綁定"))
    landlord = db.get(User, invitation.landlord_id)
    if landlord:
        record_audit(db, landlord, user, "租客", "租客接受邀請", f"{lease_tenant.name if lease_tenant else ''} 以 {user.email} 加入租約")
        notify_user(
            db, landlord,
            title="租客已接受邀請",
            body=f"{lease_tenant.name if lease_tenant else '租客'} 已用 {user.email} 加入租約，之後的帳務與報修會連到這個帳號。",
            category="租約", source_label="租約邀請", created_by="system",
            action_url="/landlord/tenants", action_label="查看租客",
        )
    db.commit()
    return {**_preview(db, invitation, user), "lease_id": invitation.lease_id}


@public_router.post("/{token}/accept")
def accept_invitation(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    return _accept(db, _find_by_token(db, token, lock=True), user)


def _find_by_code(db: Session, code: str, user: User, lock: bool = False) -> LeaseInvitation:
    now = time.time()
    attempts = [stamp for stamp in _code_attempts[user.id] if now - stamp < CODE_WINDOW_SECONDS]
    if len(attempts) >= CODE_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "嘗試次數太多，請 10 分鐘後再試。")
    query = db.query(LeaseInvitation).filter(LeaseInvitation.code_hash == _hash(_normalize_code(code)))
    if lock:
        query = query.with_for_update()
    invitation = query.first()
    if not invitation:
        attempts.append(now)
        _code_attempts[user.id] = attempts
        raise HTTPException(status.HTTP_404_NOT_FOUND, "邀請碼不正確，請確認後再輸入。")
    _code_attempts[user.id] = attempts
    return invitation


@public_router.post("/code-preview")
def preview_by_code(payload: CodePayload, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    return _preview(db, _find_by_code(db, payload.code, user), user)


@public_router.post("/code-accept")
def accept_by_code(payload: CodePayload, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    return _accept(db, _find_by_code(db, payload.code, user, lock=True), user)
