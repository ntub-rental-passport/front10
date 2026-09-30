"""後台使用者詳情的押金對帳與點交存證（2026-09-30 起讀真實資料）。

使用者詳情頁原本的押金、點交都是瀏覽器裡的示範資料，真實帳號這兩塊一直是空的。
這裡從 MySQL 既有的表組出來，不新增任何表（不用在 VM 跑遷移）。只讀不寫。

## 押金對帳

平台不經手押金，只比對兩邊各自寫的金額：房東在 RentMate 建的租約
（landlord_leases.deposit_amount）對上租客自己存的合約（rentals.deposit_amount）。

兩邊之間沒有外鍵，配對規則：
1. 房東填的租客 email 對上帳號 email（去頭尾空白、不分大小寫）—— 跟租客端看得到
   哪些租約（routers/tenant_leases.py）是同一條規則；
2. 租約期間跟合約期間有重疊。不只一份重疊時取重疊天數最多的，一樣多取最新存的。

對不上的租約照樣列，租客那一欄留空（畫面上是「租客未聲明」）：可能是租客沒有帳號、
還沒存合約，或存的是別段期間的合約。

## 點交存證

租客為自己的合約建的點交項目，每一項帶 AI 比對結果（inspection_items.comparison_result，
由 routers/inspection.py 的 compare_photos 產生）。不回傳照片（2026-09-30 決定）。
房東那一邊：他的租約配到的租客合約（同上規則）底下的點交項目。
"""

from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from db.models import InspectionItem, LandlordLease, LandlordTenant, Rental, User

#: compare_photos 的 ComparisonResult.type。不在清單裡的一律當成還沒比對，不猜
RESULT_TYPES = ('unchanged', 'new_damage', 'degraded', 'missing', 'uncertain')


def _normalized(email: str | None) -> str:
    return (email or '').strip().lower()


def _iso(value: datetime) -> str:
    """資料表存的是沒帶時區的 UTC（跟 routers/inspection.py 的 timestamp 同一種格式）。"""
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _overlap_days(a_start: date, a_end: date, b_start: date, b_end: date) -> int:
    start, end = max(a_start, b_start), min(a_end, b_end)
    return (end - start).days + 1 if start <= end else 0


def _pair(lease: LandlordLease, rentals: list[Rental]) -> Rental | None:
    """rentals 要由新到舊排：重疊天數一樣時留下先看到的，也就是最新存的那份。"""
    best, best_days = None, 0
    for rental in rentals:
        days = _overlap_days(lease.start_date, lease.end_date, rental.start_date, rental.end_date)
        if days > best_days:
            best, best_days = rental, days
    return best


def _leases(db: Session, *conditions) -> list[LandlordLease]:
    return (
        db.query(LandlordLease)
        .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(
            joinedload(LandlordLease.tenant),
            joinedload(LandlordLease.property),
            joinedload(LandlordLease.room),
        )
        .filter(LandlordTenant.deleted_at.is_(None), *conditions)
        .order_by(LandlordLease.start_date.desc(), LandlordLease.id.desc())
        .all()
    )


def _rentals_of(db: Session, user_ids: list[int]) -> dict[int, list[Rental]]:
    grouped: dict[int, list[Rental]] = {}
    if user_ids:
        for rental in db.query(Rental).filter(Rental.user_id.in_(user_ids)).order_by(Rental.id.desc()):
            grouped.setdefault(rental.user_id, []).append(rental)
    return grouped


def _items_of(db: Session, rental_ids: list[int]) -> dict[int, list[InspectionItem]]:
    grouped: dict[int, list[InspectionItem]] = {}
    if rental_ids:
        items = (
            db.query(InspectionItem)
            .options(joinedload(InspectionItem.baseline), joinedload(InspectionItem.checkout))
            .filter(InspectionItem.rental_id.in_(rental_ids))
            .order_by(InspectionItem.id)
        )
        for item in items:
            grouped.setdefault(item.rental_id, []).append(item)
    return grouped


def _lease_address(lease: LandlordLease) -> str:
    base = lease.property.address or lease.property.name
    return f'{base}（房號 {lease.room.number}）'


