"""房東工作區：帳號設定、通知偏好、操作紀錄、團隊成員、待辦總覽。

這些原本都存在瀏覽器 localStorage（而且 state 只在模組載入時讀一次，換帳號會把
前一個帳號的設定寫進後一個帳號）。團隊成員只有本機的 pending 名單，沒有邀請
接受流程，也沒有任何權限效果。現在：

- 設定存 landlord_settings，帳號顯示名稱寫回 users.display_name。
- 操作紀錄由伺服器在動作成功後寫入 landlord_audit_events。
- 團隊成員：擁有者邀請 email → 對方用同信箱的房東帳號登入、接受 → 之後可在
  側邊切換到擁有者的工作區，權限由 auth/landlord_workspace.py 判斷。
"""
import hashlib
import secrets
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload, selectinload

from auth.landlord_workspace import ROLE_LABELS, get_landlord_workspace, landlord_actor, record_audit
from auth.security import get_current_landlord
from db.database import get_db
from db.models import (
    LandlordAuditEvent,
    LandlordCharge,
    LandlordLease,
    LandlordSettings,
    LandlordTeamMember,
    LandlordTenant,
    RepairTicket,
    User,
)
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules

router = APIRouter(prefix="/api/landlord", tags=["Landlord workspace"])

TEAM_INVITE_DAYS = 7
PHONE_PATTERN = r"^[0-9+()\-\s]{8,20}$"


