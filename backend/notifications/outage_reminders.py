"""每小時主動提醒租客停水、停電，沿用既有站內通知與瀏覽器推播。

停電讀本地台電開放資料，只提醒未來 24 小時內開始的各段計畫停電。
停水即時查台灣自來水公司第一筆公告；緊急停水可能已經開始，因此首次發現
就提醒，不套用 24 小時視窗，但排除已結束的公告。同址每輪只查一次。
以租約、類型、公告編號及停電段次記錄 LandlordTenantActivity，避免每小時重送；
過長的 kind 改用穩定雜湊，讓既有 50 字欄位就能保存，不需變更資料庫。
"""
import asyncio
import hashlib
import inspect
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import joinedload

from db import database
from db.models import LandlordLease, LandlordTenant, LandlordTenantActivity, User
from notifications.user_notify import notify_user
from routers import landlord_lease_rules as rules, outage

logger = logging.getLogger(__name__)
TZ = outage.TZ


def _parse_time(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("/", "-"))
    except (ValueError, AttributeError):
        return None
    # 台水未附時區的時間是台灣當地時間，不能由執行排程主機的時區決定。
    return parsed.replace(tzinfo=TZ) if parsed.tzinfo is None else parsed.astimezone(TZ)


def _date_label(value, now):
    days = (value.date() - now.date()).days
    return {0: "今天", 1: "明天"}.get(days, value.strftime("%m/%d"))


def _time_range(start, end, now):
    if not start:
        return f"至{_date_label(end, now)} {end:%H:%M}" if end else "依公告排程"
    label = f"{_date_label(start, now)} {start:%H:%M}"
    if end:
        end_label = end.strftime("%H:%M") if end.date() == start.date() else f"{_date_label(end, now)} {end:%H:%M}"
        label += f"–{end_label}"
    return label


def _notify(db, lease, utility, record_id, occurrence, title, body, detail):
    kind = f"outage:{lease.id}:{utility}:{record_id}:{occurrence}"
    if len(kind) > 50:
        kind = "outage:" + hashlib.sha256(kind.encode("utf-8")).hexdigest()[:32]
    if db.query(LandlordTenantActivity.id).filter(
        LandlordTenantActivity.tenant_id == lease.tenant_id, LandlordTenantActivity.kind == kind
    ).first():
        return 0
    user = db.get(User, lease.tenant_user_id)
    if not user or user.status != "active":
        return 0
    notify_user(
        db, user,
        audience_role="tenant", title=title, body=body,
        category="系統", source_label="停電通知" if utility == "power" else "停水通知",
        created_by="system", action_url="/app/outage", action_label="查看停水停電",
        push=True, email=False,
    )
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind=kind, detail=detail))
    db.flush()
    return 1


def _power_reminders(db, leases, address, now):
    sent = 0
    for record in outage._find_power_matches(address, now=now, include_past=True):
        for start_key, end_key in (("start", "end"), ("secondStart", "secondEnd")):
            start = _parse_time(record.get(start_key))
            if not start or not now < start <= now + timedelta(hours=24):
                continue
            time_range = _time_range(start, _parse_time(record.get(end_key)), now)
            scope = record.get("scope") or "詳見台電公告"
            if len(scope) > 120:
                scope = scope[:120] + "…"
            for lease in leases:
                sent += _notify(
                    db, lease, "power", record.get("id") or record.get("requestNo"), start_key,
                    f"{time_range} 計畫停電",
                    f"{lease.property.name} {lease.room.number} 將計畫停電。"
                    f"工程：{record.get('work') or '台電線路維護'}。時間：{time_range}。"
                    f"停電範圍：{scope}。請先將手機充電、減少冰箱開關，並確認大樓門禁的備用進出方式。",
                    f"系統提醒租客：計畫停電 {start:%m/%d %H:%M}",
                )
    return sent


def _water_reminders(db, leases, case, now):
    if not case or case.get("status", "scheduled") != "scheduled":
        return 0
    start, end = _parse_time(case.get("startTime")), _parse_time(case.get("endTime"))
    if end and end < now:
        return 0
    time_range = _time_range(start, end, now)
    # 時間格式無法解析仍提醒，避免緊急公告因欄位格式變動就完全漏送。
    if not start and not end:
        time_range = "–".join(str(case[key]) for key in ("startTime", "endTime") if case.get(key)) or "依公告排程"
    title = "你的住處有停水公告"
    if start or end:
        title += f"（{time_range}）"
    reason = case.get("waterOffReason") or case.get("reason") or "自來水管線施工維修"
    sent = 0
    for lease in leases:
        sent += _notify(
            db, lease, "water", case.get("id", "case"), "",
            title,
            f"{lease.property.name} {lease.room.number} 有停水公告。原因：{reason}。"
            f"時間：{time_range}。請預先儲水備用，停水前關閉抽水馬達。",
            f"系統提醒租客：停水公告 {time_range}",
        )
    return sent


def dispatch_due(now=None, session_factory=None, water_fetcher=None) -> dict:
    """water_fetcher 接收地址，回傳台水原始第一筆公告或 None，可為同步或非同步函式。"""
    totals = {"power": 0, "water": 0}
    factory = session_factory or database.SessionLocal
    if factory is None:
        return totals
    now = (now or datetime.now(TZ)).astimezone(TZ)
    fetch_water = water_fetcher or outage.fetch_water_outage_case
    db = factory()
    try:
        leases = (
            db.query(LandlordLease)
            .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
            .join(User, LandlordLease.tenant_user_id == User.id)
            .options(joinedload(LandlordLease.property), joinedload(LandlordLease.room))
            .filter(LandlordTenant.deleted_at.is_(None), LandlordLease.moved_out_at.is_(None),
                    User.status == "active")
            .all()
        )
        groups = {}
        for lease in leases:
            if not rules.is_effective(lease, now.date()):
                continue
            address = (lease.property.address or "").strip()
            normalized = outage._normalize(address)
            if not normalized:
                continue
            city = (lease.property.city or "").strip()
            if city and outage._normalize(city) not in normalized:
                address = city + address
                normalized = outage._normalize(address)
            # 正規化只用於同址分組，對外查詢保留第一筆的原文，避免台水不接受轉換後的地址。
            groups.setdefault(normalized, (address, []))[1].append(lease)

        for address, group in groups.values():
            try:
                case = fetch_water(address)
                if inspect.isawaitable(case):
                    case = asyncio.run(case)
                power = _power_reminders(db, group, address, now)
                water = _water_reminders(db, group, case, now)
                db.commit()
                # 只有交易成功才計數，否則 rollback 的通知會被誤算成已送出。
                totals["power"] += power
                totals["water"] += water
            except Exception:
                db.rollback()
                logger.exception("停水停電通知失敗，地址：%s", address)
    finally:
        db.close()
    return totals
