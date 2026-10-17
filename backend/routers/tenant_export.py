"""租客自行匯出本人資料與附件，不包含房東平台的處理紀錄。"""
import csv
import io
import json
import re
import tempfile
import unicodedata
import zipfile
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from starlette.background import BackgroundTask

import storage
from auth.security import get_current_user, CurrentUser
from db.database import get_db
from db.models import (
    Bill, ContractReview, ContractReviewFile, GarbageReminder, Household, HouseholdMember,
    HouseholdTask, InspectionRecord, Note, Rental, RepairTicket, SubsidyApplication,
    SubsidyFile, TrashFavorite, User, UtilityEvidence,
)
from routers import inspection, repairs, utility_evidence

router = APIRouter(prefix='/api', tags=['租客資料匯出'])
PAYMENT_FIELDS = {
    'address': '租約地址', 'period_index': '期數', 'period_start': '期間起',
    'period_end': '期間迄', 'due_date': '到期日', 'rent_amount': '租金',
    'electricity_amount': '電費', 'water_amount': '水費', 'total_amount': '應繳合計',
    'paid_at': '繳費日', 'payment_method': '付款方式', 'payment_note': '備註',
    'payment_proof_name': '憑證檔名', 'attachment': '附件',
}
PAYMENT_METHODS = {'bank-transfer': '轉帳', 'cash': '現金', 'line-pay': 'LINE Pay', 'other': '其他'}
LEGACY_FILE = '舊紀錄僅保存檔名'
MISSING_FILE = '檔案已不存在'
UNDECRYPTABLE_FILE = '檔案無法解密'


def fields(record, names):
    return {name: getattr(record, name) for name in names}


def columns(record):
    return fields(record, record.__table__.columns.keys())


def json_value(value):
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError('無法匯出此資料格式。')


def clean_filename(name):
    name = ''.join(char for char in name if char not in '/\\' and not unicodedata.category(char).startswith('C'))
    name = name.strip(' .') or '未命名檔案'
    suffix = Path(name).suffix[:99]
    stem = name[:-len(Path(name).suffix)] if suffix else name
    stem = re.sub(r'\.{2,}', '', stem).strip(' .') or '檔案'
    return stem[:100 - len(suffix)] + suffix


class ExportArchive:
    def __init__(self, folders):
        self.exported_at = datetime.now(ZoneInfo('Asia/Taipei'))
        self.file = tempfile.SpooledTemporaryFile(max_size=20 * 1024 * 1024, mode='w+b')
        self.zip = zipfile.ZipFile(self.file, 'w', compression=zipfile.ZIP_DEFLATED)
        self.names = set()
        self.legacy = []
        self.missing = []
        self.undecryptable = []
        for folder in folders:
            self.zip.writestr(folder + '/', b'')

    def attachment(self, folder, name, stored_name, read):
        label = f'{folder}/{clean_filename(name)}'
        if not stored_name:
            if name:
                self.legacy.append(label)
                return LEGACY_FILE
            return None
        try:
            content = read()
        except storage.EncryptionUnavailable as error:
            raise HTTPException(503, '檔案加密金鑰尚未設定，暫時無法匯出附件。') from error
        except ValueError:
            self.undecryptable.append(label)
            return UNDECRYPTABLE_FILE
        except (FileNotFoundError, IsADirectoryError):
            self.missing.append(label)
            return MISSING_FILE
        except HTTPException as error:
            if error.status_code not in (404, 409, 410):
                raise
            self.missing.append(label)
            return MISSING_FILE
        filename = clean_filename(name or '未命名檔案')
        stem, suffix = Path(filename).stem, Path(filename).suffix
        candidate = filename
        count = 1
        while f'{folder}/{candidate}'.casefold() in self.names:
            count += 1
            number = f'-{count}'
            unique_suffix = suffix[:99 - len(number)]
            candidate = stem[:100 - len(unique_suffix) - len(number)] + number + unique_suffix
        path = f'{folder}/{candidate}'
        self.names.add(path.casefold())
        self.zip.writestr(path, content)
        return path

    def encrypted_attachment(self, folder, kind, record):
        return self.attachment(folder, record.original_name, record.stored_name,
                               lambda: storage.read(kind, record.stored_name, encrypted=True))

    def csv(self, name, fieldnames, rows):
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(fieldnames.values())
        for row in rows:
            writer.writerow([json_value(value) if isinstance(value, (datetime, date, time)) else value
                             for value in (row[key] for key in fieldnames)])
        self.zip.writestr(name, output.getvalue().encode('utf-8-sig'))

    def response(self, title, contents):
        description = [
            f'匯出時間（臺北時間）：{self.exported_at.isoformat()}',
            f'包含內容：{contents}',
            '僅包含本人資料與本人上傳的檔案。',
            '不包含房東的帳款、收款、電表照片與回覆，也不包含房東填寫的報修處理內容。',
            '房東平台租約（lease_id）的點交紀錄不包含在匯出中。',
            '', '舊紀錄只有檔名沒有檔案：',
            *(self.legacy or ['無']),
            '', '找不到的檔案：',
            *(self.missing or ['無']),
            '', '無法解密的檔案：',
            *(self.undecryptable or ['無']),
        ]
        self.zip.writestr('說明.txt', '\n'.join(description).encode('utf-8'))
        self.zip.close()
        self.file.seek(0)
        filename = f'RentMate-{title}-{self.exported_at.date().isoformat()}.zip'

        def chunks():
            try:
                while data := self.file.read(64 * 1024):
                    yield data
            finally:
                self.file.close()

        return StreamingResponse(chunks(), media_type='application/zip', headers={
            'Content-Disposition': "attachment; filename*=UTF-8''" + quote(filename, safe=''),
            'Access-Control-Expose-Headers': 'Content-Disposition',
            'Cache-Control': 'private, no-store',
        }, background=BackgroundTask(self.file.close))

    def close(self):
        self.zip.close()
        self.file.close()


