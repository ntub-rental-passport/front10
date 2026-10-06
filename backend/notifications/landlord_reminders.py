"""房東通知偏好裡的自動提醒（每小時由 main.py 的排程迴圈呼叫一次）。

- 收租提醒（rent_reminders）：到期前 3 天、到期當天、逾期隔天，各送租客一次站內通知。
  只送給已接受邀請、綁定帳號的租客；同一筆帳款同一階段只送一次（記在帳款事件裡）。
- 合約到期提醒（contract_reminders）：租約剩下「提前天數」與 7 天時，各通知房東一次。
  已經建好續約的不提醒。

Email 不在這裡寄：寄信要經過後台的寄送佇列與 SMTP 設定，這裡只送站內。
"""
import logging
from datetime import date, timedelta

from sqlalchemy.orm import joinedload, selectinload

from db import database
from db.models import (
    LandlordCharge,
    LandlordChargeEvent,
    LandlordLease,
    LandlordTenant,
    LandlordTenantActivity,
    User,
)
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules

logger = logging.getLogger(__name__)

RENT_STAGES = (
    ("auto_before", 3, "3 天後到期"),
    ("auto_due", 0, "今天到期"),
    ("auto_overdue", -1, "已逾期"),
)


def _rent_reminders(db, landlord: User, today: date) -> int:
    from routers.landlord_finance import _paid, ensure_rent_charges

    ensure_rent_charges(db, landlord.id, today + timedelta(days=3))
    charges = (
        db.query(LandlordCharge)
        .options(selectinload(LandlordCharge.payments), selectinload(LandlordCharge.events),
                 joinedload(LandlordCharge.lease).joinedload(LandlordLease.property),
                 joinedload(LandlordCharge.lease).joinedload(LandlordLease.room))
        .filter(LandlordCharge.landlord_id == landlord.id, LandlordCharge.voided_at.is_(None),
                LandlordCharge.due_date >= today - timedelta(days=1), LandlordCharge.due_date <= today + timedelta(days=3))
        .all()
    )
    sent = 0
    for charge in charges:
        balance = charge.amount - _paid(charge)
        lease = charge.lease
        if balance <= 0 or not lease.tenant_user_id:
            continue
        offset = (charge.due_date - today).days
        stage = next((item for item in RENT_STAGES if item[1] == offset), None)
        if not stage or any(event.kind == stage[0] for event in charge.events):
            continue
        tenant_user = db.get(User, lease.tenant_user_id)
        if not tenant_user or tenant_user.status != "active":
            continue
        notify_user(
            db, tenant_user,
            title=f"{charge.title}{stage[2]}：NT${balance:,}",
            body=f"{lease.property.name} {lease.room.number} 的{charge.title}到期日為 {charge.due_date.isoformat()}，"
                 f"尚有 NT${balance:,} 未繳。已繳費請告知房東確認入帳。",
            category="帳務", source_label="收租提醒", created_by="system",
        )
        db.add(LandlordChargeEvent(charge_id=charge.id, kind=stage[0], detail=f"系統自動提醒租客（{stage[2]}）"))
        sent += 1
    return sent


def _contract_reminders(db, landlord: User, today: date, reminder_days: int) -> int:
    leases = (
        db.query(LandlordLease).join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(joinedload(LandlordLease.tenant), joinedload(LandlordLease.property), joinedload(LandlordLease.room))
        .filter(LandlordTenant.landlord_id == landlord.id, LandlordTenant.deleted_at.is_(None)).all()
    )
    renewed = {lease.tenant_id for lease in leases if rules.is_upcoming(lease, today)}
    sent = 0
    for lease in leases:
        if lease.tenant_id in renewed or not rules.is_effective(lease, today) or lease.moved_out_at:
            continue
        days_left = (rules.occupied_until(lease) - today).days
        if days_left not in {reminder_days, 7}:
            continue
        kind = f"contract_reminder:{lease.id}:{days_left}"
        if db.query(LandlordTenantActivity.id).filter(LandlordTenantActivity.tenant_id == lease.tenant_id,
                                                      LandlordTenantActivity.kind == kind).first():
            continue
        notify_user(
            db, landlord,
            title=f"{lease.tenant.name} 的租約 {days_left} 天後到期",
            body=f"{lease.property.name} {lease.room.number} 的租約將於 {lease.end_date.isoformat()} 到期，請確認是否續約。",
            category="租約", source_label="合約到期提醒", created_by="system",
            action_url="/landlord/contracts", action_label="查看合約",
        )
        db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind=kind, detail=f"系統提醒房東：租約 {days_left} 天後到期"))
        sent += 1
    return sent


def dispatch_due(today: date | None = None, session_factory=None) -> dict:
    from routers.landlord_workspace_api import settings_for

    factory = session_factory or database.SessionLocal
    if factory is None:
        return {"rent": 0, "contract": 0}
    today = today or date.today()
    db = factory()
    totals = {"rent": 0, "contract": 0}
    try:
        landlord_ids = [row[0] for row in db.query(LandlordTenant.landlord_id).filter(LandlordTenant.deleted_at.is_(None)).distinct()]
        for landlord_id in landlord_ids:
            landlord = db.get(User, landlord_id)
            if not landlord or landlord.status != "active":
                continue
            settings = settings_for(db, landlord)
            try:
                if settings.rent_reminders:
                    totals["rent"] += _rent_reminders(db, landlord, today)
                if settings.contract_reminders:
                    totals["contract"] += _contract_reminders(db, landlord, today, settings.reminder_days)
                db.commit()
            except Exception:
                # 一位房東的資料有問題，不能讓其他房東的提醒停擺
                db.rollback()
                logger.exception("Landlord reminders failed for landlord %s", landlord_id)
    finally:
        db.close()
    return totals
