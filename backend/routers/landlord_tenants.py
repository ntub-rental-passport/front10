import csv
import io
import re
import secrets
import time
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, joinedload

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from db.database import get_db
from db.models import (
    LandlordLease,
    LandlordMoveOut,
    LandlordProperty,
    LandlordRoom,
    LandlordTenant,
    LandlordTenantActivity,
    LeaseInvitation,
    User,
)
from routers import landlord_lease_rules as rules

router = APIRouter(prefix="/api/landlord/tenants", tags=["Landlord tenants"])
ACTIVE_LEASE_STATUSES = rules.LIVE_STATUSES
PHONE_PATTERN = re.compile(r"^[0-9+()\-\s]{8,20}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_import_previews: dict[str, dict[str, object]] = {}
SORTABLE_NUMBERS = {"monthly_rent", "deposit_amount", "days_left", "payment_day"}


class TenantPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=8, max_length=30)
    email: str | None = Field(default=None, max_length=254)
    national_id: str | None = Field(default=None, max_length=20)
    birth_date: date | None = None
    contact_address: str | None = None
    emergency_name: str | None = Field(default=None, max_length=100)
    emergency_phone: str | None = Field(default=None, max_length=30)
    notes: str | None = None
    property_id: int | None = None
    room_id: int | None = None
    property_name: str | None = Field(default=None, max_length=100)
    room_number: str | None = Field(default=None, max_length=50)
    lease_start: date
    lease_end: date
    monthly_rent: int = Field(ge=0)
    deposit_amount: int = Field(ge=0)
    payment_day: int = Field(ge=1, le=31)
    payment_frequency: str = Field(default="monthly", max_length=30)
    contract_id: str | None = Field(default=None, max_length=100)
    lease_status: Literal["pending", "active"] = "active"

    @model_validator(mode="after")
    def validate_fields(self):
        if self.lease_end <= self.lease_start:
            raise ValueError("租約結束日必須晚於開始日。")
        if not PHONE_PATTERN.match(self.phone):
            raise ValueError("手機格式不正確。")
        if self.email and not EMAIL_PATTERN.match(self.email.strip()):
            raise ValueError("Email 格式不正確。")
        if self.contact_address and len(self.contact_address.encode('utf-8')) > 483:
            raise ValueError("聯絡地址過長，請縮短至 483 bytes 以內。")
        if not ((self.property_id and self.room_id) or (self.property_name and self.room_number)):
            raise ValueError("請選擇或輸入棟別與房號。")
        return self


class MoveOutPayload(BaseModel):
    move_out_date: date
    reason: str | None = None
    final_rent: int = Field(default=0, ge=0)
    utility_fee: int = Field(default=0, ge=0)
    deposit_refund: int = Field(default=0, ge=0)
    deposit_deduction: int = Field(default=0, ge=0)
    deduction_reason: str | None = None
    inspection_status: str = Field(default="pending", max_length=30)
    notes: str | None = None


class LeaseUpdatePayload(BaseModel):
    lease_start: date
    lease_end: date
    monthly_rent: int = Field(ge=0)
    deposit_amount: int = Field(ge=0)
    payment_day: int = Field(ge=1, le=31)
    payment_frequency: str = Field(default="monthly", max_length=30)
    contract_id: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.lease_end <= self.lease_start:
            raise ValueError("租約結束日必須晚於開始日。")
        return self


class RenewPayload(LeaseUpdatePayload):
    room_id: int | None = None


class ImportConfirmPayload(BaseModel):
    preview_token: str


# 舊名稱保留給既有呼叫端與測試
_current_lease = lambda tenant, today: rules.current_lease(tenant.leases, today)  # noqa: E731
_lease_display = rules.display_status
_is_effective = rules.is_effective


ENDED_LEASE_DETAIL = "這位租客的租約已經退租結束，不能再修改房間或租期（舊帳款會跟著被改掉）。要再租給他，請用「建立新租約」。"


