"""租客專用的加密補助文件與到期通知、清理。"""
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, defer

import storage
from auth.security import get_current_tenant
from db import database
from db.database import get_db
from db.models import Rental, SubsidyFile, User
from notifications.user_notify import notify_user

router = APIRouter(prefix='/api/subsidy/files', tags=['Subsidy'])
logger = logging.getLogger(__name__)

DOC_TYPES = {
    'application_form': '申請書', 'identity': '身分證明', 'household': '戶籍資料',
    'lease_copy': '租約影本', 'bankbook': '存摺封面', 'other': '其他',
}
NOT_FOUND = '找不到這份文件。'
NO_KEY = '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'
FILE_FORMAT = '只收 PDF、JPG、PNG 檔案。'
FILE_SIZE = '檔案不得超過 10 MB。'
FILE_LIMIT = '最多可存 20 份文件，請先刪除不需要的文件。'
FILE_MAX_BYTES = 10 * 1024 * 1024
FILES_LIMIT = 20
EXPIRY_BATCH_SIZE = 500


def timestamp(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


def file_json(file):
    return {
        'id': file.id, 'docType': file.doc_type, 'name': file.original_name,
        'contentType': file.content_type, 'size': file.size_bytes, 'rentalId': file.rental_id,
        'createdAt': timestamp(file.created_at), 'expiresAt': timestamp(file.expires_at),
        'url': f'/api/subsidy/files/{file.id}',
    }


@router.get('')
def list_files(db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    files = db.query(SubsidyFile).filter(SubsidyFile.user_id == user.id).order_by(
        SubsidyFile.created_at.desc(), SubsidyFile.id.desc()).all()
    return {'files': [file_json(file) for file in files], 'count': len(files), 'limit': FILES_LIMIT}


@router.post('', status_code=201)
async def upload_file(doc_type: str = Form(''), file: UploadFile = File(...),
                      rental_id: int | None = Form(None), db: Session = Depends(get_db),
                      user: User = Depends(get_current_tenant)):
    if doc_type not in DOC_TYPES:
        raise HTTPException(400, '請選擇文件類型。')
    data = await file.read(FILE_MAX_BYTES + 1)
    if len(data) > FILE_MAX_BYTES:
        raise HTTPException(400, FILE_SIZE)
    if data.startswith(b'%PDF-'):
        ext, content_type = 'pdf', 'application/pdf'
    else:
        image_format = storage.image_format(data)
        if image_format not in {'JPEG', 'PNG'}:
            raise HTTPException(400, FILE_FORMAT)
        ext, content_type = ('jpg', 'image/jpeg') if image_format == 'JPEG' else ('png', 'image/png')
    name = file.filename or 'file'
    # EncryptedText 的 512 bytes 包含版本、nonce 與驗證標記（共 29 bytes）。
    if len(name.encode('utf-8')) > 483:
        raise HTTPException(400, '檔名過長，請縮短後再上傳。')
    if rental_id is not None and db.query(Rental.id).filter(
        Rental.id == rental_id, Rental.user_id == user.id,
    ).first() is None:
        raise HTTPException(400, '找不到這份租約。')

    # 同一人的上傳共用使用者列鎖；計數也用鎖定讀取，避免沿用驗證身分時的 MySQL 舊快照。
    db.query(User.id).filter(User.id == user.id).with_for_update().one()
    existing = db.query(SubsidyFile.id).filter(SubsidyFile.user_id == user.id).with_for_update().all()
    if len(existing) >= FILES_LIMIT:
        raise HTTPException(409, FILE_LIMIT)
    stored_name = None
    try:
        stored_name = storage.save('subsidy', data, ext, encrypt=True)
        now = datetime.utcnow()
        row = SubsidyFile(
            user_id=user.id, rental_id=rental_id, doc_type=doc_type, stored_name=stored_name,
            original_name=name, content_type=content_type, size_bytes=len(data),
            created_at=now, expires_at=now + timedelta(days=180),
        )
        db.add(row)
        db.flush()
        result = file_json(row)
        db.commit()
    except Exception as error:
        db.rollback()
        if stored_name is not None:
            storage.delete('subsidy', stored_name)
        if isinstance(error, storage.EncryptionUnavailable):
            raise HTTPException(503, NO_KEY) from error
        raise
    return result


@router.get('/{file_id}')
def get_file(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    file = db.query(SubsidyFile).filter(SubsidyFile.id == file_id, SubsidyFile.user_id == user.id).first()
    if file is None:
        raise HTTPException(404, NOT_FOUND)
    try:
        data = storage.read('subsidy', file.stored_name, encrypted=True)
    except storage.EncryptionUnavailable as error:
        raise HTTPException(503, NO_KEY) from error
    except (OSError, ValueError) as error:
        logger.warning('補助文件遺失或損毀：%s', file.id)
        raise HTTPException(404, NOT_FOUND) from error
    return Response(data, media_type=file.content_type, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': "inline; filename*=UTF-8''" + quote(file.original_name, safe=''),
    })


@router.delete('/{file_id}', status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_tenant)):
    file = db.query(SubsidyFile).options(defer(SubsidyFile.original_name)).filter(
        SubsidyFile.id == file_id, SubsidyFile.user_id == user.id).with_for_update().first()
    if file is None:
        raise HTTPException(404, NOT_FOUND)
    name = file.stored_name
    db.delete(file)
    db.commit()
    storage.delete('subsidy', name)
    return Response(status_code=204)


def dispatch_expiry(now=None):
    if database.SessionLocal is None:
        return
    now = now or datetime.utcnow()
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    notice_cutoff = now + timedelta(days=14)
    with database.SessionLocal() as db:
        candidates = db.query(SubsidyFile.id, SubsidyFile.user_id, SubsidyFile.expiry_notified_at).filter(
            or_(and_(SubsidyFile.expiry_notified_at.is_(None), SubsidyFile.expires_at <= notice_cutoff),
                and_(SubsidyFile.expiry_notified_at.is_not(None), SubsidyFile.expires_at <= now)),
        ).order_by(SubsidyFile.expires_at, SubsidyFile.id).limit(EXPIRY_BATCH_SIZE).all()
        notices = {}
        deletions = []
        for file in candidates:
            if file.expiry_notified_at is None:
                notices.setdefault(file.user_id, []).append(file.id)
            else:
                deletions.append(file.id)
        db.rollback()

        for user_id, ids in notices.items():
            try:
                # 取得列鎖後重新檢查，避免多個排程器重複通知；清理不需讀取加密檔名。
                files = db.query(SubsidyFile).options(defer(SubsidyFile.original_name)).filter(
                    SubsidyFile.id.in_(ids), SubsidyFile.user_id == user_id,
                    SubsidyFile.expiry_notified_at.is_(None), SubsidyFile.expires_at <= notice_cutoff,
                ).order_by(SubsidyFile.id).with_for_update().populate_existing().all()
                if not files:
                    db.rollback()
                    continue
                deletion_date = min(max(file.expires_at, notice_cutoff) for file in files)
                types = '、'.join(f'{label} {sum(file.doc_type == kind for file in files)} 份'
                                 for kind, label in DOC_TYPES.items() if any(file.doc_type == kind for file in files))
                # 其他通知都帶 action_url，唯獨這則沒有，桌機使用者收到提醒後沒有一鍵前往的
                # 路徑。文案特別點名「電腦」是因為 /app/subsidy 在手機上掛著擋板：這是所有
                # 通知裡唯一會主動把使用者推向被擋頁面的一則，不先講清楚會讓人以為連結壞了。
                notify_user(
                    db, db.get(User, user_id), category='補貼', source_label='補助文件', created_by='system',
                    title='補助文件將於 14 天後刪除',
                    body=f'你有 {len(files)} 份補助文件（{types}）即將到期，'
                         f'最早將於 {deletion_date.date().isoformat()} 刪除。請在到期前於電腦上登入下載以保留副本。',
                    action_url='/app/subsidy', action_label='前往補助文件',
                )
                for file in files:
                    file.expiry_notified_at = now
                    file.expires_at = max(file.expires_at, notice_cutoff)
                db.commit()
            except Exception as error:
                db.rollback()
                # 不記錄例外內容與 SQL 參數，避免洩漏檔名或個資。
                logger.warning('補助文件到期通知失敗：%s（%s）', user_id, type(error).__name__)

        for file_id in deletions:
            try:
                file = db.query(SubsidyFile).options(defer(SubsidyFile.original_name)).filter(
                    SubsidyFile.id == file_id, SubsidyFile.expires_at <= now,
                    SubsidyFile.expiry_notified_at.is_not(None),
                ).with_for_update().populate_existing().first()
                if file is None:
                    db.rollback()
                    continue
                name = file.stored_name
                db.delete(file)
                db.commit()
                storage.delete('subsidy', name)
            except Exception as error:
                db.rollback()
                logger.warning('補助文件到期刪除失敗：%s（%s）', file_id, type(error).__name__)
