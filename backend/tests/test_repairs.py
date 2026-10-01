"""報修工單：編號、三端各自看得到什麼、權限、附件（routers/repairs.py）。"""
import base64
import io
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import get_current_admin, get_current_landlord, get_current_tenant
from db.database import Base, get_db
from db.models import (
    LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant, RepairTicket, User, UserRole,
)
from repairs import service
from routers import repairs as repairs_router


def image_bytes(color=(70, 69, 165)) -> bytes:
    buffer = io.BytesIO()
    Image.new('RGB', (600, 400), color).save(buffer, format='WEBP')
    return buffer.getvalue()


class RepairTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'REPAIR_EXTRAS_DB': self.temp.name + '/repair-extras.db',
            'REPAIR_PHOTO_DIR': self.temp.name + '/repair-photos',
            'PLATFORM_SETTINGS_DB': self.temp.name + '/settings.db',
            'ADMIN_AUDIT_DB': self.temp.name + '/audit.db',
            'PII_ENCRYPTION_KEY': base64.b64encode(b'r' * 32).decode(),
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.temp.cleanup)

        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.addCleanup(self.db.close)

        self.landlord = User(roles=[UserRole(role='landlord')], email='owner@example.com')
        self.other_landlord = User(roles=[UserRole(role='landlord')], email='other-owner@example.com')
        self.tenant = User(roles=[UserRole(role='tenant')], email='tenant@example.com')
        self.other_tenant = User(roles=[UserRole(role='tenant')], email='nosy@example.com')
        self.admin = User(roles=[UserRole(role='admin')], email='admin@example.com')
        self.db.add_all([self.landlord, self.other_landlord, self.tenant, self.other_tenant, self.admin])
        self.db.flush()
        self.lease = self.make_lease(self.landlord, self.tenant.email)
        self.db.commit()

    def make_lease(self, landlord, tenant_email, number='301'):
        prop = LandlordProperty(landlord_id=landlord.id, name='測試公寓', address='臺北市測試路 1 號')
        self.db.add(prop)
        self.db.flush()
        room = LandlordRoom(property_id=prop.id, number=number)
        roster = LandlordTenant(landlord_id=landlord.id, name='王小明', phone='0911111111', email=tenant_email)
        self.db.add_all([room, roster])
        self.db.flush()
        today = date.today()
        lease = LandlordLease(tenant_id=roster.id, property_id=prop.id, room_id=room.id,
                              start_date=today - timedelta(days=30), end_date=today + timedelta(days=300),
                              monthly_rent=12000, deposit_amount=24000, payment_day=5, status='active')
        self.db.add(lease)
        self.db.flush()
        return lease

    # ── 用 API 操作 ────────────────────────────────────────────────

    def client(self, role='tenant', user=None):
        app = FastAPI()
        app.include_router(repairs_router.router)

        def get_test_db():
            yield self.db

        app.dependency_overrides[get_db] = get_test_db
        resolver = {'tenant': get_current_tenant, 'landlord': get_current_landlord, 'admin': get_current_admin}[role]
        viewer = user or getattr(self, role)
        app.dependency_overrides[resolver] = lambda: viewer
        app.dependency_overrides[repairs_router.repair_viewer] = lambda: (viewer, role)
        return TestClient(app)

    def submit(self, client=None, description='冷氣不會冷', lease=None):
        payload = {'leaseId': str((lease or self.lease).id), 'location': '臥室', 'equipment': '冷氣',
                   'description': description, 'urgency': 'normal', 'availableTime': '平日晚上',
                   'accessPermission': 'contact-first'}
        return (client or self.client()).post('/api/repairs', json=payload)


class NumberTests(RepairTestCase):
    def test_case_numbers_count_up_within_the_same_day(self):
        first = self.submit().json()
        second = self.submit(description='馬桶漏水').json()
        today = datetime.now(service.extras.TZ).strftime('%Y%m%d')
        self.assertEqual(first['ticketNo'], f'R-{today}-01')
        self.assertEqual(second['ticketNo'], f'R-{today}-02')
        # 畫面上用的 id 就是案件編號，三端才對得起來
        self.assertEqual(first['id'], first['ticketNo'])

    def test_the_number_restarts_on_a_new_day(self):
        with service.extras.transaction() as connection:
            yesterday = datetime.now(service.extras.TZ) - timedelta(days=1)
            earlier = service.extras.reserve_number(connection, yesterday)
        self.assertTrue(earlier.endswith('-01'))
        today = datetime.now(service.extras.TZ).strftime('%Y%m%d')
        self.assertEqual(self.submit().json()['ticketNo'], f'R-{today}-01')