def _lease_terms_changed(lease: LandlordLease, payload, room: LandlordRoom) -> bool:
    return (lease.room_id != room.id or lease.start_date != payload.lease_start or lease.end_date != payload.lease_end
            or lease.monthly_rent != payload.monthly_rent or lease.deposit_amount != payload.deposit_amount
            or lease.payment_day != payload.payment_day or (lease.payment_frequency or "monthly") != payload.payment_frequency)


def void_charges_after_move_out(db: Session, lease: LandlordLease, move_out: date, actor: User | None) -> int:
    """退租日（含）之後才開始的帳款作廢：那些期間租客已經不住了。

    已經有收款的不動，留給房東在退租結算裡處理（例如退還多收的租金）。
    退租當期（期間跨過退租日）也不動：要收多少由退租結算的「最後租金」決定。
    """
    from datetime import datetime as _datetime
    from db.models import LandlordCharge, LandlordChargeEvent

    charges = db.query(LandlordCharge).filter(LandlordCharge.lease_id == lease.id, LandlordCharge.voided_at.is_(None),
                                              LandlordCharge.period_start >= move_out).all()
    voided = 0
    for charge in charges:
        if sum(payment.amount for payment in charge.payments) > 0:
            continue
        charge.voided_at = _datetime.utcnow()
        charge.void_reason = f"租客於 {move_out.isoformat()} 退租"
        db.add(LandlordChargeEvent(charge_id=charge.id, kind="voided", detail=f"退租作廢：租客於 {move_out.isoformat()} 退租",
                                   actor_user_id=actor.id if actor else None))
        voided += 1
    return voided


def _reconcile_after_change(db: Session, tenant: LandlordTenant, lease: LandlordLease, before: dict, actor: User | None) -> None:
    """租約條件改了就讓已產生的租金帳款跟著對齊（見 landlord_finance.reconcile_rent_charges）。"""
    from routers.contract_links import lease_snapshot
    from routers.landlord_finance import reconcile_rent_charges

    if lease_snapshot(lease) == before:
        return
    result = reconcile_rent_charges(db, lease, actor.id if actor else None)
    parts = [f"作廢 {result['voided']} 期" if result["voided"] else "", f"調整 {result['adjusted']} 期日期" if result["adjusted"] else "",
             f"{result['flagged']} 期已收款需人工確認" if result["flagged"] else ""]
    summary = "、".join(part for part in parts if part)
    if summary:
        db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="charges_reconciled", detail=f"租約條件變更，帳款已對齊：{summary}"))


def _days_left(lease: LandlordLease | None, today: date) -> int | None:
    return (rules.occupied_until(lease) - today).days if lease else None


def _binding_status(db: Session | None, lease: LandlordLease | None) -> str:
    """租客帳號綁定狀態。欄位名稱沿用 line_status，畫面上已改稱「帳號綁定」。"""
    if not lease:
        return "unbound"
    if lease.tenant_user_id:
        return "bound"
    if db is None:
        return "unbound"
    invitation = db.query(LeaseInvitation).filter(
        LeaseInvitation.lease_id == lease.id, LeaseInvitation.status == "pending",
    ).order_by(LeaseInvitation.id.desc()).first()
    if not invitation:
        return "unbound"
    return "invited" if invitation.expires_at > _utcnow() else "expired"


def _utcnow():
    from datetime import datetime
    return datetime.utcnow()


def _completeness(tenant: LandlordTenant, lease: LandlordLease | None) -> dict[str, bool | int]:
    checks = {
        "basic": bool(tenant.name and rules.tenant_pii(tenant, "phone")),
        "contact": bool(tenant.email and tenant.emergency_name and rules.tenant_pii(tenant, "emergency_phone")),
        "room": bool(lease and lease.room_id and lease.property_id),
        "lease": bool(lease and lease.start_date and lease.end_date and lease.monthly_rent is not None),
        "payment": bool(lease and lease.payment_day and lease.deposit_amount is not None),
        # 舊欄位名 line：現在代表租客已接受邀請、綁定平台帳號
        "line": bool(lease and lease.tenant_user_id),
    }
    return {**checks, "percent": round(sum(bool(value) for value in checks.values()) / len(checks) * 100)}


