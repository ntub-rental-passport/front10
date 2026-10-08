"""房東帳務：應收、實收、催繳、支出。

以前收款存在瀏覽器 localStorage，而且「本月應收」每次都用當下的租約重算——
改租金會改到已經過去的帳，退租後未結清的款項會從畫面上消失。現在：

- 應收（landlord_charges）每期每種費用一筆，金額在產生當下固定。
  畫面打開哪個月份，就補產生到那個月為止還沒產生的租金期數（冪等，有唯一鍵）。
- 實收（landlord_charge_payments）只新增：記錯了用一筆負數沖銷，不改不刪。
- 狀態有兩個維度：是否逾期（到期日已過且仍有餘額）、是否部分收款。
  逾期的部分收款仍算進逾期金額。
- 催繳：租客已綁定帳號才送得出站內通知；沒綁定就明說送不出去，不假裝已提醒。
- 支出存資料庫；報修工單由房東負擔的實際費用自動列入支出（唯讀，來源是報修）。
"""
import calendar
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from db.database import get_db
from db.models import (
    LandlordCharge,
    LandlordChargeEvent,
    LandlordChargePayment,
    LandlordExpense,
    LandlordLease,
    LandlordProperty,
    LandlordTenant,
    RepairTicket,
    User,
)
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules
from db.utility_billing import UtilityEntry
from decimal import Decimal
from pydantic import ConfigDict

router = APIRouter(prefix="/api/landlord/finance", tags=["Landlord finance"])

FREQUENCY_MONTHS = {"monthly": 1, "bimonthly": 2, "quarterly": 3}
KIND_LABELS = {"rent": "租金", "water": "水費", "electricity": "電費", "other": "其他費用"}
PAYMENT_METHODS = ("bank-transfer", "cash", "line-pay", "other")
REPAIR_EXPENSE_RESPONSIBILITIES = ("landlord", "shared")


class PaymentPayload(BaseModel):
    amount: int = Field(gt=0)
    paid_on: date
    method: str = Field(default="other", max_length=30)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("method")
    @classmethod
    def known_method(cls, value: str) -> str:
        if value not in PAYMENT_METHODS:
            raise ValueError("不支援的付款方式。")
        return value


