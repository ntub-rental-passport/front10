import base64
from datetime import date
import io
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, PropertyMock, patch

from cryptography.exceptions import InvalidTag
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import httpx
from PIL import Image
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import database
from db.encrypted_fields import EncryptedText
from db.database import Base, get_db
from db.models import User, UserRole, Rental, InspectionItem, InspectionRecord, InspectionPhotoDetail
from routers import inspection
from auth.security import create_access_token
from migrations.create_inspection_items import upgrade

# setUp 會把 subject_mismatch 換掉，先留住本尊給專門的測試用
REAL_SUBJECT_MISMATCH = inspection.subject_mismatch


class InspectionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env = patch.dict(os.environ, {'AUTH_TOKEN_SECRET': 'inspection-test', 'INSPECTION_UPLOAD_DIR': directory.name,
            'PII_ENCRYPTION_KEY': base64.b64encode(b'i' * 32).decode()})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda conn, _: conn.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        # 後台的設定等資料也在同一個資料庫（db/sqlstore.py 直接用 database.engine），
        # 不換掉的話登入、報修這些流程會去連真正的開發資料庫。
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.Session = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        with self.Session() as db:
            db.add_all([User(id=i, email=f'{i}@test.example', roles=[UserRole(role='tenant')]) for i in (1, 2)])
            db.flush()
            db.add_all([Rental(id=i, user_id=i, address='Test address', start_date=date(2026, 1, 1),
                end_date=date(2027, 1, 1), rent_amount=10000, payment_day=1, total_periods=12,
                deposit_amount=20000) for i in (1, 2)])
            db.commit()
        app = FastAPI()
        app.include_router(inspection.router)
        def test_db():
            with self.Session() as db:
                yield db
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        output = io.BytesIO()
        Image.new('RGB', (32, 32), 'white').save(output, 'PNG')
        self.photo = 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()
        self.defect = {'item_type': 'Wall', 'has_defect': False, 'severity': '無',
                       'defect_summary': 'No visible damage', 'cause_inference': '無'}
        self.diff = {'type': 'new_damage', 'confidence': 0.82, 'summary': 'New crack on right side'}
        # 預設照片都拍到項目；沒拍到的情況由專門的測試覆寫
        subject = patch.object(inspection, 'subject_mismatch', return_value=None)
        subject.start()
        self.addCleanup(subject.stop)

    def request(self, method, path, user=1, **kwargs):
        return self.client.request(method, '/api/inspection' + path,
            headers={'Authorization': f'Bearer {create_access_token(user, "tenant")}'}, **kwargs)

    def item(self):
        response = self.request('POST', '/items', json={'rental_id': 1, 'room': 'Room', 'name': 'Wall'})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def upload(self, item_id, phase='baseline', **extra):
        response = self.request('PUT', f'/items/{item_id}/photos/{phase}', json={'image_data': self.photo, 'user_note': 'note', **extra})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def photo_paths(self, item, include_history=False):
        evidences = item['evidences'] + (item['history'] if include_history else [])
        with self.Session() as db:
            return [inspection.photo_directory() / db.get(InspectionRecord, int(evidence['id'])).photo_url
                    for evidence in evidences]

    def unreadable_rental(self, rental_id, invalid_format=False):
        # 用不同金鑰寫入密文，才能驗證 ORM 載入列就失敗的情況，而不只是假造 address 讀取失敗。
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'o' * 32).decode()}):
            ciphertext = EncryptedText(255).process_bind_param('Old landlord', self.engine.dialect)
        with self.engine.begin() as conn:
            conn.execute(text('UPDATE rentals SET landlord_name = :value WHERE id = :id'),
                {'value': b'legacy plaintext' if invalid_format else ciphertext, 'id': rental_id})

    def landlord_lease(self, lease_id, error=None, moved_out=False):
        # 房東地址目前是文字欄位；模擬讀取時解密失敗，避免測試改動加密機制或資料表。
        property_info = Mock()
        property_info.name = 'Platform property'
        type(property_info).address = PropertyMock(side_effect=error, return_value='Platform address')
        return SimpleNamespace(id=lease_id, property=property_info, room=SimpleNamespace(number='101'),
            status='ended' if moved_out else 'active', moved_out_at=None,
            created_at=inspection.datetime(2026, 1, 1))

    def test_properties_skips_unreadable_rental_and_logs_once(self):
        with self.Session() as db:
            db.get(Rental, 2).user_id = 1
            db.get(Rental, 2).landlord_name = 'Readable landlord'
            db.commit()
        for invalid_format in (False, True):
            with self.subTest(invalid_format=invalid_format):
                self.unreadable_rental(1, invalid_format)
                with self.assertLogs(inspection.__name__, level='ERROR') as logs:
                    response = self.request('GET', '/properties')
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([p['id'] for p in response.json()], ['2'])
                self.assertEqual(response.json()[0]['address'], 'Test address')
                self.assertEqual(logs.output, ['ERROR:routers.inspection:Inspection: rental 1 could not be decrypted; skipped'])

    def test_properties_all_rentals_unreadable_reports_key_change(self):
        for invalid_format in (False, True):
            with self.subTest(invalid_format=invalid_format):
                self.unreadable_rental(1, invalid_format)
                with self.assertLogs(inspection.__name__, level='ERROR'):
                    response = self.request('GET', '/properties')
                self.assertEqual(response.status_code, 500, response.text)
                self.assertIn('金鑰可能已變更', response.json()['detail'])
                self.assertIn('管理員', response.json()['detail'])

    def test_properties_skips_unreadable_landlord_address_and_logs_once(self):
        with self.Session() as db:
            db.get(Rental, 1).rental_status = 'linked'
            db.commit()
        for error in (InvalidTag(), ValueError('invalid personal data')):
            with self.subTest(error=type(error).__name__):
                leases = [self.landlord_lease(13, error), self.landlord_lease(14)]
                with patch('routers.tenant_leases.tenant_visible_leases', return_value=leases):
                    with self.assertLogs(inspection.__name__, level='ERROR') as logs:
                        response = self.request('GET', '/properties')
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([p['id'] for p in response.json()], ['lease:14'])
                self.assertEqual(response.json()[0]['address'], 'Platform address')
                self.assertEqual(logs.output, ['ERROR:routers.inspection:Inspection: lease 13 could not be decrypted; skipped'])

    def test_properties_all_landlord_addresses_unreadable_reports_key_change(self):
        with self.Session() as db:
            db.get(Rental, 1).rental_status = 'linked'
            db.commit()
        with patch('routers.tenant_leases.tenant_visible_leases', return_value=[self.landlord_lease(13, InvalidTag())]):
            with self.assertLogs(inspection.__name__, level='ERROR'):
                response = self.request('GET', '/properties')
        self.assertEqual(response.status_code, 500, response.text)
        self.assertIn('金鑰可能已變更', response.json()['detail'])
        self.assertIn('管理員', response.json()['detail'])

    def test_properties_keeps_readable_lease_from_either_source(self):
        for unreadable_source in ('self', 'landlord'):
            with self.subTest(unreadable_source=unreadable_source):
                if unreadable_source == 'self':
                    self.unreadable_rental(1)
                else:
                    with self.engine.begin() as conn:
                        conn.execute(text('UPDATE rentals SET landlord_name = NULL WHERE id = 1'))
                lease = self.landlord_lease(13, InvalidTag() if unreadable_source == 'landlord' else None)
                with patch('routers.tenant_leases.tenant_visible_leases', return_value=[lease]):
                    with self.assertLogs(inspection.__name__, level='ERROR'):
                        response = self.request('GET', '/properties')
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([p['id'] for p in response.json()],
                    ['lease:13'] if unreadable_source == 'self' else ['1'])

    def test_properties_no_eligible_leases_returns_empty_list(self):
        self.unreadable_rental(1)
        with self.Session() as db:
            db.query(Rental).filter(Rental.id == 1).update({'rental_status': 'linked'})
            db.commit()
        lease = self.landlord_lease(13, InvalidTag(), moved_out=True)
        with patch('routers.tenant_leases.tenant_visible_leases', return_value=[lease]):
            response = self.request('GET', '/properties')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), [])

    def test_upload_photo_snapshot_survives_another_unreadable_rental(self):
        item = self.item()
        with self.Session() as db:
            db.get(Rental, 2).user_id = 1
            db.commit()
        self.unreadable_rental(2)
        with self.assertLogs(inspection.__name__, level='ERROR'):
            uploaded = self.upload(item['id'])
        self.assertEqual(uploaded['evidences'][0]['propertySnapshot']['id'], '1')
        self.assertEqual(uploaded['evidences'][0]['propertySnapshot']['address'], 'Test address')

    def test_delete_item_removes_baseline_and_checkout_files(self):
        item = self.upload(self.item()['id'])
        item = self.upload(item['id'], 'checkout')
        paths = self.photo_paths(item)
        self.assertTrue(all(path.is_file() for path in paths))
        response = self.request('DELETE', f"/items/{item['id']}")
        self.assertEqual(response.status_code, 204, response.text)
        self.assertTrue(all(not path.exists() for path in paths))
        with self.Session() as db:
            self.assertEqual(db.query(InspectionItem).count(), 0)
            self.assertEqual(db.query(InspectionRecord).count(), 0)

    def test_delete_item_removes_all_active_and_history_files(self):
        item = self.upload(self.item()['id'], append=True)
        item = self.upload(item['id'], append=True)
        first, second = [e['id'] for e in item['evidences']]
        for baseline_id in (first, second):
            item = self.upload(item['id'], 'checkout', pairs_with=int(baseline_id))
        item = self.upload(item['id'], 'checkout', pairs_with=int(first))
        response = self.request('DELETE', f"/items/{item['id']}/photos/{second}")
        self.assertEqual(response.status_code, 200, response.text)
        item = response.json()
        self.assertEqual(len(item['evidences']), 3)
        self.assertEqual(len(item['history']), 2)
        paths = self.photo_paths(item, include_history=True)
        self.assertEqual(len(paths), 5)
        self.assertTrue(all(path.is_file() for path in paths))
        other = self.upload(self.item()['id'])
        other_paths = self.photo_paths(other)
        response = self.request('DELETE', f"/items/{item['id']}")
        self.assertEqual(response.status_code, 204, response.text)
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertTrue(all(path.is_file() for path in other_paths))
        with self.Session() as db:
            self.assertEqual(db.query(InspectionItem).count(), 1)
            self.assertEqual(db.query(InspectionRecord).count(), 1)

    def test_reupload_keeps_previous_file_and_record_in_history(self):
        for phase in ('baseline', 'checkout'):
            with self.subTest(phase=phase):
                item = self.upload(self.item()['id'], phase)
                old_evidence = item['evidences'][0]
                old_path = self.photo_paths(item)[0]
                replaced = self.upload(item['id'], phase)
                new_path = self.photo_paths(replaced)[0]
                self.assertNotEqual(old_path, new_path)
                self.assertTrue(old_path.is_file())
                self.assertTrue(new_path.is_file())
                self.assertEqual(replaced['history'][0]['id'], old_evidence['id'])
                self.assertEqual(replaced['history'][0]['url'], old_evidence['url'])
                original = self.request('GET', f"/items/{item['id']}/photos/{old_evidence['id']}/original")
                self.assertEqual(original.status_code, 200, original.text)
                self.assertEqual(original.content, base64.b64decode(self.photo.split(',')[1]))
                with self.Session() as db:
                    self.assertIsNotNone(db.get(InspectionRecord, int(old_evidence['id'])))

    def test_delete_photo_keeps_files_and_record_in_history(self):
        for phase in ('baseline', 'checkout'):
            with self.subTest(phase=phase):
                item = self.upload(self.item()['id'])
                item = self.upload(item['id'], 'checkout')
                evidence = next(e for e in item['evidences'] if e['phase'] == phase)
                paths = self.photo_paths(item)
                path = f"/items/{item['id']}/photos/{evidence['id']}"
                response = self.request('DELETE', path)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(all(path.is_file() for path in paths))
                archived = response.json()
                self.assertEqual(len(archived['evidences']), 1)
                self.assertEqual(archived['history'][0]['id'], evidence['id'])
                self.assertEqual(archived['history'][0]['url'], evidence['url'])
                self.assertIsNotNone(archived['history'][0]['removedAt'])
                original = self.request('GET', path + '/original')
                self.assertEqual(original.status_code, 200, original.text)
                self.assertEqual(original.content, base64.b64decode(self.photo.split(',')[1]))
                with self.Session() as db:
                    self.assertIsNotNone(db.get(InspectionRecord, int(evidence['id'])))

    def test_update_photo_note_preserves_files_and_does_not_run_cleanup(self):
        item = self.upload(self.item()['id'])
        item = self.upload(item['id'], 'checkout')
        files = {path: path.read_bytes() for path in inspection.photo_directory().iterdir()}
        record_id = item['evidences'][0]['id']
        path = f"/items/{item['id']}/photos/{record_id}/note"
        with patch.object(inspection, 'delete_photo_files') as cleanup:
            response = self.request('PATCH', path, json={'note': 'updated note'})
        self.assertEqual(response.status_code, 200, response.text)
        cleanup.assert_not_called()
        evidence = response.json()['evidences'][0]
        self.assertEqual(evidence['userNote'], 'updated note')
        self.assertEqual(evidence['descriptionHistory'][0]['previous'], 'note')
        self.assertEqual(evidence['url'], item['evidences'][0]['url'])
        self.assertEqual({path: path.read_bytes() for path in inspection.photo_directory().iterdir()}, files)
        with self.Session() as db:
            self.assertEqual(db.get(InspectionRecord, int(record_id)).user_note, 'updated note')

    def test_failed_commit_preserves_existing_files_and_records(self):
        for action in ('delete_item', 'upload_photo', 'delete_photo'):
            with self.subTest(action=action):
                item = self.upload(self.item()['id'])
                item = self.upload(item['id'], 'checkout')
                paths = self.photo_paths(item)
                files = set(inspection.photo_directory().iterdir())
                method, route = ('PUT', 'baseline') if action == 'upload_photo' else ('DELETE', item['evidences'][0]['id'])
                path = f"/items/{item['id']}" if action == 'delete_item' else f"/items/{item['id']}/photos/{route}"
                with patch.object(self.Session.class_, 'commit', side_effect=RuntimeError('commit failed')):
                    with self.assertRaisesRegex(RuntimeError, 'commit failed'):
                        self.request(method, path, json={'image_data': self.photo} if method == 'PUT' else None)
                self.assertTrue(all(path.is_file() for path in paths))
                self.assertEqual(set(inspection.photo_directory().iterdir()), files)
                saved = self.request('GET', '/items?rental_id=1').json()[-1]
                self.assertEqual(saved['evidences'], item['evidences'])

    def test_delete_item_unlink_failure_is_logged_and_does_not_change_success_response(self):
        item = self.upload(self.item()['id'])
        old_path = self.photo_paths(item)[0]
        with self.assertLogs(inspection.__name__, level='WARNING'):
            with patch.object(Path, 'unlink', side_effect=OSError('unlink failed')):
                response = self.request('DELETE', f"/items/{item['id']}")
        self.assertEqual(response.status_code, 204, response.text)
        self.assertTrue(old_path.is_file())
        with self.Session() as db:
            self.assertIsNone(db.get(InspectionRecord, int(item['evidences'][0]['id'])))

    def test_shared_photo_file_is_kept(self):
        for action in ('delete_item', 'upload_photo', 'delete_photo'):
            with self.subTest(action=action):
                item = self.upload(self.item()['id'])
                old_path = self.photo_paths(item)[0]
                with self.Session() as db:
                    db.add(InspectionRecord(rental_id=2, type='check_in', photo_url=old_path.name))
                    db.commit()
                if action == 'upload_photo':
                    self.upload(item['id'])
                else:
                    path = f"/items/{item['id']}"
                    if action == 'delete_photo':
                        path += f"/photos/{item['evidences'][0]['id']}"
                    response = self.request('DELETE', path)
                    self.assertEqual(response.status_code, 204 if action == 'delete_item' else 200, response.text)
                self.assertTrue(old_path.is_file())

    def test_delete_item_skips_legacy_photo_names(self):
        for name in ('legacy.jpg', 'A' * 32 + '.jpg', 'a' * 32 + '.jpg\n', '../' + 'a' * 32 + '.jpg'):
            with self.subTest(name=name):
                item = self.upload(self.item()['id'])
                with self.Session() as db:
                    record_id = int(item['evidences'][0]['id'])
                    db.get(InspectionRecord, record_id).photo_url = name
                    detail = db.get(InspectionPhotoDetail, record_id)
                    original_path = inspection.photo_directory().resolve() / detail.provenance['originalPath']
                    db.commit()
                self.assertTrue(original_path.is_file())
                # 舊照片名稱不可信，但這次上傳產生的合法 .original 仍應清除，不能要求完全不 unlink。
                # autospec 才會記錄 self 路徑；只准刪這個原始檔，連不存在的舊檔名也不能嘗試刪除，
                # 避免只查檔案是否存在或呼叫次數，漏掉對錯誤路徑的刪除。
                with patch.object(Path, 'unlink', autospec=True) as unlink:
                    response = self.request('DELETE', f"/items/{item['id']}")
                self.assertEqual(response.status_code, 204, response.text)
                unlink.assert_called_once_with(original_path, missing_ok=True)

    def test_delete_item_skips_photo_symlink_outside_upload_directory(self):
        item = self.upload(self.item()['id'])
        path = self.photo_paths(item)[0]
        with self.Session() as db:
            detail = db.get(InspectionPhotoDetail, int(item['evidences'][0]['id']))
            original_path = inspection.photo_directory().resolve() / detail.provenance['originalPath']
        self.assertTrue(original_path.is_file())
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory) / path.name
            outside.write_bytes(path.read_bytes())
            path.unlink()
            path.symlink_to(outside)
            # 照片的 symlink 指向目錄外，不影響目錄內合法 .original 的清除責任。
            # 一般 mock 不會收到 self，無法分辨刪了誰；用 autospec 精確限制只能刪原始檔，
            # 否則 mock 擋住實際刪除後，單看外部檔案與 symlink 仍在會漏掉安全防護退化。
            with patch.object(Path, 'unlink', autospec=True) as unlink:
                response = self.request('DELETE', f"/items/{item['id']}")
            self.assertEqual(response.status_code, 204, response.text)
            unlink.assert_called_once_with(original_path, missing_ok=True)
            self.assertTrue(outside.is_file())
            self.assertTrue(path.is_symlink())

    def test_delete_item_succeeds_if_photo_file_is_already_missing(self):
        item = self.upload(self.item()['id'])
        self.photo_paths(item)[0].unlink()
        response = self.request('DELETE', f"/items/{item['id']}")
        self.assertEqual(response.status_code, 204, response.text)

    def test_camera_capture_stores_source_and_quality(self):
        item = self.upload(self.item()['id'], capture_source='camera',
            capture_quality={'brightness': 140, 'sharpness': 88, 'is_level': True})
        evidence = item['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'camera')
        self.assertEqual(evidence['captureQuality'],
                         {'brightness': 140, 'sharpness': 88, 'isLevel': True})
        self.assertEqual(evidence['integrityNote'], '現場拍攝，品質正常。')

    def test_file_upload_never_carries_quality(self):
        item = self.upload(self.item()['id'], capture_source='file',
            capture_quality={'brightness': 128, 'sharpness': 100, 'is_level': True})
        evidence = item['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'file')
        self.assertIsNone(evidence['captureQuality'])
        self.assertEqual(evidence['integrityNote'], '此照片為檔案上傳，未經現場拍攝品質把關。')

    def test_poor_camera_quality_is_flagged(self):
        item = self.upload(self.item()['id'], capture_source='camera',
            capture_quality={'brightness': 40, 'sharpness': 20, 'is_level': False})
        note = item['evidences'][0]['integrityNote']
        self.assertIn('光線偏暗', note)
        self.assertIn('畫面晃動', note)
        self.assertIn('手機未保持水平', note)

    def test_camera_without_level_keeps_the_measured_light_and_sharpness(self):
        # 使用者沒授權水平偵測時，亮度與清晰度仍然是真的量到的，不該整組丟掉 ——
        # 把有證據的照片標成「未取得量測值」反而讓存證更沒說服力。
        item = self.upload(self.item()['id'], capture_source='camera',
            capture_quality={'brightness': 140, 'sharpness': 88})
        evidence = item['evidences'][0]
        self.assertEqual(evidence['captureQuality'],
                         {'brightness': 140, 'sharpness': 88, 'isLevel': None})
        self.assertEqual(evidence['integrityNote'], '現場拍攝，但未啟用水平偵測。')

    def test_camera_without_measurements_is_labeled_unknown(self):
        evidence = self.upload(self.item()['id'], capture_source='camera')['evidences'][0]
        self.assertIsNone(evidence['captureQuality'])
        self.assertEqual(evidence['integrityNote'], '現場拍攝，未取得品質量測值。')

    def test_undeclared_source_is_a_file(self):
        evidence = self.upload(self.item()['id'])['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'file')
        self.assertIsNone(evidence['captureQuality'])

    def test_roundtrip_analysis_comparison_and_retake_invalidation(self):
        item = self.item()
        item = self.upload(item['id'])
        baseline = item['evidences'][0]
        with patch.object(inspection, 'vision_result', return_value=self.defect):
            response = self.request('POST', '/analyze', json={'item_id': int(item['id']), 'record_id': int(baseline['id'])})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['vlm_result'], self.defect)
        item = self.upload(item['id'], 'checkout')
        with patch.object(inspection, 'vision_result', return_value=self.diff):
            response = self.request('POST', f"/items/{item['id']}/compare")
        self.assertEqual(response.status_code, 200, response.text)
        saved = self.request('GET', '/items?rental_id=1').json()[0]
        self.assertEqual(saved['diff']['type'], 'new_damage')
        self.assertEqual(saved['diff']['baselineRecordId'], baseline['id'])
        self.assertEqual(saved['evidences'][0]['vlmResult'], self.defect)
        self.assertEqual(saved['evidences'][0]['userNote'], 'note')
        self.assertTrue(saved['evidences'][0]['url'].startswith('data:image/jpeg;base64,'))
        with self.Session() as db:
            self.assertEqual(db.query(InspectionRecord).count(), 2)
            self.assertEqual(db.query(InspectionItem).one().comparison_result['summary'], self.diff['summary'])
            filename = db.get(InspectionRecord, int(baseline['id'])).photo_url
            self.assertTrue((inspection.photo_directory() / filename).is_file())
        replaced = self.upload(item['id'])
        self.assertIsNone(replaced['diff'])
        self.assertEqual(len(replaced['evidences']), 2)
        self.assertEqual(len(replaced['history']), 1)
        with self.Session() as db:
            self.assertEqual(db.query(InspectionRecord).count(), 3)
        self.assertEqual(self.request('DELETE', f"/items/{item['id']}").status_code, 204)
        with self.Session() as db:
            self.assertEqual(db.query(InspectionRecord).count(), 0)

    def test_authorization_and_cross_rental_access(self):
        item = self.upload(self.item()['id'])
        record = item['evidences'][0]
        self.assertEqual(self.client.get('/api/inspection/properties').status_code, 401)
        self.assertEqual([p['id'] for p in self.request('GET', '/properties').json()], ['1'])
        self.assertEqual(self.request('GET', '/items?rental_id=1', user=2).status_code, 404)
        self.assertEqual(self.request('POST', '/items', user=2, json={'rental_id': 1, 'room': 'Room', 'name': 'Wall'}).status_code, 404)
        for method, path, payload in [
            ('DELETE', f"/items/{item['id']}", None),
            ('PUT', f"/items/{item['id']}/photos/checkout", {'image_data': self.photo}),
            ('POST', f"/items/{item['id']}/compare", None),
            ('DELETE', f"/items/{item['id']}/photos/{record['id']}", None),
            ('POST', '/analyze', {'item_id': int(item['id']), 'record_id': int(record['id'])}),
        ]:
            self.assertEqual(self.request(method, path, user=2, json=payload).status_code, 404)

    def test_multi_photo_original_integrity_notes_and_history(self):
        import hashlib
        from db.models import InspectionPhotoDetail
        item = self.item()
        for angle in ('front', 'side', 'detail'):
            item = self.upload(item['id'], append=True, angle=angle, original_name='original.png')
        self.assertEqual(len(item['evidences']), 3)
        first = item['evidences'][0]
        raw = base64.b64decode(self.photo.split(',')[1])
        self.assertEqual(first['originalSha256'], hashlib.sha256(raw).hexdigest())
        self.assertIsNone(first['photoTakenAt'])
        self.assertEqual(first['propertySnapshot']['address'], 'Test address')
        path = f"/items/{item['id']}/photos/{first['id']}"
        self.assertEqual(self.request('GET', path + '/original').content, raw)
        self.assertEqual(self.request('GET', path + '/original', user=2).status_code, 404)
        self.assertEqual(self.request('PATCH', path + '/note', user=2, json={'note': 'no'}).status_code, 404)
        updated = self.request('PATCH', path + '/note', json={'note': 'new description'}).json()
        self.assertEqual(updated['evidences'][0]['descriptionHistory'][0]['previous'], 'note')
        replaced = self.upload(item['id'], append=True, angle='front', replaces_id=int(first['id']))
        self.assertEqual(len(replaced['evidences']), 3)
        self.assertEqual(replaced['history'][0]['id'], first['id'])
        self.assertEqual(self.request('GET', path + '/original').content, raw)
        newest = max(replaced['evidences'], key=lambda e: int(e['id']))
        self.assertEqual(newest['replacesId'], first['id'])
        archived = self.request('DELETE', f"/items/{item['id']}/photos/{newest['id']}").json()
        self.assertEqual(len(archived['evidences']), 2)
        self.assertEqual(len(archived['history']), 2)
        self.assertEqual(len(self.request('GET', '/items?rental_id=1').json()[0]['evidences']), 2)
        with self.Session() as db:
            detail = db.get(InspectionPhotoDetail, int(first['id']))
            (inspection.photo_directory() / detail.provenance['originalPath']).write_bytes(b'tampered')
        self.assertEqual(self.request('GET', path + '/original').status_code, 409)

    def test_each_baseline_photo_is_compared_with_its_own_checkout_photo(self):
        item = self.item()
        for _ in range(3):
            item = self.upload(item['id'], append=True)
        baselines = [e['id'] for e in item['evidences'] if e['phase'] == 'baseline']
        self.assertFalse(item['checkoutComplete'])
        # 只補拍前兩張的退租照
        for baseline_id in baselines[:2]:
            item = self.upload(item['id'], phase='checkout', append=True, pairs_with=int(baseline_id))
        self.assertEqual([p['checkoutId'] is not None for p in item['pairs']], [True, True, False])
        self.assertFalse(item['checkoutComplete'])
        results = iter([
            {'type': 'unchanged', 'confidence': 0.9, 'summary': '沒有差異'},
            {'type': 'new_damage', 'confidence': 0.8, 'summary': '右下角新刮痕'},
        ])
        with patch.object(inspection, 'vision_result', side_effect=lambda *args, **kwargs: next(results)):
            compared = self.request('POST', f"/items/{item['id']}/compare").json()
        self.assertEqual(compared['diff']['type'], 'new_damage')
        self.assertEqual([p['type'] for p in compared['diff']['pairs']], ['unchanged', 'new_damage'])
        self.assertEqual(compared['diff']['pending'], [baselines[2]])
        self.assertIn('第 2 組：右下角新刮痕', compared['diff']['summary'])
        checkout = next(e for e in compared['evidences'] if e['phase'] == 'checkout' and e['pairsWith'] == baselines[1])
        self.assertEqual(checkout['comparison']['type'], 'new_damage')
        # 補拍第三張，才算完成
        done = self.upload(item['id'], phase='checkout', append=True, pairs_with=int(baselines[2]))
        self.assertTrue(done['checkoutComplete'])
        self.assertIsNone(done['diff'])  # 照片變了，舊的比對作廢

    def test_retaking_a_checkout_photo_replaces_only_its_pair(self):
        item = self.item()
        item = self.upload(item['id'], append=True)
        item = self.upload(item['id'], append=True)
        first, second = [e['id'] for e in item['evidences'] if e['phase'] == 'baseline']
        item = self.upload(item['id'], phase='checkout', append=True, pairs_with=int(first))
        item = self.upload(item['id'], phase='checkout', append=True, pairs_with=int(second))
        old = next(p['checkoutId'] for p in item['pairs'] if p['baselineId'] == first)
        item = self.upload(item['id'], phase='checkout', append=True, pairs_with=int(first))
        pairs = {p['baselineId']: p['checkoutId'] for p in item['pairs']}
        self.assertNotEqual(pairs[first], old)
        self.assertIsNotNone(pairs[second])
        self.assertIn(old, [h['id'] for h in item['history']])
        # 不能把退租照配到別的項目的入住照片
        other = self.item()
        response = self.request('PUT', f"/items/{other['id']}/photos/checkout",
                                json={'image_data': self.photo, 'pairs_with': int(first)})
        self.assertEqual(response.status_code, 409)

    def test_retake_rejects_other_item_and_preserves_photos(self):
        first = self.upload(self.item()['id'], append=True)
        second = self.item()
        response = self.request('PUT', f"/items/{second['id']}/photos/baseline", json={
            'image_data': self.photo, 'append': True, 'replaces_id': int(first['evidences'][0]['id'])})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.request('GET', '/items?rental_id=1').json()[0]['evidences']), 1)

    def test_legacy_photo_survives_idempotent_provenance_migration(self):
        from db.models import InspectionPhotoDetail
        from migrations.create_inspection_photo_details import upgrade as upgrade_photos
        item = self.upload(self.item()['id'])
        record_id = item['evidences'][0]['id']
        InspectionPhotoDetail.__table__.drop(self.engine)
        upgrade_photos(self.engine)
        upgrade_photos(self.engine)
        legacy = self.request('GET', '/items?rental_id=1').json()[0]['evidences'][0]
        self.assertFalse(legacy['originalAvailable'])
        self.assertEqual(legacy['angle'], 'other')
        path = f"/items/{item['id']}/photos/{record_id}"
        self.assertEqual(self.request('GET', path + '/original').status_code, 404)
        result = self.request('PATCH', path + '/note', json={'note': 'note', 'angle': 'front'}).json()
        self.assertEqual(result['evidences'][0]['angle'], 'front')
        self.assertFalse(result['evidences'][0]['originalAvailable'])
        self.assertEqual(result['evidences'][0]['angleHistory'][0]['previous'], 'other')

    def test_ai_failure_preserves_photo_and_can_retry(self):
        item = self.upload(self.item()['id'])
        payload = {'item_id': int(item['id']), 'record_id': int(item['evidences'][0]['id'])}
        with patch.object(inspection, 'vision_result', side_effect=HTTPException(502, 'unavailable')):
            self.assertEqual(self.request('POST', '/analyze', json=payload).status_code, 502)
        saved = self.request('GET', '/items?rental_id=1').json()[0]
        self.assertIsNone(saved['evidences'][0]['vlmResult'])
        with patch.object(inspection, 'vision_result', return_value=self.defect):
            self.assertEqual(self.request('POST', '/analyze', json=payload).status_code, 200)

    def test_missing_invalid_and_deleted_photos(self):
        item = self.item()
        self.assertEqual(self.request('POST', f"/items/{item['id']}/compare").status_code, 422)
        self.assertEqual(self.request('PUT', f"/items/{item['id']}/photos/baseline", json={'image_data': 'invalid'}).status_code, 400)
        item = self.upload(item['id'])
        item = self.upload(item['id'], 'checkout')
        with patch.object(inspection, 'vision_result', return_value=self.diff):
            self.request('POST', f"/items/{item['id']}/compare")
        response = self.request('DELETE', f"/items/{item['id']}/photos/{item['evidences'][1]['id']}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()['diff'])
        self.assertEqual(len(response.json()['evidences']), 1)
        self.assertEqual(self.request('POST', '/items', json={'rental_id': 1, 'room': ' ', 'name': 'Wall'}).status_code, 422)

    def test_photo_change_during_vlm_does_not_save_stale_result(self):
        item = self.upload(self.item()['id'])
        item = self.upload(item['id'], 'checkout')
        def retake(*args):
            self.upload(item['id'], 'checkout')
            return self.diff
        with patch.object(inspection, 'vision_result', side_effect=retake):
            self.assertEqual(self.request('POST', f"/items/{item['id']}/compare").status_code, 409)
        self.assertIsNone(self.request('GET', '/items?rental_id=1').json()[0]['diff'])

    def test_migration_is_idempotent_and_preserves_existing_rows(self):
        InspectionItem.__table__.drop(self.engine)
        upgrade(self.engine)
        upgrade(self.engine)
        self.assertTrue(inspect(self.engine).has_table('inspection_items'))
        with self.Session() as db:
            self.assertEqual(db.query(Rental).count(), 2)

    def test_photo_without_the_item_is_not_judged(self):
        item = self.upload(self.item()['id'])
        payload = {'item_id': int(item['id']), 'record_id': int(item['evidences'][0]['id'])}
        with patch.object(inspection, 'subject_mismatch', return_value='一張名片'), \
                patch.object(inspection, 'vision_result') as judge:
            result = self.request('POST', '/analyze', json=payload).json()
        judge.assert_not_called()
        self.assertTrue(result['vlm_result']['subject_mismatch'])
        self.assertIn('一張名片', result['vlm_result']['defect_summary'])
        self.assertEqual(result['item']['evidences'][0]['aiLabel'], '未拍到此項目')

    def test_pair_with_a_wrong_photo_is_uncertain_instead_of_compared(self):
        item = self.upload(self.item()['id'])
        output = io.BytesIO()
        Image.new('RGB', (32, 32), 'black').save(output, 'PNG')
        item = self.upload(item['id'], 'checkout', image_data='data:image/png;base64,' + base64.b64encode(output.getvalue()).decode())
        with self.Session() as db:
            record = db.get(InspectionRecord, int(item['evidences'][1]['id']))
            checkout = base64.b64encode(inspection.read_photo(record)).decode()
        wrong = lambda image, room, name: '螢幕截圖' if image == checkout else None
        with patch.object(inspection, 'subject_mismatch', side_effect=wrong), \
                patch.object(inspection, 'vision_result') as judge:
            diff = self.request('POST', f"/items/{item['id']}/compare").json()['diff']
        judge.assert_not_called()
        self.assertEqual(diff['type'], 'uncertain')
        self.assertTrue(diff['pairs'][0]['subjectMismatch'])
        self.assertIn('退租照片拍到的是：螢幕截圖', diff['summary'])
        self.assertNotIn('入住照片拍到的是', diff['summary'])

    def test_subject_check_only_rejects_explicit_false(self):
        # 審核模型回不出明確的 false（格式錯、缺欄位）就放行，交給後面的瑕疵判斷
        for answer, expected in [({'match': False}, '名片'), ({'match': 'false'}, '名片'),
                                 ({'match': True}, None), ({}, None), ([], None)]:
            with patch.object(inspection, 'describe_photo', return_value='名片'), \
                    patch.object(inspection, '_vlm_text', return_value=answer):
                self.assertEqual(REAL_SUBJECT_MISMATCH('x', 'Room', 'Wall'), expected, answer)

    def test_photo_description_drops_repeated_sentences(self):
        looping = '這是一塊白牆。牆上有裂縫。牆上有裂縫。牆上有裂縫。牆上有裂縫。'
        with patch.object(inspection, '_vlm_text', return_value=looping):
            self.assertEqual(inspection.describe_photo('x'), '這是一塊白牆。牆上有裂縫。')

    def test_invalid_vlm_response_is_rejected(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY': 'test'}), patch.object(inspection, 'OpenAI') as client:
            raw = client.return_value.__enter__.return_value.chat.completions.with_raw_response.create.return_value
            raw.http_response = httpx.Response(200, json={})
            raw.parse.return_value.choices[0].message.content = '{"type":"imaginary","confidence":2,"summary":"wrong"}'
            with self.assertRaises(HTTPException) as error:
                inspection.vision_result('unused', 'prompt', inspection.ComparisonResult)
            self.assertEqual(error.exception.status_code, 502)


class NvidiaVlmUsageTests(unittest.TestCase):
    def raw(self, content):
        raw = Mock()
        raw.http_response = httpx.Response(200, json={
            'choices': [{'message': {'content': content}}],
            'usage': {'prompt_tokens': 20, 'completion_tokens': 5},
        })
        raw.parse.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])
        return raw

    def test_json_and_schema_retries_are_all_successful_requests(self):
        good = '{"type":"unchanged","confidence":0.9,"summary":"沒有差異"}'
        for function, invalid in [('vision_result', 'not json'), ('_vlm_text', 'not json'),
                                  ('vision_result', '{"type":"imaginary","confidence":2,"summary":"wrong"}')]:
            with self.subTest(function=function, invalid=invalid), patch.dict(os.environ, {'NVIDIA_API_KEY': 'test'}), \
                    patch.object(inspection, 'OpenAI') as factory, \
                    patch.object(inspection.ai_usage, 'record_call') as record:
                create = factory.return_value.__enter__.return_value.chat.completions.with_raw_response.create
                create.side_effect = [self.raw(invalid), self.raw(good)]
                if function == 'vision_result':
                    result = inspection.vision_result('unused', 'prompt', inspection.ComparisonResult)
                else:
                    result = inspection._vlm_text([], max_tokens=50, json_mode=True)
                self.assertEqual(result['type'], 'unchanged')
                self.assertEqual(create.call_count, 2)
                self.assertEqual(record.call_args_list, [
                    unittest.mock.call('nvidia', 'inspection', ok=True, prompt_tokens=20, completion_tokens=5),
                    unittest.mock.call('nvidia', 'inspection', ok=True, prompt_tokens=20, completion_tokens=5),
                ])
                self.assertEqual(factory.call_args.kwargs['max_retries'], 0)

    def test_http_failures_and_sdk_parse_failures(self):
        for status in (None, 503, 200):
            with self.subTest(status=status), patch.dict(os.environ, {'NVIDIA_API_KEY': 'test'}), \
                    patch.object(inspection, 'OpenAI') as factory, \
                    patch.object(inspection.ai_usage, 'record_call') as record:
                create = factory.return_value.__enter__.return_value.chat.completions.with_raw_response.create
                if status == 200:
                    raw = self.raw('')
                    raw.http_response = httpx.Response(200, text='{invalid')
                    raw.parse.side_effect = ValueError('invalid response JSON')
                    create.return_value = raw
                else:
                    failure = RuntimeError('HTTP failure')
                    failure.response = httpx.Response(status) if status else None
                    create.side_effect = failure
                with self.assertRaises(HTTPException):
                    inspection._vlm_text([], max_tokens=50, json_mode=True, attempts=1)
                record.assert_called_once_with('nvidia', 'inspection', ok=status == 200, prompt_tokens=0, completion_tokens=0)

    def test_missing_key_skips_both_calls(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY': ''}), \
                patch.object(inspection, 'NVIDIA_API_KEY', ''), \
                patch.object(inspection.ai_usage, 'record_call') as record, \
                patch.object(inspection, 'OpenAI') as factory:
            with self.assertRaises(HTTPException):
                inspection.vision_result('unused', 'prompt', inspection.ComparisonResult)
            with self.assertRaises(HTTPException):
                inspection._vlm_text([], max_tokens=50, json_mode=True)
        record.assert_not_called()
        factory.assert_not_called()


if __name__ == '__main__':
    unittest.main()
