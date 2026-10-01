"""後台的報修工單（routers/admin_repairs_api.py）。

工單本體與租客、房東端由 test_repairs.py 涵蓋，這裡只測後台多出來的那幾件事。
"""
import base64
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from admin import repair_notes
from auth.security import get_current_admin
from db.database import Base, get_db
from db.models import (
    LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant, RepairTicket, User, UserRole,
)
from routers import admin_repairs_api


class AdminRepairTestCase(unittest.TestCase):
    admin = MagicMock(id=1, email='admin@example.com')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'ADMIN_REPAIR_NOTES_DB': self.temp.name + '/repair-notes.db',
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

        self.landlord = User(roles=[UserRole(role='landlord')], email='owner@example.com', display_name='房東阿明')
        self.tenant = User(roles=[UserRole(role='tenant')], email='tenant@example.com')
        self.db.add_all([self.landlord, self.tenant])
        self.db.flush()

        prop = LandlordProperty(landlord_id=self.landlord.id, name='測試公寓', address='臺北市測試路 1 號')
        self.db.add(prop)
        self.db.flush()
        room = LandlordRoom(property_id=prop.id, number='301')
        roster = LandlordTenant(landlord_id=self.landlord.id, name='王小明', phone='0911111111',
                                email=self.tenant.email)
        self.db.add_all([room, roster])
        self.db.flush()
        today = date.today()
        self.lease = LandlordLease(tenant_id=roster.id, property_id=prop.id, room_id=room.id,
                                   start_date=today - timedelta(days=30), end_date=today + timedelta(days=300),
                                   monthly_rent=12000, deposit_amount=24000, payment_day=5, status='active')
        self.db.add(self.lease)
        self.db.flush()
        self.ticket = self.make_ticket()
        self.db.commit()

    def make_ticket(self, description='冷氣不會冷', days_ago=0):
        created = datetime.utcnow() - timedelta(days=days_ago)
        ticket = RepairTicket(tenant_user_id=self.tenant.id, lease_id=self.lease.id, location='臥室',
                              equipment='冷氣', description=description, urgency='normal',
                              access_permission='contact-first', status='pending', responsibility='pending',
                              created_at=created, updated_at=created)
        self.db.add(ticket)
        self.db.flush()
        return ticket

    def client(self, admin_ok=True):
        app = FastAPI()
        app.include_router(admin_repairs_api.router)

        def get_test_db():
            yield self.db

        app.dependency_overrides[get_db] = get_test_db
        if admin_ok:
            app.dependency_overrides[get_current_admin] = lambda: self.admin
        return TestClient(app)


class ListingTests(AdminRepairTestCase):
    def test_the_admin_sees_every_ticket_with_the_shared_case_number(self):
        response = self.client().get('/api/admin/repairs')
        self.assertEqual(response.status_code, 200, response.text)
        [item] = response.json()['items']
        # 編號跟租客、房東看到的是同一個（routers/repairs.py 的 code）
        self.assertEqual(item['ticketNo'], item['code'])
        self.assertRegex(item['ticketNo'], r'^R-\d{8}-\d{4}$')
        self.assertEqual(item['address'], '臺北市測試路 1 號')
        self.assertEqual(item['landlord'], '房東阿明')
        self.assertEqual(item['landlordUserId'], str(self.landlord.id))

    def test_newest_first(self):
        self.make_ticket(description='馬桶漏水', days_ago=3)
        self.db.commit()
        items = self.client().get('/api/admin/repairs').json()['items']
        self.assertEqual([i['description'] for i in items], ['冷氣不會冷', '馬桶漏水'])

    def test_a_ticket_without_a_landlord_on_the_platform_still_lists(self):
        self.ticket.lease_id = None
        self.db.commit()
        [item] = self.client().get('/api/admin/repairs').json()['items']
        self.assertEqual(item['landlord'], '')
        self.assertEqual(item['landlordUserId'], '')

    def test_everything_here_needs_an_admin(self):
        client = self.client(admin_ok=False)
        self.assertEqual(client.get('/api/admin/repairs').status_code, 401)
        self.assertEqual(client.get(f'/api/admin/repairs/{self.ticket.id}').status_code, 401)
        self.assertEqual(
            client.patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': {'adminNote': 'x'}}).status_code,
            401)

    def test_an_unknown_ticket_is_404(self):
        self.assertEqual(self.client().get('/api/admin/repairs/9999').status_code, 404)


class NoteTests(AdminRepairTestCase):
    def test_notes_start_empty_without_creating_a_file(self):
        [item] = self.client().get('/api/admin/repairs').json()['items']
        self.assertEqual((item['adminNote'], item['interventionRequested'], item['manuallyQueued']),
                         ('', False, False))
        self.assertFalse(repair_notes.notes_db().exists())

    def test_a_note_is_saved_and_comes_back_in_the_listing(self):
        response = self.client().patch(f'/api/admin/repairs/{self.ticket.id}',
                                       json={'updates': {'adminNote': '已電聯房東，週三到場'}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['adminNote'], '已電聯房東，週三到場')
        [item] = self.client().get('/api/admin/repairs').json()['items']
        self.assertEqual(item['adminNote'], '已電聯房東，週三到場')

    def test_updating_one_flag_keeps_the_others(self):
        client = self.client()
        client.patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': {'adminNote': '協調中'}})
        client.patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': {'interventionRequested': True}})
        item = client.get(f'/api/admin/repairs/{self.ticket.id}').json()
        self.assertEqual((item['adminNote'], item['interventionRequested']), ('協調中', True))

    def test_the_admin_cannot_change_the_ticket_itself_from_here(self):
        for updates in ({'status': 'completed'}, {'description': '我改的'}, {'vendorName': '我找的'}):
            with self.subTest(updates=updates):
                response = self.client().patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': updates})
                self.assertEqual(response.status_code, 400)
                self.assertIn('不能修改', response.json()['detail'])

    def test_a_flag_must_be_a_boolean_and_a_note_must_be_text(self):
        for updates in ({'interventionRequested': 'yes'}, {'adminNote': 123}):
            with self.subTest(updates=updates):
                self.assertEqual(
                    self.client().patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': updates}).status_code,
                    400)

    def test_an_empty_update_is_refused(self):
        self.assertEqual(self.client().patch(f'/api/admin/repairs/{self.ticket.id}', json={'updates': {}}).status_code,
                         400)


if __name__ == '__main__':
    unittest.main()