def _deposit(lease: LandlordLease, rental: Rental | None, side: str, tenant_id: int | None) -> dict:
    return {
        'id': f'lease-{lease.id}',
        'side': side,
        'address': _lease_address(lease),
        'startDate': lease.start_date.isoformat(),
        'endDate': lease.end_date.isoformat(),
        'monthlyRent': lease.monthly_rent,
        'landlordDeclared': lease.deposit_amount,
        'tenantDeclared': rental.deposit_amount if rental else None,
        'landlordId': lease.tenant.landlord_id,
        'tenantId': tenant_id,
    }


def _item(item: InspectionItem) -> dict:
    result = item.comparison_result if isinstance(item.comparison_result, dict) else {}
    kind = result.get('type') if result.get('type') in RESULT_TYPES else None
    missing = None
    if kind is None:
        has_baseline, has_checkout = item.baseline_record_id is not None, item.checkout_record_id is not None
        missing = (None if has_baseline and has_checkout
                   else 'both' if not has_baseline and not has_checkout
                   else 'baseline' if not has_baseline else 'checkout')
    return {
        'id': str(item.id),
        'room': item.room_name,
        'name': item.item_name,
        'result': kind,
        'summary': result.get('summary') if kind else None,
        'confidence': result.get('confidence') if kind else None,
        'missingPhoto': missing,
    }


def _updated_at(items: list[InspectionItem]) -> str:
    """最後一次有動靜的時間：建項目、拍照、AI 比對，取最晚的。"""
    moments: list[datetime] = []
    for item in items:
        moments += [_as_utc(item.created_at)]
        moments += [_as_utc(record.captured_at) for record in (item.baseline, item.checkout) if record]
        computed = item.comparison_result.get('computedAt') if isinstance(item.comparison_result, dict) else None
        if isinstance(computed, str):
            try:
                moments.append(_as_utc(datetime.fromisoformat(computed)))
            except ValueError:
                pass
    return _iso(max(moments))


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _handover(rental: Rental, items: list[InspectionItem], side: str) -> dict:
    return {
        'id': f'rental-{rental.id}-{side}',
        'side': side,
        'address': rental.address,
        'updatedAt': _updated_at(items),
        'items': [_item(item) for item in items],
    }


def user_records(db: Session, user: User) -> dict:
    """這個帳號以租客、房東身分各自牽涉到的押金對帳與點交存證。"""
    deposits: list[dict] = []
    handovers: list[dict] = []

    # 以租客身分：房東名冊上填了他 email 的租約，對上他自己存的合約
    email = _normalized(user.email)
    own_rentals = _rentals_of(db, [user.id]).get(user.id, [])
    if email:
        for lease in _leases(db, func.lower(func.trim(LandlordTenant.email)) == email):
            deposits.append(_deposit(lease, _pair(lease, own_rentals), 'tenant', user.id))

    # 以房東身分：他的每份租約，找名冊 email 對得上的帳號，再找那個帳號期間重疊的合約
    landlord_leases = _leases(db, LandlordTenant.landlord_id == user.id)
    roster_emails = {_normalized(lease.tenant.email) for lease in landlord_leases} - {''}
    tenants = {}
    if roster_emails:
        for account in db.query(User).filter(func.lower(func.trim(User.email)).in_(roster_emails)):
            tenants[_normalized(account.email)] = account
    tenant_rentals = _rentals_of(db, [account.id for account in tenants.values()])
    paired_rentals: list[Rental] = []
    for lease in landlord_leases:
        account = tenants.get(_normalized(lease.tenant.email))
        rental = _pair(lease, tenant_rentals.get(account.id, [])) if account else None
        deposits.append(_deposit(lease, rental, 'landlord', account.id if account else None))
        if rental and rental not in paired_rentals:
            paired_rentals.append(rental)

    items = _items_of(db, [rental.id for rental in own_rentals + paired_rentals])
    handovers += [_handover(rental, items[rental.id], 'tenant') for rental in own_rentals if rental.id in items]
    handovers += [_handover(rental, items[rental.id], 'landlord') for rental in paired_rentals if rental.id in items]
    return {'deposits': deposits, 'handovers': handovers}