class ProfilePayload(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    workspace_name: str = Field(min_length=1, max_length=100)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        import re
        value = (value or "").strip() or None
        if value and not re.match(PHONE_PATTERN, value):
            raise ValueError("手機格式不正確。")
        return value


class NotificationPayload(BaseModel):
    email_notifications: bool
    rent_reminders: bool
    contract_reminders: bool
    repair_notifications: bool
    reminder_days: int = Field(ge=7, le=90)


class TeamInvitePayload(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal["manager", "accounting", "viewer"]


class TeamRolePayload(BaseModel):
    role: Literal["manager", "accounting", "viewer"]


def settings_for(db: Session, landlord: User) -> LandlordSettings:
    settings = db.get(LandlordSettings, landlord.id)
    if not settings:
        settings = LandlordSettings(landlord_id=landlord.id, email_notifications=True, rent_reminders=True,
                                    contract_reminders=True, repair_notifications=True, reminder_days=30)
    return settings


def _default_name(user: User) -> str:
    return user.display_name or (user.email or "").split("@")[0] or "房東"


def _settings_dict(landlord: User, settings: LandlordSettings) -> dict:
    name = _default_name(landlord)
    return {
        "display_name": name,
        "email": landlord.email,
        "email_verified": bool(landlord.email_verified_at),
        "phone": settings.phone or "",
        "workspace_name": settings.workspace_name or f"{name}的房東工作區",
        "email_notifications": settings.email_notifications,
        "rent_reminders": settings.rent_reminders,
        "contract_reminders": settings.contract_reminders,
        "repair_notifications": settings.repair_notifications,
        "reminder_days": settings.reminder_days,
        "created_at": landlord.created_at,
    }


# ---------------------------------------------------------------
# 工作區與設定
# ---------------------------------------------------------------

@router.get("/workspaces")
def list_workspaces(db: Session = Depends(get_db), user: User = Depends(get_current_landlord)):
    """登入者可以進入的工作區：自己的，加上被邀請且已接受的。"""
    own = settings_for(db, user)
    items = [{"owner_id": user.id, "name": own.workspace_name or f"{_default_name(user)}的房東工作區",
              "role": "owner", "role_label": ROLE_LABELS["owner"]}]
    memberships = db.query(LandlordTeamMember).filter(
        LandlordTeamMember.member_user_id == user.id, LandlordTeamMember.status == "active").all()
    for membership in memberships:
        owner = db.get(User, membership.owner_id)
        if not owner or owner.status != "active":
            continue
        owner_settings = settings_for(db, owner)
        items.append({"owner_id": owner.id, "name": owner_settings.workspace_name or f"{_default_name(owner)}的房東工作區",
                      "role": membership.role, "role_label": ROLE_LABELS[membership.role]})
    return {"items": items}


@router.get("/settings")
def read_settings(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    return _settings_dict(landlord, settings_for(db, landlord))


@router.put("/settings/profile")
def save_profile(payload: ProfilePayload, request: Request, db: Session = Depends(get_db),
                 landlord: User = Depends(get_landlord_workspace)):
    settings = settings_for(db, landlord)
    landlord.display_name = payload.display_name.strip()
    settings.phone = payload.phone
    settings.workspace_name = payload.workspace_name.strip()
    db.merge(settings)
    record_audit(db, landlord, landlord_actor(request, landlord), "帳戶", "更新帳號資料", "顯示名稱、聯絡手機或工作區名稱已更新。")
    db.commit()
    return _settings_dict(landlord, settings_for(db, landlord))


@router.put("/settings/notifications")
def save_notifications(payload: NotificationPayload, request: Request, db: Session = Depends(get_db),
                       landlord: User = Depends(get_landlord_workspace)):
    settings = settings_for(db, landlord)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)
    db.merge(settings)
    record_audit(db, landlord, landlord_actor(request, landlord), "通知", "更新通知偏好",
                 f"合約到期提醒設定為提前 {payload.reminder_days} 天。")
    db.commit()
    return _settings_dict(landlord, settings_for(db, landlord))


@router.get("/audit")
def list_audit(category: str | None = Query(default=None), limit: int = Query(default=200, ge=1, le=1000),
               db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    query = db.query(LandlordAuditEvent).filter(LandlordAuditEvent.landlord_id == landlord.id)
    if category:
        query = query.filter(LandlordAuditEvent.category == category)
    events = query.order_by(LandlordAuditEvent.created_at.desc(), LandlordAuditEvent.id.desc()).limit(limit).all()
    actor_ids = {event.actor_user_id for event in events if event.actor_user_id}
    actors = {user.id: user for user in db.query(User).filter(User.id.in_(actor_ids))} if actor_ids else {}
    return {"items": [
        {"id": event.id, "at": event.created_at, "category": event.category, "title": event.title,
         "detail": event.detail or "", "result": event.result,
         "actor": (actors[event.actor_user_id].display_name or actors[event.actor_user_id].email)
         if event.actor_user_id in actors else "系統"}
        for event in events
    ]}


# ---------------------------------------------------------------
# 團隊成員
# ---------------------------------------------------------------

def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _member_dict(db: Session, member: LandlordTeamMember) -> dict:
    user = db.get(User, member.member_user_id) if member.member_user_id else None
    expired = member.status == "pending" and member.expires_at and member.expires_at <= datetime.utcnow()
    return {
        "id": member.id, "email": member.email,
        "name": (user.display_name if user and user.display_name else member.email.split("@")[0]),
        "role": member.role, "role_label": ROLE_LABELS[member.role],
        "status": "expired" if expired else member.status,
        "invited_at": member.invited_at, "joined_at": member.accepted_at,
    }


@router.get("/team")
def list_team(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    members = db.query(LandlordTeamMember).filter(
        LandlordTeamMember.owner_id == landlord.id, LandlordTeamMember.status != "revoked"
    ).order_by(LandlordTeamMember.invited_at).all()
    return {"owner": {"email": landlord.email, "name": _default_name(landlord)},
            "items": [_member_dict(db, member) for member in members]}


@router.post("/team", status_code=status.HTTP_201_CREATED)
def invite_member(payload: TeamInvitePayload, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "請輸入有效的 Email。")
    if email == (landlord.email or "").lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "不能邀請自己。")
    member = db.query(LandlordTeamMember).filter(LandlordTeamMember.owner_id == landlord.id,
                                                 LandlordTeamMember.email == email).first()
    if member and member.status == "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "這個 Email 已經是團隊成員。")
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    if not member:
        member = LandlordTeamMember(owner_id=landlord.id, email=email)
        db.add(member)
    member.role = payload.role
    member.status = "pending"
    member.member_user_id = None
    member.token_hash = _hash(token)
    member.expires_at = now + timedelta(days=TEAM_INVITE_DAYS)
    member.invited_at = now
    member.accepted_at = None
    member.revoked_at = None
    path = f"/landlord/join/{token}"
    existing = db.query(User).filter(User.email == email).first()
    delivered = False
    if existing and existing.status == "active" and existing.has_role("landlord"):
        notify_user(db, existing, title="你被邀請加入房東工作區",
                    body=f"{_default_name(landlord)} 邀請你以「{ROLE_LABELS[payload.role]}」身分加入工作區，7 天內有效。",
                    category="系統", source_label="團隊邀請", created_by=f"landlord:{landlord.id}",
                    action_url=path, action_label="查看邀請", email=settings_for(db, landlord).email_notifications)
        delivered = True
    record_audit(db, landlord, landlord_actor(request, landlord), "團隊", "邀請成員",
                 f"邀請 {email} 擔任{ROLE_LABELS[payload.role]}")
    db.commit()
    db.refresh(member)
    return {**_member_dict(db, member), "path": path, "notified": delivered}


@router.patch("/team/{member_id}")
def change_role(member_id: int, payload: TeamRolePayload, request: Request, db: Session = Depends(get_db),
                landlord: User = Depends(get_landlord_workspace)):
    member = db.query(LandlordTeamMember).filter(LandlordTeamMember.id == member_id, LandlordTeamMember.owner_id == landlord.id,
                                                 LandlordTeamMember.status != "revoked").first()
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這位成員。")
    member.role = payload.role
    record_audit(db, landlord, landlord_actor(request, landlord), "團隊", "變更成員權限",
                 f"{member.email} 改為{ROLE_LABELS[payload.role]}")
    db.commit()
    return _member_dict(db, member)


@router.delete("/team/{member_id}")
def remove_member(member_id: int, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    member = db.query(LandlordTeamMember).filter(LandlordTeamMember.id == member_id, LandlordTeamMember.owner_id == landlord.id,
                                                 LandlordTeamMember.status != "revoked").first()
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這位成員。")
    member.status = "revoked"
    member.revoked_at = datetime.utcnow()
    member.token_hash = None
    record_audit(db, landlord, landlord_actor(request, landlord), "團隊", "移除成員", f"{member.email} 已從工作區移除。", "warning")
    db.commit()
    return {"deleted_id": member_id}


def _team_invitation(db: Session, token: str) -> LandlordTeamMember:
    member = db.query(LandlordTeamMember).filter(LandlordTeamMember.token_hash == _hash(token)).first()
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "邀請不存在或已失效，請向工作區擁有者索取新的邀請。")
    return member


@router.get("/team-invitations/{token}")
def preview_team_invitation(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_landlord)):
    member = _team_invitation(db, token)
    owner = db.get(User, member.owner_id)
    owner_settings = settings_for(db, owner)
    return {
        "workspace_name": owner_settings.workspace_name or f"{_default_name(owner)}的房東工作區",
        "owner_name": _default_name(owner),
        "role": member.role, "role_label": ROLE_LABELS[member.role],
        "status": _member_dict(db, member)["status"],
        "email_matches": (user.email or "").lower() == member.email,
        "owner_id": owner.id,
    }


@router.post("/team-invitations/{token}/accept")
def accept_team_invitation(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_landlord)):
    member = _team_invitation(db, token)
    if member.status == "active":
        if member.member_user_id == user.id:
            return {"owner_id": member.owner_id, "role": member.role}
        raise HTTPException(status.HTTP_409_CONFLICT, "這份邀請已被使用。")
    if member.status != "pending" or (member.expires_at and member.expires_at <= datetime.utcnow()):
        raise HTTPException(status.HTTP_410_GONE, "邀請已過期或已撤銷，請向工作區擁有者索取新的邀請。")
    if (user.email or "").lower() != member.email:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"這份邀請是給 {member.email} 的，請用該信箱的房東帳號登入。")
    if member.owner_id == user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "不能加入自己的工作區。")
    member.status = "active"
    member.member_user_id = user.id
    member.accepted_at = datetime.utcnow()
    member.token_hash = None
    owner = db.get(User, member.owner_id)
    record_audit(db, owner, user, "團隊", "成員加入工作區", f"{member.email} 以{ROLE_LABELS[member.role]}身分加入")
    notify_user(db, owner, title="團隊成員已加入", body=f"{member.email} 已接受邀請，以「{ROLE_LABELS[member.role]}」身分加入你的工作區。",
                category="系統", source_label="團隊邀請", created_by="system",
                action_url="/landlord/settings/team", action_label="查看成員",
                email=settings_for(db, owner).email_notifications)
    db.commit()
    return {"owner_id": member.owner_id, "role": member.role}


