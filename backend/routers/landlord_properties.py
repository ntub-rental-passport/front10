from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from db.database import get_db
from db.models import LandlordLease, LandlordProperty, LandlordRoom, User
from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from routers import landlord_lease_rules as rules


router = APIRouter(prefix="/api/landlord/properties", tags=["Landlord properties"])
ACTIVE_LEASE_STATUSES = ("active", "pending")


class PropertyPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: str | None = None
    city: str | None = Field(default=None, max_length=50)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("棟別名稱不可空白。")
        return value


class RoomBatchPayload(BaseModel):
    numbers: list[str] = Field(min_length=1, max_length=100)
    floor: int | None = None
    area: float | None = Field(default=None, gt=0)
    expected_rent: int | None = Field(default=None, ge=0)

    @field_validator("numbers")
    @classmethod
    def clean_numbers(cls, values: list[str]) -> list[str]:
        numbers = [value.strip() for value in values if value.strip()]
        if not numbers:
            raise ValueError("請至少輸入一個房號。")
        if len(numbers) != len(set(numbers)):
            raise ValueError("房號不可重複。")
        return numbers


class RoomUpdatePayload(BaseModel):
    number: str = Field(min_length=1, max_length=50)
    status: Literal["vacant", "turnover", "maintenance"] = "vacant"
    floor: int | None = None
    area: float | None = Field(default=None, gt=0)
    expected_rent: int | None = Field(default=None, ge=0)


def _owned_property(db: Session, landlord_id: int, property_id: int) -> LandlordProperty:
    property_item = (
        db.query(LandlordProperty)
        .options(
            joinedload(LandlordProperty.rooms)
            .joinedload(LandlordRoom.leases)
            .joinedload(LandlordLease.tenant)
        )
        .filter(
            LandlordProperty.id == property_id,
            LandlordProperty.landlord_id == landlord_id,
        )
        .first()
    )
    if not property_item:
        raise HTTPException(status_code=404, detail="找不到房東名下的棟別。")
    return property_item


def _current_lease(room: LandlordRoom) -> LandlordLease | None:
    """正在生效的租約。還沒起租的不算，房間不會因為一份未來租約就顯示已出租。"""
    today = date.today()
    effective = [lease for lease in room.leases if rules.is_effective(lease, today)]
    return max(effective, key=lambda item: (item.start_date, item.id)) if effective else None


def _next_lease(room: LandlordRoom) -> LandlordLease | None:
    today = date.today()
    upcoming = [lease for lease in room.leases if rules.is_upcoming(lease, today)]
    return min(upcoming, key=lambda item: (item.start_date, item.id)) if upcoming else None


def _room_dict(room: LandlordRoom) -> dict[str, object]:
    lease = _current_lease(room)
    upcoming = _next_lease(room)
    today = date.today()
    return {
        "id": room.id,
        "number": room.number,
        "status": "rented" if lease else ("maintenance" if room.status == "maintenance" else "vacant"),
        # 空房但還沒整理好（剛退租）；畫面仍算空房，另外標示待整備
        "needs_turnover": not lease and room.status == "turnover",
        "tenant": lease.tenant.name if lease else None,
        "rent": lease.monthly_rent if lease else room.expected_rent,
        "expected_rent": room.expected_rent,
        "lease_end": rules.occupied_until(lease) if lease else None,
        "scheduled_move_out": lease.moved_out_at if lease and lease.moved_out_at and lease.moved_out_at > today else None,
        "next_lease_start": upcoming.start_date if upcoming else None,
        "next_tenant": upcoming.tenant.name if upcoming else None,
        "floor": room.floor,
        "area": float(room.area) if room.area is not None else None,
    }


def _property_dict(property_item: LandlordProperty) -> dict[str, object]:
    return {
        "id": property_item.id,
        "name": property_item.name,
        "address": property_item.address or "",
        "city": property_item.city or "",
        "rooms": [_room_dict(room) for room in sorted(property_item.rooms, key=lambda item: item.number)],
    }


