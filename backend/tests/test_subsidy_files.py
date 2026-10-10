"""補助文件的租客隔離、原檔加密與到期通知、清理。"""
import asyncio
import base64
import io
import os
from pathlib import Path
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from urllib.parse import quote

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event, text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import storage
from db import database
from db.database import Base, get_db
from db.models import AdminSession, InboxMessage, Rental, SubsidyFile, User, UserRole
from db.schema_check import schema_problems

with patch.dict(os.environ, {'JWT_SECRET': os.getenv('JWT_SECRET') or 'subsidy-files-tests-secret-32-bytes'}):
    from auth.security import create_access_token
    from routers import admin_user_records_api, subsidy_files


def image_bytes(format):
    buffer = io.BytesIO()
    image = Image.new('RGB', (32, 16), 'red')
    metadata = Image.Exif()
    metadata[270] = '個人照片'
    metadata[274] = 6
    image.save(buffer, format=format, exif=metadata)
    return buffer.getvalue()


class SubsidyFileTestCase(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        env = patch.dict(os.environ, {
            'SUBSIDY_FILE_DIR': directory.name,
            'PII_ENCRYPTION_KEY': base64.b64encode(b'p' * 32).decode(),
            'FILE_ENCRYPTION_KEY': base64.b64encode(b'f' * 32).decode(),
            'AUTH_TOKEN_SECRET': 'subsidy-files-tests-secret',
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
            db.add(User(id=3, email='admin@example.com', roles=[UserRole(role='admin')]))
            db.flush()
            db.add(AdminSession(id='subsidy-test-admin-session', user_id=3))
            db.commit()
        app = FastAPI()
        app.include_router(subsidy_files.router)
        app.include_router(admin_user_records_api.router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.url = '/api/subsidy/files'
        self.login(1)

    def login(self, user_id, role='tenant'):
        token = create_access_token(user_id, role, expires_seconds=3600,
                                    sid='subsidy-test-admin-session' if role == 'admin' else None)
        self.client.headers['Authorization'] = 'Bearer ' + token

    def upload(self, data=b'%PDF-1.7\nprivate application\n%%EOF', name='補助申請.pdf',
               doc_type='application_form', rental_id=None):
        fields = {'doc_type': doc_type}
        if rental_id is not None:
            fields['rental_id'] = rental_id
        return self.client.post(self.url, data=fields, files={'file': (name, data, 'application/octet-stream')})

    def assert_error(self, response, status, detail):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json(), {'detail': detail})

    def assert_empty(self):
        with self.Session() as db:
            self.assertEqual(db.query(SubsidyFile).count(), 0)
        self.assertEqual(list(self.directory.iterdir()), [])

    def stored_path(self, file_id):
        with self.Session() as db:
            return self.directory / db.get(SubsidyFile, file_id).stored_name

    def add_rental(self, user_id=1):
        with self.Session() as db:
            rental = Rental(user_id=user_id, address='測試地址', start_date=date(2026, 1, 1),
                            end_date=date(2027, 1, 1), rent_amount=10000, deposit_amount=20000,
                            payment_day=5, total_periods=12)
            db.add(rental)
            db.commit()
            return rental.id

    def set_expiry(self, file_id, expires, notified=None):
        with self.Session() as db:
            file = db.get(SubsidyFile, file_id)
            file.expires_at = expires
            file.expiry_notified_at = notified
            db.commit()


class SubsidyFileApiTests(SubsidyFileTestCase):
    def test_schema_check_clean_and_foreign_key_deletion_rules(self):
        self.assertEqual(schema_problems(self.engine), [])
        rental_id = self.add_rental()
        file = self.upload(rental_id=rental_id).json()
        with self.Session() as db:
            db.delete(db.get(Rental, rental_id))
            db.commit()
            self.assertIsNone(db.get(SubsidyFile, file['id']).rental_id)
            db.delete(db.get(User, 1))
            db.commit()
            self.assertIsNone(db.get(SubsidyFile, file['id']))

    def test_pdf_jpeg_png_round_trip_encryption_headers_and_contract(self):
        for data, ext, content_type in ((b'%PDF-1.7\noriginal\n%%EOF', 'pdf', 'application/pdf'),
                                        (image_bytes('JPEG'), 'jpg', 'image/jpeg'),
                                        (image_bytes('PNG'), 'png', 'image/png')):
            with self.subTest(content_type=content_type):
                name = '我的文件 #1.' + ext
                before = datetime.now(timezone.utc)
                response = self.upload(data, name)
                self.assertEqual(response.status_code, 201, response.text)
                file = response.json()
                self.assertEqual(set(file), {'id', 'docType', 'name', 'contentType', 'size', 'rentalId',
                                             'createdAt', 'expiresAt', 'url'})
                self.assertEqual((file['name'], file['docType'], file['contentType'], file['size'], file['rentalId']),
                                 (name, 'application_form', content_type, len(data), None))
                self.assertEqual(file['url'], self.url + '/' + str(file['id']))
                self.assertTrue(file['createdAt'].endswith('+00:00'))
                self.assertTrue(file['expiresAt'].endswith('+00:00'))
                self.assertGreaterEqual(datetime.fromisoformat(file['createdAt']), before)
                self.assertEqual(datetime.fromisoformat(file['expiresAt']) - datetime.fromisoformat(file['createdAt']),
                                 timedelta(days=180))
                path = self.stored_path(file['id'])
                self.assertEqual(path.suffix, '.' + ext)
                self.assertNotIn(data, path.read_bytes())
                with self.engine.connect() as db:
                    encrypted_name = db.execute(text('SELECT original_name FROM subsidy_files WHERE id = :id'),
                                                {'id': file['id']}).scalar_one()
                self.assertNotIn(name.encode('utf-8'), encrypted_name)
                served = self.client.get(file['url'])
                self.assertEqual((served.status_code, served.content), (200, data))
                self.assertEqual(served.headers['content-type'], content_type)
                self.assertEqual(served.headers['cache-control'], 'private, no-store')
                self.assertEqual(served.headers['x-content-type-options'], 'nosniff')
                self.assertEqual(served.headers['content-disposition'], "inline; filename*=UTF-8''" + quote(name, safe=''))

    def test_gif_webp_text_and_spoofed_content_type_store_nothing(self):
        for data in (image_bytes('GIF'), image_bytes('WEBP'), b'plain text', b''):
            response = self.client.post(self.url, data={'doc_type': 'identity'},
                                        files={'file': ('fake.png', data, 'image/png')})
            self.assert_error(response, 400, '只收 PDF、JPG、PNG 檔案。')
            self.assert_empty()

    def test_size_boundary_and_hard_read_cap(self):
        data = b'%PDF-' + b'x' * (subsidy_files.FILE_MAX_BYTES - 5)
        self.assert_error(self.upload(data + b'x'), 400, '檔案不得超過 10 MB。')
        self.assert_empty()
        self.assertEqual(self.upload(data).status_code, 201)
        with self.Session() as db:
            file = UploadFile(io.BytesIO(), filename='test.pdf')
            file.read = AsyncMock(return_value=b'%PDF-1.7')
            asyncio.run(subsidy_files.upload_file('other', file, None, db, db.get(User, 1)))
            file.read.assert_awaited_once_with(subsidy_files.FILE_MAX_BYTES + 1)

    def test_document_types_and_bad_type(self):
        for doc_type in ('unknown', '', ' ', 'IDENTITY'):
            self.assert_error(self.upload(doc_type=doc_type), 400, '請選擇文件類型。')
            self.assert_empty()
        for doc_type in ('application_form', 'identity', 'household', 'lease_copy', 'bankbook', 'other'):
            response = self.upload(doc_type=doc_type)
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()['docType'], doc_type)

    def test_rental_must_belong_to_user(self):
        for rental_id in (self.add_rental(2), 999):
            self.assert_error(self.upload(rental_id=rental_id), 400, '找不到這份租約。')
            self.assert_empty()
        own = self.add_rental()
        self.assertEqual(self.upload(rental_id=own).json()['rentalId'], own)

    def test_filename_limit_counts_utf8_bytes(self):
        self.assert_error(self.upload(name='中' * 160 + '.pdf'), 400, '檔名過長，請縮短後再上傳。')
        self.assert_empty()
        name = '中' * 159 + 'aa.pdf'
        self.assertEqual(len(name.encode('utf-8')), 483)
        response = self.upload(name=name)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['name'], name)

    def test_twenty_file_limit_is_per_user_and_delete_frees_a_slot(self):
        for _ in range(20):
            response = self.upload()
            self.assertEqual(response.status_code, 201, response.text)
        self.assert_error(self.upload(), 409, '最多可存 20 份文件，請先刪除不需要的文件。')
        self.assertEqual(len(list(self.directory.iterdir())), 20)
        self.login(2)
        self.assertEqual(self.upload().status_code, 201)
        self.login(1)
        self.assertEqual(self.client.delete(response.json()['url']).status_code, 204)
        self.assertEqual(self.upload().status_code, 201)

    def test_upload_locks_user_then_reads_current_file_count_before_saving(self):
        statements = []

        def record(conn, clause, multiparams, params, execution_options):
            statements.append(str(clause.compile(dialect=mysql.dialect())))

        def check_locks(*args, **kwargs):
            locked = [sql for sql in statements if 'FOR UPDATE' in sql]
            self.assertEqual(len(locked), 2)
            self.assertIn('FROM users', locked[0])
            self.assertIn('FROM subsidy_files', locked[1])
            return save(*args, **kwargs)

        event.listen(self.engine, 'before_execute', record)
        self.addCleanup(event.remove, self.engine, 'before_execute', record)
        save = storage.save
        with patch.object(storage, 'save', side_effect=check_locks):
            self.assertEqual(self.upload().status_code, 201)

    def test_missing_or_invalid_file_key_returns_503_on_upload_and_download(self):
        file = self.upload().json()
        for key in ('', 'invalid-base64', base64.b64encode(b'short').decode()):
            with self.subTest(key=key), patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': key}):
                self.assert_error(self.upload(), 503, subsidy_files.NO_KEY)
                self.assert_error(self.client.get(file['url']), 503, subsidy_files.NO_KEY)
                self.assertEqual(self.client.get(self.url).status_code, 200)
        with patch.dict(os.environ):
            os.environ.pop('FILE_ENCRYPTION_KEY', None)
            self.assert_error(self.upload(), 503, subsidy_files.NO_KEY)
            self.assert_error(self.client.get(file['url']), 503, subsidy_files.NO_KEY)
        self.assertEqual(self.client.get(self.url).json()['count'], 1)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_isolation_and_list_newest_first(self):
        first = self.upload().json()
        second = self.upload(doc_type='identity').json()
        self.assertEqual(self.client.get(self.url).json(), {'files': [second, first], 'count': 2, 'limit': 20})
        self.login(2)
        self.assertEqual(self.client.get(self.url).json(), {'files': [], 'count': 0, 'limit': 20})
        for method in (self.client.get, self.client.delete):
            for url in (first['url'], self.url + '/9999'):
                self.assert_error(method(url), 404, '找不到這份文件。')
        own = self.upload().json()
        self.assertEqual(self.client.get(self.url).json()['files'], [own])
        self.login(1)
        self.assertEqual(self.client.get(self.url).json()['files'], [second, first])

    def test_bearer_required_and_admin_rejected_on_every_endpoint(self):
        file = self.upload().json()
        requests = [lambda: self.client.get(self.url), self.upload,
                    lambda: self.client.get(file['url']), lambda: self.client.delete(file['url'])]
        self.client.headers.pop('Authorization')
        for request in requests:
            self.assertIn(request().status_code, (401, 403))
        self.login(3, 'admin')
        for request in requests:
            self.assertIn(request().status_code, (401, 403))
        response = self.client.get('/api/admin/users/1/records')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {'deposits': [], 'handovers': []})
        self.assertEqual(self.client.get('/api/admin/deposits').json(), {'deposits': []})

    def test_delete_removes_row_then_bytes_even_without_file_key(self):
        file = self.upload().json()
        path = self.stored_path(file['id'])
        delete = storage.delete

        def check_committed(kind, name):
            with self.Session() as db:
                self.assertIsNone(db.get(SubsidyFile, file['id']))
            delete(kind, name)

        with patch.object(storage, 'delete', side_effect=check_committed), patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': ''}):
            response = self.client.delete(file['url'])
        self.assertEqual((response.status_code, response.content), (204, b''))
        self.assertFalse(path.exists())
        self.assert_empty()

    def test_failed_commit_keeps_existing_bytes_and_cleans_new_upload(self):
        file = self.upload().json()
        path = self.stored_path(file['id'])
        with patch('sqlalchemy.orm.Session.commit', side_effect=RuntimeError('測試提交失敗')):
            with self.assertRaises(RuntimeError):
                self.client.delete(file['url'])
            self.assertTrue(path.exists())
            with self.assertRaises(RuntimeError):
                self.upload()
        self.assertEqual(list(self.directory.iterdir()), [path])
        self.assertEqual(self.client.get(file['url']).status_code, 200)
        self.assertEqual(self.client.get(self.url).json()['count'], 1)

    def test_missing_or_corrupt_bytes_return_404_without_logging_names(self):
        file = self.upload().json()
        path = self.stored_path(file['id'])
        encrypted = path.read_bytes()
        for data in (None, b'corrupt', encrypted[:-1] + bytes([encrypted[-1] ^ 1])):
            if data is None:
                path.unlink()
            else:
                path.write_bytes(data)
            with self.assertLogs(subsidy_files.logger, level='WARNING') as logs:
                self.assert_error(self.client.get(file['url']), 404, '找不到這份文件。')
            self.assertNotIn(file['name'], ''.join(logs.output))
            self.assertNotIn(path.name, ''.join(logs.output))