class VisibilityTests(RepairTestCase):
    def test_each_side_only_sees_what_belongs_to_it(self):
        number = self.submit().json()['ticketNo']

        self.assertEqual([t['ticketNo'] for t in self.client().get('/api/repairs').json()['items']], [number])
        landlord_items = self.client('landlord').get('/api/landlord/repairs').json()['items']
        self.assertEqual([t['ticketNo'] for t in landlord_items], [number])
        self.assertEqual(len(self.client('admin').get('/api/admin/repairs').json()['items']), 1)

        # 別人的工單一律 404，不分「不存在」與「沒權限」
        self.assertEqual(self.client('tenant', self.other_tenant).get('/api/repairs').json()['items'], [])
        self.assertEqual(self.client('tenant', self.other_tenant).get(f'/api/repairs/{number}').status_code, 404)
        self.assertEqual(
            self.client('landlord', self.other_landlord).get(f'/api/landlord/repairs/{number}').status_code, 404)

    def test_a_landlord_only_sees_the_tickets_of_their_own_leases(self):
        self.submit()
        other_lease = self.make_lease(self.other_landlord, self.other_tenant.email, number='902')
        self.db.commit()
        self.submit(client=self.client('tenant', self.other_tenant), description='別人的案子', lease=other_lease)

        mine = self.client('landlord').get('/api/landlord/repairs').json()['items']
        self.assertEqual([t['description'] for t in mine], ['冷氣不會冷'])
        self.assertEqual(len(self.client('admin').get('/api/admin/repairs').json()['items']), 2)

    def test_a_tenant_cannot_report_on_a_lease_that_is_not_theirs(self):
        other_lease = self.make_lease(self.other_landlord, self.other_tenant.email, number='903')
        self.db.commit()
        response = self.submit(lease=other_lease)
        self.assertEqual(response.status_code, 400)
        self.assertIn('租約', response.json()['detail'])

    def test_only_the_admin_sees_internal_notes(self):
        number = self.submit().json()['ticketNo']
        self.client('admin').patch(f'/api/admin/repairs/{number}', json={'updates': {'adminNote': '已電話聯絡房東'}})
        self.assertEqual(self.client('admin').get(f'/api/admin/repairs/{number}').json()['adminNote'], '已電話聯絡房東')
        self.assertNotIn('adminNote', self.client().get(f'/api/repairs/{number}').json())


class UpdateTests(RepairTestCase):
    def test_the_landlord_can_move_the_case_forward_and_the_tenant_sees_it(self):
        number = self.submit().json()['ticketNo']
        response = self.client('landlord').patch(
            f'/api/landlord/repairs/{number}', json={'updates': {'status': 'processing', 'landlordRead': True}})
        self.assertEqual(response.status_code, 200, response.text)
        tenant_view = self.client().get(f'/api/repairs/{number}').json()
        self.assertEqual(tenant_view['status'], 'processing')
        self.assertTrue(tenant_view['landlordRead'])

    def test_nobody_can_write_a_field_that_belongs_to_another_side(self):
        number = self.submit().json()['ticketNo']
        cases = [
            (self.client(), f'/api/repairs/{number}', {'adminNote': '我自己加的'}),
            (self.client(), f'/api/repairs/{number}', {'vendorName': '我自己找的師傅'}),
            (self.client('landlord'), f'/api/landlord/repairs/{number}', {'adminNote': '房東寫的'}),
            (self.client('admin'), f'/api/admin/repairs/{number}', {'status': 'completed'}),
        ]
        for client, url, updates in cases:
            with self.subTest(updates=updates):
                response = client.patch(url, json={'updates': updates})
                self.assertEqual(response.status_code, 400)
                self.assertIn('身分', response.json()['detail'])


class OverdueTests(RepairTestCase):
    def test_overdue_follows_the_threshold_in_system_settings(self):
        from admin import site_settings

        number = self.submit().json()['ticketNo']
        ticket = self.db.query(RepairTicket).one()
        ticket.created_at = datetime.utcnow() - timedelta(days=8)
        self.db.commit()

        self.assertTrue(self.client('admin').get(f'/api/admin/repairs/{number}').json()['overdue'])
        site_settings.update_settings({'maintenanceOverdueDays': 30}, actor='admin@example.com')
        self.assertFalse(self.client('admin').get(f'/api/admin/repairs/{number}').json()['overdue'])


class AttachmentTests(RepairTestCase):
    def upload(self, client, number, purpose='initial', data=None, filename='現場.webp'):
        return client.post(f'/api/repairs/{number}/photos' if purpose in {'initial', 'supplement', 'unresolved'}
                           else f'/api/landlord/repairs/{number}/photos',
                           files={'file': (filename, data if data is not None else image_bytes(), 'image/webp')},
                           data={'purpose': purpose})

    def test_a_tenant_photo_is_visible_to_the_landlord_and_the_admin_but_nobody_else(self):
        number = self.submit().json()['ticketNo']
        uploaded = self.upload(self.client(), number)
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        url = uploaded.json()['url']
        self.assertTrue(url.startswith('/api/repairs/photos/'))

        for role, user in (('tenant', None), ('landlord', None), ('admin', None)):
            with self.subTest(role=role):
                self.assertEqual(self.client(role, user).get(url).status_code, 200)
        # 不相干的帳號看不到
        self.assertEqual(self.client('tenant', self.other_tenant).get(url).status_code, 404)
        self.assertEqual(self.client('landlord', self.other_landlord).get(url).status_code, 404)

    def test_the_same_photo_twice_keeps_one_copy(self):
        number = self.submit().json()['ticketNo']
        data = image_bytes()
        first = self.upload(self.client(), number, data=data).json()
        second = self.upload(self.client(), number, data=data, filename='又傳一次.webp').json()
        self.assertEqual(first['url'], second['url'])

    def test_files_that_are_not_images_are_refused(self):
        number = self.submit().json()['ticketNo']
        response = self.upload(self.client(), number, data=b'not an image')
        self.assertEqual(response.status_code, 400)

    def test_a_tenant_cannot_upload_a_landlord_only_attachment(self):
        number = self.submit().json()['ticketNo']
        response = self.client().post(f'/api/repairs/{number}/photos',
                                      files={'file': ('收據.webp', image_bytes(), 'image/webp')},
                                      data={'purpose': 'receipt'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('身分', response.json()['detail'])

    def test_an_unknown_attachment_is_404(self):
        self.assertEqual(self.client().get('/api/repairs/photos/' + 'a' * 64 + '.webp').status_code, 404)


if __name__ == '__main__':
    unittest.main()
