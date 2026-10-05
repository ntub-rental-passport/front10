"""房東合約管理：所有租約（含歷史與續約）與合約附件。

以前合約頁每位租客只顯示一份租約，續約只是插進畫面陣列、重新整理就消失；
附件只在瀏覽器記檔名，檔案本身沒有存。現在每份 landlord_leases 都是一列，
附件存在伺服器（LEASE_FILE_DIR），資料庫只記伺服器產生的檔名。
"""
import base64
import os
import re
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload, selectinload

from auth.landlord_workspace import get_landlord_workspace, landlord_actor, record_audit
from db.database import get_db
from db.models import LandlordLease, LandlordLeaseFile, LandlordTenant, LandlordTenantActivity, User
from routers import landlord_lease_rules as rules

router = APIRouter(prefix="/api/landlord/contracts", tags=["Landlord contracts"])

BASE_DIR = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES_PER_LEASE = 20
_STORED_NAME = re.compile(r"[0-9a-f]{32}\.(?:pdf|jpg|png)")
_SIGNATURES = {
    "pdf": (b"%PDF-", "application/pdf"),
    "jpg": (b"\xff\xd8\xff", "image/jpeg"),
    "png": (b"\x89PNG\r\n\x1a\n", "image/png"),
}


class FilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(min_length=1)


def file_directory() -> Path:
    """部署時以 LEASE_FILE_DIR 指定，並掛成持久化 volume（同 REPAIR_UPLOAD_DIR）。"""
    return Path(os.getenv("LEASE_FILE_DIR", str(BASE_DIR / "uploads" / "contracts")))


def _decode(data: str) -> tuple[bytes, str, str]:
    """data URL 或純 base64 → (內容, 副檔名, content type)。只收 PDF、JPEG、PNG，依檔頭判斷不看副檔名。"""
    _, _, raw = data.partition(",")
    raw = raw or data
    try:
        content = base64.b64decode(raw, validate=True)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "檔案內容無法解析。") from error
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "單一檔案不可超過 15MB。")
    for extension, (signature, content_type) in _SIGNATURES.items():
        if content.startswith(signature):
            return content, extension, content_type
    raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "只接受 PDF、JPG 或 PNG 檔。")


def _leases_query(db: Session, landlord_id: int):
    return (
        db.query(LandlordLease)
        .join(LandlordTenant, LandlordLease.tenant_id == LandlordTenant.id)
        .options(
            joinedload(LandlordLease.tenant), joinedload(LandlordLease.property), joinedload(LandlordLease.room),
            selectinload(LandlordLease.files), joinedload(LandlordLease.move_out),
        )
        .filter(LandlordTenant.landlord_id == landlord_id, LandlordTenant.deleted_at.is_(None))
    )


def _owned_lease(db: Session, landlord_id: int, lease_id: int) -> LandlordLease:
    lease = _leases_query(db, landlord_id).filter(LandlordLease.id == lease_id).first()
    if not lease:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到房東名下的這份租約。")
    return lease


def _file_dict(item: LandlordLeaseFile) -> dict:
    return {"id": item.id, "name": item.original_name, "content_type": item.content_type,
            "size": item.size_bytes, "uploaded_at": item.uploaded_at}


def _contract_state(lease: LandlordLease, today: date) -> str:
    display = rules.display_status(lease, today)
    return {"moved_out": "archived", "expired": "expired", "expiring": "expiring", "pending": "upcoming"}.get(display, "active")


def _lease_dict(lease: LandlordLease, today: date, renewed_by: dict[int, int]) -> dict:
    tenant = lease.tenant
    national_id = rules.tenant_pii(tenant, "national_id")
    return {
        "lease_id": lease.id,
        "tenant_id": tenant.id,
        "contract_id": lease.contract_id or f"LEASE-{lease.id}",
        "tenant": tenant.name,
        "phone": rules.tenant_pii(tenant, "phone") or rules.UNREADABLE,
        "email": tenant.email,
        "national_id_masked": (f"{national_id[:3]}*****{national_id[-2:]}"
                               if national_id and len(national_id) >= 5 else None),
        "contact_address": rules.tenant_pii(tenant, "contact_address"),
        "property_id": lease.property_id,
        "property": lease.property.name,
        "property_address": lease.property.address or "",
        "room_id": lease.room_id,
        "room": lease.room.number,
        "start": lease.start_date,
        "end": lease.end_date,
        "moved_out_at": lease.moved_out_at,
        "rent": lease.monthly_rent,
        "deposit": lease.deposit_amount,
        "payment_day": lease.payment_day,
        "payment_frequency": lease.payment_frequency,
        "state": _contract_state(lease, today),
        "effective": rules.is_effective(lease, today),
        "account_bound": bool(lease.tenant_user_id),
        "renewed_by_lease_id": renewed_by.get(lease.id),
        "files": [_file_dict(item) for item in lease.files],
        "created_at": lease.created_at,
    }