class ReversePayload(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ChargePayload(BaseModel):
    lease_id: int
    kind: Literal["water", "electricity", "other"]
    title: str = Field(min_length=1, max_length=100)
    amount: int = Field(gt=0)
    due_date: date
    period_start: date | None = None
    period_end: date | None = None


class VoidPayload(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ElectricityRow(BaseModel):
    model_config = ConfigDict(extra='forbid')
    lease_id: int
    entry: UtilityEntry


class ElectricityBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    property_id: int
    month: str
    due_date: date
    rows: list[ElectricityRow] = Field(min_length=1, max_length=200)


def _electricity_history(db, lease_id, before):
    rows = db.query(LandlordCharge).filter(LandlordCharge.lease_id == lease_id,
        LandlordCharge.kind == 'electricity', LandlordCharge.period_start < before,
        LandlordCharge.voided_at.is_(None)).order_by(LandlordCharge.period_start.desc()).all()
    return next((r.utility_details for r in rows if r.utility_details and r.utility_details.get('current') is not None), {})


@router.get('/electricity')
def electricity_records(month: str, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    start, end = _month_bounds(month)
    items = []
    for lease in _landlord_leases(db, landlord.id):
        if lease.status not in ('active', 'ended', 'terminated') or lease.start_date > end or lease.end_date < start:
            continue
        previous = _electricity_history(db, lease.id, start)
        saved = db.query(LandlordCharge).filter(LandlordCharge.lease_id == lease.id,
            LandlordCharge.kind == 'electricity', LandlordCharge.period_start >= start,
            LandlordCharge.period_start <= end).first()
        items.append({'lease_id': lease.id, 'property_id': lease.property_id, 'property': lease.property.name,
            'room': lease.room.number, 'tenant': lease.tenant.name,
            'previous': previous.get('current', (saved.utility_details or {}).get('previous', '') if saved else ''),
            'rate': previous.get('rate'), 'initial': not bool(previous) and not (saved and (saved.utility_details or {}).get('previous') is not None),
            'saved': saved.utility_details if saved else None, 'exists': saved is not None,
            'amount': saved.amount if saved else None})
    return items


@router.post('/electricity', status_code=201)
def save_electricity(payload: ElectricityBatch, request: Request, db: Session = Depends(get_db),
                     landlord: User = Depends(get_landlord_workspace)):
    start, end = _month_bounds(payload.month)
    leases = {l.id: l for l in _landlord_leases(db, landlord.id) if l.property_id == payload.property_id
              and l.start_date <= end and l.end_date >= start and l.status in ('active', 'ended', 'terminated')}
    if len({r.lease_id for r in payload.rows}) != len(payload.rows):
        raise HTTPException(422, '戶別不可重複。')
    actor = landlord_actor(request, landlord)
    for row in payload.rows:
        if row.lease_id not in leases:
            raise HTTPException(404, '找不到這個房屋的有效租約。')
        entry = row.entry
        if entry.method not in ('meter', 'amount', 'shared', 'master') or not entry.recorded_on:
            raise HTTPException(422, '請選擇計費方式並填寫抄表日期。')
        if db.query(LandlordCharge.id).filter(LandlordCharge.lease_id == row.lease_id,
            LandlordCharge.kind == 'electricity', LandlordCharge.period_start >= start,
            LandlordCharge.period_start <= end).first():
            raise HTTPException(409, '本月已有電費記錄，請重新載入，避免重複收費。')
        later = db.query(LandlordCharge).filter(LandlordCharge.lease_id == row.lease_id,
            LandlordCharge.kind == 'electricity', LandlordCharge.period_start > end,
            LandlordCharge.voided_at.is_(None)).all()
        if any((c.utility_details or {}).get('current') is not None for c in later):
            raise HTTPException(409, '後續月份已有抄表紀錄，請依時間順序記錄。')
        if entry.method in ('meter', 'master'):
            previous = _electricity_history(db, row.lease_id, start).get('current')
            if previous is not None and entry.previous != Decimal(str(previous)):
                raise HTTPException(409, '上期讀數已更新，請重新載入。')
        payer = {'landlord_collect': '房東代收', 'tenant_direct': '房客自繳', 'landlord_absorb': '房東負擔'}[entry.payer]
        charge = LandlordCharge(landlord_id=landlord.id, lease_id=row.lease_id, kind='electricity',
            title=f'{payload.month} 電費（{payer}）', amount=entry.receivable(),
            period_start=start, period_end=end, due_date=payload.due_date,
            utility_details=entry.model_dump(mode='json', exclude_none=True))
        db.add(charge)
        db.add(LandlordChargeEvent(charge=charge, kind='created', detail=f'新增電費記錄：{payer}', actor_user_id=actor.id))
    record_audit(db, landlord, actor, '帳務', '新增電費記錄', f'{payload.month}，{len(payload.rows)} 筆')
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '本月電費已建立，請重新載入。')
    return {'saved': len(payload.rows)}


class ExpensePayload(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=30)
    amount: int = Field(gt=0)
    spent_on: date
    property_id: int | None = None
    note: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------
# 期數計算
# ---------------------------------------------------------------

def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def _months_from(anchor: date, offset: int) -> date:
    """起租日往後第 offset 個月的同一天（遇到小月份取月底）。一律從起租日算，不從上一期累加，
    否則 31 號起租遇到 30 天的月份，之後每一期都會漂移一天。"""
    return _add_months(anchor, offset)


def _period_amount(monthly_rent: int, anchor: date, first_month: int, end: date) -> int:
    """從起租日後第 first_month 個月開始、到 end 為止的租金：整月照月租，不足一個月依天數比例。"""
    total = 0
    offset = first_month
    while _months_from(anchor, offset) <= end:
        month_start = _months_from(anchor, offset)
        month_end = _months_from(anchor, offset + 1) - timedelta(days=1)
        if month_end <= end:
            total += monthly_rent
        else:
            days = (end - month_start).days + 1
            total += round(monthly_rent * days / ((month_end - month_start).days + 1))
        offset += 1
    return total


def rent_periods(lease: LandlordLease, until: date) -> list[tuple[date, date, date, int]]:
    """（期起, 期迄, 到期日, 金額），到期日不晚於 until。退租後的期數不產生。"""
    step = FREQUENCY_MONTHS.get(lease.payment_frequency or "monthly", 1)
    last_day = rules.occupied_until(lease)
    periods = []
    index = 0
    while True:
        start = _months_from(lease.start_date, index * step)
        if start > last_day:
            break
        end = min(_months_from(lease.start_date, (index + 1) * step) - timedelta(days=1), last_day)
        day = min(lease.payment_day or 1, calendar.monthrange(start.year, start.month)[1])
        due = max(date(start.year, start.month, day), start)
        if due > until:
            break
        periods.append((start, end, due, _period_amount(lease.monthly_rent, lease.start_date, index * step, end)))
        index += 1
    return periods


def _landlord_leases(db: Session, landlord_id: int) -> list[LandlordLease]:
    return (
        db.query(LandlordLease)
        .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(joinedload(LandlordLease.tenant), joinedload(LandlordLease.property), joinedload(LandlordLease.room))
        .filter(LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None))
        .all()
    )


def ensure_rent_charges(db: Session, landlord_id: int, until: date, lease_ids: set[int] | None = None) -> int:
    """補產生到 until 為止的租金期數。已存在的不動（金額固定）。回傳新增幾筆。

    lease_ids 有給就只處理那幾份（租客首頁要看自己那份的整段租期）。
    """
    leases = _landlord_leases(db, landlord_id)
    if lease_ids is not None:
        leases = [lease for lease in leases if lease.id in lease_ids]
    if not leases:
        return 0
    existing = {
        (row.lease_id, row.period_start)
        for row in db.query(LandlordCharge.lease_id, LandlordCharge.period_start).filter(
            LandlordCharge.landlord_id == landlord_id, LandlordCharge.kind == "rent")
    }
    created = 0
    for lease in leases:
        if lease.monthly_rent <= 0 or lease.status not in rules.LIVE_STATUSES + ("ended", "terminated"):
            continue
        for start, end, due, amount in rent_periods(lease, until):
            if (lease.id, start) in existing:
                continue
            if (end - start).days < 32:
                title = f"{start.year} 年 {start.month} 月租金"
            else:
                title = f"{start.year}/{start.month} ～ {end.year}/{end.month} 租金"
            charge = LandlordCharge(
                landlord_id=landlord_id, lease_id=lease.id, kind="rent", title=title,
                period_start=start, period_end=end, due_date=due, amount=amount,
            )
            db.add(charge)
            db.add(LandlordChargeEvent(charge=charge, kind="created", detail="系統依租約產生本期應收"))
            existing.add((lease.id, start))
            created += 1
    if created:
        try:
            db.commit()
        except IntegrityError:
            # 兩個分頁同時打開：另一個請求先產生了，這次的就不需要
            db.rollback()
    return created


# ---------------------------------------------------------------
# 回應
# ---------------------------------------------------------------

def _paid(charge: LandlordCharge) -> int:
    return sum(payment.amount for payment in charge.payments)


def _charge_dict(charge: LandlordCharge, today: date, month_start: date | None = None) -> dict:
    paid = _paid(charge)
    balance = max(0, charge.amount - paid)
    overdue = balance > 0 and charge.due_date < today
    partial = 0 < paid < charge.amount
    if charge.voided_at:
        state = "void"
    elif balance == 0:
        state = "paid"
    elif overdue:
        state = "overdue"
    elif partial:
        state = "partial"
    else:
        state = "pending"
    lease = charge.lease
    events = [
        {"kind": event.kind, "detail": event.detail, "at": event.created_at}
        for event in sorted(charge.events, key=lambda item: item.id, reverse=True)
    ]
    reminded = [event for event in charge.events if event.kind == "reminded"]
    reports = [event for event in charge.events if event.kind == "tenant_reported"]
    latest_report = max(reports, key=lambda event: event.id) if reports and balance > 0 else None
    return {
        "id": charge.id,
        "lease_id": charge.lease_id,
        "tenant_id": lease.tenant_id,
        "tenant": lease.tenant.name,
        "tenant_bound": bool(lease.tenant_user_id),
        "property_id": lease.property_id,
        "property": lease.property.name,
        "room": lease.room.number,
        "kind": charge.kind,
        "title": charge.title,
        "period_start": charge.period_start,
        "period_end": charge.period_end,
        "due_date": charge.due_date,
        "amount": charge.amount,
        "paid": paid,
        "balance": balance,
        "status": state,
        "partial": partial,
        "overdue": overdue and not charge.voided_at,
        "carried": bool(month_start and charge.due_date < month_start),
        "voided": bool(charge.voided_at),
        "void_reason": charge.void_reason,
        "reminded_at": max((event.created_at for event in reminded), default=None),
        # 租客回報已繳、房東還沒確認收齊：畫面要提醒房東去對帳入帳
        "tenant_report": None if not latest_report else {"at": latest_report.created_at, "detail": latest_report.detail},
        "payments": [
            {"id": payment.id, "amount": payment.amount, "paid_on": payment.paid_on, "method": payment.method,
             "note": payment.note, "created_at": payment.created_at}
            for payment in charge.payments
        ],
        "events": events,
    }


def _month_bounds(month: str | None) -> tuple[date, date]:
    if month:
        try:
            year, number = (int(part) for part in month.split("-"))
            start = date(year, number, 1)
        except (ValueError, TypeError) as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "月份格式應為 YYYY-MM。") from error
    else:
        today = date.today()
        start = date(today.year, today.month, 1)
    return start, _add_months(start, 1) - timedelta(days=1)


