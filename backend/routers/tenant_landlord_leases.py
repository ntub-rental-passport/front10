"""租客端看房東平台上的租約：首頁的每期帳款、回報已繳款、租約內容與附件。

兩套租約不合併：
- rentals：租客自己存的合約，帳單由租客自己標已繳。
- landlord_leases：房東建立、租客接受邀請加入的。金額與收款以房東的紀錄為準，
  租客只能看，不能自己標已繳 —— 改成「回報已繳款」，通知房東去確認入帳。

首頁把後者轉成跟前者一樣的格式（source = "landlord"），前端照原本的列表顯示。
可見範圍與報修相同（routers/tenant_leases.tenant_visible_leases）。
"""
import datetime
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, selectinload

from auth.security import get_current_tenant
from db.database import get_db
from db.models import LandlordCharge, LandlordChargeEvent, LandlordLease, User
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules

router = APIRouter(prefix="/api/tenant/landlord-leases", tags=["Tenant landlord leases"])

PAYMENT_METHODS = ("bank-transfer", "cash", "line-pay", "other")
METHOD_LABELS = {"bank-transfer": "銀行轉帳", "cash": "現金", "line-pay": "LINE Pay", "other": "其他方式"}


class PaymentReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paid_at: datetime.date
    payment_method: str = Field(default="other")
    payment_note: str = Field(default="", max_length=500)


def _paid(charge: LandlordCharge) -> int:
    return sum(payment.amount for payment in charge.payments)


def _lease_charges(db: Session, lease: LandlordLease) -> list[LandlordCharge]:
    """這份租約的所有帳款（不含作廢）。租金先補產生到整段租期結束。"""
    from routers.landlord_finance import ensure_rent_charges

    ensure_rent_charges(db, lease.tenant.landlord_id, rules.occupied_until(lease), lease_ids={lease.id})
    return (
        db.query(LandlordCharge)
        .options(selectinload(LandlordCharge.payments), selectinload(LandlordCharge.events))
        .filter(LandlordCharge.lease_id == lease.id, LandlordCharge.voided_at.is_(None))
        .order_by(LandlordCharge.period_start, LandlordCharge.id)
        .all()
    )


def _group_by_period(charges: list[LandlordCharge]) -> list[tuple[LandlordCharge, list[LandlordCharge]]]:
    """每期 = 一筆租金 + 落在那段期間的水電／其他費用。期間外的費用歸到到期日所在的那期。"""
    rents = [charge for charge in charges if charge.kind == "rent"]
    extras: dict[int, list[LandlordCharge]] = defaultdict(list)
    for charge in charges:
        if charge.kind == "rent" or not rents:
            continue
        owner = next((rent for rent in rents if rent.period_start <= charge.period_start <= rent.period_end), None)
        owner = owner or next((rent for rent in rents if rent.period_start <= charge.due_date <= rent.period_end), None)
        owner = owner or min(rents, key=lambda rent: abs((rent.due_date - charge.due_date).days))
        extras[owner.id].append(charge)
    return [(rent, extras.get(rent.id, [])) for rent in rents]


def _reported(charges: list[LandlordCharge]) -> dict | None:
    """租客最近一次回報（房東還沒確認收齊之前才有意義）。"""
    events = [event for charge in charges for event in charge.events if event.kind == "tenant_reported"]
    if not events:
        return None
    latest = max(events, key=lambda event: event.id)
    return {"at": latest.created_at.isoformat(), "detail": latest.detail}


def _cycle_json(index: int, rent: LandlordCharge, extras: list[LandlordCharge]) -> dict:
    electricity = [charge for charge in extras if charge.kind == 'electricity']
    group = [rent, *extras]
    total = sum(charge.amount for charge in group)
    paid = sum(min(charge.amount, _paid(charge)) for charge in group)
    payments = [payment for charge in group for payment in charge.payments if payment.amount > 0]
    settled = paid >= total
    last_payment = max(payments, key=lambda payment: payment.paid_on) if payments else None
    return {
        "id": f"charge:{rent.id}",
        "periodIndex": index,
        "periodStart": rent.period_start.isoformat(),
        "periodEnd": rent.period_end.isoformat(),
        "dueDate": rent.due_date.isoformat(),
        "rentAmount": rent.amount,
        # 房東沒有開水電帳款就是 0：以房東的紀錄為準，不顯示「待匯入」
        "electricityAmount": sum(charge.amount for charge in extras if charge.kind == "electricity"),
        "waterAmount": sum(charge.amount for charge in extras if charge.kind in ("water", "other")),
        "utilityDetails": {'electricity': electricity[0].utility_details, 'water': {'method': 'pending'}}
                          if len(electricity) == 1 and electricity[0].utility_details else None,
        "paidAt": last_payment.paid_on.isoformat() if settled and last_payment else None,
        "paymentMethod": last_payment.method if settled and last_payment else None,
        "paymentNote": "房東已確認入帳" if settled else "",
        "paymentProofName": None,
        "source": "landlord",
        "paidAmount": paid,
        "totalAmount": total,
        "tenantReport": None if settled else _reported(group),
    }


