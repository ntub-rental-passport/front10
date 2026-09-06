import csv
import io
import re
import secrets
import time
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    LandlordLease,
    LandlordMoveOut,
    LandlordProperty,
    LandlordRoom,
    LandlordTenant,
    LandlordTenantActivity,
    User,
)
from security import get_current_landlord

router = APIRouter(prefix="/api/landlord/tenants", tags=["Landlord tenants"])
ACTIVE_LEASE_STATUSES = ("active", "pending")
PHONE_PATTERN = re.compile(r"^[0-9+()\-\s]{8,20}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_import_previews: dict[str, dict[str, object]] = {}


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
        if self.email and not EMAIL_PATTERN.match(self.email):
            raise ValueError("Email 格式不正確。")
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
    inspection_status: str = "pending"
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


class ImportConfirmPayload(BaseModel):
    preview_token: str


def _days_left(lease: LandlordLease | None, today: date) -> int | None:
    return (lease.end_date - today).days if lease else None


def _current_lease(tenant: LandlordTenant, today: date) -> LandlordLease | None:
    leases = sorted(tenant.leases, key=lambda item: (item.start_date, item.id), reverse=True)
    return next((lease for lease in leases if lease.status in ACTIVE_LEASE_STATUSES and lease.moved_out_at is None), leases[0] if leases else None)


def _lease_display(lease: LandlordLease | None, today: date) -> str:
    if not lease:
        return "incomplete"
    if lease.status in ("terminated", "ended") or lease.moved_out_at:
        return "moved_out"
    if lease.start_date > today:
        return "pending"
    if lease.end_date < today:
        return "expired"
    if (lease.end_date - today).days <= 30:
        return "expiring"
    return "occupied"


def _is_effective(lease: LandlordLease | None, today: date) -> bool:
    return bool(lease and lease.status == "active" and not lease.moved_out_at and lease.start_date <= today <= lease.end_date)


def _completeness(tenant: LandlordTenant, lease: LandlordLease | None) -> dict[str, bool | int]:
    checks = {
        "basic": bool(tenant.name and tenant.phone),
        "contact": bool(tenant.email and tenant.emergency_name and tenant.emergency_phone),
        "room": bool(lease and lease.room_id and lease.property_id),
        "lease": bool(lease and lease.start_date and lease.end_date and lease.monthly_rent is not None),
        "payment": bool(lease and lease.payment_day and lease.deposit_amount is not None),
        "line": bool(tenant.line_user_id and tenant.line_status == "bound"),
    }
    return {**checks, "percent": round(sum(bool(value) for value in checks.values()) / len(checks) * 100)}


def _tenant_dict(tenant: LandlordTenant, today: date, detailed: bool = False) -> dict[str, object]:
    lease = _current_lease(tenant, today)
    property_item = lease.property if lease else None
    room = lease.room if lease else None
    result: dict[str, object] = {
        "id": tenant.id, "name": tenant.name, "phone": tenant.phone, "email": tenant.email,
        "national_id_masked": (f"{tenant.national_id[:3]}*****{tenant.national_id[-2:]}" if tenant.national_id and len(tenant.national_id) >= 5 else None),
        "birth_date": tenant.birth_date, "contact_address": tenant.contact_address,
        "emergency_name": tenant.emergency_name, "emergency_phone": tenant.emergency_phone,
        "notes": tenant.notes, "line_status": tenant.line_status,
        "property_id": property_item.id if property_item else None, "property_name": property_item.name if property_item else None,
        "room_id": room.id if room else None, "room_number": room.number if room else None,
        "lease_id": lease.id if lease else None, "lease_start": lease.start_date if lease else None,
        "lease_end": lease.end_date if lease else None, "monthly_rent": lease.monthly_rent if lease else 0,
        "deposit_amount": lease.deposit_amount if lease else 0, "payment_day": lease.payment_day if lease else None,
        "payment_frequency": lease.payment_frequency if lease else None, "contract_id": lease.contract_id if lease else None,
        "lease_status": _lease_display(lease, today), "days_left": _days_left(lease, today),
        "effective": _is_effective(lease, today), "completeness": _completeness(tenant, lease),
        "created_at": tenant.created_at,
    }
    if detailed:
        result["activity_timeline"] = [
            {"kind": activity.kind, "detail": activity.detail, "occurred_at": activity.occurred_at}
            for activity in sorted(tenant.activities, key=lambda item: item.occurred_at, reverse=True)
        ]
        result["history"] = [
            {"id": item.id, "start_date": item.start_date, "end_date": item.end_date, "status": item.status,
             "property_name": item.property.name, "room_number": item.room.number, "monthly_rent": item.monthly_rent}
            for item in sorted(tenant.leases, key=lambda item: item.start_date, reverse=True)
        ]
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


def _resolve_room(db: Session, landlord_id: int, payload: TenantPayload) -> tuple[LandlordProperty, LandlordRoom]:
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
        LandlordLease.room_id == room_id, LandlordLease.status.in_(ACTIVE_LEASE_STATUSES),
        LandlordLease.moved_out_at.is_(None), LandlordLease.start_date <= end, LandlordLease.end_date >= start,
    )
    if exclude_lease_id:
        query = query.filter(LandlordLease.id != exclude_lease_id)
    if query.first():
        raise HTTPException(status_code=409, detail="此房間在指定租期已有有效租約，無法重複指派。")


