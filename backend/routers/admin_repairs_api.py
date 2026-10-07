"""後台的報修工單（2026-10-01 起讀真實資料）。

報修本體與租客、房東端的 API 是組員寫的（routers/repairs.py），這裡不重做一份，
只補後台需要而那邊沒有的：

- 看得到全部工單（那邊只給工單的兩造）
- 房東是誰、房東何時讀到、何時完成——後台要判斷是不是卡在房東
- 管理員的內部註記與旗標（admin/repair_notes.py，存 SQLite）

工單的狀態與內容一律不從這裡改：那是租客與房東的流程，管理員介入是線下協調，
不是替他們按按鈕。
"""

from fastapi import APIRouter, Body, Depends, HTTPException
from cryptography.exceptions import InvalidTag
from sqlalchemy import LargeBinary, type_coerce
from sqlalchemy.orm import Session, defer

from admin import repair_notes
from auth.security import get_current_admin
from db import models
from db.database import get_db
from routers.repairs import _ticket_json
from db.models import User

router = APIRouter(prefix='/api/admin/repairs', tags=['Admin repairs'])


def _ticket_rows(db: Session):
    # 解密發生在整列載入時，所以同一查詢略過 ORM 電話並取原始密文，才能逐筆容錯且不加 N+1。
    return db.query(
        models.RepairTicket,
        type_coerce(models.RepairTicket.phone, LargeBinary).label('phone_ciphertext'),
    ).options(defer(models.RepairTicket.phone))


def _phone_or_empty(db: Session, ciphertext: bytes | None) -> str:
    try:
        return models.RepairTicket.__table__.c.phone.type.process_result_value(
            ciphertext, db.get_bind().dialect
        ) or ''
    # ValueError 是舊格式（非 v1 密文）；與 dashboard.py 一致，兩種都只讓這一筆的電話留空
    except (InvalidTag, ValueError):
        return ''


def _landlord_of(db: Session, ticket: models.RepairTicket) -> models.User | None:
    """房東是誰。租客自己存檔的契約（rental）沒有平台上的房東，回 None。"""
    if not ticket.lease_id:
        return None
    lease = db.get(models.LandlordLease, ticket.lease_id)
    if not lease or not lease.property:
        return None
    return db.get(models.User, lease.property.landlord_id)


def _admin_view(db: Session, ticket: models.RepairTicket, notes: dict, phone: str | None = None) -> dict:
    landlord = _landlord_of(db, ticket)
    data = _ticket_json(db, ticket, 'admin', phone=phone)
    data.update({
        # 畫面上與電話裡講的都是這個編號，跟租客、房東看到的同一個
        'ticketNo': data['code'],
        'landlordUserId': str(landlord.id) if landlord else '',
        'landlord': (landlord.display_name or landlord.email) if landlord else '',
        'landlordReadAt': ticket.landlord_read_at.isoformat() if ticket.landlord_read_at else None,
        'completedAt': ticket.completed_at.isoformat() if ticket.completed_at else None,
        **notes,
    })
    return data


@router.get('')
def list_repairs(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)) -> dict:
    notes = repair_notes.all_notes()
    tickets = (
        _ticket_rows(db)
        .order_by(models.RepairTicket.created_at.desc(), models.RepairTicket.id.desc())
        .all()
    )
    default = dict(repair_notes.FIELDS)
    return {'items': [
        _admin_view(db, ticket, notes.get(str(ticket.id), default), _phone_or_empty(db, ciphertext))
        for ticket, ciphertext in tickets
    ]}


@router.get('/{ticket_id}')
def read_repair(
    ticket_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
) -> dict:
    row = _ticket_rows(db).filter(models.RepairTicket.id == ticket_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail='找不到這筆報修。')
    ticket, ciphertext = row
    return _admin_view(db, ticket, repair_notes.notes_for(str(ticket.id)), _phone_or_empty(db, ciphertext))


@router.patch('/{ticket_id}')
def update_repair_notes(
    ticket_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> dict:
    row = _ticket_rows(db).filter(models.RepairTicket.id == ticket_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail='找不到這筆報修。')
    ticket, ciphertext = row
    updates = payload.get('updates')
    if not isinstance(updates, dict) or not updates:
        raise HTTPException(status_code=400, detail='沒有要更新的內容。')
    try:
        notes = repair_notes.update(str(ticket.id), updates)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _admin_view(db, ticket, notes, _phone_or_empty(db, ciphertext))