# ---------------------------------------------------------------
# 待辦總覽（收租中心）
# ---------------------------------------------------------------

@router.get("/overview/tasks")
def overview_tasks(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    """收租中心的待辦：未收帳款、即將到期／已到期的租約、還沒結案的報修。依日期分成逾期／今天／7 天內。"""
    from routers.landlord_finance import ensure_rent_charges, _paid

    today = date.today()
    horizon = today + timedelta(days=7)
    settings = settings_for(db, landlord)
    ensure_rent_charges(db, landlord.id, horizon)
    tasks = []

    def bucket(day: date) -> str:
        return "overdue" if day < today else "today" if day == today else "upcoming"

    def timing(day: date) -> str:
        delta = (day - today).days
        return f"逾期 {-delta} 天" if delta < 0 else "今天到期" if delta == 0 else f"{delta} 天後"

    charges = (
        db.query(LandlordCharge)
        .options(selectinload(LandlordCharge.payments),
                 joinedload(LandlordCharge.lease).joinedload(LandlordLease.tenant),
                 joinedload(LandlordCharge.lease).joinedload(LandlordLease.property),
                 joinedload(LandlordCharge.lease).joinedload(LandlordLease.room))
        .filter(LandlordCharge.landlord_id == landlord.id, LandlordCharge.voided_at.is_(None), LandlordCharge.due_date <= horizon)
        .all()
    )
    for charge in charges:
        balance = charge.amount - _paid(charge)
        if balance <= 0:
            continue
        lease = charge.lease
        tasks.append({
            "id": f"charge:{charge.id}", "kind": "rent" if charge.kind == "rent" else "utility",
            "bucket": bucket(charge.due_date), "date": charge.due_date,
            "title": f"{lease.tenant.name} · {charge.title}{'尚未入帳' if charge.due_date <= today else '即將到期'}",
            "meta": f"{lease.property.name} · {lease.room.number} · NT${balance:,}",
            "timing": timing(charge.due_date), "route": "/landlord/finance",
        })

    leases = (
        db.query(LandlordLease).join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(joinedload(LandlordLease.tenant), joinedload(LandlordLease.property), joinedload(LandlordLease.room))
        .filter(LandlordTenant.landlord_id == landlord.id, LandlordTenant.deleted_at.is_(None)).all()
    )
    renewed_tenants = {lease.tenant_id for lease in leases if rules.is_upcoming(lease, today)}
    for lease in leases:
        if not rules.is_effective(lease, today) or lease.tenant_id in renewed_tenants:
            continue
        end = rules.occupied_until(lease)
        days_left = (end - today).days
        if days_left > settings.reminder_days:
            continue
        tasks.append({
            "id": f"lease:{lease.id}", "kind": "contract",
            "bucket": "today" if days_left <= 0 else "upcoming" if days_left <= 7 else "upcoming",
            "date": end,
            "title": f"{lease.tenant.name} · 租約{'今天到期' if days_left == 0 else '即將到期'}，續約待確認",
            "meta": f"{lease.property.name} · {lease.room.number}",
            "timing": f"剩餘 {days_left} 天" if days_left > 0 else "今天到期",
            "route": "/landlord/contracts",
        })

    lease_ids = [lease.id for lease in leases]
    if lease_ids:
        tickets = db.query(RepairTicket).filter(RepairTicket.lease_id.in_(lease_ids),
                                                RepairTicket.status.in_(("pending", "processing", "inspection"))).all()
        lease_by_id = {lease.id: lease for lease in leases}
        for ticket in tickets:
            lease = lease_by_id[ticket.lease_id]
            scheduled = ticket.scheduled_at.date() if ticket.scheduled_at else None
            day = scheduled or ticket.created_at.date()
            label = {"pending": "等待安排處理", "processing": "處理中", "inspection": "等待租客驗收"}[ticket.status]
            tasks.append({
                "id": f"repair:{ticket.id}", "kind": "maintenance",
                "bucket": "today" if ticket.urgency == "emergency" or (scheduled and scheduled <= today) or not scheduled else bucket(day),
                "date": day,
                "title": f"{ticket.equipment or ticket.location or '報修'} · {label}",
                "meta": f"{lease.property.name} · {lease.room.number} · {lease.tenant.name}",
                "timing": ticket.scheduled_at.strftime("%m/%d %H:%M") if ticket.scheduled_at else ("緊急" if ticket.urgency == "emergency" else "尚未安排"),
                "route": "/landlord/maintenance",
            })

    order = {"overdue": 0, "today": 1, "upcoming": 2}
    tasks.sort(key=lambda task: (order[task["bucket"]], task["date"]))
    return {"items": tasks, "generated_at": datetime.utcnow()}


# ---------------------------------------------------------------
# 完整備份
# ---------------------------------------------------------------

@router.get("/backup")
def export_backup(request: Request, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    """工作區的完整資料：物件、租客與所有租約（含歷史）、帳款與收款、支出、附件清單、操作紀錄。

    附件只列檔名與大小，檔案本身請在合約頁逐一下載——把所有 PDF 塞進一個 JSON 不實際。
    """
    from routers.landlord_contracts import list_contracts
    from routers.landlord_properties import list_properties
    from routers.landlord_tenants import _base_query, _tenant_dict
    from db.models import LandlordChargePayment, LandlordExpense

    today = date.today()
    tenants = [_tenant_dict(tenant, today, detailed=True, db=db) for tenant in _base_query(db, landlord.id).all()]
    charges = (
        db.query(LandlordCharge).options(selectinload(LandlordCharge.payments), selectinload(LandlordCharge.events))
        .filter(LandlordCharge.landlord_id == landlord.id).order_by(LandlordCharge.due_date).all()
    )
    expenses = db.query(LandlordExpense).filter(LandlordExpense.landlord_id == landlord.id).order_by(LandlordExpense.spent_on).all()
    audit = db.query(LandlordAuditEvent).filter(LandlordAuditEvent.landlord_id == landlord.id).order_by(LandlordAuditEvent.created_at).all()
    record_audit(db, landlord, landlord_actor(request, landlord), "資料", "匯出完整備份",
                 f"{len(tenants)} 位租客、{len(charges)} 筆帳款、{len(expenses)} 筆支出")
    db.commit()
    return {
        "exported_at": datetime.utcnow(),
        "workspace": {"owner_email": landlord.email, "name": settings_for(db, landlord).workspace_name},
        "properties": list_properties(db=db, landlord=landlord)["items"],
        "tenants": tenants,
        "contracts": list_contracts(db=db, landlord=landlord)["items"],
        "charges": [
            {"id": charge.id, "lease_id": charge.lease_id, "kind": charge.kind, "title": charge.title,
             "period_start": charge.period_start, "period_end": charge.period_end, "due_date": charge.due_date,
             "amount": charge.amount, "voided_at": charge.voided_at, "void_reason": charge.void_reason,
             "payments": [{"amount": item.amount, "paid_on": item.paid_on, "method": item.method, "note": item.note}
                          for item in charge.payments],
             "events": [{"kind": item.kind, "detail": item.detail, "at": item.created_at} for item in charge.events]}
            for charge in charges
        ],
        "expenses": [
            {"title": item.title, "category": item.category, "amount": item.amount, "spent_on": item.spent_on, "note": item.note}
            for item in expenses
        ],
        "audit": [{"at": item.created_at, "category": item.category, "title": item.title, "detail": item.detail} for item in audit],
    }
