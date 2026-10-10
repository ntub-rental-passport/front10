"""合約審閱的擁有者隔離、加密檔案與到期通知。"""
import asyncio
import base64
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from urllib.parse import quote

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import storage
from db import database
from db.database import Base, get_db
from db.models import ContractReview, ContractReviewFile, InboxMessage, Rental, User, UserRole

with patch.dict(os.environ, {'JWT_SECRET': os.getenv('JWT_SECRET') or 'contract-review-tests-secret-32-bytes'}):
    from auth.security import AUTH_COOKIE_NAME, CurrentUser, create_cookie_token
    from routers import contract_reviews


def image_bytes(format='PNG', size=(32, 16), exif=False):
    buffer = io.BytesIO()
    image = Image.new('RGB', size, 'red')
    metadata = Image.Exif()
    if exif:
        metadata[270] = '個人照片'
        metadata[274] = 6
    image.save(buffer, format=format, exif=metadata)
    return buffer.getvalue()


class ReviewTestCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        env = patch.dict(os.environ, {
            'REVIEW_FILE_DIR': directory.name,
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
        for attribute, value in [('engine', self.engine), ('SessionLocal', self.Session)]:
            replacement = patch.object(database, attribute, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        with self.Session() as db:
            db.add_all([User(id=user_id, email=f'{user_id}@example.com', roles=[UserRole(role='tenant')])
                        for user_id in (1, 2)])
            db.commit()
        app = FastAPI()
        app.include_router(contract_reviews.router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.login(1)
        self.review_id = str(uuid.uuid4())
        self.url = f'/api/contract/reviews/{self.review_id}'

    def login(self, user_id):
        with patch('auth.security.session_seconds', return_value=3600):
            token = create_cookie_token(user_id, f'{user_id}@example.com', 'tenant')
        self.client.cookies.set(AUTH_COOKIE_NAME, token)

    def evidence(self, files=None, record_key='record-1', url=None):
        files = files if files is not None else [('照片.png', image_bytes(), 'application/octet-stream')]
        return self.client.post((url or self.url) + '/evidence', data={'record_key': record_key},
                                files=[('files', file) for file in files])

    def report(self, data=b'%PDF-1.7\nfull report\n%%EOF', url=None):
        return self.client.post((url or self.url) + '/reports', data={'report_id': 'REPORT-001'},
                                files={'file': ('完整報告.pdf', data, 'application/octet-stream')})

    def assert_error(self, response, status, detail):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json(), {'detail': detail})

    def assert_empty(self):
        with self.Session() as db:
            self.assertEqual(db.query(ContractReview).count(), 0)
            self.assertEqual(db.query(ContractReviewFile).count(), 0)
        self.assertEqual(list(self.directory.iterdir()), [])

    def age_review(self, activity, notified=None):
        with self.Session() as db:
            review = db.get(ContractReview, self.review_id)
            review.activity_at = activity
            review.expiry_notified_at = notified
            db.commit()

    def stored_path(self, file_id):
        with self.Session() as db:
            return self.directory / db.get(ContractReviewFile, file_id).stored_name


class ContractReviewApiTests(ReviewTestCase):
    def test_cookie_auth_is_required(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.put(self.url, json={'records': []}).status_code, 401)

    def test_put_create_update_and_response_shape(self):
        self.assert_error(self.client.get(self.url), 404, contract_reviews.NOT_FOUND)
        records = [{'id': 'record-1', 'note': '已處理', 'custom': [True, None, 3]}]
        response = self.client.put(self.url, json={'records': records})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(set(result), {'id', 'records', 'rentalId', 'files', 'updatedAt'})
        self.assertEqual(result['id'], self.review_id)
        self.assertEqual(result['records'], records)
        self.assertIsNone(result['rentalId'])
        self.assertEqual(result['files'], [])
        self.assertEqual(datetime.fromisoformat(result['updatedAt']).utcoffset(), timedelta(0))
        self.assertEqual(self.client.get(self.url).json(), result)
        self.assertEqual(self.client.put(self.url, json={'records': [1, 'opaque', None]}).json()['records'],
                         [1, 'opaque', None])
        with self.Session() as db:
            self.assertEqual(db.query(ContractReview).count(), 1)

    def test_put_limits_leave_no_data(self):
        for records in ({}, 'text', None, [None] * 201, ['中' * (256 * 1024 // 3)]):
            with self.subTest(records_type=type(records).__name__):
                self.assert_error(self.client.put(self.url, json={'records': records}), 400, contract_reviews.RECORDS_LIMIT)
                self.assert_empty()
        self.assert_error(self.client.put(self.url, json={}), 400, contract_reviews.RECORDS_LIMIT)
        self.assert_error(self.client.put(self.url, json=[]), 400, contract_reviews.RECORDS_LIMIT)

    def test_put_size_and_item_boundaries(self):
        self.assertEqual(self.client.put(self.url, json={'records': [None] * 200}).status_code, 200)
        records = ['a' * (256 * 1024 - 4)]
        self.assertEqual(len(json.dumps(records).encode()), 256 * 1024)
        self.assertEqual(self.client.put(self.url, json={'records': records}).status_code, 200)
        self.assert_error(self.client.put(self.url, json={'records': [records[0] + 'a']}), 400, contract_reviews.RECORDS_LIMIT)
        self.assertEqual(self.client.get(self.url).json()['records'], records)

    def check_all_endpoints_missing(self, url, file_id):
        responses = [
            self.client.get(url), self.client.put(url, json={'records': []}), self.client.delete(url),
            self.evidence(url=url), self.report(url=url),
            self.client.get(f'{url}/files/{file_id}'), self.client.delete(f'{url}/files/{file_id}'),
        ]
        for response in responses:
            with self.subTest(method=response.request.method, url=str(response.request.url)):
                self.assert_error(response, 404, contract_reviews.NOT_FOUND)

    def test_other_user_gets_404_on_every_endpoint(self):
        file = self.evidence().json()['files'][0]
        self.login(2)
        self.check_all_endpoints_missing(self.url, file['id'])
        self.assertTrue(self.stored_path(file['id']).exists())
        self.login(1)
        self.assertEqual(len(self.client.get(self.url).json()['files']), 1)

    def test_invalid_review_ids_get_404_on_every_endpoint(self):
        for review_id in ('invalid', self.review_id.upper(), self.review_id + 'a', self.review_id[:-1],
                          self.review_id.replace('-', '_')):
            self.check_all_endpoints_missing(f'/api/contract/reviews/{review_id}', 1)
        self.assert_empty()

    def test_file_from_another_review_and_missing_file_are_404(self):
        file = self.report().json()
        other_url = f'/api/contract/reviews/{uuid.uuid4()}'
        self.client.put(other_url, json={'records': []})
        for url, file_id in [(other_url, file['id']), (self.url, file['id'] + 1)]:
            self.assert_error(self.client.get(f'{url}/files/{file_id}'), 404, contract_reviews.NOT_FOUND)
            self.assert_error(self.client.delete(f'{url}/files/{file_id}'), 404, contract_reviews.NOT_FOUND)

    def test_evidence_is_encrypted_and_served_as_jpeg_without_exif(self):
        source = image_bytes('JPEG', (2400, 1200), exif=True)
        response = self.evidence([('佐證 / 個資.jpg', source, 'text/plain')])
        self.assertEqual(response.status_code, 201, response.text)
        file = response.json()['files'][0]
        self.assertEqual(set(file), {'id', 'kind', 'recordKey', 'name', 'contentType', 'size', 'reportId', 'createdAt', 'url'})
        self.assertEqual((file['kind'], file['recordKey'], file['name'], file['contentType'], file['reportId']),
                         ('evidence', 'record-1', '佐證 / 個資.jpg', 'image/jpeg', None))
        self.assertEqual(datetime.fromisoformat(file['createdAt']).utcoffset(), timedelta(0))
        self.assertEqual(file['url'], f"{self.url}/files/{file['id']}")
        ciphertext = self.stored_path(file['id']).read_bytes()
        self.assertEqual(ciphertext[0], 1)
        self.assertNotEqual(ciphertext[:3], b'\xff\xd8\xff')
        served = self.client.get(file['url'])
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served.headers['content-type'], 'image/jpeg')
        self.assertEqual(served.headers['cache-control'], 'private, no-store')
        self.assertEqual(served.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(served.headers['content-disposition'], "inline; filename*=UTF-8''" + quote(file['name'], safe=''))
        self.assertEqual(len(served.content), file['size'])
        with Image.open(io.BytesIO(served.content)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertEqual(image.size, (1024, 2048))
            self.assertEqual(dict(image.getexif()), {})
        with self.Session() as db:
            row = db.get(ContractReviewFile, file['id'])
            self.assertEqual(storage.read('reviews', row.stored_name, encrypted=True), served.content)
            raw = db.execute(text('SELECT original_name FROM contract_review_files')).scalar_one()
            self.assertIsInstance(raw, bytes)
            self.assertNotIn(file['name'].encode(), raw)
        self.assertEqual(self.client.get(self.url).json()['records'], [])

    def test_all_supported_image_formats_are_reencoded(self):
        for format in ('JPEG', 'PNG', 'WEBP'):
            response = self.evidence([('wrong.extension', image_bytes(format), 'text/plain')])
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()['files'][0]['contentType'], 'image/jpeg')

    def test_invalid_image_in_batch_stores_nothing(self):
        for data in (b'not an image', image_bytes('GIF')):
            response = self.evidence([('good.png', image_bytes(), 'image/png'), ('bad.png', data, 'image/png')])
            self.assert_error(response, 400, contract_reviews.IMAGE_FORMAT)
            self.assert_empty()

    def test_image_size_limit_and_reencoding_failure_store_nothing(self):
        response = self.evidence([('large.jpg', b'x' * (contract_reviews.IMAGE_MAX_BYTES + 1), 'image/jpeg')])
        self.assert_error(response, 400, contract_reviews.IMAGE_SIZE)
        self.assert_empty()
        with patch.object(storage, 'reencode_image', side_effect=ValueError('圖片像素過多')):
            self.assert_error(self.evidence(), 400, contract_reviews.IMAGE_FORMAT)
        self.assert_empty()

    def test_sixth_evidence_is_rejected_per_record_key(self):
        files = [('test.png', image_bytes(), 'image/png')] * 5
        response = self.evidence(files)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()['files']), 5)
        self.assert_error(self.evidence(), 409, contract_reviews.EVIDENCE_LIMIT)
        self.assertEqual(self.evidence(record_key='record-2').status_code, 201)
        self.assertEqual(len(list(self.directory.iterdir())), 6)
        other_url = f'/api/contract/reviews/{uuid.uuid4()}'
        self.assert_error(self.evidence(files + files[:1], url=other_url), 409, contract_reviews.EVIDENCE_LIMIT)
        self.assertEqual(self.client.get(other_url).status_code, 404)

    def test_report_round_trip_encryption_and_ordering(self):
        evidence = self.evidence().json()['files'][0]
        data = b'%PDF-1.7\nprivate report\n%%EOF'
        response = self.report(data)
        self.assertEqual(response.status_code, 201, response.text)
        file = response.json()
        self.assertEqual((file['kind'], file['recordKey'], file['reportId'], file['contentType'], file['size']),
                         ('report', None, 'REPORT-001', 'application/pdf', len(data)))
        self.assertNotIn(data, self.stored_path(file['id']).read_bytes())
        served = self.client.get(file['url'])
        self.assertEqual(served.content, data)
        self.assertEqual(served.headers['content-type'], 'application/pdf')
        self.assertEqual(served.headers['cache-control'], 'private, no-store')
        self.assertEqual(served.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(served.headers['content-disposition'], "inline; filename*=UTF-8''" + quote('完整報告.pdf'))
        self.assertEqual(self.client.get(self.url).json()['files'], [evidence, file])

    def test_invalid_and_oversized_reports_store_nothing(self):
        for data in (b'fake.pdf', b'%PDF-' + b'x' * (contract_reviews.REPORT_MAX_BYTES - 4)):
            self.assert_error(self.report(data), 400, contract_reviews.REPORT_FORMAT)
            self.assert_empty()
        response = self.report(b'%PDF-' + b'x' * (contract_reviews.REPORT_MAX_BYTES - 5))
        self.assertEqual(response.status_code, 201, response.text)

    def test_eleventh_report_is_rejected(self):
        for _ in range(10):
            self.assertEqual(self.report().status_code, 201)
        self.assert_error(self.report(), 409, contract_reviews.REPORT_LIMIT)
        self.assertEqual(len(list(self.directory.iterdir())), 10)

    def test_missing_or_invalid_file_key_returns_503_on_upload_and_read(self):
        file = self.report().json()
        for key in ('', 'invalid-base64', base64.b64encode(b'short').decode()):
            with self.subTest(key=key), patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': key}):
                self.assert_error(self.evidence(), 503, contract_reviews.NO_KEY)
                self.assert_error(self.report(), 503, contract_reviews.NO_KEY)
                self.assert_error(self.client.get(file['url']), 503, contract_reviews.NO_KEY)
                self.assertEqual(self.client.get(self.url).status_code, 200)
        with patch.dict(os.environ):
            os.environ.pop('FILE_ENCRYPTION_KEY', None)
            self.assert_error(self.report(url=f'/api/contract/reviews/{uuid.uuid4()}'), 503, contract_reviews.NO_KEY)
            self.assert_error(self.client.get(file['url']), 503, contract_reviews.NO_KEY)
        with self.Session() as db:
            self.assertEqual(db.query(ContractReview).count(), 1)
            self.assertEqual(db.query(ContractReviewFile).count(), 1)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_missing_and_corrupt_file_bytes_return_404_and_log(self):
        file = self.report().json()
        path = self.stored_path(file['id'])
        encrypted = path.read_bytes()
        for data in (None, b'corrupt', encrypted[:-1] + bytes([encrypted[-1] ^ 1])):
            if data is None:
                path.unlink()
            else:
                path.write_bytes(data)
            with self.assertLogs(contract_reviews.logger, level='WARNING'):
                self.assert_error(self.client.get(file['url']), 404, contract_reviews.NOT_FOUND)

    def test_file_and_review_deletion_remove_bytes_only_after_commit(self):
        first = self.report().json()
        second = self.evidence().json()['files'][0]
        first_path = self.stored_path(first['id'])
        second_path = self.stored_path(second['id'])
        real_delete = storage.delete

        def check_committed(kind, name):
            with self.Session() as db:
                self.assertIsNone(db.query(ContractReviewFile.id).filter(ContractReviewFile.stored_name == name).first())
            real_delete(kind, name)

        with patch.object(storage, 'delete', side_effect=check_committed):
            response = self.client.delete(first['url'])
            self.assertEqual((response.status_code, response.content), (204, b''))
            self.assertFalse(first_path.exists())
            self.assertTrue(second_path.exists())
            response = self.client.delete(self.url)
            self.assertEqual((response.status_code, response.content), (204, b''))
        self.assert_empty()
        self.assert_error(self.client.delete(self.url), 404, contract_reviews.NOT_FOUND)

    def test_mutations_refresh_activity_and_clear_expiry_notice_but_reads_do_not(self):
        file = self.report().json()
        old = datetime(2025, 1, 1)
        mutations = [lambda: self.client.put(self.url, json={'records': []}), self.evidence, self.report,
                     lambda: self.client.delete(file['url'])]
        for mutate in mutations:
            self.age_review(old, old + timedelta(days=166))
            self.assertEqual(self.client.get(self.url).json()['updatedAt'], old.replace(tzinfo=timezone.utc).isoformat())
            self.assertEqual(self.client.get(file['url']).status_code, 200)
            with self.Session() as db:
                self.assertEqual(db.get(ContractReview, self.review_id).expiry_notified_at, old + timedelta(days=166))
            before = datetime.utcnow()
            self.assertIn(mutate().status_code, (200, 201, 204))
            with self.Session() as db:
                review = db.get(ContractReview, self.review_id)
                self.assertGreaterEqual(review.activity_at, before)
                self.assertIsNone(review.expiry_notified_at)

    def test_failed_validation_preserves_activity_notice_and_existing_files(self):
        self.report()
        old = datetime(2025, 1, 1)
        self.age_review(old, old)
        self.assertEqual(self.evidence([('bad.png', b'bad', 'image/png')]).status_code, 400)
        with self.Session() as db:
            review = db.get(ContractReview, self.review_id)
            self.assertEqual(review.activity_at, old)
            self.assertEqual(review.expiry_notified_at, old)
            self.assertEqual(db.query(ContractReviewFile).count(), 1)

    def test_failed_second_storage_write_rolls_back_and_removes_staged_files(self):
        real_save = storage.save
        calls = []

        def fail_second(*args, **kwargs):
            if calls:
                raise OSError('測試寫檔失敗')
            result = real_save(*args, **kwargs)
            calls.append(result)
            return result

        with patch.object(storage, 'save', side_effect=fail_second), self.assertRaises(OSError):
            self.evidence([('one.png', image_bytes(), 'image/png')] * 2)
        self.assert_empty()

    def test_failed_commit_preserves_existing_bytes_and_cleans_new_bytes(self):
        file = self.report().json()
        path = self.stored_path(file['id'])
        with patch('sqlalchemy.orm.Session.commit', side_effect=RuntimeError('測試提交失敗')):
            for delete in (lambda: self.client.delete(file['url']), lambda: self.client.delete(self.url)):
                with self.assertRaises(RuntimeError):
                    delete()
                self.assertTrue(path.exists())
            with self.assertRaises(RuntimeError):
                self.evidence()
        self.assertEqual(list(self.directory.iterdir()), [path])
        self.assertEqual(self.client.get(file['url']).status_code, 200)

    def test_upload_read_calls_have_hard_caps(self):
        user = CurrentUser(id=1, email='1@example.com', role='tenant')
        with self.Session() as db:
            file = UploadFile(io.BytesIO(), filename='image.png')
            file.read = AsyncMock(return_value=image_bytes())
            asyncio.run(contract_reviews.upload_evidence(self.review_id, 'record-1', [file], db, user))
            file.read.assert_awaited_once_with(contract_reviews.IMAGE_MAX_BYTES + 1)
            file = UploadFile(io.BytesIO(), filename='report.pdf')
            file.read = AsyncMock(return_value=b'%PDF-1.7')
            asyncio.run(contract_reviews.upload_report(self.review_id, 'REPORT-001', file, db, user))
            file.read.assert_awaited_once_with(contract_reviews.REPORT_MAX_BYTES + 1)

    def test_multipart_fields_validate_lengths_and_require_files(self):
        for key in ('', 'x' * 65):
            self.assertEqual(self.evidence(record_key=key).status_code, 422)
            response = self.client.post(self.url + '/reports', data={'report_id': key},
                                        files={'file': ('report.pdf', b'%PDF-1.7', 'application/pdf')})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post(self.url + '/evidence', data={'record_key': 'record-1'}).status_code, 422)
        self.assert_empty()

    def test_overlong_original_name_is_rejected_without_truncation(self):
        self.assert_error(self.evidence([('中' * 162 + '.png', image_bytes(), 'image/png')]),
                          400, '檔名過長，請縮短後再上傳。')
        self.assert_empty()


class ContractReviewExpiryTests(ReviewTestCase):
    def setUp(self):
        super().setUp()
        self.activity = datetime(2026, 1, 1, 12, 30)

    def add_review(self, *, records=None, activity=None, notified=None, rental_id=None):
        review_id = str(uuid.uuid4())
        with self.Session() as db:
            db.add(ContractReview(id=review_id, user_id=1, rental_id=rental_id,
                                  records=[] if records is None else records,
                                  activity_at=activity or self.activity, expiry_notified_at=notified))
            db.commit()
        return review_id

    def add_rental(self):
        with self.Session() as db:
            rental = Rental(user_id=1, address='測試地址', start_date=date(2026, 1, 1), end_date=date(2027, 1, 1),
                            rent_amount=10000, deposit_amount=20000, payment_day=5, total_periods=12)
            db.add(rental)
            db.commit()
            return rental.id

    def test_notice_at_day_166_once_and_delete_at_day_180(self):
        file = self.evidence().json()['files'][0]
        self.report()
        self.client.put(self.url, json={'records': [{'id': 'record-1'}]})
        self.age_review(self.activity)
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=166) - timedelta(microseconds=1))
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 0)
        now = self.activity + timedelta(days=166)
        contract_reviews.dispatch_expiry(now.replace(tzinfo=timezone.utc))
        contract_reviews.dispatch_expiry(now + timedelta(hours=1))
        with self.Session() as db:
            notice = db.query(InboxMessage).one()
            self.assertEqual((notice.title, notice.category, notice.source_label, notice.created_by, notice.user_id),
                             ('合約審閱紀錄將於 14 天後刪除', '租約', '合約審閱', 'system', 1))
            for text in ('2026-01-01', '1 張佐證圖片', '1 份報告', '2026-06-30', '儲存合約', '下載報告'):
                self.assertIn(text, notice.body)
            review = db.get(ContractReview, self.review_id)
            self.assertEqual(review.expiry_notified_at, now)
            self.assertEqual(review.activity_at, self.activity)
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=180) - timedelta(microseconds=1))
        self.assertEqual(self.client.get(file['url']).status_code, 200)
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=180))
        self.assert_empty()

    def test_late_notice_still_grants_fourteen_full_days(self):
        self.report()
        self.age_review(self.activity)
        now = self.activity + timedelta(days=300)
        contract_reviews.dispatch_expiry(now)
        contract_reviews.dispatch_expiry(now + timedelta(days=14) - timedelta(microseconds=1))
        self.assertEqual(self.client.get(self.url).status_code, 200)
        with self.Session() as db:
            self.assertIn((now + timedelta(days=14)).date().isoformat(), db.query(InboxMessage).one().body)
        contract_reviews.dispatch_expiry(now + timedelta(days=14))
        self.assert_empty()

    def test_records_without_files_get_a_notice(self):
        review_id = self.add_review(records=[{'id': 'only-record'}])
        now = self.activity + timedelta(days=166)
        contract_reviews.dispatch_expiry(now)
        with self.Session() as db:
            self.assertEqual(db.get(ContractReview, review_id).expiry_notified_at, now)
            self.assertIn('0 張佐證圖片、0 份報告', db.query(InboxMessage).one().body)

    def test_empty_review_deleted_at_180_days_without_notice(self):
        review_id = self.add_review()
        for days in (166, 179):
            contract_reviews.dispatch_expiry(self.activity + timedelta(days=days))
            with self.Session() as db:
                self.assertIsNotNone(db.get(ContractReview, review_id))
                self.assertEqual(db.query(InboxMessage).count(), 0)
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=180))
        self.assert_empty()
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 0)

    def test_linked_reviews_never_expire_or_get_notice(self):
        rental_id = self.add_rental()
        ids = [self.add_review(records=records, rental_id=rental_id) for records in ([], [1])]
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=400))
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 0)
            for review_id in ids:
                review = db.get(ContractReview, review_id)
                self.assertEqual(review.rental_id, rental_id)
                self.assertIsNone(review.expiry_notified_at)

    def test_rental_deletion_unlinks_review_and_late_notice_precedes_deletion(self):
        rental_id = self.add_rental()
        review_id = self.add_review(records=[1], rental_id=rental_id)
        with self.Session() as db:
            db.delete(db.get(Rental, rental_id))
            db.commit()
            review = db.get(ContractReview, review_id)
            self.assertIsNone(review.rental_id)
            self.assertEqual(review.activity_at, self.activity)
        now = self.activity + timedelta(days=400)
        contract_reviews.dispatch_expiry(now)
        contract_reviews.dispatch_expiry(now + timedelta(days=13))
        with self.Session() as db:
            self.assertIsNotNone(db.get(ContractReview, review_id))
            self.assertEqual(db.query(InboxMessage).count(), 1)
        contract_reviews.dispatch_expiry(now + timedelta(days=14))
        self.assert_empty()

    def test_activity_restarts_notice_clock(self):
        self.report()
        self.age_review(self.activity)
        contract_reviews.dispatch_expiry(self.activity + timedelta(days=166))
        self.client.put(self.url, json={'records': [1]})
        with self.Session() as db:
            activity = db.get(ContractReview, self.review_id).activity_at
        contract_reviews.dispatch_expiry(activity + timedelta(days=165))
        with self.Session() as db:
            self.assertIsNone(db.get(ContractReview, self.review_id).expiry_notified_at)
            self.assertEqual(db.query(InboxMessage).count(), 1)
        contract_reviews.dispatch_expiry(activity + timedelta(days=166))
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 2)

    def test_batch_is_bounded_and_waiting_reviews_do_not_starve_eligible_reviews(self):
        now = self.activity + timedelta(days=180)
        waiting = self.add_review(records=[1], activity=self.activity - timedelta(days=20), notified=now - timedelta(days=1))
        too_new_empty = self.add_review(activity=now - timedelta(days=170))
        for _ in range(3):
            self.add_review(records=[1], activity=now - timedelta(days=167))
        with patch.object(contract_reviews, 'EXPIRY_BATCH_SIZE', 2):
            contract_reviews.dispatch_expiry(now)
            with self.Session() as db:
                self.assertEqual(db.query(InboxMessage).count(), 2)
            contract_reviews.dispatch_expiry(now)
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 3)
            self.assertIsNotNone(db.get(ContractReview, waiting))
            self.assertIsNone(db.get(ContractReview, too_new_empty).expiry_notified_at)

    def test_one_failed_review_does_not_stop_other_reviews(self):
        self.add_review(records=[1])
        self.add_review(records=[2])
        notify = contract_reviews.notify_user
        calls = []

        def fail_first(*args, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise RuntimeError('測試通知失敗')
            return notify(*args, **kwargs)

        with patch.object(contract_reviews, 'notify_user', side_effect=fail_first), self.assertLogs(contract_reviews.logger, level='WARNING'):
            contract_reviews.dispatch_expiry(self.activity + timedelta(days=166))
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 1)
            self.assertEqual(db.query(ContractReview).filter(ContractReview.expiry_notified_at.is_(None)).count(), 1)

    def test_failed_expiry_commit_preserves_review_and_bytes(self):
        file = self.report().json()
        self.age_review(self.activity, self.activity + timedelta(days=166))
        with patch('sqlalchemy.orm.Session.commit', side_effect=RuntimeError('測試提交失敗')), \
                self.assertLogs(contract_reviews.logger, level='WARNING'):
            contract_reviews.dispatch_expiry(self.activity + timedelta(days=180))
        self.assertTrue(self.stored_path(file['id']).exists())
        self.assertEqual(self.client.get(file['url']).status_code, 200)


if __name__ == '__main__':
    unittest.main()
