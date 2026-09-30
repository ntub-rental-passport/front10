"""家具設備報修：工單、時間軸與照片存證。

## 為什麼要重寫

報修原本整個存在瀏覽器：工單在 localStorage、照片在 IndexedDB。後果是：
- 租客報修後，房東只有在「同一台電腦、同一個瀏覽器」才看得到
- 房東端根本看不到照片——介面只顯示檔名，圖檔留在租客的瀏覽器裡
- 房東端列出 localStorage 裡「所有」工單，沒有依房東過濾
- 收據只存了檔名，檔案本身從沒被保存

## 與點交存證同一套概念

- 照片存在伺服器磁碟（REPAIR_UPLOAD_DIR），資料庫只記伺服器產生的檔名
- 時間軸（repair_ticket_events）只新增、不修改、不刪除：誰、何時、做了什麼，
  事後無法竄改，發生爭議時可以拿出來對照
- 照片隨著動作一起送出並寫入時間軸，送出後不提供刪除 —— 存證不能被抽掉

## 兩種工單

- lease：房東也在平台上（landlord_leases），房東端可以處理
- rental：租客自己存檔的終版契約，房東不在平台上。工單就是存證紀錄，
  租客可以補充、取消，或在與房東處理完後自行結案
"""
import base64
import datetime
import os
import re
import uuid
from pathlib import Path
from typing import Any, Literal

from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from auth.security import get_current_landlord, get_current_tenant, read_access_token
from db import models
from db.database import get_db
from routers.inspection import compress_image

router = APIRouter(prefix="/api/repairs", tags=["家具設備報修"])

# 與點交存證同一個根：backend/uploads/（inspection.py 的 BASE_DIR 也是 backend/）
BASE_DIR = Path(__file__).resolve().parents[1]

MAX_PHOTOS_PER_ACTION = 8
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
TERMINAL_STATUSES = {"completed", "canceled"}

# 伺服器產生的檔名。讀檔前一律比對，杜絕路徑穿越。
_STORED_NAME = re.compile(r"[0-9a-f]{32}\.(?:jpg|pdf)")


# ---------------------------------------------------------------
# 照片儲存（與點交存證同一套做法）
# ---------------------------------------------------------------

def photo_directory() -> Path:
    """照片存放位置。部署到學校 VM 時以 REPAIR_UPLOAD_DIR 指定，
    並且必須掛成持久化的 volume —— 重新部署時這個目錄若被清掉，
    資料庫裡的檔名就全部指向不存在的檔案，存證也就沒了。"""
    return Path(os.getenv("REPAIR_UPLOAD_DIR", str(BASE_DIR / "uploads" / "repairs")))


def _decode_upload(data: str) -> tuple[bytes, str]:
    """把前端送來的 data URL 轉成要存的位元組與副檔名。

    圖片一律重新壓成 JPEG（順便去掉 EXIF 位置資訊）；PDF 只接受真的 PDF。
    """
    header, _, raw = data.partition(",")
    if not raw:
        raw, header = header, ""
    if "application/pdf" in header:
        try:
            content = base64.b64decode(raw, validate=True)
        except ValueError as error:
            raise HTTPException(400, "檔案內容無法解析。") from error
        if not content.startswith(b"%PDF-"):
            raise HTTPException(400, "檔案不是有效的 PDF。")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "檔案不可超過 10MB。")
        return content, "pdf"
    try:
        return base64.b64decode(compress_image(data)), "jpg"
    except Exception as error:
        raise HTTPException(400, "無法解析圖片，請選擇有效的 JPG 或 PNG。") from error


def _write_file(content: bytes, extension: str) -> str:
    name = f"{uuid.uuid4().hex}.{extension}"
    directory = photo_directory()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content)
    return name


def _stored_path(photo: models.RepairTicketPhoto) -> Path:
    if not _STORED_NAME.fullmatch(photo.photo_url or ""):
        raise HTTPException(409, "這張照片的檔名格式不正確，無法讀取。")
    return photo_directory() / photo.photo_url


# ---------------------------------------------------------------
# 身分：同一組端點要服務租客與房東
# ---------------------------------------------------------------