def _owned_charge(db: Session, landlord_id: int, charge_id: int) -> LandlordCharge:
    charge = (
        db.query(LandlordCharge)
        .options(
            selectinload(LandlordCharge.payments), selectinload(LandlordCharge.events),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.tenant),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.property),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.room),
        )
        .filter(LandlordCharge.id == charge_id, LandlordCharge.landlord_id == landlord_id)
        .first()
    )
    if not charge:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆帳款。")
    return charge


def _email_enabled(db: Session, landlord: User) -> bool:
    from routers.landlord_workspace_api import settings_for
    return settings_for(db, landlord).email_notifications


def _money(value: int) -> str:
    return f"NT${value:,}"


# ---------------------------------------------------------------
# 端點：應收與實收
# ---------------------------------------------------------------

@router.get("/charges")
def list_charges(month: str | None = Query(default=None), db: Session = Depends(get_db),
                 landlord: User = Depends(get_landlord_workspace)):
    """該月份到期的帳款，加上更早到期、還沒收齊的（carried=true）。"""
    month_start, month_end = _month_bounds(month)
    today = date.today()
    ensure_rent_charges(db, landlord.id, month_end)
    charges = (
        db.query(LandlordCharge)
        .options(
            selectinload(LandlordCharge.payments), selectinload(LandlordCharge.events),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.tenant),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.property),
            joinedload(LandlordCharge.lease).joinedload(LandlordLease.room),
        )
        .filter(LandlordCharge.landlord_id == landlord.id, LandlordCharge.due_date <= month_end)
        .order_by(LandlordCharge.due_date, LandlordCharge.id)
        .all()
    )
    items = []
    for charge in charges:
        row = _charge_dict(charge, today, month_start)
        in_month = charge.due_date >= month_start
        if in_month or (not row["voided"] and row["balance"] > 0):
            items.append(row)
    in_month_rows = [row for row in items if not row["carried"] and not row["voided"]]
    total = sum(row["amount"] for row in in_month_rows)
    received = sum(row["paid"] for row in in_month_rows)
    open_rows = [row for row in items if not row["voided"]]
    return {
        "month": month_start.strftime("%Y-%m"),
        "items": items,
        "totals": {
            "total": total,
            "received": received,
            "awaiting": sum(row["balance"] for row in open_rows),
            "overdue": sum(row["balance"] for row in open_rows if row["overdue"]),
            "partial_received": sum(row["paid"] for row in open_rows if row["partial"]),
            "rate": round(received / total * 100) if total else 0,
        },
    }