def _tenant_dict(tenant: LandlordTenant, today: date, detailed: bool = False, db: Session | None = None) -> dict[str, object]:
    lease = _current_lease(tenant, today)
    property_item = lease.property if lease else None
    room = lease.room if lease else None
    readable = rules.pii_readable(tenant)
    phone = rules.tenant_pii(tenant, "phone")
    national_id = rules.tenant_pii(tenant, "national_id")
    scheduled_move_out = lease.moved_out_at if lease and lease.moved_out_at and lease.moved_out_at > today else None
    result: dict[str, object] = {
        "id": tenant.id, "name": tenant.name, "phone": phone if readable else rules.UNREADABLE, "email": tenant.email,
        "national_id_masked": (f"{national_id[:3]}*****{national_id[-2:]}" if national_id and len(national_id) >= 5 else None),
        "birth_date": tenant.birth_date, "contact_address": rules.tenant_pii(tenant, "contact_address"),
        "emergency_name": tenant.emergency_name, "emergency_phone": rules.tenant_pii(tenant, "emergency_phone"),
        "pii_readable": readable,
        "notes": tenant.notes, "line_status": _binding_status(db, lease),
        "property_id": property_item.id if property_item else None, "property_name": property_item.name if property_item else None,
        "property_address": (property_item.address or "") if property_item else "",
        "room_id": room.id if room else None, "room_number": room.number if room else None,
        "lease_id": lease.id if lease else None, "lease_start": lease.start_date if lease else None,
        "lease_end": lease.end_date if lease else None, "monthly_rent": lease.monthly_rent if lease else 0,
        "deposit_amount": lease.deposit_amount if lease else 0, "payment_day": lease.payment_day if lease else None,
        "payment_frequency": lease.payment_frequency if lease else None, "contract_id": lease.contract_id if lease else None,
        "lease_status": _lease_display(lease, today), "days_left": _days_left(lease, today),
        "effective": _is_effective(lease, today), "completeness": _completeness(tenant, lease),
        "scheduled_move_out": scheduled_move_out,
        "account_bound": bool(lease and lease.tenant_user_id),
        "created_at": tenant.created_at,
    }
    if detailed:
        result["activity_timeline"] = [
            {"kind": activity.kind, "detail": activity.detail, "occurred_at": activity.occurred_at}
            for activity in sorted(tenant.activities, key=lambda item: item.occurred_at, reverse=True)
        ]
        result["history"] = [
            {"id": item.id, "start_date": item.start_date, "end_date": item.end_date, "status": _lease_display(item, today),
             "property_name": item.property.name, "room_number": item.room.number, "monthly_rent": item.monthly_rent}
            for item in sorted(tenant.leases, key=lambda item: item.start_date, reverse=True)
        ]
        settlement = lease.move_out if lease else None
        result["move_out"] = None if not settlement else {
            "move_out_date": settlement.move_out_date, "reason": settlement.reason,
            "final_rent": settlement.final_rent, "utility_fee": settlement.utility_fee,
            "deposit_refund": settlement.deposit_refund, "deposit_deduction": settlement.deposit_deduction,
            "deduction_reason": settlement.deduction_reason, "inspection_status": settlement.inspection_status,
        }
    return result


def _owned_tenant(db: Session, landlord_id: int, tenant_id: int) -> LandlordTenant:
    tenant = db.query(LandlordTenant).options(
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.property),
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.room),
        joinedload(LandlordTenant.activities),
    ).filter(LandlordTenant.id == tenant_id, LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="找不到租客資料。")
    return tenant


