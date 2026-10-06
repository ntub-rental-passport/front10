from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from db.database import get_db
from db.models import LandlordLease, LandlordTenant, User
from auth.security import get_current_tenant
from routers import landlord_lease_rules as rules


router = APIRouter(prefix="/api/tenant/leases", tags=["Tenant leases"])


def tenant_visible_leases(db: Session, user: User) -> list[LandlordLease]:
    """租客看得到的房東租約。

    正式依據是接受邀請後的帳號綁定（tenant_user_id）。還沒有任何人綁定的舊租約，
    暫時沿用「房東填的 email 等於登入信箱」；一旦被別的帳號綁定，就不再靠 email 顯示。
    """
    email = (user.email or "").strip().lower()
    return (
        db.query(LandlordLease)
        .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(
            joinedload(LandlordLease.tenant),
            joinedload(LandlordLease.property),
            joinedload(LandlordLease.room),
        )
        .filter(
            LandlordTenant.deleted_at.is_(None),
            or_(
                LandlordLease.tenant_user_id == user.id,
                and_(
                    LandlordLease.tenant_user_id.is_(None),
                    func.lower(func.trim(LandlordTenant.email)) == email,
                ),
            ),
        )
        .all()
    )


@router.get("")
def list_tenant_leases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant),
) -> dict[str, list[dict[str, object]]]:
    """Return leases bound to the tenant account (or, before binding, matching its email)."""
    today = date.today()
    items: list[dict[str, object]] = []
    for lease in tenant_visible_leases(db, current_user):
        profile = lease.tenant
        items.append(
            {
                "leaseId": str(lease.id),
                "propertyId": str(lease.property_id),
                "roomId": str(lease.room_id),
                "property": lease.property.name,
                "address": lease.property.address or "地址尚未填寫",
                "room": lease.room.number,
                "tenant": profile.name,
                "phone": rules.tenant_pii(profile, "phone") or "",
                "startDate": lease.start_date,
                "endDate": lease.end_date,
                "status": lease.status,
                "effective": rules.is_effective(lease, today),
                "bound": lease.tenant_user_id == current_user.id,
            }
        )
    return {"items": items}