@router.post("/charges", status_code=status.HTTP_201_CREATED)
def create_charge(payload: ChargePayload, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    """水電或其他費用。租金由系統依租約產生，不從這裡建。"""
    lease = next((item for item in _landlord_leases(db, landlord.id) if item.id == payload.lease_id), None)
    if not lease:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到房東名下的這份租約。")
    period_start = payload.period_start or payload.due_date
    period_end = payload.period_end or period_start
    if period_end < period_start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "計費期間的結束日不可早於開始日。")
    if db.query(LandlordCharge.id).filter(LandlordCharge.lease_id == lease.id, LandlordCharge.kind == payload.kind,
                                          LandlordCharge.period_start == period_start).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"這份租約在 {period_start.isoformat()} 起的{KIND_LABELS[payload.kind]}已經建立過。")
    charge = LandlordCharge(landlord_id=landlord.id, lease_id=lease.id, kind=payload.kind, title=payload.title.strip(),
                            period_start=period_start, period_end=period_end, due_date=payload.due_date, amount=payload.amount)
    db.add(charge)
    actor = landlord_actor(request, landlord)
    db.add(LandlordChargeEvent(charge=charge, kind="created", detail=f"新增{KIND_LABELS[payload.kind]} {_money(payload.amount)}", actor_user_id=actor.id))
    record_audit(db, landlord, actor, "帳務", f"新增{KIND_LABELS[payload.kind]}",
                 f"{lease.tenant.name}（{lease.room.number}）{payload.title} {_money(payload.amount)}")
    db.commit()
    return _charge_dict(_owned_charge(db, landlord.id, charge.id), date.today())