@router.get("")
def list_properties(
    db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)
):
    properties = (
        db.query(LandlordProperty)
        .options(
            joinedload(LandlordProperty.rooms)
            .joinedload(LandlordRoom.leases)
            .joinedload(LandlordLease.tenant)
        )
        .filter(LandlordProperty.landlord_id == landlord.id)
        .order_by(LandlordProperty.created_at, LandlordProperty.id)
        .all()
    )
    return {"items": [_property_dict(item) for item in properties]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyPayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    duplicate = db.query(LandlordProperty).filter(
        LandlordProperty.landlord_id == landlord.id,
        LandlordProperty.name == payload.name,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="已有相同名稱的棟別。")
    property_item = LandlordProperty(
        landlord_id=landlord.id,
        name=payload.name,
        address=(payload.address or "").strip() or None,
        city=(payload.city or "").strip() or None,
    )
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "新增棟別", payload.name)
    db.add(property_item)
    db.commit()
    db.refresh(property_item)
    return _property_dict(property_item)


@router.patch("/{property_id}")
def update_property(
    property_id: int,
    payload: PropertyPayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    property_item = _owned_property(db, landlord.id, property_id)
    duplicate = db.query(LandlordProperty).filter(
        LandlordProperty.landlord_id == landlord.id,
        LandlordProperty.name == payload.name,
        LandlordProperty.id != property_id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="已有相同名稱的棟別。")
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "更新棟別", payload.name)
    property_item.name = payload.name
    property_item.address = (payload.address or "").strip() or None
    property_item.city = (payload.city or "").strip() or None
    db.commit()
    return _property_dict(_owned_property(db, landlord.id, property_id))


@router.delete("/{property_id}")
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    property_item = _owned_property(db, landlord.id, property_id)
    if property_item.rooms:
        raise HTTPException(
            status_code=409,
            detail="棟別內已有房間，為保留租客、合約與財務紀錄，無法直接刪除。",
        )

    deleted = {"deleted_id": property_item.id, "name": property_item.name}
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "刪除棟別", property_item.name, "warning")
    db.delete(property_item)
    db.commit()
    return deleted


@router.post("/{property_id}/rooms", status_code=status.HTTP_201_CREATED)
def create_rooms(
    property_id: int,
    payload: RoomBatchPayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    property_item = _owned_property(db, landlord.id, property_id)
    existing = {room.number for room in property_item.rooms}
    duplicates = sorted(existing.intersection(payload.numbers))
    if duplicates:
        raise HTTPException(status_code=409, detail=f"房號已存在：{', '.join(duplicates)}")
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "新增房間", f"{property_item.name}：{'、'.join(payload.numbers)}")
    for number in payload.numbers:
        db.add(
            LandlordRoom(
                property_id=property_item.id,
                number=number,
                status="vacant",
                floor=payload.floor,
                area=payload.area,
                expected_rent=payload.expected_rent,
            )
        )
    db.commit()
    return _property_dict(_owned_property(db, landlord.id, property_id))


@router.patch("/{property_id}/rooms/{room_id}")
def update_room(
    property_id: int,
    room_id: int,
    payload: RoomUpdatePayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    property_item = _owned_property(db, landlord.id, property_id)
    room = next((item for item in property_item.rooms if item.id == room_id), None)
    if not room:
        raise HTTPException(status_code=404, detail="找不到房東名下的房間。")
    lease = _current_lease(room)
    duplicate = next(
        (item for item in property_item.rooms if item.number == payload.number.strip() and item.id != room_id),
        None,
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="此房號已存在。")
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "更新房間", f"{property_item.name} {payload.number.strip()}")
    room.number = payload.number.strip()
    # 有生效租約時房間一定是出租中，不能被改成空房或維修
    room.status = "occupied" if lease else payload.status
    room.floor = payload.floor
    room.area = payload.area
    room.expected_rent = payload.expected_rent
    db.commit()
    return _room_dict(room)


@router.delete("/{property_id}/rooms/{room_id}")
def delete_room(
    property_id: int,
    room_id: int,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_landlord_workspace),
    request: Request = None,
):
    property_item = _owned_property(db, landlord.id, property_id)
    room = next((item for item in property_item.rooms if item.id == room_id), None)
    if not room:
        raise HTTPException(status_code=404, detail="找不到房東名下的房間。")
    if room.leases:
        raise HTTPException(status_code=409, detail="這間房有租約紀錄，為保留租客與帳務歷史，無法刪除。可改成維修中或停用。")
    record_audit(db, landlord, landlord_actor(request, landlord) if request else landlord, "房務", "刪除房間", f"{property_item.name} {room.number}", "warning")
    db.delete(room)
    db.commit()
    return {"deleted_id": room_id}
