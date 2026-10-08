import base64
from datetime import date
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import database
from db.database import Base, get_db
from db.models import User, UserRole, Rental, InspectionItem, InspectionRecord
from routers import inspection
from auth.security import create_access_token
from migrations.create_inspection_items import upgrade


class InspectionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env = patch.dict(os.environ, {'AUTH_TOKEN_SECRET': 'inspection-test', 'INSPECTION_UPLOAD_DIR': directory.name})
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

    def photo_paths(self, item):
        with self.Session() as db:
            return [inspection.photo_directory() / db.get(InspectionRecord, int(evidence['id'])).photo_url
                    for evidence in item['evidences']]

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

    def test_reupload_removes_previous_file_and_keeps_new_file(self):
        for phase in ('baseline', 'checkout'):
            with self.subTest(phase=phase):
                item = self.upload(self.item()['id'], phase)
                old_path = self.photo_paths(item)[0]
                replaced = self.upload(item['id'], phase)
                new_path = self.photo_paths(replaced)[0]
                self.assertNotEqual(old_path, new_path)
                self.assertFalse(old_path.exists())
                self.assertTrue(new_path.is_file())

    def test_delete_photo_removes_only_its_file(self):
        item = self.upload(self.item()['id'])
        item = self.upload(item['id'], 'checkout')
        baseline_path, checkout_path = self.photo_paths(item)
        response = self.request('DELETE', f"/items/{item['id']}/photos/{item['evidences'][1]['id']}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(baseline_path.is_file())
        self.assertFalse(checkout_path.exists())

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

    def test_unlink_failure_is_logged_and_does_not_change_success_response(self):
        for action in ('delete_item', 'upload_photo', 'delete_photo'):
            with self.subTest(action=action):
                item = self.upload(self.item()['id'])
                old_path = self.photo_paths(item)[0]
                method, route = ('PUT', 'baseline') if action == 'upload_photo' else ('DELETE', item['evidences'][0]['id'])
                path = f"/items/{item['id']}" if action == 'delete_item' else f"/items/{item['id']}/photos/{route}"
                with self.assertLogs(inspection.__name__, level='WARNING'):
                    with patch.object(Path, 'unlink', side_effect=OSError('unlink failed')):
                        response = self.request(method, path, json={'image_data': self.photo} if method == 'PUT' else None)
                self.assertEqual(response.status_code, 204 if action == 'delete_item' else 200, response.text)
                self.assertTrue(old_path.is_file())
                if action == 'upload_photo':
                    new_path = self.photo_paths(response.json())[0]
                    self.assertNotEqual(old_path, new_path)
                    self.assertTrue(new_path.is_file())
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
                    db.get(InspectionRecord, int(item['evidences'][0]['id'])).photo_url = name
                    db.commit()
                with patch.object(Path, 'unlink') as unlink:
                    response = self.request('DELETE', f"/items/{item['id']}")
                self.assertEqual(response.status_code, 204, response.text)
                unlink.assert_not_called()

    def test_delete_item_skips_photo_symlink_outside_upload_directory(self):
        item = self.upload(self.item()['id'])
        path = self.photo_paths(item)[0]
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory) / path.name
            outside.write_bytes(path.read_bytes())
            path.unlink()
            path.symlink_to(outside)
            with patch.object(Path, 'unlink') as unlink:
                response = self.request('DELETE', f"/items/{item['id']}")
            self.assertEqual(response.status_code, 204, response.text)
            unlink.assert_not_called()
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
        with self.Session() as db:
            self.assertEqual(db.query(InspectionRecord).count(), 2)
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

    def test_invalid_vlm_response_is_rejected(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY': 'test'}), patch.object(inspection, 'OpenAI') as client:
            client.return_value.__enter__.return_value.chat.completions.create.return_value.choices[0].message.content = '{"type":"imaginary","confidence":2,"summary":"wrong"}'
            with self.assertRaises(HTTPException) as error:
                inspection.vision_result('unused', 'prompt', inspection.ComparisonResult)
            self.assertEqual(error.exception.status_code, 502)


if __name__ == '__main__':
    unittest.main()