def _resolve_room(db: Session, landlord_id: int, payload) -> tuple[LandlordProperty, LandlordRoom]:
    if payload.property_id and payload.room_id:
        room = db.query(LandlordRoom).join(LandlordProperty).filter(
            LandlordRoom.id == payload.room_id, LandlordRoom.property_id == payload.property_id,
            LandlordProperty.landlord_id == landlord_id,
        ).first()
        if not room:
            raise HTTPException(status_code=404, detail="找不到房東名下的棟別或房間。")
        return room.property, room
    property_name = (payload.property_name or "").strip()
    room_number = (payload.room_number or "").strip()
    property_item = db.query(LandlordProperty).filter(
        LandlordProperty.landlord_id == landlord_id, LandlordProperty.name == property_name
    ).first()
    if not property_item:
        raise HTTPException(status_code=404, detail="棟別不存在，請先至房務管理建立資料。")
    room = db.query(LandlordRoom).filter(
        LandlordRoom.property_id == property_item.id, LandlordRoom.number == room_number
    ).first()
    if not room:
        raise HTTPException(status_code=404, detail="房間不存在，請先至房務管理建立資料。")
    return property_item, room


def _assert_no_overlap(db: Session, room_id: int, start: date, end: date, exclude_lease_id: int | None = None) -> None:
    query = db.query(LandlordLease).filter(
        LandlordLease.room_id == room_id, LandlordLease.start_date <= end, LandlordLease.end_date >= start,
    )
    if exclude_lease_id:
        query = query.filter(LandlordLease.id != exclude_lease_id)
    if any(rules.blocks_room(lease, start, end) for lease in query.all()):
        raise HTTPException(status_code=409, detail="此房間在指定租期已有有效租約，無法重複指派。")


def _assert_unique_contact(db: Session, landlord_id: int, phone: str, email: str | None, exclude_tenant_id: int | None = None) -> None:
    # AES-GCM uses a fresh nonce, so encrypted phone numbers cannot be compared
    # with SQL equality. Only decrypt contacts owned by this landlord.
    query = db.query(LandlordTenant).filter(
        LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None)
    )
    if exclude_tenant_id:
        query = query.filter(LandlordTenant.id != exclude_tenant_id)
    phone = phone.strip()
    # 逐筆讀電話：解不開的那筆略過（無從比對），不讓整個新增失敗
    if any(rules.tenant_pii(item, "phone") == phone or (email and (item.email or "").lower() == email) for item in query.all()):
        raise HTTPException(status_code=409, detail="相同手機或 Email 的租客已存在。")


def _clean_email(value: str | None) -> str | None:
    return value.strip().lower() if value and value.strip() else None


def _base_query(db: Session, landlord_id: int):
    return db.query(LandlordTenant).options(
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.property),
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.room),
        joinedload(LandlordTenant.activities),
    ).filter(LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None))


def _sort_key(sort_by: str):
    if sort_by in SORTABLE_NUMBERS:
        return lambda row: (row.get(sort_by) is None, row.get(sort_by) or 0)
    return lambda row: str(row.get(sort_by) or "")


def _actor(request: Request | None, landlord: User) -> User:
    return landlord_actor(request, landlord) if request is not None else landlord


@router.get("")
def list_tenants(
    keyword: str = "", quick_filter: str = "all", property_id: int | None = None,
    status_filter: str = Query(default="all", alias="status"), page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500), sort_by: str = "name", sort_order: str = "asc",
    db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
):
    today = date.today()
    tenants = _base_query(db, landlord.id).all()
    rows = [_tenant_dict(tenant, today, db=db) for tenant in tenants]
    counts = {
        "all": len(rows), "occupied": sum(row["lease_status"] in ("occupied", "expiring") for row in rows),
        "expiring": sum(row["lease_status"] == "expiring" for row in rows),
        "unbound": sum(row["line_status"] != "bound" for row in rows),
        "incomplete": sum(int(row["completeness"]["percent"]) < 100 for row in rows),
        "moved_out": sum(row["lease_status"] == "moved_out" for row in rows),
    }
    query = keyword.strip().lower()
    if query:
        rows = [row for row in rows if any(query in str(row.get(field) or "").lower() for field in ("name", "phone", "email", "property_name", "room_number"))]
    quick_checks = {
        "occupied": lambda row: row["lease_status"] in ("occupied", "expiring"), "expiring": lambda row: row["lease_status"] == "expiring",
        "unbound": lambda row: row["line_status"] != "bound", "incomplete": lambda row: int(row["completeness"]["percent"]) < 100,
        "moved_out": lambda row: row["lease_status"] == "moved_out",
    }
    if quick_filter in quick_checks: rows = [row for row in rows if quick_checks[quick_filter](row)]
    if property_id: rows = [row for row in rows if row["property_id"] == property_id]
    if status_filter != "all": rows = [row for row in rows if row["lease_status"] == status_filter or (status_filter == "occupied" and row["lease_status"] == "expiring")]
    rows.sort(key=_sort_key(sort_by), reverse=sort_order == "desc")
    total = len(rows); start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size, "filter_counts": counts}


