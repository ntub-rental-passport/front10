"""電費對帳：電表照片、租客回報讀數、房東處理（routers/landlord_finance 與 tenant_landlord_leases 共用）。

兩邊都用平台、租客也已加入房東的租約時，電費只有一份 —— 房東在財務頁記的那筆，
租客首頁唯讀顯示。這裡補上「對不上的時候怎麼辦」：

- 房東抄表時附電表照片，租客看得到同一張照片。
- 租客覺得讀數不對，回報自己抄到的讀數（可附照片），房東收到通知。
- 房東「採用」：直接更正那筆電費的讀數與金額，事件紀錄留下原值；
  「維持」：不改帳，回覆原因。兩種都會通知租客。
"""
import base64
import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from auth.security import get_current_tenant
from db.database import get_db
from db.models import LandlordCharge, LandlordChargeEvent, LandlordLease, UtilityEvidence, User
from db.utility_billing import UtilityEntry
from notifications.user_notify import notify_user

landlord_router = APIRouter(prefix="/api/landlord/finance", tags=["Utility evidence (landlord)"])
tenant_router = APIRouter(prefix="/api/tenant/landlord-leases", tags=["Utility evidence (tenant)"])

BASE_DIR = Path(__file__).resolve().parents[1]
MAX_PHOTO_BYTES = 10 * 1024 * 1024
_STORED_NAME = re.compile(r"[0-9a-f]{32}\.(?:jpg|pdf)")


class PhotoPayload(BaseModel):
    name: str = Field(default="電表照片.jpg", max_length=255)
    data: str = Field(min_length=1, max_length=15_000_000)


class ReadingPayload(BaseModel):
    reading: Decimal = Field(ge=0, le=100_000_000)
    note: str = Field(default="", max_length=1000)
    photo: PhotoPayload | None = None


class ResolvePayload(BaseModel):
    action: Literal["accept", "keep"]
    response: str = Field(default="", max_length=1000)


def photo_directory() -> Path:
    """部署時以 UTILITY_PHOTO_DIR 指定持久化 volume（同 REPAIR_UPLOAD_DIR）。"""
    return Path(os.getenv("UTILITY_PHOTO_DIR", str(BASE_DIR / "uploads" / "utility")))


def _store_photo(photo: PhotoPayload, allow_pdf: bool = False) -> str:
    """照片一律重新壓成 JPEG（順便去掉 EXIF 位置）；繳款證明另外接受真的 PDF。"""
    from routers.inspection import compress_image

    header, _, raw = photo.data.partition(",")
    extension = "jpg"
    if allow_pdf and "application/pdf" in header:
        try:
            content = base64.b64decode(raw, validate=True)
        except ValueError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "檔案內容無法解析。") from error
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "檔案不是有效的 PDF。")
        extension = "pdf"
    else:
        try:
            content = base64.b64decode(compress_image(photo.data))
        except Exception as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "無法解析照片，請選擇 JPG 或 PNG。") from error
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "檔案不可超過 10MB。")
    name = f"{uuid.uuid4().hex}.{extension}"
    directory = photo_directory()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content)
    return name


def _reading_of(charge: LandlordCharge):
    current = (charge.utility_details or {}).get("current")
    return None if current is None else Decimal(str(current))


def evidence_json(item: UtilityEvidence) -> dict:
    return {
        "id": item.id,
        "charge_id": item.charge_id,
        "kind": item.kind,
        "role": item.role,
        "reading": float(item.reading) if item.reading is not None else None,
        "amount": item.amount,
        "has_photo": bool(item.stored_name),
        "note": item.note or "",
        "status": item.status,
        "response": item.response or "",
        "resolved_at": item.resolved_at,
        "created_at": item.created_at,
    }


def charge_evidence(db: Session, charge_id: int) -> list[dict]:
    rows = db.query(UtilityEvidence).filter(UtilityEvidence.charge_id == charge_id).order_by(UtilityEvidence.id).all()
    return [evidence_json(item) for item in rows]


def _photo_response(item: UtilityEvidence) -> FileResponse:
    if not item.stored_name or not _STORED_NAME.fullmatch(item.stored_name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "這筆紀錄沒有照片。")
    path = photo_directory() / item.stored_name
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "照片檔案已不在伺服器上。")
    media_type = "application/pdf" if item.stored_name.endswith(".pdf") else "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=item.original_name or "佐證檔案")


# ---------------------------------------------------------------
# 房東
# ---------------------------------------------------------------

def _owned_electricity(db: Session, landlord_id: int, charge_id: int) -> LandlordCharge:
    charge = db.query(LandlordCharge).filter(LandlordCharge.id == charge_id, LandlordCharge.landlord_id == landlord_id).first()
    if not charge or charge.kind != "electricity":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆電費。")
    return charge


def _owned_charge_any(db: Session, landlord_id: int, charge_id: int) -> LandlordCharge:
    charge = db.query(LandlordCharge).filter(LandlordCharge.id == charge_id, LandlordCharge.landlord_id == landlord_id).first()
    if not charge:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆帳款。")
    return charge