def payment_records(db, user_id, archive, folder):
    rows = db.query(Bill, Rental.address).join(Rental).filter(Rental.user_id == user_id).order_by(
        Bill.rental_id, Bill.period_index).all()
    result = {}
    for bill, address in rows:
        row = fields(bill, ('period_index', 'period_start', 'period_end', 'due_date', 'rent_amount',
                            'electricity_amount', 'water_amount', 'paid_at', 'payment_note'))
        row.update({
            'address': address,
            'total_amount': bill.rent_amount + (bill.electricity_amount or 0) + (bill.water_amount or 0),
            'payment_method': PAYMENT_METHODS.get(bill.payment_method),
            'payment_proof_name': bill.payment_proof_url,
            'attachment': archive.attachment(
                folder, f'{bill.rental_id}-第{bill.period_index}期-{bill.payment_proof_url or "憑證"}',
                bill.payment_proof_stored_name,
                lambda: storage.read('payment_proofs', bill.payment_proof_stored_name, encrypted=True),
            ) if bill.payment_proof_url or bill.payment_proof_stored_name else None,
        })
        result.setdefault(bill.rental_id, []).append(row)
    archive.csv('繳費紀錄.csv', PAYMENT_FIELDS, [row for rows in result.values() for row in rows])
    return result


def read_evidence(record):
    if not utility_evidence._STORED_NAME.fullmatch(record.stored_name):
        raise FileNotFoundError('找不到檔案。')
    return (utility_evidence.photo_directory() / record.stored_name).read_bytes()


def lease_reports(db, user_id, archive, folder, kinds):
    records = db.query(UtilityEvidence).filter(
        UtilityEvidence.role == 'tenant', UtilityEvidence.submitted_by == user_id,
        UtilityEvidence.kind.in_(kinds),
    ).order_by(UtilityEvidence.created_at, UtilityEvidence.id).all()
    result = []
    for record in records:
        row = fields(record, ('kind', 'reading', 'amount', 'note', 'original_name', 'created_at'))
        row['attachment'] = archive.attachment(
            folder, record.original_name or '', record.stored_name, lambda: read_evidence(record))
        result.append(row)
    return result