@router.post("/charges/{charge_id}/payments", status_code=status.HTTP_201_CREATED)
def record_payment(charge_id: int, payload: PaymentPayload, request: Request, db: Session = Depends(get_db),
                   landlord: User = Depends(get_landlord_workspace)):
    charge = _owned_charge(db, landlord.id, charge_id)
    if charge.voided_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆帳款已作廢，不能再入帳。")
    balance = charge.amount - _paid(charge)
    if balance <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆帳款已經收齊。")
    if payload.amount > balance:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"入帳金額超過未收餘額 {_money(balance)}。")
    if payload.paid_on > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "收款日期不可晚於今天。")
    actor = landlord_actor(request, landlord)
    db.add(LandlordChargePayment(charge_id=charge.id, amount=payload.amount, paid_on=payload.paid_on,
                                 method=payload.method, note=(payload.note or "").strip() or None, recorded_by=actor.id))
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="payment", actor_user_id=actor.id,
                               detail=f"{payload.paid_on.isoformat()} 入帳 {_money(payload.amount)}"))
    record_audit(db, landlord, actor, "帳務", "確認收款",
                 f"{charge.lease.tenant.name}（{charge.lease.room.number}）{charge.title} {_money(payload.amount)}")
    db.commit()
    db.expire_all()
    return _charge_dict(_owned_charge(db, landlord.id, charge.id), date.today())


@router.post("/charges/{charge_id}/payments/{payment_id}/reverse")
def reverse_payment(charge_id: int, payment_id: int, payload: ReversePayload, request: Request,
                    db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    """沖銷一筆記錯的收款：新增一筆等額負數，原紀錄保留。"""
    charge = _owned_charge(db, landlord.id, charge_id)
    original = next((item for item in charge.payments if item.id == payment_id), None)
    if not original or original.amount <= 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到可沖銷的收款紀錄。")
    if any(item.amount == -original.amount and (item.note or "").startswith(f"沖銷 #{original.id}") for item in charge.payments):
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆收款已經沖銷過。")
    actor = landlord_actor(request, landlord)
    db.add(LandlordChargePayment(charge_id=charge.id, amount=-original.amount, paid_on=date.today(), method=original.method,
                                 note=f"沖銷 #{original.id}：{payload.reason.strip()}", recorded_by=actor.id))
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="reversed", actor_user_id=actor.id,
                               detail=f"沖銷 {_money(original.amount)}：{payload.reason.strip()}"))
    record_audit(db, landlord, actor, "帳務", "沖銷收款", f"{charge.title} {_money(original.amount)}：{payload.reason.strip()}", "warning")
    db.commit()
    db.expire_all()
    return _charge_dict(_owned_charge(db, landlord.id, charge.id), date.today())


