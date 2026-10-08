"""合約審閱紀錄、加密附件與未連結審閱的到期清理。"""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import String, and_, cast, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import storage
from auth.security import CurrentUser, get_current_user
from db import database
from db.database import get_db
from db.models import ContractReview, ContractReviewFile, User
from notifications.user_notify import notify_user

router = APIRouter(
    prefix='/api/contract/reviews', tags=['合約審閱紀錄'],
    dependencies=[Depends(get_current_user)],
)
logger = logging.getLogger(__name__)

REVIEW_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
NOT_FOUND = '找不到這筆審閱紀錄。'
NO_KEY = '檔案加密金鑰尚未設定，暫時無法存放或讀取檔案。'
RECORDS_LIMIT = '處理紀錄過多或過大。'
IMAGE_FORMAT = '佐證只收 JPG、PNG、WebP 圖片。'
IMAGE_SIZE = '每張圖片不得超過 10 MB。'
EVIDENCE_LIMIT = '每筆處理紀錄最多 5 張佐證圖片。'
REPORT_FORMAT = '報告必須是 20 MB 以內的 PDF。'
REPORT_LIMIT = '已存 10 份報告，請先刪除舊報告。'
IMAGE_MAX_BYTES = 10 * 1024 * 1024
REPORT_MAX_BYTES = 20 * 1024 * 1024
EXPIRY_BATCH_SIZE = 200


def owned_review(db, review_id, user, *, create=False, lock=False):
    if not REVIEW_ID.fullmatch(review_id):
        raise HTTPException(404, NOT_FOUND)
    query = db.query(ContractReview).filter(ContractReview.id == review_id)
    review = query.first()
    if review is not None and lock:
        review = query.with_for_update().populate_existing().first()
    if review is None and create:
        try:
            # 同一個 reviewSessionId 的首次請求可能同時抵達，唯一鍵決定擁有者。
            review = ContractReview(id=review_id, user_id=user.id, records=[], activity_at=datetime.utcnow())
            db.add(review)
            db.flush()
        except IntegrityError:
            db.rollback()
            review = query.with_for_update().populate_existing().first()
    if review is None or review.user_id != user.id:
        raise HTTPException(404, NOT_FOUND)
    return review


def touch(review):
    review.activity_at = datetime.utcnow()
    review.expiry_notified_at = None