def current_actor(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> tuple[models.User, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "請先登入後再使用報修功能。")
    role = read_access_token(authorization[7:]).get("role")
    if role == "tenant":
        return get_current_tenant(authorization, db), "tenant"
    if role == "landlord":
        return get_current_landlord(authorization, db), "landlord"
    raise HTTPException(403, "報修功能僅限租客與房東使用。")


def _email_matches(column, email: str):
    return func.lower(func.trim(column)) == (email or "").strip().lower()


def _tenant_leases(db: Session, user: models.User) -> list[models.LandlordLease]:
    """租客在房東平台上的租約：與 /api/tenant/leases 相同的比對規則（信箱）。"""
    profiles = (
        db.query(models.LandlordTenant)
        .options(
            joinedload(models.LandlordTenant.leases).joinedload(models.LandlordLease.property),
            joinedload(models.LandlordTenant.leases).joinedload(models.LandlordLease.room),
        )
        .filter(_email_matches(models.LandlordTenant.email, user.email),
                models.LandlordTenant.deleted_at.is_(None))
        .all()
    )
    return [lease for profile in profiles for lease in profile.leases]


def _landlord_lease_ids(db: Session, user: models.User) -> set[int]:
    rows = (
        db.query(models.LandlordLease.id)
        .join(models.LandlordTenant, models.LandlordLease.tenant_id == models.LandlordTenant.id)
        .filter(models.LandlordTenant.landlord_id == user.id)
        .all()
    )
    return {row.id for row in rows}


def _load_ticket(db: Session, ticket_id: int, user: models.User, role: str) -> models.RepairTicket:
    ticket = (
        db.query(models.RepairTicket)
        .options(selectinload(models.RepairTicket.events), selectinload(models.RepairTicket.photos))
        .filter(models.RepairTicket.id == ticket_id)
        .first()
    )
    allowed = ticket is not None and (
        (role == "tenant" and ticket.tenant_user_id == user.id)
        or (role == "landlord" and ticket.lease_id in _landlord_lease_ids(db, user))
    )
    if not allowed:
        # 不區分「不存在」與「不是你的」，避免被拿來探測別人的工單編號
        raise HTTPException(404, "找不到這筆報修，或它不屬於你的帳號。")
    return ticket


# ---------------------------------------------------------------
# 回應格式（對齊前端 RepairTicket）
# ---------------------------------------------------------------

def _iso(value: datetime.datetime | None) -> str:
    if not value:
        return ""
    return value.replace(tzinfo=datetime.timezone.utc).isoformat()


def _photo_ref(photo: models.RepairTicketPhoto) -> dict:
    is_pdf = (photo.photo_url or "").endswith(".pdf")
    try:
        size = _stored_path(photo).stat().st_size
    except (HTTPException, OSError):
        size = 0
    return {
        "id": str(photo.id),
        "name": photo.photo_name or ("文件.pdf" if is_pdf else "照片.jpg"),
        "type": "application/pdf" if is_pdf else "image/jpeg",
        "size": size,
        "stage": photo.stage,
    }


def _target_fields(db: Session, ticket: models.RepairTicket) -> dict:
    if ticket.lease_id:
        lease = db.get(models.LandlordLease, ticket.lease_id)
        if lease:
            return {
                "leaseId": f"lease:{lease.id}",
                "propertyId": str(lease.property_id),
                "roomId": str(lease.room_id),
                "property": lease.property.name if lease.property else "",
                "address": (lease.property.address if lease.property else "") or "",
                "room": lease.room.number if lease.room else "",
                "tenant": lease.tenant.name if lease.tenant else "",
                "targetKind": "lease",
            }
    if ticket.rental_id:
        rental = db.get(models.Rental, ticket.rental_id)
        if rental:
            return {
                "leaseId": f"rental:{rental.id}",
                "propertyId": f"rental:{rental.id}",
                "roomId": f"rental:{rental.id}",
                "property": rental.contract_tag or (rental.address or "")[:16],
                "address": rental.address or "",
                "room": rental.rental_room or "",
                "tenant": rental.tenant_name or "",
                "targetKind": "rental",
            }
    return {"leaseId": "", "propertyId": "", "roomId": "", "property": "（租約已刪除）",
            "address": "", "room": "", "tenant": "", "targetKind": "rental"}


def _inventory(db: Session, ticket: models.RepairTicket) -> dict:
    """「過去報修」與「入住狀況」都讀真實資料。

    入住狀況來自點交存證：同一份租約裡、名稱對得上的點交項目，
    有入住照就顯示入住時的辨識結果。這是判斷責任歸屬的關鍵證據
    （入住時就壞了，還是住進來之後才壞）。對不上就明講沒有紀錄。
    """
    same_target = models.RepairTicket.lease_id == ticket.lease_id if ticket.lease_id \
        else models.RepairTicket.rental_id == ticket.rental_id
    repair_count = (
        db.query(func.count(models.RepairTicket.id))
        .filter(same_target, models.RepairTicket.equipment == ticket.equipment,
                models.RepairTicket.id < ticket.id)
        .scalar()
    ) or 0

    move_in_status, move_in_photo = "尚無點交紀錄", "尚無入住照片"
    if ticket.rental_id and (ticket.equipment or ticket.location):
        candidates = (
            db.query(models.InspectionItem)
            .filter(models.InspectionItem.rental_id == ticket.rental_id)
            .all()
        )
        match = next(
            (item for item in candidates if item.baseline and (
                (ticket.equipment and ticket.equipment in (item.item_name or ""))
                or (ticket.location and ticket.location == item.room_name)
            )),
            None,
        )
        if match:
            result = match.baseline.vlm_result or {}
            move_in_status = (
                result.get("defect_summary")
                or match.baseline.user_note
                or ("入住時狀態完好" if result and not result.get("has_defect") else "入住時已拍照存證")
            )
            captured = match.baseline.captured_at
            move_in_photo = f"入住點交照片（{captured:%Y/%m/%d}，{match.room_name or ''} {match.item_name or ''}）".strip()

    return {"brand": "未記錄", "model": "", "moveInStatus": move_in_status,
            "moveInPhoto": move_in_photo, "repairCount": repair_count}


def _ticket_json(db: Session, ticket: models.RepairTicket, viewer_role: str) -> dict:
    photos = list(ticket.photos)
    by_stage = lambda stage: [p for p in photos if p.stage == stage]  # noqa: E731
    receipts = by_stage("receipt")

    supplements = []
    for event in ticket.events:
        if event.kind != "supplement":
            continue
        attached = [p for p in photos if p.event_id == event.id]
        supplements.append({
            "id": str(event.id), "at": _iso(event.created_at), "note": event.detail or "",
            "photoNames": [p.photo_name or "" for p in attached],
            "photos": [_photo_ref(p) for p in attached],
        })

    try:
        phone = ticket.phone or ""
    except InvalidTag:
        phone = ""

    return {
        "id": str(ticket.id),
        "code": f"R-{ticket.created_at:%Y%m%d}-{ticket.id:04d}",
        "tenantUserId": str(ticket.tenant_user_id),
        **_target_fields(db, ticket),
        "phone": phone,
        "location": ticket.location or "",
        "equipment": ticket.equipment or "",
        "description": ticket.description,
        "photoNames": [p.photo_name or "" for p in by_stage("report")],
        "photos": [_photo_ref(p) for p in by_stage("report")],
        "urgency": ticket.urgency,
        "availableTime": ticket.available_time or "",
        "accessPermission": ticket.access_permission,
        "status": ticket.status,
        "landlordRead": ticket.landlord_read_at is not None,
        "responsibility": ticket.responsibility,
        "responsibilityNote": ticket.responsibility_note or "",
        "vendorName": ticket.vendor_name or "",
        "vendorPhone": ticket.vendor_phone or "",
        "scheduledAt": ticket.scheduled_at.strftime("%Y-%m-%dT%H:%M") if ticket.scheduled_at else "",
        "estimatedCost": ticket.estimated_cost,
        "actualCost": ticket.actual_cost,
        "payer": ticket.payer or "待確認",
        "quoteName": "",
        "receiptName": receipts[-1].photo_name if receipts else "",
        "receipt": _photo_ref(receipts[-1]) if receipts else None,
        "tenantScheduleReply": ticket.tenant_schedule_reply or "",
        "inspectionResult": ticket.inspection_result or "",
        "contactBeforeArrival": ticket.contact_before_arrival,
        "supplementRequested": ticket.supplement_requested,
        "supplementRequestNote": ticket.supplement_request_note or "",
        "supplements": supplements,
        "rescheduleRequest": ticket.reschedule_request,
        "responsibilityAgreement": ticket.responsibility_agreement or "",
        "responsibilityQuestion": ticket.responsibility_question or "",
        "completionNote": ticket.completion_note or "",
        "completionPhotoNames": [p.photo_name or "" for p in by_stage("completion")],
        "completionPhotos": [_photo_ref(p) for p in by_stage("completion")],
        "unresolvedNote": ticket.unresolved_note or "",
        "unresolvedPhotoNames": [p.photo_name or "" for p in by_stage("unresolved")],
        "unresolvedPhotos": [_photo_ref(p) for p in by_stage("unresolved")],
        "unresolvedSafetyConcern": ticket.unresolved_safety_concern,
        "revisitAvailableTime": ticket.revisit_available_time or "",
        "inventory": _inventory(db, ticket),
        "createdAt": _iso(ticket.created_at),
        "updatedAt": _iso(ticket.updated_at),
        "timeline": [
            {"id": str(e.id), "at": _iso(e.created_at), "title": e.title,
             "detail": e.detail or None, "actorRole": e.actor_role}
            for e in ticket.events
        ],
        # 房東不在平台上的工單，租客可以自行結案
        "selfManaged": ticket.lease_id is None,
    }


# ---------------------------------------------------------------
# 請求格式
# ---------------------------------------------------------------

class UploadPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="", max_length=255)
    data: str = Field(min_length=1, max_length=15_000_000)


class EventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=4_000)


class CreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: str = Field(pattern=r"^(lease|rental):\d+$")
    location: str = Field(default="", max_length=100)
    equipment: str = Field(default="", max_length=100)
    description: str = Field(min_length=1, max_length=4_000)
    urgency: Literal["emergency", "soon", "normal"] = "normal"
    availableTime: str = Field(default="", max_length=500)
    accessPermission: Literal["present", "absent", "contact-first"] = "contact-first"
    phone: str = Field(default="", max_length=50)
    photos: list[UploadPayload] = Field(default_factory=list, max_length=MAX_PHOTOS_PER_ACTION)


class UpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    updates: dict[str, Any] = Field(default_factory=dict)
    event: EventPayload
    photos: list[UploadPayload] = Field(default_factory=list, max_length=MAX_PHOTOS_PER_ACTION)
    photoStage: Literal["supplement", "completion", "unresolved", "receipt"] | None = None


# ---------------------------------------------------------------
# 誰能改哪些欄位
# ---------------------------------------------------------------
#
# 前端的每個動作都送「欄位更新 + 時間軸事件」。如果伺服器照單全收，
# 租客就能自己把責任改成「房東負擔」、把費用改成 0。所以每個角色
# 只能動自己那一側的欄位，狀態也只能照流程往下走。