@router.get("")
def list_contracts(db: Session = Depends(get_db), landlord: User = Depends(get_landlord_workspace)):
    today = date.today()
    leases = _leases_query(db, landlord.id).all()
    # 同一位租客的下一份租約 = 續約
    renewed_by: dict[int, int] = {}
    by_tenant: dict[int, list[LandlordLease]] = {}
    for lease in leases:
        by_tenant.setdefault(lease.tenant_id, []).append(lease)
    for items in by_tenant.values():
        items.sort(key=lambda item: (item.start_date, item.id))
        for previous, following in zip(items, items[1:]):
            renewed_by[previous.id] = following.id
    rows = [_lease_dict(lease, today, renewed_by) for lease in leases]
    rows.sort(key=lambda row: (row["state"] == "archived", row["end"]), reverse=False)
    return {"items": rows}


@router.post("/{lease_id}/files", status_code=status.HTTP_201_CREATED)
def upload_file(lease_id: int, payload: FilePayload, request: Request, db: Session = Depends(get_db),
                landlord: User = Depends(get_landlord_workspace)):
    lease = _owned_lease(db, landlord.id, lease_id)
    if len(lease.files) >= MAX_FILES_PER_LEASE:
        raise HTTPException(status.HTTP_409_CONFLICT, f"每份租約最多 {MAX_FILES_PER_LEASE} 個附件。")
    content, extension, content_type = _decode(payload.data)
    stored = f"{uuid.uuid4().hex}.{extension}"
    directory = file_directory()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / stored).write_bytes(content)
    actor = landlord_actor(request, landlord)
    record = LandlordLeaseFile(lease_id=lease.id, stored_name=stored, original_name=payload.name.strip()[:255],
                               content_type=content_type, size_bytes=len(content), uploaded_by=actor.id)
    db.add(record)
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind="contract_file", detail=f"上傳合約附件 {record.original_name}"))
    record_audit(db, landlord, actor, "合約", "上傳合約附件", f"{lease.tenant.name}：{record.original_name}")
    try:
        db.commit()
    except Exception:
        (directory / stored).unlink(missing_ok=True)
        raise
    db.refresh(record)
    return _file_dict(record)


def _owned_file(db: Session, landlord_id: int, lease_id: int, file_id: int) -> tuple[LandlordLease, LandlordLeaseFile]:
    lease = _owned_lease(db, landlord_id, lease_id)
    item = next((entry for entry in lease.files if entry.id == file_id), None)
    if not item or not _STORED_NAME.fullmatch(item.stored_name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "找不到這個附件。")
    return lease, item


@router.get("/{lease_id}/files/{file_id}")
def download_file(lease_id: int, file_id: int, db: Session = Depends(get_db),
                  landlord: User = Depends(get_landlord_workspace)):
    _, item = _owned_file(db, landlord.id, lease_id, file_id)
    path = file_directory() / item.stored_name
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "附件檔案已不在伺服器上，請重新上傳。")
    return FileResponse(path, media_type=item.content_type, filename=item.original_name)


@router.delete("/{lease_id}/files/{file_id}")
def delete_file(lease_id: int, file_id: int, request: Request, db: Session = Depends(get_db),
                landlord: User = Depends(get_landlord_workspace)):
    lease, item = _owned_file(db, landlord.id, lease_id, file_id)
    stored = item.stored_name
    record_audit(db, landlord, landlord_actor(request, landlord), "合約", "刪除合約附件",
                 f"{lease.tenant.name}：{item.original_name}", "warning")
    db.add(LandlordTenantActivity(tenant_id=lease.tenant_id, kind="contract_file", detail=f"刪除合約附件 {item.original_name}"))
    db.delete(item)
    db.commit()
    (file_directory() / stored).unlink(missing_ok=True)
    return {"deleted_id": file_id}
