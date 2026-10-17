"""租客匯出的資料隔離、附件解密與檔名安全。"""
import base64
import csv
import io
import json
import os
import tempfile
import unittest
import zipfile
from datetime import date, datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote

from cryptography.exceptions import InvalidTag
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import storage
from db import database, models
from db.database import Base, get_db
from db.encrypted_fields import EncryptedText

with patch.dict(os.environ, {'JWT_SECRET': os.getenv('JWT_SECRET') or 'tenant-export-tests-secret-32-bytes'}):
    from auth import security
    from routers import tenant_export


OTHER_KEY = base64.b64encode(b'x' * 32).decode()


class TenantExportTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        env = patch.dict(os.environ, {
            **{name: str(self.directory / folder) for name, folder in (
                ('PAYMENT_PROOF_DIR', 'payment_proofs'), ('SUBSIDY_FILE_DIR', 'subsidy'),
                ('REVIEW_FILE_DIR', 'reviews'), ('INSPECTION_UPLOAD_DIR', 'inspection'),
                ('REPAIR_UPLOAD_DIR', 'repairs'), ('UTILITY_PHOTO_DIR', 'utility'),
            )},
            'PII_ENCRYPTION_KEY': base64.b64encode(b'p' * 32).decode(),
            'FILE_ENCRYPTION_KEY': base64.b64encode(b'f' * 32).decode(),
        })
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda conn, _: conn.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        self.Session = sessionmaker(bind=self.engine)
        for name, value in [('engine', self.engine), ('SessionLocal', self.Session)]:
            replacement = patch.object(database, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        with self.Session() as db:
            db.add_all([
                models.User(id=1, email='本人@example.com', display_name='租客', national_id='A123456789',
                            password_hash='不得匯出的密碼雜湊', roles=[models.UserRole(role='tenant')]),
                models.User(id=2, email='別人@example.com', roles=[models.UserRole(role='tenant')]),
                models.User(id=3, email='房東@example.com', roles=[models.UserRole(role='landlord')]),
            ])
            db.commit()
        app = FastAPI()
        app.include_router(tenant_export.router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.login(1)

    def login(self, user_id, role='tenant'):
        with patch.object(security, 'session_seconds', return_value=3600):
            token = security.create_cookie_token(user_id, f'{user_id}@example.com', role)
        self.client.cookies.set(security.AUTH_COOKIE_NAME, token)

    def rental(self, user_id=1):
        with self.Session() as db:
            rental = models.Rental(user_id=user_id, address=f'使用者{user_id}自記地址',
                                   start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
                                   rent_amount=10000, deposit_amount=20000, payment_day=5, total_periods=12,
                                   bank_account='本人填寫的銀行帳號', tenant_phone='0912345678')
            db.add(rental)
            db.commit()
            return rental.id

    def bill(self, rental_id, period, **kwargs):
        with self.Session() as db:
            db.add(models.Bill(rental_id=rental_id, period_index=period,
                               period_start=date(2026, period, 1), period_end=date(2026, period, 28),
                               due_date=date(2026, period, 5), rent_amount=10000, **kwargs))
            db.commit()

    def archive(self, path):
        statements = []

        def record(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(self.engine, 'before_cursor_execute', record)
        try:
            response = self.client.get(path)
        finally:
            event.remove(self.engine, 'before_cursor_execute', record)
        self.assertEqual(response.status_code, 200, response.text if response.status_code != 200 else '')
        self.assertEqual(response.headers['content-type'], 'application/zip')
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        self.assertEqual(response.headers['access-control-expose-headers'], 'Content-Disposition')
        self.assertFalse(any(sql.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) for sql in statements))
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        self.addCleanup(archive.close)
        self.assertIsNone(archive.testzip())
        title = '個人資料' if path == '/api/account/export' else '繳費紀錄'
        self.assertRegex(unquote(response.headers['content-disposition']),
                         "^attachment; filename\\*=UTF-8''RentMate-" + title + r'-\d{4}-\d{2}-\d{2}\.zip$')
        self.assertIn('+08:00', archive.read('說明.txt').decode())
        self.assertIn('不包含房東的帳款、收款、電表照片與回覆', archive.read('說明.txt').decode())
        return archive

    def csv_rows(self, archive, name='繳費紀錄.csv'):
        data = archive.read(name)
        self.assertTrue(data.startswith(b'\xef\xbb\xbf'))
        return list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))

    def assert_absent(self, archive, *values):
        for name in archive.namelist():
            for value in values:
                self.assertNotIn(value.encode(), archive.read(name), name)
                self.assertNotIn(value, name)

    def test_payments_decrypt_sort_and_isolate(self):
        own, other = self.rental(), self.rental(2)
        original = b'%PDF-1.7\n' + '本人原始繳費憑證'.encode()
        stored = storage.save('payment_proofs', original, 'pdf', encrypt=True)
        foreign = storage.save('payment_proofs', '別人的繳費檔案'.encode(), 'pdf', encrypt=True)
        self.bill(own, 2, payment_proof_url='舊紀錄.pdf', payment_method='cash')
        self.bill(own, 1, payment_proof_url='轉帳憑證.pdf', payment_proof_stored_name=stored,
                  payment_method='bank-transfer', water_amount=50, paid_at=datetime(2026, 1, 3),
                  payment_note='備註，含逗號\n第二行')
        self.bill(own, 3, payment_proof_url='遺失繳費.pdf', payment_proof_stored_name='f' * 32 + '.pdf',
                  payment_method='line-pay')
        self.bill(own, 4, payment_method='other')
        self.bill(other, 1, payment_proof_url='他人憑證.pdf', payment_proof_stored_name=foreign)
        archive = self.archive('/api/dashboard/payments/export')
        rows = self.csv_rows(archive)
        self.assertEqual(list(rows[0]), ['租約地址', '期數', '期間起', '期間迄', '到期日', '租金', '電費',
                                        '水費', '應繳合計', '繳費日', '付款方式', '備註', '憑證檔名', '附件'])
        self.assertEqual([row['期數'] for row in rows], ['1', '2', '3', '4'])
        self.assertEqual([row['付款方式'] for row in rows], ['轉帳', '現金', 'LINE Pay', '其他'])
        self.assertEqual((rows[0]['電費'], rows[0]['水費'], rows[0]['應繳合計']), ('', '50', '10050'))
        self.assertEqual(rows[0]['備註'], '備註，含逗號\n第二行')
        self.assertEqual(rows[0]['附件'], f'憑證/{own}-第1期-轉帳憑證.pdf')
        self.assertEqual(archive.read(rows[0]['附件']), original)
        self.assertEqual(rows[1]['附件'], '舊紀錄僅保存檔名')
        self.assertEqual(rows[2]['附件'], '檔案已不存在')
        self.assertEqual(rows[3]['附件'], '')
        self.assertIn('舊紀錄.pdf', archive.read('說明.txt').decode())
        self.assertIn('遺失繳費.pdf', archive.read('說明.txt').decode())
        self.assert_absent(archive, '使用者2自記地址', '他人憑證.pdf', '別人的繳費檔案')
        archive = self.archive('/api/account/export')
        rows = self.csv_rows(archive)
        bills = json.loads(archive.read('資料.json'))['rentals'][0]['bills']
        self.assertEqual(rows[0]['附件'], f'繳費憑證/{own}-第1期-轉帳憑證.pdf')
        self.assertEqual(bills[0]['attachment'], rows[0]['附件'])
        self.assertEqual(archive.read(bills[0]['attachment']), original)
        self.assertEqual(bills[1]['attachment'], '舊紀錄僅保存檔名')
        self.assertEqual(bills[2]['attachment'], '檔案已不存在')
        self.assert_absent(archive, '使用者2自記地址', '他人憑證.pdf', '別人的繳費檔案')

    def test_undecryptable_proof_does_not_stop_other_files_or_records(self):
        own = self.rental()
        original = b'%PDF-valid-proof'
        valid = storage.save('payment_proofs', original, 'pdf', encrypt=True)
        damaged = storage.save('payment_proofs', b'%PDF-damaged-proof', 'pdf', encrypt=True)
        damaged_path = storage.path_of('payment_proofs', damaged)
        encrypted = damaged_path.read_bytes()
        self.bill(own, 1, payment_proof_url='正常憑證.pdf', payment_proof_stored_name=valid)
        self.bill(own, 2, payment_proof_url='損壞憑證.pdf', payment_proof_stored_name=damaged)
        for content in (b'invalid-encrypted-file', encrypted[:-1] + bytes([encrypted[-1] ^ 1])):
            damaged_path.write_bytes(content)
            for path in ('/api/dashboard/payments/export', '/api/account/export'):
                with self.subTest(content=content, path=path):
                    archive = self.archive(path)
                    rows = self.csv_rows(archive)
                    self.assertEqual(archive.read(rows[0]['附件']), original)
                    self.assertEqual(rows[1]['附件'], '檔案無法解密')
                    self.assertFalse(any(name.endswith('損壞憑證.pdf') for name in archive.namelist()))
                    description = archive.read('說明.txt').decode()
                    self.assertIn('找不到的檔案：\n無', description)
                    self.assertIn('損壞憑證.pdf', description.split('無法解密的檔案：\n')[1])
                    if path == '/api/account/export':
                        bills = json.loads(archive.read('資料.json'))['rentals'][0]['bills']
                        self.assertEqual(bills[1]['attachment'], '檔案無法解密')

    def test_missing_file_encryption_key_returns_service_unavailable(self):
        own = self.rental()
        stored = storage.save('payment_proofs', b'%PDF-proof', 'pdf', encrypt=True)
        self.bill(own, 1, payment_proof_url='憑證.pdf', payment_proof_stored_name=stored)
        with patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': ''}):
            for path in ('/api/dashboard/payments/export', '/api/account/export'):
                with self.subTest(path=path):
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json(), {'detail': '檔案加密金鑰尚未設定，暫時無法匯出附件。'})

    def test_other_key_fields_are_null_and_listed_without_losing_other_data(self):
        own = self.rental()
        self.rental()
        partial = self.rental()
        self.bill(own, 1, payment_note='正常繳費備註')
        review_file = storage.save('reviews', b'%PDF-review', 'pdf', encrypt=True)
        subsidy_file = storage.save('subsidy', b'%PDF-subsidy', 'pdf', encrypt=True)
        encrypted_rental_fields = [column.key for column in models.Rental.__table__.columns
                                   if isinstance(column.type, EncryptedText)]
        with self.Session() as db:
            user = db.get(models.User, 1)
            rental = db.get(models.Rental, own)
            partial_rental = db.get(models.Rental, partial)
            db.add(models.ContractReview(id='異金鑰審閱', user_id=1, records=['正常審閱內容'],
                                         activity_at=datetime(2026, 1, 1)))
            db.add(models.RepairTicket(id=1, tenant_user_id=1, rental_id=own, description='正常報修',
                                       phone='0912345678'))
            db.flush()
            with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': OTHER_KEY}):
                user.national_id = 'B123456789'
                for name in encrypted_rental_fields:
                    setattr(rental, name, '異金鑰租約資料')
                partial_rental.bank_account = '異金鑰銀行帳號'
                db.add(models.RepairTicket(id=2, tenant_user_id=1, rental_id=own, description='異金鑰報修',
                                           phone='0987654321'))
                db.add(models.ContractReviewFile(id=1, review_id='異金鑰審閱', kind='evidence',
                                                 stored_name=review_file, original_name='異金鑰審閱.pdf',
                                                 content_type='application/pdf', size_bytes=11))
                db.add(models.SubsidyFile(id=1, user_id=1, doc_type='other', stored_name=subsidy_file,
                                          original_name='異金鑰補助.pdf', content_type='application/pdf',
                                          size_bytes=12, expires_at=datetime(2027, 1, 1)))
                db.flush()
            db.commit()

        for path in ('/api/dashboard/payments/export', '/api/account/export'):
            with self.subTest(path=path):
                archive = self.archive(path)
                [bill] = self.csv_rows(archive)
                self.assertEqual(bill['租約地址'], '使用者1自記地址')
                self.assertEqual(bill['備註'], '正常繳費備註')
                description = archive.read('說明.txt').decode()
                if path.endswith('payments/export'):
                    self.assertIn('無法解密的欄位：\n無', description)
                    continue
                data = json.loads(archive.read('資料.json'))
                self.assertIsNone(data['account']['national_id'])
                self.assertEqual(data['account']['email'], '本人@example.com')
                self.assertEqual(data['account']['roles'], ['tenant'])
                self.assertTrue(all(data['rentals'][0][name] is None for name in encrypted_rental_fields))
                self.assertEqual(data['rentals'][1]['bank_account'], '本人填寫的銀行帳號')
                self.assertEqual(data['rentals'][1]['tenant_phone'], '0912345678')
                self.assertIsNone(data['rentals'][2]['bank_account'])
                self.assertEqual(data['rentals'][2]['tenant_phone'], '0912345678')
                self.assertEqual(data['repairs'][0]['phone'], '0912345678')
                self.assertIsNone(data['repairs'][1]['phone'])
                self.assertEqual(data['repairs'][1]['description'], '異金鑰報修')
                self.assertEqual(data['contract_reviews'][0]['records'], ['正常審閱內容'])
                for file, folder, content in (
                    (data['contract_reviews'][0]['files'][0], '契約審閱', b'%PDF-review'),
                    (data['subsidy']['files'][0], '補助文件', b'%PDF-subsidy'),
                ):
                    self.assertIsNone(file['original_name'])
                    self.assertEqual(file['attachment'], f'{folder}/{folder}-1.pdf')
                    self.assertEqual(archive.read(file['attachment']), content)
                self.assertEqual(set(description.split('無法解密的欄位：\n')[1].splitlines()), {
                    'account.national_id', 'repairs[1].phone', 'contract_reviews[0].files[0].original_name',
                    'subsidy.files[0].original_name', 'rentals[2].bank_account',
                    *(f'rentals[0].{name}' for name in encrypted_rental_fields),
                })

        # 匯出後密文仍在，不能把容錯用的 null 寫回資料庫。
        with self.Session() as db:
            with self.assertRaises(InvalidTag):
                db.query(models.RepairTicket.phone).filter(models.RepairTicket.id == 2).scalar()

    def test_legacy_encrypted_field_format_is_null_and_listed(self):
        own = self.rental()
        with self.Session() as db:
            db.add(models.RepairTicket(id=1, tenant_user_id=1, rental_id=own, description='舊格式電話'))
            db.commit()
        with self.engine.begin() as connection:
            connection.exec_driver_sql('UPDATE repair_tickets SET phone = ? WHERE id = ?', (b'legacy-phone', 1))
        archive = self.archive('/api/account/export')
        [repair] = json.loads(archive.read('資料.json'))['repairs']
        self.assertIsNone(repair['phone'])
        self.assertEqual(repair['description'], '舊格式電話')
        self.assertIn('無法解密的欄位：\nrepairs[0].phone', archive.read('說明.txt').decode())

    def test_unnamed_repair_photos_keep_stored_extensions(self):
        own = self.rental()
        files = [('pdf', b'%PDF-receipt'), ('jpg', b'JPEG-photo')]
        with self.Session() as db:
            db.add(models.RepairTicket(id=1, tenant_user_id=1, rental_id=own, description='無檔名附件測試'))
            db.flush()
            for photo_id, (extension, content) in enumerate(files, start=1):
                stored = storage.save('repairs', content, extension)
                db.add(models.RepairTicketPhoto(id=photo_id, ticket_id=1, uploaded_by=1, photo_url=stored,
                                                stage='receipt' if extension == 'pdf' else 'report'))
            db.commit()
        archive = self.archive('/api/account/export')
        photos = json.loads(archive.read('資料.json'))['repairs'][0]['photos']
        self.assertEqual(len(photos), len(files))
        for photo_id, ((extension, content), photo) in enumerate(zip(files, photos), start=1):
            self.assertEqual(photo['attachment'], f'報修照片/報修-{photo_id}.{extension}')
            self.assertEqual(archive.read(photo['attachment']), content)

    def seed_landlord(self):
        folder = self.directory / 'utility'
        folder.mkdir()
        proof, meter = 'a' * 32 + '.pdf', 'b' * 32 + '.jpg'
        (folder / proof).write_bytes('租客回報檔案'.encode())
        (folder / meter).write_bytes('房東電表檔案不得出現'.encode())
        with self.Session() as db:
            db.add(models.LandlordProperty(id=1, landlord_id=3, name='房東物件不得出現'))
            db.add(models.LandlordTenant(id=1, landlord_id=3, name='房東填的租客名', phone='0900000000'))
            db.flush()
            db.add(models.LandlordRoom(id=1, property_id=1, number='房東房號'))
            db.flush()
            db.add(models.LandlordLease(id=1, tenant_id=1, property_id=1, room_id=1, tenant_user_id=1,
                                        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
                                        monthly_rent=20000, deposit_amount=40000, payment_day=5))
            db.flush()
            db.add(models.LandlordCharge(id=1, landlord_id=3, lease_id=1, title='房東帳款標題不得出現',
                                         period_start=date(2026, 1, 1), period_end=date(2026, 1, 31),
                                         due_date=date(2026, 1, 5), amount=20000))
            db.flush()
            db.add(models.LandlordChargePayment(charge_id=1, amount=20000, paid_on=date(2026, 1, 3),
                                                note='房東收款備註不得出現', recorded_by=3))
            for kind in ('payment_proof', 'tenant_reading', 'charge_dispute'):
                db.add(models.UtilityEvidence(charge_id=1, role='tenant', submitted_by=1, kind=kind,
                                              amount=12345, reading=456, note='本人回報' + kind,
                                              stored_name=proof if kind == 'payment_proof' else None,
                                              original_name='租客回報.pdf' if kind == 'payment_proof' else None,
                                              response='房東回覆不得出現', resolved_by=3, status='accepted'))
            db.add(models.UtilityEvidence(charge_id=1, role='landlord', submitted_by=3, kind='meter_photo',
                                          stored_name=meter, original_name='房東電表照片.jpg'))
            db.add(models.UtilityEvidence(charge_id=1, role='tenant', submitted_by=2, kind='payment_proof',
                                          stored_name=meter, original_name='其他租客回報.jpg'))
            db.add(models.UtilityEvidence(charge_id=1, role='landlord', submitted_by=1, kind='payment_proof',
                                          note='以房東身分回報不得出現'))
            db.add(models.InspectionRecord(lease_id=1, type='check_in', photo_url=meter,
                                           user_note='平台租約點交不得出現'))
            db.commit()

    def test_landlord_reports_only_export_tenant_fields(self):
        self.seed_landlord()
        for path in ('/api/dashboard/payments/export', '/api/account/export'):
            archive = self.archive(path)
            self.assert_absent(archive, '房東電表檔案不得出現', '房東電表照片.jpg', '房東回覆不得出現',
                               '房東帳款標題不得出現', '房東收款備註不得出現', '其他租客回報.jpg',
                               '以房東身分回報不得出現', '平台租約點交不得出現', '房東物件不得出現')
            if path.endswith('payments/export'):
                rows = self.csv_rows(archive, '房東租約回報憑證.csv')
                self.assertEqual(list(rows[0]), ['回報時間', '金額', '備註', '檔名', '附件路徑'])
                self.assertEqual(len(rows), 1)
                self.assertEqual(rows[0]['金額'], '12345')
                self.assertEqual(archive.read(rows[0]['附件路徑']), '租客回報檔案'.encode())
            else:
                rows = json.loads(archive.read('資料.json'))['landlord_lease_reports']
                self.assertEqual({row['kind'] for row in rows}, {'payment_proof', 'tenant_reading', 'charge_dispute'})
                self.assertEqual(set(rows[0]), {'kind', 'reading', 'amount', 'note', 'original_name', 'created_at', 'attachment'})

    def test_payment_reports_without_proof_deduplicate_and_exclude_other_events(self):
        self.seed_landlord()
        created_at = datetime(2026, 1, 3, 12, 30, 0, 100000)
        detail = '租客回報已繳款：2026-01-03，轉帳，備註：原文\n第二行（待房東確認入帳）'
        with self.Session() as db:
            db.query(models.UtilityEvidence).delete()
            db.add(models.LandlordCharge(id=2, landlord_id=3, lease_id=1, kind='electricity',
                                         title='房東電費帳款不得出現', amount=500,
                                         period_start=date(2026, 1, 1), period_end=date(2026, 1, 31),
                                         due_date=date(2026, 1, 5)))
            db.flush()
            for charge_id, timestamp in ((1, created_at), (2, created_at + timedelta(microseconds=500000))):
                db.add(models.LandlordChargeEvent(charge_id=charge_id, kind='tenant_reported',
                                                  actor_user_id=1, detail=detail, created_at=timestamp))
            for kind, actor, text in (
                ('payment_recorded', 3, '房東確認收款事件不得出現'),
                ('tenant_reported', 3, '房東回報事件不得出現'),
                ('tenant_reported', 2, '其他租客事件不得出現'),
                ('payment_recorded', 1, '本人非繳款回報事件不得出現'),
                ('tenant_reported', None, '無送出者事件不得出現'),
            ):
                db.add(models.LandlordChargeEvent(charge_id=1, kind=kind, actor_user_id=actor,
                                                  detail=text, created_at=created_at))
            db.commit()

        def check_exports(expected):
            for path in ('/api/dashboard/payments/export', '/api/account/export'):
                with self.subTest(path=path, count=len(expected)):
                    archive = self.archive(path)
                    self.assert_absent(archive, '房東確認收款事件不得出現', '房東回報事件不得出現',
                                       '其他租客事件不得出現', '本人非繳款回報事件不得出現', '無送出者事件不得出現',
                                       '房東帳款標題不得出現', '房東電費帳款不得出現', '房東收款備註不得出現')
                    if path.endswith('payments/export'):
                        self.assertEqual(self.csv_rows(archive, '房東租約回報憑證.csv'), [])
                        self.assertEqual(self.csv_rows(archive, '房東租約繳費回報.csv'), [
                            {'回報時間': timestamp.isoformat(), '回報內容': text} for timestamp, text in expected])
                    else:
                        data = json.loads(archive.read('資料.json'))
                        self.assertEqual(data['landlord_lease_reports'], [])
                        self.assertEqual(data['landlord_lease_payment_reports'], [
                            {'created_at': timestamp.isoformat(), 'detail': text} for timestamp, text in expected])
                    self.assertIn('房東租約', archive.read('說明.txt').decode())
                    self.assertIn('繳費回報', archive.read('說明.txt').decode())

        check_exports([(created_at, detail)])
        # 同秒不同內容、跨秒相同內容都是另一筆回報；去重不改動原始時間與內容。
        later = created_at.replace(microsecond=0) + timedelta(seconds=1)
        with self.Session() as db:
            for timestamp, text in ((created_at, '另一筆回報'), (later, detail)):
                db.add(models.LandlordChargeEvent(charge_id=1, kind='tenant_reported', actor_user_id=1,
                                                  detail=text, created_at=timestamp))
            db.commit()
        check_exports([(created_at, detail), (created_at, '另一筆回報'), (later, detail)])

    def test_account_all_sections_and_private_attachments(self):
        own, other = self.rental(), self.rental(2)
        self.bill(own, 1)
        review_file = storage.save('reviews', b'%PDF-review', 'pdf', encrypt=True)
        subsidy_file = storage.save('subsidy', b'%PDF-subsidy', 'pdf', encrypt=True)
        photo = storage.save('repairs', '本人報修照片'.encode(), 'jpg')
        foreign_photo = storage.save('repairs', '房東報修照片不得出現'.encode(), 'jpg')
        inspection_photo = storage.save('inspection', '本人點交照片'.encode(), 'jpg')
        with self.Session() as db:
            db.add(models.UserIdentity(user_id=1, provider='google', provider_subject='不得匯出的識別值',
                                       provider_email='不得匯出的供應商信箱'))
            db.add(models.ContractReview(id='本人審閱', user_id=1, rental_id=own,
                                         records=[{'原始': '審閱內容'}], activity_at=datetime(2026, 1, 1)))
            db.add(models.ContractReview(id='他人審閱', user_id=2, records=['別人審閱不得出現'],
                                         activity_at=datetime(2026, 1, 1)))
            db.flush()
            db.add(models.ContractReviewFile(review_id='本人審閱', kind='evidence', stored_name=review_file,
                                             original_name='審閱.pdf', content_type='application/pdf', size_bytes=11))
            db.add(models.ContractReviewFile(review_id='他人審閱', kind='report', stored_name=review_file,
                                             original_name='他人審閱附件.pdf', content_type='application/pdf', size_bytes=11))
            db.add(models.InspectionRecord(rental_id=own, type='check_in', photo_url=inspection_photo,
                                           item_name='冷氣', user_note='本人點交', vlm_result={'結果': '正常'}))
            db.add(models.InspectionRecord(rental_id=other, type='check_out', photo_url=inspection_photo,
                                           user_note='其他租約點交不得出現'))
            db.add(models.RepairTicket(id=1, tenant_user_id=1, rental_id=own, description='本人報修',
                                       phone='0912345678', completion_note='房東完工內容不得出現',
                                       vendor_name='房東廠商不得出現', responsibility_note='房東責任不得出現'))
            db.add(models.RepairTicket(id=2, tenant_user_id=2, rental_id=other, description='他人報修不得出現'))
            db.flush()
            for role, user_id, text in [('tenant', 1, '本人事件'), ('landlord', 3, '房東事件不得出現'),
                                       ('system', None, '系統事件不得出現')]:
                db.add(models.RepairTicketEvent(ticket_id=1, actor_user_id=user_id, actor_role=role,
                                                title=text, detail=text))
            for user_id, stored, name in [(1, photo, '本人照片.jpg'), (3, foreign_photo, '房東照片.jpg'),
                                          (2, foreign_photo, '其他人照片.jpg')]:
                db.add(models.RepairTicketPhoto(ticket_id=1, uploaded_by=user_id, photo_url=stored, photo_name=name))
            db.add(models.RepairTicketPhoto(ticket_id=1, uploaded_by=1, photo_url='e' * 32 + '.jpg',
                                            photo_name='遺失報修照片.jpg'))
            db.add_all([models.Note(user_id=1, title='本人筆記', due_time=time(9, 30)),
                        models.Note(user_id=2, title='其他人筆記不得出現')])
            db.add(models.Household(id=1, name='合租群組', invite_code='邀請碼不得出現', created_by=2))
            db.flush()
            db.add_all([models.HouseholdMember(id=1, household_id=1, user_id=1, display_name='本人群組名', role='室友'),
                        models.HouseholdMember(id=2, household_id=1, user_id=2, display_name='其他成員不得出現')])
            db.flush()
            db.add_all([models.HouseholdTask(household_id=1, creator_member_id=1, assignee_member_id=2, title='本人建立任務'),
                        models.HouseholdTask(household_id=1, creator_member_id=2, assignee_member_id=1, title='他人任務不得出現')])
            db.add(models.SubsidyApplication(user_id=1, rental_id=own, remark='本人補助'))
            for user_id, name, stored in [(1, '本人補助.pdf', subsidy_file), (1, '遺失補助.pdf', 'f' * 32 + '.pdf'),
                                          (2, '其他補助不得出現.pdf', subsidy_file)]:
                db.add(models.SubsidyFile(user_id=user_id, doc_type='other', stored_name=stored,
                                          original_name=name, content_type='application/pdf', size_bytes=12,
                                          expires_at=datetime(2027, 1, 1)))
            for user_id in (1, 2):
                db.add(models.TrashFavorite(user_id=user_id, station_id=str(user_id), station_name=f'使用者{user_id}垃圾站'))
                db.add(models.GarbageReminder(id=str(user_id), user_id=user_id, payload=json.dumps({'本人': user_id}),
                                              due=1234, email_status='pending', push_status='pending'))
            db.commit()
        archive = self.archive('/api/account/export')
        data = json.loads(archive.read('資料.json'))
        self.assertEqual(set(data), {'exported_at', 'account', 'rentals', 'landlord_lease_reports',
                                     'landlord_lease_payment_reports', 'contract_reviews',
                                     'inspections', 'repairs', 'notes', 'households', 'subsidy', 'trash_favorites', 'garbage_reminders'})
        self.assertEqual(data['account']['national_id'], 'A123456789')
        self.assertEqual(data['account']['roles'], ['tenant'])
        self.assertEqual(set(data['account']['identities'][0]), {'provider', 'created_at'})
        self.assertEqual(data['rentals'][0]['bank_account'], '本人填寫的銀行帳號')
        self.assertEqual(data['rentals'][0]['start_date'], '2026-01-01')
        self.assertEqual(set(data['rentals'][0]) - {'bills'}, set(models.Rental.__table__.columns.keys()))
        self.assertEqual(data['contract_reviews'][0]['records'], [{'原始': '審閱內容'}])
        self.assertEqual(archive.read(data['contract_reviews'][0]['files'][0]['attachment']), b'%PDF-review')
        self.assertEqual(archive.read(data['inspections'][0]['attachment']), '本人點交照片'.encode())
        repair = data['repairs'][0]
        self.assertEqual(repair['phone'], '0912345678')
        self.assertEqual([item['title'] for item in repair['events']], ['本人事件'])
        self.assertEqual(len(repair['photos']), 2)
        self.assertEqual(archive.read(repair['photos'][0]['attachment']), '本人報修照片'.encode())
        self.assertEqual(repair['photos'][1]['attachment'], '檔案已不存在')
        self.assertEqual(len(data['notes']), 1)
        self.assertEqual(data['notes'][0]['due_time'], '09:30:00')
        self.assertEqual(data['households'][0]['tasks'][0]['title'], '本人建立任務')
        self.assertNotIn('assignee_member_id', data['households'][0]['tasks'][0])
        self.assertEqual(data['subsidy']['applications'][0]['rental_id'], own)
        self.assertNotIn('rental', data['subsidy']['applications'][0])
        self.assertEqual(archive.read(data['subsidy']['files'][0]['attachment']), b'%PDF-subsidy')
        self.assertEqual(data['garbage_reminders'][0]['payload'], {'本人': 1})
        self.assertEqual(len(data['trash_favorites']), 1)
        self.assertIn('遺失報修照片.jpg', archive.read('說明.txt').decode())
        self.assertIn('遺失補助.pdf', archive.read('說明.txt').decode())
        self.assert_absent(archive, '房東完工內容不得出現', '房東廠商不得出現', '房東責任不得出現',
                           '房東事件不得出現', '系統事件不得出現', '房東報修照片不得出現', '其他人筆記不得出現',
                           '不得匯出的密碼雜湊', '不得匯出的識別值', '不得匯出的供應商信箱', '其他成員不得出現',
                           '他人任務不得出現', '邀請碼不得出現', '其他補助不得出現', '使用者2垃圾站',
                           '其他租約點交不得出現', '別人審閱不得出現', '他人審閱附件.pdf', '他人報修不得出現')

    def test_filenames_are_clean_unique_and_invalid_storage_names_are_not_read(self):
        own = self.rental()
        stored = storage.save('payment_proofs', b'%PDF-proof', 'pdf', encrypt=True)
        self.bill(own, 1, payment_proof_url='../憑證\\..\x00.pdf', payment_proof_stored_name=stored)
        self.bill(own, 2, payment_proof_url='惡意路徑.pdf', payment_proof_stored_name='../機密.pdf')
        (self.directory / '機密.pdf').write_bytes('不得讀取路徑外的內容'.encode())
        with self.Session() as db:
            for name in ['../重複\\..\x01.pdf'] * 3 + ['長' * 150 + '.pdf'] * 2 + ['檔案.' + 'a' * 110] * 2:
                db.add(models.SubsidyFile(user_id=1, doc_type='other', original_name=name,
                                          stored_name='f' * 32 + '.pdf', content_type='application/pdf',
                                          size_bytes=12, expires_at=datetime(2027, 1, 1)))
            db.commit()
        folder = self.directory / 'subsidy'
        folder.mkdir()
        from storage.crypto import encrypt
        (folder / ('f' * 32 + '.pdf')).write_bytes(encrypt('subsidy', b'%PDF-duplicate'))
        archive = self.archive('/api/account/export')
        for name in archive.namelist():
            self.assertNotIn('..', name)
            self.assertNotIn('\\', name)
            self.assertFalse(any(ord(char) < 32 for char in name))
            self.assertLessEqual(len(Path(name).name), 100)
            self.assertFalse(name.startswith('/'))
            self.assertLessEqual(name.count('/'), 1)
        self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))
        self.assertIn('補助文件/重複.pdf', archive.namelist())
        self.assertIn('補助文件/重複-2.pdf', archive.namelist())
        self.assertIn('補助文件/重複-3.pdf', archive.namelist())
        self.assertEqual(len([name for name in archive.namelist() if name.startswith('補助文件/長') and name.endswith('.pdf')]), 2)
        self.assert_absent(archive, '不得讀取路徑外的內容')
        self.assertIn('惡意路徑.pdf', archive.read('說明.txt').decode())

    def test_missing_and_invalid_photo_files_do_not_stop_export(self):
        own = self.rental()
        self.seed_landlord()
        with self.Session() as db:
            db.add(models.RepairTicket(id=1, tenant_user_id=1, rental_id=own, description='照片格式測試'))
            db.add(models.ContractReview(id='遺失審閱', user_id=1, records=[], activity_at=datetime(2026, 1, 1)))
            db.flush()
            db.add(models.ContractReviewFile(review_id='遺失審閱', kind='report', stored_name='a' * 32 + '.pdf',
                                             original_name='遺失審閱.pdf', content_type='application/pdf', size_bytes=12))
            for stored in ('c' * 32 + '.jpg', '../機密.pdf'):
                db.add(models.InspectionRecord(rental_id=own, type='check_in', photo_url=stored))
                db.add(models.RepairTicketPhoto(ticket_id=1, uploaded_by=1, photo_url=stored, photo_name='報修照片.jpg'))
                db.add(models.UtilityEvidence(charge_id=1, role='tenant', submitted_by=1, kind='payment_proof',
                                              stored_name=stored, original_name='遺失回報.jpg'))
            db.commit()
        (self.directory / '機密.pdf').write_bytes('不得讀取機密'.encode())
        archive = self.archive('/api/account/export')
        data = json.loads(archive.read('資料.json'))
        self.assertTrue(all(item['attachment'] == '檔案已不存在' for item in data['inspections']))
        self.assertTrue(all(item['attachment'] == '檔案已不存在' for item in data['repairs'][0]['photos']))
        self.assertEqual(data['contract_reviews'][0]['files'][0]['attachment'], '檔案已不存在')
        for name in ('遺失審閱.pdf', '報修照片.jpg', '遺失回報.jpg', '點交-'):
            self.assertIn(name, archive.read('說明.txt').decode())
        self.assert_absent(archive, '不得讀取機密')

    def test_empty_exports_and_landlord_only_account(self):
        for user_id, role in [(1, 'tenant'), (3, 'landlord')]:
            self.login(user_id, role)
            archive = self.archive('/api/dashboard/payments/export')
            self.assertIn('無法解密的檔案：\n無', archive.read('說明.txt').decode())
            self.assertIn('無法解密的欄位：\n無', archive.read('說明.txt').decode())
            self.assertEqual(self.csv_rows(archive), [])
            self.assertEqual(self.csv_rows(archive, '房東租約回報憑證.csv'), [])
            self.assertEqual(self.csv_rows(archive, '房東租約繳費回報.csv'), [])
            archive = self.archive('/api/account/export')
            self.assertIn('無法解密的檔案：\n無', archive.read('說明.txt').decode())
            self.assertIn('無法解密的欄位：\n無', archive.read('說明.txt').decode())
            data = json.loads(archive.read('資料.json'))
            for key in ('rentals', 'landlord_lease_reports', 'landlord_lease_payment_reports', 'contract_reviews', 'inspections', 'repairs',
                        'notes', 'households', 'trash_favorites', 'garbage_reminders'):
                self.assertEqual(data[key], [])
            self.assertEqual(data['subsidy'], {'applications': [], 'files': []})

    def test_unauthenticated(self):
        self.client.cookies.clear()
        for path in ('/api/dashboard/payments/export', '/api/account/export'):
            self.assertEqual(self.client.get(path).status_code, 401)