@router.post("/charges/{charge_id}/void")
def void_charge(charge_id: int, payload: VoidPayload, request: Request, db: Session = Depends(get_db),
                landlord: User = Depends(get_landlord_workspace)):
    charge = _owned_charge(db, landlord.id, charge_id)
    if charge.voided_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆帳款已經作廢。")
    if _paid(charge) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "已有收款的帳款不能作廢，請先沖銷收款。")
    actor = landlord_actor(request, landlord)
    charge.voided_at = datetime.utcnow()
    charge.void_reason = payload.reason.strip()
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="voided", actor_user_id=actor.id, detail=f"作廢：{payload.reason.strip()}"))
    record_audit(db, landlord, actor, "帳務", "作廢帳款", f"{charge.title}：{payload.reason.strip()}", "warning")
    db.commit()
    db.expire_all()
    return _charge_dict(_owned_charge(db, landlord.id, charge.id), date.today())


@router.post("/charges/{charge_id}/remind")
def remind_charge(charge_id: int, request: Request, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    """送一則站內催繳通知給已綁定帳號的租客。沒綁定就回 409，畫面不能顯示「已提醒」。"""
    charge = _owned_charge(db, landlord.id, charge_id)
    balance = charge.amount - _paid(charge)
    if charge.voided_at or balance <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆帳款已收齊或已作廢，不需要提醒。")
    lease = charge.lease
    tenant_user = db.get(User, lease.tenant_user_id) if lease.tenant_user_id else None
    if not tenant_user or tenant_user.status != "active":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{lease.tenant.name} 還沒有接受租約邀請、綁定平台帳號，系統送不出提醒。請改用電話聯絡，或先到租客管理發送邀請。",
        )
    today = date.today()
    timing = f"已逾期 {(today - charge.due_date).days} 天" if charge.due_date < today else f"到期日 {charge.due_date.isoformat()}"
    notify_user(
        db, tenant_user,
        title=f"{charge.title}待繳 {_money(balance)}",
        body=f"{lease.property.name} {lease.room.number} 的{charge.title}尚有 {_money(balance)} 未繳（{timing}）。已繳費請告知房東確認入帳。",
        category="帳務", source_label="房東催繳", created_by=f"landlord:{landlord.id}",
        email=_email_enabled(db, landlord),
    )
    actor = landlord_actor(request, landlord)
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="reminded", actor_user_id=actor.id, detail=f"已送出站內提醒給 {tenant_user.email}"))
    record_audit(db, landlord, actor, "帳務", "發送催繳提醒", f"{lease.tenant.name}：{charge.title} {_money(balance)}")
    db.commit()
    db.expire_all()
    return _charge_dict(_owned_charge(db, landlord.id, charge.id), today)


# ---------------------------------------------------------------
# 支出
# ---------------------------------------------------------------

def _repair_expenses(db: Session, landlord_id: int, start: date, end: date) -> list[dict]:
    lease_ids = [lease.id for lease in _landlord_leases(db, landlord_id)]
    if not lease_ids:
        return []
    tickets = (
        db.query(RepairTicket)
        .filter(RepairTicket.lease_id.in_(lease_ids), RepairTicket.actual_cost.isnot(None), RepairTicket.actual_cost > 0,
                RepairTicket.responsibility.in_(REPAIR_EXPENSE_RESPONSIBILITIES),
                RepairTicket.status.in_(("inspection", "completed")))
        .all()
    )
    rows = []
    for ticket in tickets:
        spent = (ticket.completed_at or ticket.updated_at or ticket.created_at).date()
        if not start <= spent <= end:
            continue
        rows.append({
            "id": f"repair:{ticket.id}",
            "title": f"報修 #{ticket.id}：{ticket.equipment or ticket.location or '維修'}",
            "category": "維修",
            "amount": ticket.actual_cost,
            "spent_on": spent,
            "note": "雙方協議分攤：列出全額，實際分攤請另行確認" if ticket.responsibility == "shared" else "房東負擔",
            "source": "repair",
            "repair_ticket_id": ticket.id,
        })
    return rows