@router.get("/summary")
def tenant_summary(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    today = date.today(); tenants = _base_query(db, landlord.id).all(); leases = [_current_lease(item, today) for item in tenants]
    effective = [lease for lease in leases if _is_effective(lease, today)]
    return {"tenant_count": len(tenants), "active_lease_count": len(effective),
            "expiring_count": sum(0 <= (rules.occupied_until(lease) - today).days <= 30 for lease in effective),
            "deposit_total": sum(lease.deposit_amount for lease in effective),
            "monthly_rent_total": sum(lease.monthly_rent for lease in effective)}


@router.get("/options")
def tenant_options(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    today = date.today()
    properties = db.query(LandlordProperty).options(joinedload(LandlordProperty.rooms).joinedload(LandlordRoom.leases)).filter(LandlordProperty.landlord_id == landlord.id).all()

    def room_status(room: LandlordRoom) -> str:
        if any(rules.is_effective(lease, today) for lease in room.leases):
            return "occupied"
        return room.status if room.status in ("maintenance", "turnover") else "vacant"

    return {"properties": [{"id": item.id, "name": item.name, "address": item.address or "",
                            "rooms": [{"id": room.id, "number": room.number, "status": room_status(room)} for room in item.rooms]}
                           for item in properties]}


@router.get("/{tenant_id}")
def tenant_detail(tenant_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant_id), date.today(), detailed=True, db=db)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantPayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
                  request: Request = None):
    property_item, room = _resolve_room(db, landlord.id, payload)
    _assert_no_overlap(db, room.id, payload.lease_start, payload.lease_end)
    email = _clean_email(payload.email)
    _assert_unique_contact(db, landlord.id, payload.phone, email)
    tenant = LandlordTenant(landlord_id=landlord.id, name=payload.name.strip(), phone=payload.phone.strip(), email=email,
        national_id=payload.national_id, birth_date=payload.birth_date, contact_address=payload.contact_address, emergency_name=payload.emergency_name,
        emergency_phone=payload.emergency_phone, notes=payload.notes)
    db.add(tenant); db.flush()
    lease_status = "pending" if payload.lease_start > date.today() else "active"
    lease = LandlordLease(tenant_id=tenant.id, property_id=property_item.id, room_id=room.id, start_date=payload.lease_start, end_date=payload.lease_end,
        monthly_rent=payload.monthly_rent, deposit_amount=payload.deposit_amount, payment_day=payload.payment_day,
        payment_frequency=payload.payment_frequency, contract_id=payload.contract_id, status=lease_status)
    db.add(lease)
    if lease_status == "active":
        room.status = "occupied"
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="created", detail="建立租客資料"))
    record_audit(db, landlord, _actor(request, landlord), "租客", "新增租客", f"{tenant.name}（{property_item.name} {room.number}）")
    db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), date.today(), detailed=True, db=db)