_FIELD_COLUMNS = {
    "tenantScheduleReply": "tenant_schedule_reply",
    "rescheduleRequest": "reschedule_request",
    "supplementRequested": "supplement_requested",
    "supplementRequestNote": "supplement_request_note",
    "responsibility": "responsibility",
    "responsibilityNote": "responsibility_note",
    "responsibilityAgreement": "responsibility_agreement",
    "responsibilityQuestion": "responsibility_question",
    "vendorName": "vendor_name",
    "vendorPhone": "vendor_phone",
    "scheduledAt": "scheduled_at",
    "estimatedCost": "estimated_cost",
    "actualCost": "actual_cost",
    "payer": "payer",
    "completionNote": "completion_note",
    "inspectionResult": "inspection_result",
    "unresolvedNote": "unresolved_note",
    "unresolvedSafetyConcern": "unresolved_safety_concern",
    "revisitAvailableTime": "revisit_available_time",
    "contactBeforeArrival": "contact_before_arrival",
    "status": "status",
}

TENANT_FIELDS = {
    "status", "tenantScheduleReply", "rescheduleRequest", "contactBeforeArrival",
    "supplementRequested", "supplementRequestNote",
    "responsibilityAgreement", "responsibilityQuestion",
    "inspectionResult", "unresolvedNote", "unresolvedSafetyConcern", "revisitAvailableTime",
}

