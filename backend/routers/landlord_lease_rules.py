"""房東租約的狀態規則：房務、租客、合約、帳務、租客端、報修共用同一套判斷。

以前每支 router 各寫一份，結果互相矛盾（2026-09-24 稽核）：
- 未起租的 pending 租約讓房間顯示「已出租」
- 送出 7 天後的退租，房間當下就變空房
- 「目前租約」挑最晚開始的那份，續約一建立就蓋掉正在住的那份

日期語意（全部頁面一致）：
- start_date、end_date 都是「含當天」。續約的新租約從舊約 end_date 的隔天開始。
- moved_out_at 是搬走那天；那天起房間就空出來，新租約可以從這天開始。
- moved_out_at 在未來 = 已排定退租，在那天之前租約照常有效。
- pending 只代表「還沒到起租日」，日期一到就視為生效，不需要排程去改狀態。
"""
from datetime import date, timedelta

from db.models import LandlordLease

LIVE_STATUSES = ("active", "pending")


def moved_out(lease: LandlordLease, today: date) -> bool:
    if lease.status in ("ended", "terminated") and (lease.moved_out_at is None or lease.moved_out_at <= today):
        return True
    return bool(lease.moved_out_at and lease.moved_out_at <= today)


def occupied_until(lease: LandlordLease) -> date:
    """實際佔用房間的最後一天：提前退租就算到搬走前一天。"""
    if lease.moved_out_at:
        return min(lease.end_date, lease.moved_out_at - timedelta(days=1))
    return lease.end_date


def is_effective(lease: LandlordLease | None, today: date) -> bool:
    return bool(
        lease
        and lease.status in LIVE_STATUSES + ("ended", "terminated")
        and not moved_out(lease, today)
        and lease.start_date <= today <= occupied_until(lease)
    )


def is_upcoming(lease: LandlordLease, today: date) -> bool:
    return lease.status in LIVE_STATUSES and not moved_out(lease, today) and lease.start_date > today


def current_lease(leases, today: date) -> LandlordLease | None:
    """這位租客（或這間房）「現在」該看的那份租約。

    正在生效的優先；沒有的話看即將開始的（最早那份）；都沒有才退回最近的一份歷史租約。
    """
    leases = list(leases)
    effective = [lease for lease in leases if is_effective(lease, today)]
    if effective:
        return max(effective, key=lambda item: (item.start_date, item.id))
    upcoming = [lease for lease in leases if is_upcoming(lease, today)]
    if upcoming:
        return min(upcoming, key=lambda item: (item.start_date, item.id))
    if not leases:
        return None
    return max(leases, key=lambda item: (item.start_date, item.id))


def display_status(lease: LandlordLease | None, today: date) -> str:
    if not lease:
        return "incomplete"
    if moved_out(lease, today):
        return "moved_out"
    if lease.start_date > today:
        return "pending"
    if occupied_until(lease) < today:
        return "expired"
    if (occupied_until(lease) - today).days <= 30:
        return "expiring"
    return "occupied"


def blocks_room(lease: LandlordLease, start: date, end: date) -> bool:
    """這份租約是否佔用 [start, end] 這段期間的房間。"""
    if lease.status not in LIVE_STATUSES:
        # ended / terminated 但退租日還沒到：搬走前仍佔用
        if not lease.moved_out_at:
            return False
    return lease.start_date <= end and occupied_until(lease) >= start


UNREADABLE = "（無法解密）"


def tenant_pii(tenant, field: str):
    """讀租客的加密欄位；這筆用別的金鑰存、解不開時回 None，不讓整個請求失敗。"""
    from cryptography.exceptions import InvalidTag
    try:
        return getattr(tenant, field)
    except (InvalidTag, ValueError):
        return None


def pii_readable(tenant) -> bool:
    from cryptography.exceptions import InvalidTag
    try:
        tenant.phone
        return True
    except (InvalidTag, ValueError):
        return False