def _owned_evidence(db: Session, landlord_id: int, evidence_id: int) -> tuple[UtilityEvidence, LandlordCharge]:
    item = db.get(UtilityEvidence, evidence_id)
    charge = db.get(LandlordCharge, item.charge_id) if item else None
    if not item or not charge or charge.landlord_id != landlord_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆電費佐證。")
    return item, charge


@landlord_router.get("/charges/{charge_id}/evidence")
def landlord_list_evidence(charge_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    _owned_charge_any(db, landlord.id, charge_id)
    return {"items": charge_evidence(db, charge_id)}


@landlord_router.post("/charges/{charge_id}/meter-photos", status_code=status.HTTP_201_CREATED)
def landlord_add_meter_photo(charge_id: int, payload: PhotoPayload, request: Request, db: Session = Depends(get_db),
                             landlord: User = Depends(get_landlord_workspace)):
    charge = _owned_electricity(db, landlord.id, charge_id)
    actor = landlord_actor(request, landlord)
    stored = _store_photo(payload)
    item = UtilityEvidence(charge_id=charge.id, kind="meter_photo", role="landlord", submitted_by=actor.id,
                           reading=_reading_of(charge), stored_name=stored, original_name=payload.name[:255], status="open")
    db.add(item)
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="meter_photo", detail="附上電表照片", actor_user_id=actor.id))
    try:
        db.commit()
    except Exception:
        (photo_directory() / stored).unlink(missing_ok=True)
        raise
    return evidence_json(item)


@landlord_router.get("/evidence/{evidence_id}/photo")
def landlord_photo(evidence_id: int, db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    item, _ = _owned_evidence(db, landlord.id, evidence_id)
    return _photo_response(item)


@landlord_router.post("/evidence/{evidence_id}/resolve")
def landlord_resolve_reading(evidence_id: int, payload: ResolvePayload, request: Request, db: Session = Depends(get_db),
                             landlord: User = Depends(get_landlord_workspace)):
    """處理租客回報的讀數或帳款異議：採用（更正這筆帳款）或維持原樣並回覆。"""
    item, charge = _owned_evidence(db, landlord.id, evidence_id)
    if item.kind not in ("tenant_reading", "charge_dispute"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "只有租客回報的讀數或異議需要處理。")
    if item.status != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "這筆回報已經處理過了。")
    response = payload.response.strip()
    actor = landlord_actor(request, landlord)
    lease = db.get(LandlordLease, charge.lease_id)

    if payload.action == "accept" and item.kind == "charge_dispute":
        if charge.voided_at:
            raise HTTPException(status.HTTP_409_CONFLICT, "這筆帳款已作廢。")
        paid = sum(payment.amount for payment in charge.payments)
        if paid > item.amount:
            raise HTTPException(status.HTTP_409_CONFLICT, f"已收 NT${paid:,}，多於租客主張的金額，請先沖銷多收的部分。")
        old_amount = charge.amount
        charge.amount = item.amount
        detail = f"依租客異議更正金額：NT${old_amount:,} → NT${item.amount:,}"
        item.status = "accepted"
        title, body = "房東已採用你主張的金額", f"{charge.title} 已更正為 NT${item.amount:,}。"
    elif payload.action == "accept":
        details = dict(charge.utility_details or {})
        if details.get("method") not in ("meter", "master"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "這筆電費不是依度數計算，讀數無法套用；請改用「維持原讀數」並回覆說明。")
        if charge.voided_at:
            raise HTTPException(status.HTTP_409_CONFLICT, "這筆電費已作廢。")
        if sum(payment.amount for payment in charge.payments) > 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "這筆電費已有收款，請先沖銷收款再更正讀數。")
        later = db.query(LandlordCharge).filter(LandlordCharge.lease_id == charge.lease_id, LandlordCharge.kind == "electricity",
                                                LandlordCharge.period_start > charge.period_start, LandlordCharge.voided_at.is_(None)).all()
        if any((row.utility_details or {}).get("current") is not None for row in later):
            raise HTTPException(status.HTTP_409_CONFLICT, "後續月份已有抄表紀錄，更正這期會影響之後的讀數，請依時間順序處理。")
        old_reading, old_amount = details.get("current"), charge.amount
        try:
            entry = UtilityEntry.model_validate({**details, "current": item.reading})
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"租客的讀數無法套用：{str(error).splitlines()[-1]}") from error
        charge.utility_details = entry.model_dump(mode="json", exclude_none=True)
        charge.amount = entry.receivable() or 0
        detail = f"依租客回報更正讀數：{old_reading} → {item.reading} 度，金額 NT${old_amount:,} → NT${charge.amount:,}"
        item.status = "accepted"
        title, body = "房東已採用你回報的電表讀數", f"{charge.title} 已更正為 {item.reading} 度，應繳 NT${charge.amount:,}。"
    else:
        if not response:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "維持原讀數時請回覆原因，讓租客知道。")
        detail = (f"維持原讀數（租客回報 {item.reading} 度）：{response}" if item.kind == "tenant_reading"
                  else f"維持原金額（租客主張 NT${item.amount:,}）：{response}")
        item.status = "kept"
        title = "房東維持原本的電表讀數" if item.kind == "tenant_reading" else "房東維持原本的帳款金額"
        body = f"{charge.title}：{response}"

    item.response = response or None
    item.resolved_by = actor.id
    item.resolved_at = datetime.utcnow()
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="reading_resolved", detail=detail, actor_user_id=actor.id))
    record_audit(db, landlord, actor, "帳務", "處理租客回報的電表讀數" if item.kind == "tenant_reading" else "處理租客的帳款異議", detail)
    tenant_user = db.get(User, lease.tenant_user_id) if lease and lease.tenant_user_id else None
    if tenant_user:
        from routers.landlord_workspace_api import settings_for

        notify_user(db, tenant_user, title=title, body=body, category="帳務", source_label="電費對帳",
                    created_by=f"landlord:{landlord.id}", action_url="/app", action_label="查看帳單",
                    email=settings_for(db, landlord).email_notifications)
    db.commit()
    return {"evidence": evidence_json(item), "amount": charge.amount, "utility_details": charge.utility_details}


