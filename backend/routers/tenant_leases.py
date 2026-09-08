from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import LandlordLease, LandlordTenant, User
from security import get_current_tenant


router = APIRouter(prefix="/api/tenant/leases", tags=["Tenant leases"])


@router.get("")
def list_tenant_leases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_tenant),
) -> dict[str, list[dict[str, object]]]:
    """Return only leases linked to the authenticated tenant's verified account email."""
    tenant_profiles = (
        db.query(LandlordTenant)
        .options(
            joinedload(LandlordTenant.leases).joinedload(LandlordLease.property),
            joinedload(LandlordTenant.leases).joinedload(LandlordLease.room),
        )
        .filter(
            LandlordTenant.email == current_user.email,
            LandlordTenant.deleted_at.is_(None),
        )
        .all()
    )
    today = date.today()
    items: list[dict[str, object]] = []
    for profile in tenant_profiles:
        for lease in profile.leases:
            effective = (
                lease.status == "active"
                and lease.moved_out_at is None
                and lease.start_date <= today <= lease.end_date
            )
            items.append(
                {
                    "leaseId": str(lease.id),
                    "propertyId": str(lease.property_id),
                    "roomId": str(lease.room_id),
                    "property": lease.property.name,
                    "address": lease.property.address or "地址尚未填寫",
                    "room": lease.room.number,
                    "tenant": profile.name,
                    "phone": profile.phone,
                    "startDate": lease.start_date,
                    "endDate": lease.end_date,
                    "status": lease.status,
                    "effective": effective,
                }
            )
    return {"items": items}