LANDLORD_FIELDS = {
    "status", "supplementRequested", "supplementRequestNote",
    "responsibility", "responsibilityNote", "payer",
    "responsibilityAgreement", "responsibilityQuestion",
    "vendorName", "vendorPhone", "scheduledAt", "estimatedCost",
    "tenantScheduleReply", "rescheduleRequest", "inspectionResult",
    "actualCost", "completionNote",
}

# (角色, 目前狀態) -> 可以改成的狀態
_TRANSITIONS = {
    ("tenant", "pending"): {"canceled"},
    ("tenant", "processing"): {"canceled"},
    ("tenant", "inspection"): {"completed", "processing"},  # 驗收通過／回報未解決
    ("landlord", "pending"): {"pending", "processing", "canceled"},
    ("landlord", "processing"): {"processing", "inspection", "canceled"},
    ("landlord", "inspection"): {"processing"},  # 租客回報前重新安排
}

# 房東不在平台上時，租客要能在跟房東處理完之後自己結案，否則工單永遠停在待處理
_SELF_MANAGED_TRANSITIONS = {
    "pending": {"canceled", "completed"},
    "processing": {"canceled", "completed"},
    "inspection": {"completed", "processing"},
}

# 值要符合資料表的限制，不接受前端自由填
_ENUM_VALUES = {
    "responsibility": {"pending", "landlord", "tenant", "shared"},
    "tenantScheduleReply": {"", "accepted", "reschedule", "contact-first"},
    "inspectionResult": {"", "resolved", "unresolved", "retry"},
    "responsibilityAgreement": {"", "agreed", "questioned"},
}

_STAGE_OWNER = {"supplement": "tenant", "unresolved": "tenant", "completion": "landlord", "receipt": "landlord"}


def _coerce(field: str, value: Any) -> Any:
    if field in _ENUM_VALUES:
        if value not in _ENUM_VALUES[field]:
            raise HTTPException(422, f"「{field}」的值不在允許範圍內。")
        return value or None
    if field in {"supplementRequested", "unresolvedSafetyConcern", "contactBeforeArrival"}:
        return bool(value)
    if field in {"estimatedCost", "actualCost"}:
        if value in (None, ""):
            return None
        if not isinstance(value, (int, float)) or value < 0 or value > 10_000_000:
            raise HTTPException(422, "金額必須是 0 以上的數字。")
        return int(value)
    if field == "scheduledAt":
        if not value:
            return None
        try:
            return datetime.datetime.fromisoformat(str(value))
        except ValueError as error:
            raise HTTPException(422, "預計到場時間格式不正確。") from error
    if field == "rescheduleRequest":
        if value is None:
            return None
        if not isinstance(value, dict):
            raise HTTPException(422, "改期資料格式不正確。")
        return value
    if isinstance(value, str):
        return value.strip() or None
    return value


def _apply_updates(ticket: models.RepairTicket, updates: dict, role: str) -> None:
    allowed = TENANT_FIELDS if role == "tenant" else LANDLORD_FIELDS
    rejected = sorted(set(updates) - allowed - {"landlordRead"})
    if rejected:
        raise HTTPException(403, f"這些欄位不能由{'租客' if role == 'tenant' else '房東'}修改：{'、'.join(rejected)}")

    if "status" in updates:
        target = updates["status"]
        if ticket.lease_id is None and role == "tenant":
            options = _SELF_MANAGED_TRANSITIONS.get(ticket.status, set())
        else:
            options = _TRANSITIONS.get((role, ticket.status), set())
        if target != ticket.status and target not in options:
            raise HTTPException(409, f"目前狀態無法從「{ticket.status}」改成「{target}」。")

    for field, value in updates.items():
        if field == "landlordRead":
            continue
        setattr(ticket, _FIELD_COLUMNS[field], _coerce(field, value))

    if ticket.status == "completed" and not ticket.completed_at:
        ticket.completed_at = datetime.datetime.utcnow()