def store_payment_proof(db: Session, charge: LandlordCharge, user: User, proof: PhotoPayload, note: str) -> UtilityEvidence:
    """租客回報繳款時附的證明（轉帳截圖或 PDF），存在伺服器，房東與後台都看得到。呼叫端負責 commit。"""
    stored = _store_photo(proof, allow_pdf=True)
    item = UtilityEvidence(charge_id=charge.id, kind="payment_proof", role="tenant", submitted_by=user.id,
                           stored_name=stored, original_name=proof.name[:255], note=note or None, status="open")
    db.add(item)
    return item


# ---------------------------------------------------------------
# 租客
# ---------------------------------------------------------------

def _visible_charge(db: Session, user: User, charge_id: int) -> tuple[LandlordCharge, LandlordLease]:
    from routers.tenant_leases import tenant_visible_leases

    charge = db.get(LandlordCharge, charge_id)
    lease = next((item for item in tenant_visible_leases(db, user) if charge and item.id == charge.lease_id), None)
    if not charge or not lease or charge.kind != "electricity" or charge.voided_at:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這筆電費。")
    return charge, lease


@tenant_router.post("/charges/{charge_id}/reading", status_code=status.HTTP_201_CREATED)
def tenant_report_reading(charge_id: int, payload: ReadingPayload, db: Session = Depends(get_db),
                          user: User = Depends(get_current_tenant)):
    charge, lease = _visible_charge(db, user, charge_id)
    if db.query(UtilityEvidence.id).filter(UtilityEvidence.charge_id == charge.id, UtilityEvidence.kind == "tenant_reading",
                                           UtilityEvidence.status == "open").first():
        raise HTTPException(status.HTTP_409_CONFLICT, "你上次回報的讀數房東還在處理，請等候回覆。")
    stored = _store_photo(payload.photo) if payload.photo else None
    item = UtilityEvidence(charge_id=charge.id, kind="tenant_reading", role="tenant", submitted_by=user.id,
                           reading=payload.reading, stored_name=stored,
                           original_name=payload.photo.name[:255] if payload.photo else None,
                           note=payload.note.strip() or None, status="open")
    db.add(item)
    landlord_reading = _reading_of(charge)
    detail = f"租客回報讀數 {payload.reading} 度" + (f"（房東記錄 {landlord_reading} 度）" if landlord_reading is not None else "")
    db.add(LandlordChargeEvent(charge_id=charge.id, kind="tenant_reading", detail=detail, actor_user_id=user.id))
    landlord = db.get(User, lease.tenant.landlord_id)
    if landlord:
        from routers.landlord_workspace_api import settings_for

        record_audit(db, landlord, user, "帳務", "租客回報電表讀數", f"{lease.tenant.name}：{detail}")
        notify_user(db, landlord, title=f"{lease.tenant.name} 回報的電表讀數與你不同",
                    body=f"{lease.property.name} {lease.room.number} 的{charge.title}：{detail}。"
                         + (f"備註：{payload.note.strip()}。" if payload.note.strip() else "") + "請到財務管理的電費紀錄確認。",
                    category="帳務", source_label="電費對帳", created_by=f"tenant:{user.id}",
                    action_url="/landlord/finance", action_label="確認讀數",
                    email=settings_for(db, landlord).email_notifications)
    try:
        db.commit()
    except Exception:
        if stored:
            (photo_directory() / stored).unlink(missing_ok=True)
        raise
    return evidence_json(item)


@tenant_router.get("/evidence/{evidence_id}/photo")
def tenant_photo(evidence_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    item = db.get(UtilityEvidence, evidence_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這張照片。")
    _visible_charge(db, user, item.charge_id)
    return _photo_response(item)