@router.patch("/{tenant_id}")
def update_tenant(tenant_id: int, payload: TenantPayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
                  request: Request = None):
    today = date.today()
    tenant = _owned_tenant(db, landlord.id, tenant_id); lease = _current_lease(tenant, today)
    property_item, room = _resolve_room(db, landlord.id, payload)
    if lease and rules.moved_out(lease, today) and _lease_terms_changed(lease, payload, room):
        # 已結束的租約是歷史紀錄：改它的房間或租期會把舊帳款搬到新地址。再出租要另開一份。
        raise HTTPException(status_code=409, detail=ENDED_LEASE_DETAIL)
    _assert_no_overlap(db, room.id, payload.lease_start, payload.lease_end, lease.id if lease else None)
    email = _clean_email(payload.email)
    _assert_unique_contact(db, landlord.id, payload.phone, email, exclude_tenant_id=tenant.id)
    for field in ("name", "phone", "birth_date", "contact_address", "emergency_name", "emergency_phone", "notes"):
        value = getattr(payload, field)
        setattr(tenant, field, value.strip() if isinstance(value, str) else value)
    tenant.email = email
    if payload.national_id:
        tenant.national_id = payload.national_id
    from routers.contract_links import lease_snapshot, record_term_change
    before = lease_snapshot(lease) if lease else None
    if not lease:
        lease = LandlordLease(tenant_id=tenant.id); db.add(lease)
    lease.property_id = property_item.id; lease.room_id = room.id; lease.start_date = payload.lease_start; lease.end_date = payload.lease_end
    lease.monthly_rent = payload.monthly_rent; lease.deposit_amount = payload.deposit_amount; lease.payment_day = payload.payment_day
    lease.payment_frequency = payload.payment_frequency; lease.contract_id = payload.contract_id
    if lease.status in rules.LIVE_STATUSES or lease.status is None:
        lease.status = "pending" if payload.lease_start > today else "active"
    if before is not None:
        db.flush()
        record_term_change(db, lease, before, _actor(request, landlord))
        _reconcile_after_change(db, tenant, lease, before, _actor(request, landlord))
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="updated", detail="更新租客與租約資料"))
    record_audit(db, landlord, _actor(request, landlord), "租客", "更新租客資料", tenant.name)
    db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), today, detailed=True, db=db)


@router.patch("/{tenant_id}/lease")
def update_tenant_lease(tenant_id: int, payload: LeaseUpdatePayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
                        request: Request = None):
    today = date.today()
    tenant = _owned_tenant(db, landlord.id, tenant_id)
    lease = _current_lease(tenant, today)
    if not lease:
        raise HTTPException(status_code=404, detail="找不到可更新的租約。")
    if rules.moved_out(lease, today):
        raise HTTPException(status_code=409, detail=ENDED_LEASE_DETAIL)
    _assert_no_overlap(db, lease.room_id, payload.lease_start, payload.lease_end, lease.id)
    from routers.contract_links import lease_snapshot, record_term_change
    before = lease_snapshot(lease)
    lease.start_date = payload.lease_start
    lease.end_date = payload.lease_end
    lease.monthly_rent = payload.monthly_rent
    lease.deposit_amount = payload.deposit_amount
    lease.payment_day = payload.payment_day
    lease.payment_frequency = payload.payment_frequency
    lease.contract_id = payload.contract_id
    if lease.status in rules.LIVE_STATUSES:
        lease.status = "pending" if payload.lease_start > today else "active"
    db.flush()
    record_term_change(db, lease, before, _actor(request, landlord))
    _reconcile_after_change(db, tenant, lease, before, _actor(request, landlord))
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="lease_updated", detail="由合約管理更新租約資料"))
    record_audit(db, landlord, _actor(request, landlord), "合約", "更新租約", f"{tenant.name}：{payload.lease_start} ～ {payload.lease_end}")
    db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), today, detailed=True, db=db)


