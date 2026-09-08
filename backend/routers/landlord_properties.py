from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import LandlordLease, LandlordProperty, LandlordRoom, User
from security import get_current_landlord


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
    today = date.today()
    leases = sorted(room.leases, key=lambda item: (item.start_date, item.id), reverse=True)
    return next(
        (
            lease
            for lease in leases
            if lease.status in ACTIVE_LEASE_STATUSES
            and lease.moved_out_at is None
            and lease.end_date >= today
        ),
        None,
    )


def _room_dict(room: LandlordRoom) -> dict[str, object]:
    lease = _current_lease(room)
    return {
        "id": room.id,
        "number": room.number,
        "status": "rented" if lease else ("maintenance" if room.status == "maintenance" else "vacant"),
        "tenant": lease.tenant.name if lease else None,
        "rent": lease.monthly_rent if lease else room.expected_rent,
        "lease_end": lease.end_date if lease else None,
        "floor": room.floor,
        "area": room.area,
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
    db: Session = Depends(get_db), landlord: User = Depends(get_current_landlord)
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
    landlord: User = Depends(get_current_landlord),
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
    db.add(property_item)
    db.commit()
    db.refresh(property_item)
    return _property_dict(property_item)


@router.patch("/{property_id}")
def update_property(
    property_id: int,
    payload: PropertyPayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_current_landlord),
):
    property_item = _owned_property(db, landlord.id, property_id)
    duplicate = db.query(LandlordProperty).filter(
        LandlordProperty.landlord_id == landlord.id,
        LandlordProperty.name == payload.name,
        LandlordProperty.id != property_id,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="已有相同名稱的棟別。")
    property_item.name = payload.name
    property_item.address = (payload.address or "").strip() or None
    property_item.city = (payload.city or "").strip() or None
    db.commit()
    return _property_dict(_owned_property(db, landlord.id, property_id))


@router.delete("/{property_id}")
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_current_landlord),
):
    property_item = _owned_property(db, landlord.id, property_id)
    if property_item.rooms:
        raise HTTPException(
            status_code=409,
            detail="棟別內已有房間，為保留租客、合約與財務紀錄，無法直接刪除。",
        )

    deleted = {"deleted_id": property_item.id, "name": property_item.name}
    db.delete(property_item)
    db.commit()
    return deleted


@router.post("/{property_id}/rooms", status_code=status.HTTP_201_CREATED)
def create_rooms(
    property_id: int,
    payload: RoomBatchPayload,
    db: Session = Depends(get_db),
    landlord: User = Depends(get_current_landlord),
):
    property_item = _owned_property(db, landlord.id, property_id)
    existing = {room.number for room in property_item.rooms}
    duplicates = sorted(existing.intersection(payload.numbers))
    if duplicates:
        raise HTTPException(status_code=409, detail=f"房號已存在：{', '.join(duplicates)}")
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
    landlord: User = Depends(get_current_landlord),
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
    room.number = payload.number.strip()
    room.status = "occupied" if lease else payload.status
    room.floor = payload.floor
    room.area = payload.area
    room.expected_rent = payload.expected_rent
    db.commit()
    return _room_dict(room)
