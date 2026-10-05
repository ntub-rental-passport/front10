"""租客儀表板：租約與每期帳單的真實資料。

資料一律來自 rentals / bills 兩張表。儀表板原本吃 src/mocks/dashboard-seed.ts
的假資料，那份假資料會顯示三份不存在的租約、假的房東姓名與已繳紀錄 ——
使用者無從分辨哪些是自己的。這支 router 取代它。

沒有任何租約時回空陣列，由前端顯示空狀態；不得回填示範資料。
"""
import datetime
import logging
import re

from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, selectinload

from auth.security import CurrentUser, get_current_user
from db import models
from db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/dashboard",
    tags=["租客儀表板"],
    dependencies=[Depends(get_current_user)],
)

# 卡片配色。純視覺，依租約建立順序輪流指派，讓同一份租約每次進來顏色一致。
ACCENTS = ("sky", "emerald", "amber")

PAYMENT_METHODS = ("bank-transfer", "cash", "line-pay", "other")

# 「臺北市」「新北市」「花蓮縣」——取地址開頭的縣市，找不到就留空，不猜。
_CITY_PATTERN = re.compile(r"^\s*([一-鿿]{2,3}[市縣])")


class PaymentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paid_at: datetime.date
    payment_method: str = Field(default="other")
    payment_note: str = Field(default="", max_length=2_000)
    payment_proof_name: str | None = Field(default=None, max_length=255)


def _city_of(address: str) -> str:
    match = _CITY_PATTERN.match(address or "")
    return match.group(1) if match else ""


def _lease_months(start: datetime.date, end: datetime.date) -> int:
    """租期月數；末端不足一個月仍算一個月，與 total_periods 的算法一致。"""
    exclusive_end = end + datetime.timedelta(days=1)
    whole = (exclusive_end.year - start.year) * 12 + (exclusive_end.month - start.month)
    if exclusive_end.day < start.day:
        whole -= 1
    return max(1, whole + (0 if exclusive_end.day == start.day else 1))


def _bill_json(bill: models.Bill) -> dict:
    return {
        "id": str(bill.id),
        "periodIndex": bill.period_index,
        "periodStart": bill.period_start.isoformat(),
        "periodEnd": bill.period_end.isoformat(),
        "dueDate": bill.due_date.isoformat(),
        "rentAmount": bill.rent_amount,
        # NULL 代表「帳單還沒來」，前端顯示「待匯入」而不是 0 元
        "electricityAmount": bill.electricity_amount,
        "waterAmount": bill.water_amount,
        "paidAt": bill.paid_at.date().isoformat() if bill.paid_at else None,
        "paymentMethod": bill.payment_method,
        "paymentNote": bill.payment_note or "",
        "paymentProofName": bill.payment_proof_url or None,
    }


def _contract_json(rental: models.Rental, accent: str) -> dict:
    address = rental.address or ""
    return {
        "id": str(rental.id),
        "title": rental.contract_tag or (address[:16] or f"租約 #{rental.id}"),
        "city": _city_of(address),
        "address": address,
        # landlord_name 是加密欄位，讀出來時已由 ORM 解密
        "landlord": rental.landlord_name or "未填寫",
        "leaseMonths": _lease_months(rental.start_date, rental.end_date),
        "contractStart": rental.start_date.isoformat(),
        "contractEnd": rental.end_date.isoformat(),
        "dueDay": rental.payment_day,
        "electricityPlan": rental.electricity_fee_type or "契約未載明",
        "waterPlan": rental.water_fee_rule or "契約未載明",
        "accent": accent,
        "cycles": [_bill_json(bill) for bill in sorted(rental.bills, key=lambda b: b.period_index)],
    }


def _owned_bill(db: Session, bill_id: int, user: CurrentUser) -> models.Bill:
    bill = (
        db.query(models.Bill)
        .join(models.Rental)
        .filter(models.Bill.id == bill_id, models.Rental.user_id == user.id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="找不到這期帳單，或它不屬於你的帳號。")
    return bill


@router.get("/contracts")
def list_contracts(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """這個使用者的租約與每期帳單。沒有租約就回空陣列。"""
    # 解密在載入列時就發生（EncryptedText 是 row-level 處理），一次查全部的話，
    # 只要其中一份租約解不開（例如用舊金鑰存的），整個儀表板就壞掉，
    # 其他正常的租約也選不到。所以先只查明文 id，再逐份載入。
    rental_ids = [
        row.id
        for row in db.query(models.Rental.id)
        .filter(models.Rental.user_id == user.id, models.Rental.rental_status == "active")
        .order_by(models.Rental.created_at.asc())
        .all()
    ]

    rentals = []
    for rental_id in rental_ids:
        try:
            rentals.append(
                db.query(models.Rental)
                .options(selectinload(models.Rental.bills))
                .filter(models.Rental.id == rental_id)
                .one()
            )
        except (InvalidTag, ValueError):
            logger.error("Dashboard: rental %s could not be decrypted; skipped", rental_id)

    if rental_ids and not rentals:
        # 全部都解不開才報錯；金鑰換過時要說清楚，不能讓儀表板顯示成「沒有租約」。
        raise HTTPException(
            status_code=500,
            detail="租約個資無法解密，加密金鑰可能已變更。請聯絡系統管理員核對金鑰。",
        )

    return [
        _contract_json(rental, ACCENTS[index % len(ACCENTS)])
        for index, rental in enumerate(rentals)
    ]


@router.put("/bills/{bill_id}/payment")
def record_payment(
    bill_id: int,
    payload: PaymentPayload,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """記錄某一期已繳。已繳的期數不可重複標記，避免覆蓋原本的付款紀錄。"""
    bill = _owned_bill(db, bill_id, user)
    if bill.paid_at:
        raise HTTPException(status_code=409, detail="這期已經標記為已繳，請先取消再重新記錄。")
    if payload.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail="不支援的付款方式。")

    bill.paid_at = datetime.datetime.combine(payload.paid_at, datetime.time.min)
    bill.payment_method = payload.payment_method
    bill.payment_note = payload.payment_note.strip() or None
    bill.payment_proof_url = payload.payment_proof_name
    db.commit()
    db.refresh(bill)
    return _bill_json(bill)


@router.delete("/bills/{bill_id}/payment")
def undo_payment(
    bill_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """取消已繳標記，回到未繳狀態。"""
    bill = _owned_bill(db, bill_id, user)
    bill.paid_at = None
    bill.payment_method = None
    bill.payment_note = None
    bill.payment_proof_url = None
    db.commit()
    db.refresh(bill)
    return _bill_json(bill)