def _add_event(db: Session, ticket: models.RepairTicket, user: models.User, role: str,
               title: str, detail: str | None, kind: str = "note") -> models.RepairTicketEvent:
    # 行為者一律由伺服器依登入身分決定，前端無法冒充對方
    event = models.RepairTicketEvent(ticket_id=ticket.id, actor_user_id=user.id, actor_role=role,
                                     kind=kind, title=title, detail=detail)
    db.add(event)
    db.flush()
    return event


def _add_photos(db: Session, ticket: models.RepairTicket, user: models.User, uploads: list[UploadPayload],
                stage: str, event_id: int | None, written: list[Path]) -> None:
    for upload in uploads:
        content, extension = _decode_upload(upload.data)
        if extension == "pdf" and stage != "receipt":
            raise HTTPException(400, "只有收據或發票可以上傳 PDF，其他請上傳照片。")
        name = _write_file(content, extension)
        written.append(photo_directory() / name)
        db.add(models.RepairTicketPhoto(ticket_id=ticket.id, event_id=event_id, stage=stage,
                                        uploaded_by=user.id, photo_url=name,
                                        photo_name=(upload.name or name)[:255]))


# ---------------------------------------------------------------
# 端點
# ---------------------------------------------------------------

@router.get("/targets")
def list_targets(db: Session = Depends(get_db), user: models.User = Depends(get_current_tenant)):
    """租客可以報修的對象：房東平台上的租約，加上自己存檔的終版契約。"""
    today = datetime.date.today()
    items = []
    for lease in _tenant_leases(db, user):
        items.append({
            "leaseId": f"lease:{lease.id}", "propertyId": str(lease.property_id), "roomId": str(lease.room_id),
            "property": lease.property.name if lease.property else "",
            "address": (lease.property.address if lease.property else "") or "",
            "room": lease.room.number if lease.room else "",
            "tenant": lease.tenant.name if lease.tenant else "",
            "phone": "", "startDate": lease.start_date.isoformat(), "endDate": lease.end_date.isoformat(),
            "status": lease.status, "kind": "lease",
            "effective": lease.status == "active" and lease.moved_out_at is None
                         and lease.start_date <= today <= lease.end_date,
        })
    try:
        rentals = db.query(models.Rental).filter(models.Rental.user_id == user.id).all()
    except InvalidTag as error:
        raise HTTPException(500, "租約個資無法解密，加密金鑰可能已變更。") from error
    for rental in rentals:
        items.append({
            "leaseId": f"rental:{rental.id}", "propertyId": f"rental:{rental.id}", "roomId": f"rental:{rental.id}",
            "property": rental.contract_tag or (rental.address or "")[:16],
            "address": rental.address or "", "room": rental.rental_room or "",
            "tenant": rental.tenant_name or "", "phone": rental.tenant_phone or "",
            "startDate": rental.start_date.isoformat(), "endDate": rental.end_date.isoformat(),
            "status": rental.rental_status, "kind": "rental",
            "effective": rental.rental_status == "active" and rental.start_date <= today <= rental.end_date,
        })
    return {"items": items}


@router.get("")
def list_tickets(db: Session = Depends(get_db), actor=Depends(current_actor)):
    user, role = actor
    query = db.query(models.RepairTicket).options(
        selectinload(models.RepairTicket.events), selectinload(models.RepairTicket.photos))
    if role == "tenant":
        query = query.filter(models.RepairTicket.tenant_user_id == user.id)
    else:
        lease_ids = _landlord_lease_ids(db, user)
        if not lease_ids:
            return {"items": []}
        query = query.filter(models.RepairTicket.lease_id.in_(lease_ids))
    tickets = query.order_by(models.RepairTicket.created_at.desc()).all()
    return {"items": [_ticket_json(db, ticket, role) for ticket in tickets]}