@router.get("/expenses")
def list_expenses(month: str | None = Query(default=None), db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    start, end = _month_bounds(month)
    manual = (
        db.query(LandlordExpense)
        .filter(LandlordExpense.landlord_id == landlord.id, LandlordExpense.spent_on >= start, LandlordExpense.spent_on <= end)
        .order_by(LandlordExpense.spent_on.desc(), LandlordExpense.id.desc())
        .all()
    )
    items = [
        {"id": f"expense:{item.id}", "title": item.title, "category": item.category, "amount": item.amount,
         "spent_on": item.spent_on, "note": item.note, "source": "manual", "property_id": item.property_id}
        for item in manual
    ] + _repair_expenses(db, landlord.id, start, end)
    items.sort(key=lambda item: item["spent_on"], reverse=True)
    return {"month": start.strftime("%Y-%m"), "items": items, "total": sum(item["amount"] for item in items)}


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpensePayload, request: Request, db: Session = Depends(get_db),
                   landlord: User = Depends(get_landlord_workspace)):
    if payload.property_id and not db.query(LandlordProperty.id).filter(
            LandlordProperty.id == payload.property_id, LandlordProperty.landlord_id == landlord.id).first():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到房東名下的棟別。")
    actor = landlord_actor(request, landlord)
    expense = LandlordExpense(landlord_id=landlord.id, title=payload.title.strip(), category=payload.category.strip(),
                              amount=payload.amount, spent_on=payload.spent_on, property_id=payload.property_id,
                              note=(payload.note or "").strip() or None, recorded_by=actor.id)
    db.add(expense)
    record_audit(db, landlord, actor, "帳務", "新增支出", f"{payload.title.strip()} {_money(payload.amount)}")
    db.commit()
    db.refresh(expense)
    return {"id": f"expense:{expense.id}", "title": expense.title, "category": expense.category, "amount": expense.amount,
            "spent_on": expense.spent_on, "note": expense.note, "source": "manual", "property_id": expense.property_id}


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, request: Request, db: Session = Depends(get_db),
                   landlord: User = Depends(get_landlord_workspace)):
    expense = db.query(LandlordExpense).filter(LandlordExpense.id == expense_id, LandlordExpense.landlord_id == landlord.id).first()
    if not expense:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆支出。")
    record_audit(db, landlord, landlord_actor(request, landlord), "帳務", "刪除支出", f"{expense.title} {_money(expense.amount)}", "warning")
    db.delete(expense)
    db.commit()
    return {"deleted_id": expense_id}


@router.get("/trend")
def collection_trend(months: int = Query(default=6, ge=1, le=24), month: str | None = Query(default=None),
                     db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    """近幾個月每月到期帳款的應收、實收與收款率（不含作廢）。"""
    month_start, month_end = _month_bounds(month)
    ensure_rent_charges(db, landlord.id, month_end)
    first = _add_months(month_start, -(months - 1))
    charges = (
        db.query(LandlordCharge).options(selectinload(LandlordCharge.payments))
        .filter(LandlordCharge.landlord_id == landlord.id, LandlordCharge.voided_at.is_(None),
                LandlordCharge.due_date >= first, LandlordCharge.due_date <= month_end)
        .all()
    )
    rows = []
    for index in range(months):
        start = _add_months(first, index)
        end = _add_months(start, 1) - timedelta(days=1)
        in_month = [charge for charge in charges if start <= charge.due_date <= end]
        total = sum(charge.amount for charge in in_month)
        received = sum(min(charge.amount, _paid(charge)) for charge in in_month)
        rows.append({"month": start.strftime("%Y-%m"), "label": f"{start.month}月", "total": total,
                     "received": received, "rate": round(received / total * 100) if total else None})
    return {"items": rows}