@router.post("/{tenant_id}/renew", status_code=status.HTTP_201_CREATED)
def renew_lease(tenant_id: int, payload: RenewPayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
                request: Request = None):
    """續約：替同一位租客新增一份租約，原租約與其帳款、附件都保留。"""
    today = date.today()
    tenant = _owned_tenant(db, landlord.id, tenant_id)
    previous = _current_lease(tenant, today)
    if not previous:
        raise HTTPException(status_code=404, detail="這位租客沒有可續約的租約。")
    room = previous.room
    if payload.room_id and payload.room_id != previous.room_id:
        room = db.query(LandlordRoom).join(LandlordProperty).filter(
            LandlordRoom.id == payload.room_id, LandlordProperty.landlord_id == landlord.id).first()
        if not room:
            raise HTTPException(status_code=404, detail="找不到房東名下的房間。")
    if payload.lease_start <= previous.start_date:
        raise HTTPException(status_code=422, detail="續約的開始日必須晚於原租約的開始日。")
    if rules.moved_out(previous, today) and payload.lease_start < previous.moved_out_at:
        raise HTTPException(status_code=422, detail=f"新租約要從上一份退租日（{previous.moved_out_at.isoformat()}）之後開始。")
    _assert_no_overlap(db, room.id, payload.lease_start, payload.lease_end, previous.id if payload.lease_start > previous.end_date else None)
    if room.id == previous.room_id and payload.lease_start <= rules.occupied_until(previous):
        raise HTTPException(status_code=409, detail=f"續約要從原租約結束後開始（{(previous.end_date + timedelta(days=1)).isoformat()} 或之後）。")
    lease = LandlordLease(
        tenant_id=tenant.id, property_id=room.property_id, room_id=room.id,
        start_date=payload.lease_start, end_date=payload.lease_end, monthly_rent=payload.monthly_rent,
        deposit_amount=payload.deposit_amount, payment_day=payload.payment_day,
        payment_frequency=payload.payment_frequency, contract_id=payload.contract_id,
        status="pending" if payload.lease_start > today else "active",
        # 同一位租客續約，帳號綁定延續；換人要重新邀請
        tenant_user_id=previous.tenant_user_id, tenant_bound_at=previous.tenant_bound_at,
    )
    db.add(lease)
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="renewed", detail=f"建立續約 {payload.lease_start.isoformat()} ～ {payload.lease_end.isoformat()}"))
    record_audit(db, landlord, _actor(request, landlord), "合約", "建立續約", f"{tenant.name}：{payload.lease_start} ～ {payload.lease_end}")
    db.commit()
    db.refresh(lease)
    return {"lease_id": lease.id, "tenant": _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), today, detailed=True, db=db)}


@router.post("/{tenant_id}/move-out")
def move_out(tenant_id: int, payload: MoveOutPayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
             request: Request = None):
    today = date.today()
    tenant = _owned_tenant(db, landlord.id, tenant_id); lease = _current_lease(tenant, today)
    if not lease or rules.moved_out(lease, today) or lease.move_out:
        raise HTTPException(status_code=409, detail="此租客已完成退租，請勿重複提交。")
    if payload.move_out_date < lease.start_date:
        raise HTTPException(status_code=422, detail="退租日不可早於租約開始日。")
    if payload.move_out_date > lease.end_date + timedelta(days=1):
        raise HTTPException(status_code=422, detail="退租日晚於租約到期日，請先續約或修改租期。")
    if payload.deposit_refund + payload.deposit_deduction > lease.deposit_amount:
        raise HTTPException(status_code=422, detail=f"退還押金加上扣款不可超過押金 {lease.deposit_amount:,} 元。")
    if payload.deposit_deduction and not (payload.deduction_reason or "").strip():
        raise HTTPException(status_code=422, detail="有扣押金時請填寫扣款原因。")
    settlement = LandlordMoveOut(lease_id=lease.id, **payload.model_dump()); db.add(settlement)
    lease.status = "terminated" if payload.move_out_date <= lease.end_date else "ended"
    lease.moved_out_at = payload.move_out_date
    scheduled = payload.move_out_date > today
    # 預定退租：搬走那天之前房間仍算出租中，由租約規則依日期判斷，不在這裡先釋出
    if not scheduled:
        lease.room.status = "turnover"
    detail = f"{'排定' if scheduled else '完成'}退租，退租日 {payload.move_out_date.isoformat()}"
    voided = void_charges_after_move_out(db, lease, payload.move_out_date, _actor(request, landlord))
    if voided:
        detail += f"，作廢退租後的 {voided} 筆帳款"
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="moved_out", detail=detail))
    record_audit(db, landlord, _actor(request, landlord), "租客", "退租結算", f"{tenant.name}：{detail}")
    db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), today, detailed=True, db=db)