def _base_query(db: Session, landlord_id: int):
    return db.query(LandlordTenant).options(
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.property),
        joinedload(LandlordTenant.leases).joinedload(LandlordLease.room),
        joinedload(LandlordTenant.activities),
    ).filter(LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None))


@router.get("")
def list_tenants(
    keyword: str = "", quick_filter: str = "all", property_id: int | None = None,
    status_filter: str = Query(default="all", alias="status"), page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100), sort_by: str = "name", sort_order: str = "asc",
    db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord),
):
    today = date.today()
    tenants = _base_query(db, landlord.id).all()
    rows = [_tenant_dict(tenant, today) for tenant in tenants]
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
    reverse = sort_order == "desc"
    rows.sort(key=lambda row: str(row.get(sort_by) or ""), reverse=reverse)
    total = len(rows); start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size, "filter_counts": counts}


@router.get("/summary")
def tenant_summary(db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    today = date.today(); tenants = _base_query(db, landlord.id).all(); leases = [_current_lease(item, today) for item in tenants]
    effective = [lease for lease in leases if _is_effective(lease, today)]
    return {"tenant_count": len(tenants), "active_lease_count": len(effective),
            "expiring_count": sum(0 <= (lease.end_date - today).days <= 30 for lease in effective),
            "deposit_total": sum(lease.deposit_amount for lease in effective),
            "monthly_rent_total": sum(lease.monthly_rent for lease in effective)}


@router.get("/options")
def tenant_options(db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    properties = db.query(LandlordProperty).options(joinedload(LandlordProperty.rooms)).filter(LandlordProperty.landlord_id == landlord.id).all()
    return {"properties": [{"id": item.id, "name": item.name, "rooms": [{"id": room.id, "number": room.number, "status": room.status} for room in item.rooms]} for item in properties]}


@router.get("/{tenant_id}")
def tenant_detail(tenant_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant_id), date.today(), detailed=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantPayload, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    property_item, room = _resolve_room(db, landlord.id, payload)
    _assert_no_overlap(db, room.id, payload.lease_start, payload.lease_end)
    duplicate = db.query(LandlordTenant).filter(LandlordTenant.landlord_id == landlord.id, LandlordTenant.deleted_at.is_(None), or_(LandlordTenant.phone == payload.phone, LandlordTenant.email == payload.email if payload.email else False)).first()
    if duplicate: raise HTTPException(status_code=409, detail="相同手機或 Email 的租客已存在。")
    tenant = LandlordTenant(landlord_id=landlord.id, name=payload.name.strip(), phone=payload.phone.strip(), email=payload.email.strip().lower() if payload.email else None,
        national_id=payload.national_id, birth_date=payload.birth_date, contact_address=payload.contact_address, emergency_name=payload.emergency_name,
        emergency_phone=payload.emergency_phone, notes=payload.notes)
    db.add(tenant); db.flush()
    lease = LandlordLease(tenant_id=tenant.id, property_id=property_item.id, room_id=room.id, start_date=payload.lease_start, end_date=payload.lease_end,
        monthly_rent=payload.monthly_rent, deposit_amount=payload.deposit_amount, payment_day=payload.payment_day,
        payment_frequency=payload.payment_frequency, contract_id=payload.contract_id, status=payload.lease_status)
    db.add(lease); room.status = "occupied" if payload.lease_status == "active" else "turnover"
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="created", detail="建立租客資料")); db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), date.today(), detailed=True)


@router.patch("/{tenant_id}")
def update_tenant(tenant_id: int, payload: TenantPayload, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    tenant = _owned_tenant(db, landlord.id, tenant_id); lease = _current_lease(tenant, date.today())
    property_item, room = _resolve_room(db, landlord.id, payload); _assert_no_overlap(db, room.id, payload.lease_start, payload.lease_end, lease.id if lease else None)
    for field in ("name", "phone", "email", "birth_date", "contact_address", "emergency_name", "emergency_phone", "notes"):
        setattr(tenant, field, getattr(payload, field))
    if payload.national_id:
        tenant.national_id = payload.national_id
    if not lease:
        lease = LandlordLease(tenant_id=tenant.id); db.add(lease)
    lease.property_id = property_item.id; lease.room_id = room.id; lease.start_date = payload.lease_start; lease.end_date = payload.lease_end
    lease.monthly_rent = payload.monthly_rent; lease.deposit_amount = payload.deposit_amount; lease.payment_day = payload.payment_day
    lease.payment_frequency = payload.payment_frequency; lease.contract_id = payload.contract_id; lease.status = payload.lease_status
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="updated", detail="更新租客與租約資料")); db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), date.today(), detailed=True)