@router.post("", status_code=201)
def create_ticket(payload: CreatePayload, db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_tenant)):
    kind, raw_id = payload.target.split(":")
    target_id = int(raw_id)
    if kind == "lease":
        if target_id not in {lease.id for lease in _tenant_leases(db, user)}:
            raise HTTPException(404, "找不到這份租約，或它不屬於你的帳號。")
        ticket = models.RepairTicket(tenant_user_id=user.id, lease_id=target_id)
    else:
        rental = db.query(models.Rental.id).filter(models.Rental.id == target_id,
                                                   models.Rental.user_id == user.id).first()
        if not rental:
            raise HTTPException(404, "找不到這份租約，或它不屬於你的帳號。")
        ticket = models.RepairTicket(tenant_user_id=user.id, rental_id=target_id)

    ticket.location = payload.location.strip() or None
    ticket.equipment = payload.equipment.strip() or None
    ticket.description = payload.description.strip()
    ticket.urgency = payload.urgency
    ticket.available_time = payload.availableTime.strip() or None
    ticket.access_permission = payload.accessPermission
    ticket.contact_before_arrival = payload.accessPermission == "contact-first"
    ticket.phone = payload.phone.strip() or None

    written: list[Path] = []
    try:
        db.add(ticket)
        db.flush()
        event = _add_event(db, ticket, user, "tenant", "租客提交報修",
                           f"附上 {len(payload.photos)} 張照片" if payload.photos else None, kind="status")
        _add_photos(db, ticket, user, payload.photos, "report", event.id, written)
        db.commit()
    except Exception:
        db.rollback()
        # 資料庫沒寫成就把已寫到磁碟的檔案清掉，不留孤兒檔
        for path in written:
            path.unlink(missing_ok=True)
        raise
    db.refresh(ticket)
    return _ticket_json(db, ticket, "tenant")


@router.patch("/{ticket_id}")
def update_ticket(ticket_id: int, payload: UpdatePayload, db: Session = Depends(get_db),
                  actor=Depends(current_actor)):
    user, role = actor
    ticket = _load_ticket(db, ticket_id, user, role)
    if ticket.status in TERMINAL_STATUSES:
        raise HTTPException(409, "案件已結束，不能再修改。原始紀錄會完整保留。")
    if role == "landlord" and ticket.lease_id is None:
        raise HTTPException(403, "這筆報修的房東不在平台上，由租客自行管理。")
    if payload.photos:
        if not payload.photoStage:
            raise HTTPException(422, "上傳照片時要指定用途。")
        if _STAGE_OWNER[payload.photoStage] != role:
            raise HTTPException(403, "這類照片不能由你上傳。")

    written: list[Path] = []
    try:
        _apply_updates(ticket, payload.updates, role)
        if role == "landlord" and not ticket.landlord_read_at:
            ticket.landlord_read_at = datetime.datetime.utcnow()
        kind = "supplement" if payload.photoStage == "supplement" else (
            "status" if "status" in payload.updates else "note")
        event = _add_event(db, ticket, user, role, payload.event.title, payload.event.detail, kind=kind)
        if payload.photos:
            _add_photos(db, ticket, user, payload.photos, payload.photoStage, event.id, written)
        db.commit()
    except Exception:
        db.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise
    db.refresh(ticket)
    return _ticket_json(db, ticket, role)


@router.post("/{ticket_id}/read")
def mark_read(ticket_id: int, db: Session = Depends(get_db),
              user: models.User = Depends(get_current_landlord)):
    ticket = _load_ticket(db, ticket_id, user, "landlord")
    if not ticket.landlord_read_at:
        ticket.landlord_read_at = datetime.datetime.utcnow()
        _add_event(db, ticket, user, "landlord", "房東已讀報修內容", None)
        db.commit()
        db.refresh(ticket)
    return _ticket_json(db, ticket, "landlord")


@router.get("/{ticket_id}/photos/{photo_id}")
def read_photo(ticket_id: int, photo_id: int, db: Session = Depends(get_db), actor=Depends(current_actor)):
    """讀取照片或收據。只有工單雙方看得到；不提供公開網址。"""
    user, role = actor
    ticket = _load_ticket(db, ticket_id, user, role)
    photo = next((p for p in ticket.photos if p.id == photo_id), None)
    if not photo:
        raise HTTPException(404, "找不到這張照片。")
    try:
        content = _stored_path(photo).read_bytes()
    except FileNotFoundError as error:
        # 資料庫有紀錄但檔案不見了：通常是部署時上傳目錄沒掛成持久化 volume
        raise HTTPException(410, "照片檔案已不存在，請確認伺服器的照片目錄設定。") from error
    media_type = "application/pdf" if photo.photo_url.endswith(".pdf") else "image/jpeg"
    return Response(content=content, media_type=media_type,
                    headers={"Cache-Control": "private, max-age=3600"})