@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...), db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    content = (await file.read()).decode("utf-8-sig"); rows = list(csv.DictReader(io.StringIO(content))); preview = []
    today = date.today()
    properties = db.query(LandlordProperty).options(joinedload(LandlordProperty.rooms).joinedload(LandlordRoom.leases)).filter(
        LandlordProperty.landlord_id == landlord.id).all()
    rooms = {(item.name, room.number): room for item in properties for room in item.rooms}
    contacts = db.query(LandlordTenant).filter(
        LandlordTenant.landlord_id == landlord.id, LandlordTenant.deleted_at.is_(None)).all()
    known_phones = {rules.tenant_pii(item, "phone") for item in contacts} - {None}
    known_emails = {(item.email or "").lower() for item in contacts if item.email}
    claimed: list[tuple[int, date, date]] = []
    seen_phones: set[str] = set()
    for index, row in enumerate(rows, start=2):
        errors = []
        for field in ("name", "phone", "property_name", "room_number", "lease_start", "lease_end", "monthly_rent", "deposit_amount", "payment_day"):
            if not (row.get(field) or "").strip(): errors.append(f"缺少 {field}")
        parsed = None
        try:
            parsed = TenantPayload(**{**row, "email": (row.get("email") or "").strip() or None,
                                      "monthly_rent": int(row.get("monthly_rent") or 0), "deposit_amount": int(row.get("deposit_amount") or 0),
                                      "payment_day": int(row.get("payment_day") or 0)})
        except Exception as error: errors.append(str(error).split("\n")[0])
        if parsed:
            room = rooms.get(((parsed.property_name or "").strip(), (parsed.room_number or "").strip()))
            if not room:
                errors.append("棟別或房號不存在，請先在房務管理建立")
            else:
                if any(rules.blocks_room(lease, parsed.lease_start, parsed.lease_end) for lease in room.leases):
                    errors.append("這間房在該租期已有租約")
                if any(room_id == room.id and start <= parsed.lease_end and end >= parsed.lease_start for room_id, start, end in claimed):
                    errors.append("與檔案中另一列的租期重疊")
                claimed.append((room.id, parsed.lease_start, parsed.lease_end))
            phone = parsed.phone.strip()
            if phone in known_phones or phone in seen_phones:
                errors.append("相同手機的租客已存在")
            if parsed.email and parsed.email.strip().lower() in known_emails:
                errors.append("相同 Email 的租客已存在")
            seen_phones.add(phone)
        preview.append({"row": index, "data": row, "errors": errors, "valid": not errors})
    token = secrets.token_urlsafe(24); _import_previews[token] = {"landlord_id": landlord.id, "expires": time.time() + 900, "rows": preview}
    return {"preview_token": token, "rows": preview, "valid_count": sum(item["valid"] for item in preview), "error_count": sum(not item["valid"] for item in preview)}


@router.post("/import/confirm")
def import_confirm(payload: ImportConfirmPayload, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace),
                   request: Request = None):
    preview = _import_previews.pop(payload.preview_token, None)
    if not preview or preview["landlord_id"] != landlord.id or preview["expires"] < time.time():
        raise HTTPException(status_code=404, detail="匯入預覽已失效，請重新選擇 CSV。")
    created, errors = [], []
    for item in preview["rows"]:
        if not item["valid"]: errors.append(item); continue
        try:
            raw = item["data"]; tenant_payload = TenantPayload(**{**raw, "email": (raw.get("email") or "").strip() or None,
                "monthly_rent": int(raw["monthly_rent"]), "deposit_amount": int(raw["deposit_amount"]), "payment_day": int(raw["payment_day"])})
            created.append(create_tenant(tenant_payload, db, landlord, request)["id"])
        except HTTPException as error:
            db.rollback(); errors.append({**item, "errors": [str(error.detail)], "valid": False})
    return {"created_count": len(created), "error_count": len(errors), "created_ids": created, "errors": errors}