@router.patch("/{tenant_id}/lease")
def update_tenant_lease(tenant_id: int, payload: LeaseUpdatePayload, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    tenant = _owned_tenant(db, landlord.id, tenant_id)
    lease = _current_lease(tenant, date.today())
    if not lease:
        raise HTTPException(status_code=404, detail="找不到可更新的租約。")
    _assert_no_overlap(db, lease.room_id, payload.lease_start, payload.lease_end, lease.id)
    lease.start_date = payload.lease_start
    lease.end_date = payload.lease_end
    lease.monthly_rent = payload.monthly_rent
    lease.deposit_amount = payload.deposit_amount
    lease.payment_day = payload.payment_day
    lease.payment_frequency = payload.payment_frequency
    lease.contract_id = payload.contract_id
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="lease_updated", detail="由合約管理更新租約資料"))
    db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), date.today(), detailed=True)


@router.post("/{tenant_id}/move-out")
def move_out(tenant_id: int, payload: MoveOutPayload, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    tenant = _owned_tenant(db, landlord.id, tenant_id); lease = _current_lease(tenant, date.today())
    if not lease or lease.status in ("terminated", "ended") or lease.move_out:
        raise HTTPException(status_code=409, detail="此租客已完成退租，請勿重複提交。")
    settlement = LandlordMoveOut(lease_id=lease.id, **payload.model_dump()); db.add(settlement)
    lease.status = "terminated" if payload.move_out_date < lease.end_date else "ended"; lease.moved_out_at = payload.move_out_date
    lease.room.status = "turnover"; db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="moved_out", detail=f"完成退租，退租日 {payload.move_out_date.isoformat()}")); db.commit()
    return _tenant_dict(_owned_tenant(db, landlord.id, tenant.id), date.today(), detailed=True)


@router.post("/{tenant_id}/line-invite")
def line_invite(tenant_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    tenant = _owned_tenant(db, landlord.id, tenant_id); tenant.line_status = "invited"; tenant.line_invited_at = datetime.utcnow()
    db.add(LandlordTenantActivity(tenant_id=tenant.id, kind="line_invite", detail="產生 LINE 綁定邀請（尚未串接 LINE API）")); db.commit()
    return {"status": "invited", "invite_url": f"https://line.me/R/ti/p/@rentmate?tenant={secrets.token_urlsafe(12)}", "expires_at": datetime.utcnow() + timedelta(days=1), "mock": True}


@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...), db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    content = (await file.read()).decode("utf-8-sig"); rows = list(csv.DictReader(io.StringIO(content))); preview = []
    for index, row in enumerate(rows, start=2):
        errors = []
        for field in ("name", "phone", "property_name", "room_number", "lease_start", "lease_end", "monthly_rent", "deposit_amount", "payment_day"):
            if not (row.get(field) or "").strip(): errors.append(f"缺少 {field}")
        try:
            if row.get("email") and not EMAIL_PATTERN.match(row["email"]): errors.append("Email 格式錯誤")
            TenantPayload(**{**row, "monthly_rent": int(row.get("monthly_rent") or 0), "deposit_amount": int(row.get("deposit_amount") or 0), "payment_day": int(row.get("payment_day") or 0)})
        except Exception as error: errors.append(str(error).split("\n")[0])
        preview.append({"row": index, "data": row, "errors": errors, "valid": not errors})
    token = secrets.token_urlsafe(24); _import_previews[token] = {"landlord_id": landlord.id, "expires": time.time() + 900, "rows": preview}
    return {"preview_token": token, "rows": preview, "valid_count": sum(item["valid"] for item in preview), "error_count": sum(not item["valid"] for item in preview)}


@router.post("/import/confirm")
def import_confirm(payload: ImportConfirmPayload, db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)):
    preview = _import_previews.pop(payload.preview_token, None)
    if not preview or preview["landlord_id"] != landlord.id or preview["expires"] < time.time():
        raise HTTPException(status_code=404, detail="匯入預覽已失效，請重新選擇 CSV。")
    created, errors = [], []
    for item in preview["rows"]:
        if not item["valid"]: errors.append(item); continue
        try:
            raw = item["data"]; tenant_payload = TenantPayload(**{**raw, "monthly_rent": int(raw["monthly_rent"]), "deposit_amount": int(raw["deposit_amount"]), "payment_day": int(raw["payment_day"])})
            created.append(create_tenant(tenant_payload, db, landlord)["id"])
        except HTTPException as error:
            db.rollback(); errors.append({**item, "errors": [str(error.detail)], "valid": False})
    return {"created_count": len(created), "error_count": len(errors), "created_ids": created, "errors": errors}
