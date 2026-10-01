"""報修：工單進資料庫、照片存伺服器、時間軸只能新增、各角色只能改自己那一側。"""
import base64
import datetime
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import create_access_token
from db import database
from db.database import Base, get_db
from db.models import (LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant, RepairTicket,
                       RepairTicketEvent, RepairTicketPhoto, Rental, User, UserRole)
from routers import repairs


def image_data_url(color='white') -> str:
    output = io.BytesIO()
    Image.new('RGB', (40, 40), color).save(output, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()


PDF_DATA_URL = 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-1.4\n%fake receipt\n').decode()

TENANT, LANDLORD, OTHER_TENANT, OTHER_LANDLORD = 1, 2, 3, 4


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.upload_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.upload_dir.cleanup)
        env = patch.dict(os.environ, {
            'AUTH_TOKEN_SECRET': 'repair-test',
            'PII_ENCRYPTION_KEY': base64.b64encode(b'r' * 32).decode(),
            'REPAIR_UPLOAD_DIR': self.upload_dir.name,
        })
        env.start()
        self.addCleanup(env.stop)

        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda c, _: c.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        # 後台的設定等資料也在同一個資料庫（db/sqlstore.py 直接用 database.engine），
        # 不換掉的話登入、報修這些流程會去連真正的開發資料庫。
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.Session = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)

        with self.Session() as db:
            db.add_all([
                User(id=TENANT, email='tenant@test.example', roles=[UserRole(role='tenant')]),
                User(id=LANDLORD, email='landlord@test.example', roles=[UserRole(role='landlord')]),
                User(id=OTHER_TENANT, email='other@test.example', roles=[UserRole(role='tenant')]),
                User(id=OTHER_LANDLORD, email='other-landlord@test.example', roles=[UserRole(role='landlord')]),
            ])
            db.flush()
            prop = LandlordProperty(id=1, landlord_id=LANDLORD, name='松江路', address='臺北市中山區松江路 88 號')
            db.add(prop)
            db.flush()
            db.add(LandlordRoom(id=1, property_id=1, number='101'))
            # 信箱大小寫與空白不同，也要對得上（與 /api/tenant/leases 同一條規則）
            db.add(LandlordTenant(id=1, landlord_id=LANDLORD, name='王小明', phone='0912000000',
                                  email=' Tenant@Test.example '))
            db.flush()
            today = datetime.date.today()
            db.add(LandlordLease(id=1, tenant_id=1, property_id=1, room_id=1,
                                 start_date=today - datetime.timedelta(days=30),
                                 end_date=today + datetime.timedelta(days=300),
                                 monthly_rent=15000, deposit_amount=30000, payment_day=5))
            db.add(Rental(id=1, user_id=TENANT, contract_tag='我的套房', address='臺北市中正區羅斯福路 2 號',
                          start_date=today - datetime.timedelta(days=10),
                          end_date=today + datetime.timedelta(days=355),
                          rent_amount=20000, payment_day=5, total_periods=12, deposit_amount=40000,
                          tenant_name='王小明'))
            db.commit()

        app = FastAPI()
        app.include_router(repairs.router)

        def test_db():
            with self.Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    # ---- helpers ----

    def call(self, method, path, user, role, **kwargs):
        headers = {'Authorization': f'Bearer {create_access_token(user, role)}'}
        return self.client.request(method, '/api/repairs' + path, headers=headers, **kwargs)

    def create(self, target='lease:1', photos=None, user=TENANT):
        return self.call('POST', '', user, 'tenant', json={
            'target': target, 'location': '浴室', 'equipment': '水電',
            'description': '洗手台下方漏水', 'urgency': 'emergency', 'phone': '0912-345-678',
            'photos': photos if photos is not None else [{'name': '漏水.jpg', 'data': image_data_url()}],
        })

    def patch(self, ticket_id, user, role, updates, title='動作', **extra):
        return self.call('PATCH', f'/{ticket_id}', user, role,
                         json={'updates': updates, 'event': {'title': title}, **extra})

    # ---- 建立與可見範圍 ----

    def test_targets_include_both_landlord_leases_and_own_rentals(self):
        items = self.call('GET', '/targets', TENANT, 'tenant').json()['items']
        self.assertEqual({item['leaseId'] for item in items}, {'lease:1', 'rental:1'})
        self.assertTrue(all(item['effective'] for item in items))

    def test_ticket_is_stored_with_photo_on_disk_and_first_event(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.text)
        ticket = response.json()
        self.assertEqual(ticket['status'], 'pending')
        self.assertEqual(ticket['photoNames'], ['漏水.jpg'])
        self.assertEqual(ticket['timeline'][0]['title'], '租客提交報修')
        self.assertEqual(ticket['timeline'][0]['actorRole'], 'tenant')
        self.assertEqual(len(list(Path(self.upload_dir.name).iterdir())), 1)

    def test_contact_phone_is_encrypted_at_rest(self):
        ticket_id = int(self.create().json()['id'])
        with self.engine.connect() as connection:
            raw = connection.exec_driver_sql('SELECT phone FROM repair_tickets WHERE id = ?', (ticket_id,)).scalar()
        self.assertNotIn(b'0912', bytes(raw))

    def test_landlord_sees_only_tickets_on_their_own_leases(self):
        self.create()
        self.assertEqual(len(self.call('GET', '', LANDLORD, 'landlord').json()['items']), 1)
        self.assertEqual(self.call('GET', '', OTHER_LANDLORD, 'landlord').json()['items'], [])

    def test_tenant_sees_only_their_own_tickets(self):
        self.create()
        self.assertEqual(self.call('GET', '', OTHER_TENANT, 'tenant').json()['items'], [])

    def test_cannot_report_on_someone_elses_lease(self):
        self.assertEqual(self.create(user=OTHER_TENANT).status_code, 404)
        self.assertEqual(self.create(target='rental:1', user=OTHER_TENANT).status_code, 404)

    def test_rental_ticket_is_invisible_to_landlords(self):
        # 房東不在平台上的工單是租客自己的存證紀錄
        self.create(target='rental:1')
        self.assertEqual(self.call('GET', '', LANDLORD, 'landlord').json()['items'], [])

    # ---- 照片 ----

    def test_both_sides_can_read_the_photo_but_outsiders_cannot(self):
        ticket = self.create().json()
        path = f"/{ticket['id']}/photos/{ticket['photos'][0]['id']}"
        tenant = self.call('GET', path, TENANT, 'tenant')
        self.assertEqual(tenant.status_code, 200)
        self.assertEqual(tenant.headers['content-type'], 'image/jpeg')
        # 原本房東看不到照片（圖檔只在租客瀏覽器的 IndexedDB 裡）
        self.assertEqual(self.call('GET', path, LANDLORD, 'landlord').status_code, 200)
        self.assertEqual(self.call('GET', path, OTHER_TENANT, 'tenant').status_code, 404)
        self.assertEqual(self.call('GET', path, OTHER_LANDLORD, 'landlord').status_code, 404)

    def test_pdf_is_only_accepted_as_a_receipt(self):
        response = self.create(photos=[{'name': 'x.pdf', 'data': PDF_DATA_URL}])
        self.assertEqual(response.status_code, 400)

    def test_failed_create_leaves_no_orphan_files(self):
        response = self.create(photos=[{'name': 'ok.jpg', 'data': image_data_url()},
                                       {'name': 'bad.jpg', 'data': 'data:image/png;base64,bm90IGFuIGltYWdl'}])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(list(Path(self.upload_dir.name).iterdir()), [])
        with self.Session() as db:
            self.assertEqual(db.query(RepairTicket).count(), 0)

    # ---- 角色權限 ----

    def test_tenant_cannot_set_landlord_side_fields(self):
        ticket_id = self.create().json()['id']
        response = self.patch(ticket_id, TENANT, 'tenant', {'responsibility': 'landlord', 'actualCost': 0})
        self.assertEqual(response.status_code, 403)
        self.assertIn('responsibility', response.json()['detail'])

    def test_landlord_cannot_accept_inspection_on_behalf_of_tenant(self):
        ticket_id = self.create().json()['id']
        self.patch(ticket_id, LANDLORD, 'landlord', {'status': 'processing'})
        self.patch(ticket_id, LANDLORD, 'landlord', {'status': 'inspection', 'actualCost': 850})
        self.assertEqual(self.patch(ticket_id, LANDLORD, 'landlord', {'status': 'completed'}).status_code, 409)

    def test_tenant_cannot_skip_ahead_in_the_workflow(self):
        ticket_id = self.create().json()['id']
        self.assertEqual(self.patch(ticket_id, TENANT, 'tenant', {'status': 'completed'}).status_code, 409)

    def test_event_actor_comes_from_the_login_not_the_request(self):
        ticket_id = self.create().json()['id']
        ticket = self.patch(ticket_id, TENANT, 'tenant', {'status': 'canceled'}, title='房東接受處理').json()
        # 標題由前端決定，但「誰做的」是伺服器依登入身分記錄，無法冒充房東
        self.assertEqual(ticket['timeline'][-1]['actorRole'], 'tenant')

    def test_unknown_enum_values_are_rejected(self):
        ticket_id = self.create().json()['id']
        response = self.patch(ticket_id, LANDLORD, 'landlord', {'responsibility': 'nobody'})
        self.assertEqual(response.status_code, 422)

    # ---- 完整流程 ----

    def test_full_lease_workflow_with_receipt(self):
        ticket_id = self.create().json()['id']
        self.call('POST', f'/{ticket_id}/read', LANDLORD, 'landlord')
        self.patch(ticket_id, LANDLORD, 'landlord', {'status': 'processing'}, title='房東接受處理')
        self.patch(ticket_id, LANDLORD, 'landlord', {'responsibility': 'landlord', 'payer': '房東負擔'})
        self.patch(ticket_id, LANDLORD, 'landlord', {'vendorName': '安心水電', 'scheduledAt': '2026-10-02T16:00',
                                                     'estimatedCost': 1800})
        self.patch(ticket_id, TENANT, 'tenant', {'tenantScheduleReply': 'accepted'})
        done = self.patch(ticket_id, LANDLORD, 'landlord',
                          {'status': 'inspection', 'actualCost': 1500, 'completionNote': '已更換水管'},
                          photos=[{'name': '收據.pdf', 'data': PDF_DATA_URL}], photoStage='receipt')
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()['receiptName'], '收據.pdf')

        receipt = done.json()['receipt']
        pdf = self.call('GET', f"/{ticket_id}/photos/{receipt['id']}", TENANT, 'tenant')
        self.assertEqual(pdf.headers['content-type'], 'application/pdf')

        final = self.patch(ticket_id, TENANT, 'tenant', {'status': 'completed', 'inspectionResult': 'resolved'}).json()
        self.assertEqual(final['status'], 'completed')
        self.assertTrue(final['landlordRead'])
        self.assertEqual(final['vendorName'], '安心水電')
        self.assertEqual(final['actualCost'], 1500)

    def test_finished_ticket_is_frozen(self):
        ticket_id = self.create().json()['id']
        self.patch(ticket_id, TENANT, 'tenant', {'status': 'canceled'})
        self.assertEqual(self.patch(ticket_id, TENANT, 'tenant', {'responsibilityQuestion': 'x'}).status_code, 409)

    def test_supplement_photos_are_grouped_under_their_event(self):
        ticket_id = self.create().json()['id']
        self.patch(ticket_id, LANDLORD, 'landlord', {'supplementRequested': True, 'supplementRequestNote': '請拍水管接頭'})
        ticket = self.patch(ticket_id, TENANT, 'tenant', {'supplementRequested': False, 'supplementRequestNote': ''},
                            title='租客已補充報修資料', photos=[{'name': '接頭.jpg', 'data': image_data_url('gray')}],
                            photoStage='supplement').json()
        self.assertEqual(len(ticket['supplements']), 1)
        self.assertEqual(ticket['supplements'][0]['photoNames'], ['接頭.jpg'])
        self.assertFalse(ticket['supplementRequested'])

    def test_tenant_cannot_upload_a_receipt(self):
        ticket_id = self.create().json()['id']
        response = self.patch(ticket_id, TENANT, 'tenant', {}, photos=[{'name': 'r.pdf', 'data': PDF_DATA_URL}],
                              photoStage='receipt')
        self.assertEqual(response.status_code, 403)

    def test_self_managed_rental_ticket_can_be_closed_by_tenant(self):
        # 房東不在平台上：租客與房東處理完後要能自己結案，否則永遠停在待處理
        ticket = self.create(target='rental:1').json()
        self.assertTrue(ticket['selfManaged'])
        closed = self.patch(ticket['id'], TENANT, 'tenant', {'status': 'completed'}, title='租客記錄已處理完成')
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.json()['status'], 'completed')

    # ---- 存證 ----

    def test_timeline_is_append_only(self):
        ticket_id = self.create().json()['id']
        self.patch(ticket_id, LANDLORD, 'landlord', {'status': 'processing'}, title='房東接受處理')
        self.patch(ticket_id, TENANT, 'tenant', {'responsibilityQuestion': '為何要我付'}, title='提出疑問')
        with self.Session() as db:
            titles = [e.title for e in db.query(RepairTicketEvent).order_by(RepairTicketEvent.id)]
        self.assertEqual(titles, ['租客提交報修', '房東接受處理', '提出疑問'])

    def test_repair_count_is_real_not_hardcoded(self):
        first = self.create().json()
        self.assertEqual(first['inventory']['repairCount'], 0)
        second = self.create().json()
        self.assertEqual(second['inventory']['repairCount'], 1)


if __name__ == '__main__':
    unittest.main()