class SubsidyFileExpiryTests(SubsidyFileTestCase):
    def setUp(self):
        super().setUp()
        self.expiry = datetime(2026, 6, 30, 12, 30)

    def expiring_file(self, doc_type='identity', expires=None, notified=None, rental_id=None):
        response = self.upload(doc_type=doc_type, rental_id=rental_id)
        self.assertEqual(response.status_code, 201, response.text)
        file = response.json()
        self.set_expiry(file['id'], expires or self.expiry, notified)
        return file

    def test_notice_boundary_grouped_by_user_then_delete_at_expiry(self):
        first = self.expiring_file()
        second = self.expiring_file(doc_type='lease_copy')
        notice_time = self.expiry - timedelta(days=14)
        subsidy_files.dispatch_expiry(notice_time - timedelta(microseconds=1))
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 0)
        subsidy_files.dispatch_expiry(notice_time.replace(tzinfo=timezone.utc))
        subsidy_files.dispatch_expiry(notice_time + timedelta(hours=1))
        with self.Session() as db:
            notice = db.query(InboxMessage).one()
            self.assertEqual((notice.category, notice.source_label, notice.created_by, notice.user_id),
                             ('補貼', '補助文件', 'system', 1))
            for part in ('2 份補助文件', '身分證明 1 份', '租約影本 1 份', '2026-06-30'):
                self.assertIn(part, notice.body)
            self.assertNotIn(first['name'], notice.body)
            for file in db.query(SubsidyFile):
                self.assertEqual(file.expiry_notified_at, notice_time)
                self.assertEqual(file.expires_at, self.expiry)
        subsidy_files.dispatch_expiry(self.expiry - timedelta(microseconds=1))
        for file in (first, second):
            self.assertEqual(self.client.get(file['url']).status_code, 200)
        delete = storage.delete

        def check_committed(kind, name):
            with self.Session() as db:
                self.assertIsNone(db.query(SubsidyFile.id).filter(SubsidyFile.stored_name == name).first())
            delete(kind, name)

        with patch.object(storage, 'delete', side_effect=check_committed):
            subsidy_files.dispatch_expiry(self.expiry)
        self.assert_empty()

    def test_late_and_missed_notices_grant_fourteen_days_and_only_extend_once(self):
        for delay in (timedelta(days=-7), timedelta(days=30)):
            with self.subTest(delay=delay):
                file = self.expiring_file(rental_id=self.add_rental())
                now = self.expiry + delay
                cutoff = now + timedelta(days=14)
                subsidy_files.dispatch_expiry(now)
                subsidy_files.dispatch_expiry(cutoff - timedelta(microseconds=1))
                self.assertEqual(self.client.get(file['url']).status_code, 200)
                listed = self.client.get(self.url).json()['files'][0]
                self.assertEqual(listed['expiresAt'], cutoff.replace(tzinfo=timezone.utc).isoformat())
                with self.Session() as db:
                    row = db.get(SubsidyFile, file['id'])
                    self.assertEqual(row.expiry_notified_at, now)
                    self.assertEqual(row.expires_at, cutoff)
                    notice = db.query(InboxMessage).order_by(InboxMessage.created_at.desc()).first()
                    self.assertIn(cutoff.date().isoformat(), notice.body)
                subsidy_files.dispatch_expiry(cutoff)
                self.assert_empty()

    def test_different_users_get_separate_notices_and_future_files_are_untouched(self):
        self.expiring_file()
        self.expiring_file(doc_type='bankbook', expires=self.expiry - timedelta(days=20))
        future = self.expiring_file(expires=self.expiry + timedelta(days=1))
        self.login(2)
        self.expiring_file(doc_type='household')
        now = self.expiry - timedelta(days=14)
        subsidy_files.dispatch_expiry(now)
        with self.Session() as db:
            notices = db.query(InboxMessage).order_by(InboxMessage.user_id).all()
            self.assertEqual([notice.user_id for notice in notices], [1, 2])
            self.assertIn('2 份補助文件', notices[0].body)
            self.assertIn('存摺封面', notices[0].body)
            self.assertIn('1 份補助文件', notices[1].body)
            self.assertIn('戶籍資料', notices[1].body)
            self.assertIsNone(db.get(SubsidyFile, future['id']).expiry_notified_at)

    def test_batch_bounds_notices_and_deletions_without_waiting_files_starving_work(self):
        now = self.expiry
        waiting = self.expiring_file(expires=now + timedelta(days=1), notified=now - timedelta(days=13))
        self.expiring_file(notified=now - timedelta(days=14))
        self.expiring_file()
        self.expiring_file(doc_type='bankbook')
        with patch.object(subsidy_files, 'EXPIRY_BATCH_SIZE', 2):
            subsidy_files.dispatch_expiry(now)
            with self.Session() as db:
                self.assertEqual(db.query(SubsidyFile).count(), 3)
                self.assertEqual(db.query(SubsidyFile).filter(SubsidyFile.expiry_notified_at.is_(None)).count(), 1)
                self.assertEqual(db.query(InboxMessage).count(), 1)
            subsidy_files.dispatch_expiry(now)
        with self.Session() as db:
            self.assertEqual(db.query(SubsidyFile).filter(SubsidyFile.expiry_notified_at.is_(None)).count(), 0)
            self.assertEqual(db.get(SubsidyFile, waiting['id']).expires_at, now + timedelta(days=1))

    def test_one_failed_notice_does_not_stop_other_users_or_deletions(self):
        failed = self.expiring_file()
        delete = self.expiring_file(notified=self.expiry - timedelta(days=14))
        self.login(2)
        other = self.expiring_file()
        notify = subsidy_files.notify_user

        def fail_first(db, user, **kwargs):
            if user.id == 1:
                raise RuntimeError('測試不得出現在日誌的檔名.pdf')
            return notify(db, user, **kwargs)

        with patch.object(subsidy_files, 'notify_user', side_effect=fail_first), \
                self.assertLogs(subsidy_files.logger, level='WARNING') as logs:
            subsidy_files.dispatch_expiry(self.expiry)
        self.assertNotIn('測試不得出現在日誌的檔名.pdf', ''.join(logs.output))
        with self.Session() as db:
            self.assertIsNone(db.get(SubsidyFile, failed['id']).expiry_notified_at)
            self.assertEqual(db.get(SubsidyFile, failed['id']).expires_at, self.expiry)
            self.assertIsNone(db.get(SubsidyFile, delete['id']))
            self.assertEqual(db.get(SubsidyFile, other['id']).expiry_notified_at, self.expiry)
            self.assertEqual(db.query(InboxMessage).one().user_id, 2)

    def test_notice_commit_failure_rolls_back_notice_and_expiry_extension(self):
        file = self.expiring_file()
        with patch('sqlalchemy.orm.Session.commit', side_effect=RuntimeError('測試提交失敗')), \
                self.assertLogs(subsidy_files.logger, level='WARNING'):
            subsidy_files.dispatch_expiry(self.expiry)
        with self.Session() as db:
            self.assertEqual(db.query(InboxMessage).count(), 0)
            row = db.get(SubsidyFile, file['id'])
            self.assertIsNone(row.expiry_notified_at)
            self.assertEqual(row.expires_at, self.expiry)
        self.assertTrue(self.stored_path(file['id']).exists())

    def test_failed_deletion_commit_keeps_bytes_and_continues_next_file(self):
        first = self.expiring_file(notified=self.expiry - timedelta(days=14))
        second = self.expiring_file(notified=self.expiry - timedelta(days=14))
        first_path = self.stored_path(first['id'])
        second_path = self.stored_path(second['id'])
        commit = self.Session.class_.commit
        calls = []

        def fail_first(db):
            calls.append(db)
            if len(calls) == 1:
                raise RuntimeError('測試提交失敗')
            return commit(db)

        with patch.object(self.Session.class_, 'commit', fail_first), self.assertLogs(subsidy_files.logger, level='WARNING'):
            subsidy_files.dispatch_expiry(self.expiry)
        self.assertTrue(first_path.exists())
        self.assertFalse(second_path.exists())
        self.assertEqual(self.client.get(first['url']).status_code, 200)
        self.assertEqual(self.client.get(second['url']).status_code, 404)

    def test_expiry_works_without_file_or_filename_keys_and_normalizes_utc(self):
        file = self.expiring_file()
        local = (self.expiry - timedelta(days=14)).replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=8)))
        with patch.dict(os.environ, {'FILE_ENCRYPTION_KEY': '', 'PII_ENCRYPTION_KEY': ''}):
            subsidy_files.dispatch_expiry(local)
            with self.Session() as db:
                row = db.query(SubsidyFile.expiry_notified_at, SubsidyFile.expires_at).one()
                self.assertEqual(row.expiry_notified_at, self.expiry - timedelta(days=14))
                self.assertEqual(row.expires_at, self.expiry)
            subsidy_files.dispatch_expiry(self.expiry)
        self.assert_empty()
        self.assert_error(self.client.get(file['url']), 404, '找不到這份文件。')


if __name__ == '__main__':
    unittest.main()