def timestamp(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


def file_json(file):
    return {
        'id': file.id, 'kind': file.kind, 'recordKey': file.record_key,
        'name': file.original_name, 'contentType': file.content_type,
        'size': file.size_bytes, 'reportId': file.report_id,
        'createdAt': timestamp(file.created_at),
        'url': f'/api/contract/reviews/{file.review_id}/files/{file.id}',
    }


def review_json(db, review):
    files = db.query(ContractReviewFile).filter(ContractReviewFile.review_id == review.id).order_by(
        ContractReviewFile.created_at, ContractReviewFile.id).all()
    return {
        'id': review.id, 'records': review.records, 'rentalId': review.rental_id,
        'files': [file_json(file) for file in files], 'updatedAt': timestamp(review.activity_at),
    }


def original_name(file):
    name = file.filename or 'file'
    # EncryptedText 的 512 bytes 包含版本、nonce 與驗證標記（共 29 bytes）。
    if len(name.encode('utf-8')) > 483:
        raise HTTPException(400, '檔名過長，請縮短後再上傳。')
    return name


def save_files(db, review, uploads):
    saved_names = []
    rows = []
    try:
        for data, ext, attributes in uploads:
            name = storage.save('reviews', data, ext, encrypt=True)
            saved_names.append(name)
            row = ContractReviewFile(review_id=review.id, stored_name=name, size_bytes=len(data), **attributes)
            db.add(row)
            rows.append(row)
        touch(review)
        db.flush()
        result = [file_json(row) for row in rows]
        db.commit()
    except Exception as error:
        db.rollback()
        # 這些檔案尚未有已提交的引用；整批失敗時一併回收。
        for name in saved_names:
            storage.delete('reviews', name)
        if isinstance(error, storage.EncryptionUnavailable):
            raise HTTPException(503, NO_KEY) from error
        raise
    return result


def delete_review_rows(db, review):
    files = db.query(ContractReviewFile).filter(ContractReviewFile.review_id == review.id)
    names = [row[0] for row in files.with_entities(ContractReviewFile.stored_name)]
    files.delete(synchronize_session=False)
    db.delete(review)
    return names


@router.get('/{review_id}')
def get_review(review_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    return review_json(db, owned_review(db, review_id, user))


@router.put('/{review_id}')
def put_review(review_id: str, payload: Any = Body(...), db: Session = Depends(get_db),
               user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user, create=True, lock=True)
    records = payload.get('records') if isinstance(payload, dict) else None
    if not isinstance(records, list) or len(records) > 200:
        raise HTTPException(400, RECORDS_LIMIT)
    try:
        size = len(json.dumps(records, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8'))
    except (ValueError, UnicodeError) as error:
        raise HTTPException(400, RECORDS_LIMIT) from error
    if size > 256 * 1024:
        raise HTTPException(400, RECORDS_LIMIT)
    review.records = records
    touch(review)
    db.commit()
    return review_json(db, review)


@router.delete('/{review_id}', status_code=204)
def delete_review(review_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user, lock=True)
    names = delete_review_rows(db, review)
    db.commit()
    for name in names:
        storage.delete('reviews', name)
    return Response(status_code=204)


@router.post('/{review_id}/evidence', status_code=201)
async def upload_evidence(review_id: str, record_key: str = Form(..., min_length=1, max_length=64),
                          files: list[UploadFile] = File(...), db: Session = Depends(get_db),
                          user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user, create=True, lock=True)
    count = db.query(ContractReviewFile).filter(
        ContractReviewFile.review_id == review.id, ContractReviewFile.kind == 'evidence',
        ContractReviewFile.record_key == record_key).count()
    if count + len(files) > 5:
        raise HTTPException(409, EVIDENCE_LIMIT)
    uploads = []
    for file in files:
        data = await file.read(IMAGE_MAX_BYTES + 1)
        if len(data) > IMAGE_MAX_BYTES:
            raise HTTPException(400, IMAGE_SIZE)
        if storage.image_format(data) not in {'JPEG', 'PNG', 'WEBP'}:
            raise HTTPException(400, IMAGE_FORMAT)
        try:
            data = storage.reencode_image(data, max_edge=2048, quality=85)
        except ValueError as error:
            raise HTTPException(400, IMAGE_FORMAT) from error
        uploads.append((data, 'jpg', {
            'kind': 'evidence', 'record_key': record_key, 'original_name': original_name(file),
            'content_type': 'image/jpeg',
        }))
    return {'files': save_files(db, review, uploads)}


@router.post('/{review_id}/reports', status_code=201)
async def upload_report(review_id: str, report_id: str = Form(..., min_length=1, max_length=64),
                        file: UploadFile = File(...), db: Session = Depends(get_db),
                        user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user, create=True, lock=True)
    count = db.query(ContractReviewFile).filter(
        ContractReviewFile.review_id == review.id, ContractReviewFile.kind == 'report').count()
    if count >= 10:
        raise HTTPException(409, REPORT_LIMIT)
    data = await file.read(REPORT_MAX_BYTES + 1)
    if len(data) > REPORT_MAX_BYTES or not data.startswith(b'%PDF-'):
        raise HTTPException(400, REPORT_FORMAT)
    return save_files(db, review, [(data, 'pdf', {
        'kind': 'report', 'report_id': report_id, 'original_name': original_name(file),
        'content_type': 'application/pdf',
    })])[0]


@router.get('/{review_id}/files/{file_id}')
def get_file(review_id: str, file_id: int, db: Session = Depends(get_db),
             user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user)
    file = db.query(ContractReviewFile).filter(
        ContractReviewFile.id == file_id, ContractReviewFile.review_id == review.id).first()
    if file is None:
        raise HTTPException(404, NOT_FOUND)
    try:
        data = storage.read('reviews', file.stored_name, encrypted=True)
    except storage.EncryptionUnavailable as error:
        raise HTTPException(503, NO_KEY) from error
    except (OSError, ValueError) as error:
        logger.warning('合約審閱檔案遺失或損毀：%s', file.id)
        raise HTTPException(404, NOT_FOUND) from error
    return Response(data, media_type=file.content_type, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': "inline; filename*=UTF-8''" + quote(file.original_name, safe=''),
    })


@router.delete('/{review_id}/files/{file_id}', status_code=204)
def delete_file(review_id: str, file_id: int, db: Session = Depends(get_db),
                user: CurrentUser = Depends(get_current_user)):
    review = owned_review(db, review_id, user, lock=True)
    files = db.query(ContractReviewFile).filter(
        ContractReviewFile.id == file_id, ContractReviewFile.review_id == review.id)
    file = files.with_entities(ContractReviewFile.stored_name).first()
    if file is None:
        raise HTTPException(404, NOT_FOUND)
    files.delete(synchronize_session=False)
    touch(review)
    db.commit()
    storage.delete('reviews', file.stored_name)
    return Response(status_code=204)


def dispatch_expiry(now=None):
    if database.SessionLocal is None:
        return
    now = now or datetime.utcnow()
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    notice_cutoff = now - timedelta(days=166)
    delete_cutoff = now - timedelta(days=180)
    notified_cutoff = now - timedelta(days=14)
    with database.SessionLocal() as db:
        has_files = db.query(ContractReviewFile.id).filter(ContractReviewFile.review_id == ContractReview.id).exists()
        # 不能寫 records != []：MySQL 會把參數 '[]' 當成 JSON 字串而不是空陣列，條件永遠成立，
        # 空審閱就會佔掉批次名額。轉成文字再比：MySQL 輸出空陣列固定是 '[]'，SQLite 存的就是 '[]'。
        has_content = or_(cast(ContractReview.records, String) != '[]', has_files)
        ids = [row[0] for row in db.query(ContractReview.id).filter(
            ContractReview.rental_id.is_(None), ContractReview.activity_at <= notice_cutoff,
            or_(and_(ContractReview.expiry_notified_at.is_(None), has_content),
                and_(ContractReview.activity_at <= delete_cutoff,
                     or_(ContractReview.expiry_notified_at <= notified_cutoff, ~has_content))),
        ).order_by(ContractReview.activity_at, ContractReview.id).limit(EXPIRY_BATCH_SIZE)]
        for review_id in ids:
            try:
                # 與 PUT／上傳／刪檔共用審閱列鎖，避免剛更新的資料被到期工作刪除。
                review = db.query(ContractReview).filter(ContractReview.id == review_id).with_for_update().populate_existing().first()
                if review is None or review.rental_id is not None or review.activity_at > notice_cutoff:
                    db.rollback()
                    continue
                files = db.query(ContractReviewFile.kind).filter(ContractReviewFile.review_id == review.id).all()
                empty = not review.records and not files
                if review.activity_at <= delete_cutoff and (
                    empty or (review.expiry_notified_at is not None and review.expiry_notified_at <= notified_cutoff)
                ):
                    names = delete_review_rows(db, review)
                    db.commit()
                    for name in names:
                        storage.delete('reviews', name)
                elif not empty and review.expiry_notified_at is None:
                    deletion_date = max(review.activity_at + timedelta(days=180), now + timedelta(days=14))
                    evidence = sum(file.kind == 'evidence' for file in files)
                    reports = sum(file.kind == 'report' for file in files)
                    notify_user(
                        db, db.get(User, review.user_id), category='租約', source_label='合約審閱', created_by='system',
                        title='合約審閱紀錄將於 14 天後刪除',
                        body=f'這筆合約審閱最後更新於 {review.activity_at.date().isoformat()}，'
                             f'包含 {evidence} 張佐證圖片、{reports} 份報告，'
                             f'將於 {deletion_date.date().isoformat()} 刪除。'
                             '請在到期前儲存合約以保留審閱紀錄，或下載報告以保留副本。',
                    )
                    review.expiry_notified_at = now
                    db.commit()
                else:
                    db.rollback()
            except Exception as error:
                db.rollback()
                # 不記錄 SQL 參數，避免把紀錄內容與檔名寫進日誌。
                logger.warning('合約審閱到期處理失敗：%s（%s）', review_id, type(error).__name__)