def landlord_contracts_for(db: Session, user: User, accents: tuple[str, ...], offset: int) -> list[dict]:
    """首頁用：這位租客看得到的房東租約（已退租的不列），轉成首頁的租約格式。"""
    from routers.tenant_leases import tenant_visible_leases

    today = datetime.date.today()
    items = []
    for lease in sorted(tenant_visible_leases(db, user), key=lambda item: (item.start_date, item.id)):
        if rules.moved_out(lease, today):
            continue
        landlord = db.get(User, lease.tenant.landlord_id)
        address = lease.property.address or ""
        cycles = [_cycle_json(index, rent, extras)
                  for index, (rent, extras) in enumerate(_group_by_period(_lease_charges(db, lease)), start=1)]
        from routers.dashboard import _city_of, _lease_months

        items.append({
            "id": f"lease:{lease.id}",
            "source": "landlord",
            "title": f"{lease.property.name} {lease.room.number}",
            "city": _city_of(address),
            "address": address,
            "landlord": (landlord.display_name or "房東") if landlord else "房東",
            "leaseMonths": _lease_months(lease.start_date, lease.end_date),
            "contractStart": lease.start_date.isoformat(),
            "contractEnd": lease.end_date.isoformat(),
            "dueDay": lease.payment_day,
            "electricityPlan": "依房東開立的帳款",
            "waterPlan": "依房東開立的帳款",
            "accent": accents[(offset + len(items)) % len(accents)],
            "cycles": cycles,
        })
    return items


def _visible_lease(db: Session, user: User, lease_id: int) -> LandlordLease:
    from routers.tenant_leases import tenant_visible_leases

    lease = next((item for item in tenant_visible_leases(db, user) if item.id == lease_id), None)
    if not lease:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這份租約，或它不屬於你的帳號。")
    return lease


@router.post("/charges/{charge_id}/report")
def report_payment(charge_id: int, payload: PaymentReport, db: Session = Depends(get_db),
                   user: User = Depends(get_current_tenant)):
    """租客回報已繳款：記一筆帳款事件、通知房東確認。不會改變已收金額。"""
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "不支援的付款方式。")
    if payload.paid_at > datetime.date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "繳款日期不可晚於今天。")
    rent = db.get(LandlordCharge, charge_id)
    if not rent or rent.kind != "rent":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這期帳款。")
    lease = _visible_lease(db, user, rent.lease_id)
    group = next(((r, extras) for r, extras in _group_by_period(_lease_charges(db, lease)) if r.id == rent.id), None)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這期帳款。")
    charges = [group[0], *group[1]]
    balance = sum(max(0, charge.amount - _paid(charge)) for charge in charges)
    if balance <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "這期房東已經確認收齊，不需要再回報。")

    note = payload.payment_note.strip()
    detail = (f"租客回報已繳款：{payload.paid_at.isoformat()}，{METHOD_LABELS[payload.payment_method]}"
              + (f"，備註：{note}" if note else "") + "（待房東確認入帳）")
    for charge in charges:
        if charge.amount - _paid(charge) > 0:
            db.add(LandlordChargeEvent(charge_id=charge.id, kind="tenant_reported", detail=detail, actor_user_id=user.id))
    landlord = db.get(User, lease.tenant.landlord_id)
    if landlord:
        from routers.landlord_workspace_api import settings_for

        notify_user(
            db, landlord,
            title=f"{lease.tenant.name} 回報已繳款",
            body=f"{lease.property.name} {lease.room.number} 的{group[0].title}（未收 NT${balance:,}）：{detail}。請到財務管理確認入帳。",
            category="帳務", source_label="租客回報繳款", created_by=f"tenant:{user.id}",
            action_url="/landlord/finance", action_label="確認入帳",
            email=settings_for(db, landlord).email_notifications,
        )
    db.commit()
    db.expire_all()
    rent, extras = next((r, e) for r, e in _group_by_period(_lease_charges(db, lease)) if r.id == charge_id)
    index = [r.id for r, _ in _group_by_period(_lease_charges(db, lease))].index(charge_id) + 1
    return _cycle_json(index, rent, extras)


@router.get("/{lease_id}")
def lease_detail(lease_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    """房東登記的租約內容：租期、租金、押金、繳費方式與合約附件清單（唯讀）。"""
    lease = _visible_lease(db, user, lease_id)
    landlord = db.get(User, lease.tenant.landlord_id)
    return {
        "lease_id": lease.id,
        "landlord": (landlord.display_name or "房東") if landlord else "房東",
        "property": lease.property.name,
        "address": lease.property.address or "",
        "room": lease.room.number,
        "tenant": lease.tenant.name,
        "start": lease.start_date,
        "end": lease.end_date,
        "moved_out_at": lease.moved_out_at,
        "rent": lease.monthly_rent,
        "deposit": lease.deposit_amount,
        "payment_day": lease.payment_day,
        "payment_frequency": lease.payment_frequency,
        "contract_id": lease.contract_id,
        "status": rules.display_status(lease, datetime.date.today()),
        "bound": lease.tenant_user_id == user.id,
        "files": [{"id": item.id, "name": item.original_name, "content_type": item.content_type,
                   "size": item.size_bytes, "uploaded_at": item.uploaded_at} for item in lease.files],
    }


@router.get("/{lease_id}/files/{file_id}")
def download_file(lease_id: int, file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    from routers.landlord_contracts import _STORED_NAME, file_directory

    lease = _visible_lease(db, user, lease_id)
    item = next((entry for entry in lease.files if entry.id == file_id), None)
    if not item or not _STORED_NAME.fullmatch(item.stored_name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個附件。")
    path = file_directory() / item.stored_name
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "附件檔案已不在伺服器上，請向房東索取。")
    return FileResponse(path, media_type=item.content_type, filename=item.original_name)