def account_data(db, user_id, archive):
    user = db.get(User, user_id)
    account = fields(user, ('email', 'display_name', 'national_id', 'avatar_url', 'email_verified_at',
                           'created_at', 'last_login_at'))
    account['roles'] = [role.role for role in user.roles]
    account['identities'] = [fields(item, ('provider', 'created_at')) for item in user.identities]
    bills = payment_records(db, user_id, archive, '繳費憑證')
    rentals = db.query(Rental).filter(Rental.user_id == user_id).order_by(Rental.id).all()
    result = {
        'exported_at': archive.exported_at,
        'account': account,
        'rentals': [{**columns(rental), 'bills': bills.get(rental.id, [])} for rental in rentals],
        'landlord_lease_reports': lease_reports(db, user_id, archive, '房東租約回報',
                                              ('payment_proof', 'tenant_reading', 'charge_dispute')),
        'contract_reviews': [], 'inspections': [], 'repairs': [], 'notes': [], 'households': [],
        'subsidy': {'applications': [], 'files': []}, 'trash_favorites': [], 'garbage_reminders': [],
    }
    reviews = db.query(ContractReview).filter(ContractReview.user_id == user_id).order_by(ContractReview.id).all()
    for review in reviews:
        row = columns(review)
        row['files'] = []
        files = db.query(ContractReviewFile).filter(ContractReviewFile.review_id == review.id).order_by(ContractReviewFile.id).all()
        for file in files:
            row['files'].append({
                **fields(file, ('kind', 'original_name', 'size_bytes', 'created_at')),
                'attachment': archive.encrypted_attachment('契約審閱', 'reviews', file),
            })
        result['contract_reviews'].append(row)
    records = db.query(InspectionRecord).join(Rental).filter(
        Rental.user_id == user_id, InspectionRecord.lease_id.is_(None),
    ).order_by(InspectionRecord.id).all()
    for record in records:
        result['inspections'].append({
            **fields(record, ('type', 'item_name', 'room_name', 'user_note', 'captured_at', 'vlm_result')),
            'attachment': archive.attachment('點交照片', f'點交-{record.id}.jpg', record.photo_url,
                                             lambda: inspection.read_photo(record)),
        })
    tickets = db.query(RepairTicket).options(selectinload(RepairTicket.events), selectinload(RepairTicket.photos)).filter(
        RepairTicket.tenant_user_id == user_id).order_by(RepairTicket.id).all()
    for ticket in tickets:
        row = fields(ticket, ('location', 'equipment', 'description', 'phone', 'urgency', 'available_time',
                              'access_permission', 'contact_before_arrival', 'status', 'created_at'))
        row['events'] = [fields(item, ('actor_role', 'kind', 'title', 'detail', 'created_at'))
                         for item in ticket.events if item.actor_role == 'tenant']
        row['photos'] = [{
            **fields(photo, ('stage', 'photo_name', 'uploaded_at')),
            'attachment': archive.attachment('報修照片', photo.photo_name or f'報修-{photo.id}{Path(photo.photo_url).suffix}', photo.photo_url,
                                             lambda: repairs._stored_path(photo).read_bytes()),
        } for photo in ticket.photos if photo.uploaded_by == user_id]
        result['repairs'].append(row)
    memberships = db.query(HouseholdMember, Household.name).join(Household).filter(
        HouseholdMember.user_id == user_id).order_by(HouseholdMember.id).all()
    for member, name in memberships:
        tasks = db.query(HouseholdTask).filter(HouseholdTask.creator_member_id == member.id,
                                              HouseholdTask.household_id == member.household_id).order_by(HouseholdTask.id).all()
        result['households'].append({
            'name': name, **fields(member, ('display_name', 'role', 'joined_at')),
            'tasks': [fields(task, ('title', 'content', 'tag', 'due_date', 'due_time', 'done', 'done_at',
                                    'created_at', 'updated_at')) for task in tasks],
        })
    files = db.query(SubsidyFile).filter(SubsidyFile.user_id == user_id).order_by(SubsidyFile.id).all()
    result['subsidy']['files'] = [{
        **fields(file, ('doc_type', 'original_name', 'size_bytes', 'created_at', 'expires_at')),
        'attachment': archive.encrypted_attachment('補助文件', 'subsidy', file),
    } for file in files]
    result['subsidy']['applications'] = [columns(item) for item in db.query(SubsidyApplication).filter(
        SubsidyApplication.user_id == user_id).order_by(SubsidyApplication.id).all()]
    for key, model in (('notes', Note), ('trash_favorites', TrashFavorite), ('garbage_reminders', GarbageReminder)):
        result[key] = [columns(item) for item in db.query(model).filter(model.user_id == user_id).order_by(model.id).all()]
    for reminder in result['garbage_reminders']:
        if isinstance(reminder['payload'], str):
            try:
                reminder['payload'] = json.loads(reminder['payload'])
            except ValueError:
                pass
    return result


@router.get('/dashboard/payments/export')
def export_payments(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    archive = ExportArchive(('憑證', '房東租約回報憑證'))
    try:
        payment_records(db, user.id, archive, '憑證')
        reports = lease_reports(db, user.id, archive, '房東租約回報憑證', ('payment_proof',))
        archive.csv('房東租約回報憑證.csv', {
            'created_at': '回報時間', 'amount': '金額', 'note': '備註',
            'original_name': '檔名', 'attachment': '附件路徑',
        }, reports)
        return archive.response('繳費紀錄', '自記租約的繳費紀錄 CSV、繳費憑證與本人在房東租約回報的繳費憑證 CSV 及附件。')
    except Exception:
        archive.close()
        raise


@router.get('/account/export')
def export_account(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    archive = ExportArchive(('繳費憑證', '房東租約回報', '契約審閱', '點交照片', '報修照片', '補助文件'))
    try:
        data = account_data(db, user.id, archive)
        archive.zip.writestr('資料.json', json.dumps(data, ensure_ascii=False, indent=2, default=json_value).encode('utf-8'))
        return archive.response('個人資料', '個人資料 JSON、自記租約與繳費紀錄 CSV、本人租約回報、契約審閱、點交、報修、筆記、群組與自建任務、補助、垃圾車收藏與提醒，以及本人附件。')
    except Exception:
        archive.close()
        raise
