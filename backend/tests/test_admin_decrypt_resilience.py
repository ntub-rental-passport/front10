"""少數異金鑰個資不能拖垮後台的明文紀錄與工單清單。"""
import base64
import os
from datetime import date
from unittest.mock import patch

from cryptography.exceptions import InvalidTag
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from auth.security import get_current_admin
from db.database import get_db
from db.models import Rental, RepairTicket
from routers import admin_repairs_api, admin_user_records_api
from test_admin_repairs import AdminRepairTestCase
from test_admin_user_records import RecordsTestCase


OTHER_KEY = base64.b64encode(b'x' * 32).decode()


def client_for(engine, router):
    app = FastAPI()
    app.include_router(router)

    def get_test_db():
        # 每次請求重新載入，避免寫入時的明文與關聯快取掩蓋真正的解密失敗。
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = get_test_db
    app.dependency_overrides[get_current_admin] = lambda: AdminRepairTestCase.admin
    return TestClient(app)


class RentalDecryptTests(RecordsTestCase):
    def test_bad_rental_pii_keeps_deposit_pairing_and_handovers(self):
        tenant_id, landlord_id = self.tenant.id, self.landlord.id
        profile = self.roster(self.tenant.email)
        # 同一合約配到兩份租約時，明文投影仍須保留原有的點交去重結果。
        for _ in range(2):
            self.lease(profile, date(2026, 1, 1), date(2026, 12, 31))
        broken = self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), deposit=20000)
        broken_id = broken.id
        self.item(broken, '冷氣', {'type': 'unchanged', 'summary': '一樣'})
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': OTHER_KEY}):
            broken.landlord_name = '另一把金鑰的房東'
            broken.tenant_phone = '0912345678'
            broken.bank_account = '1234567890'
            self.db.flush()
        self.lease(profile, date(2027, 1, 1), date(2027, 12, 31), deposit=30000)
        self.rental(self.tenant, date(2027, 1, 1), date(2027, 12, 31), deposit=30000)
        self.db.commit()

        with Session(self.engine) as db:
            with self.assertRaises(InvalidTag):
                db.query(Rental.landlord_name).filter(Rental.id == broken_id).scalar()

        client = client_for(self.engine, admin_user_records_api.router)
        response = client.get('/api/admin/deposits')
        self.assertEqual(response.status_code, 200, response.text)
        deposits = response.json()['deposits']
        self.assertEqual([row['tenantDeclared'] for row in deposits], [30000, 20000, 20000])
        for user_id, side in ((tenant_id, 'tenant'), (landlord_id, 'landlord')):
            with self.subTest(side=side):
                response = client.get(f'/api/admin/users/{user_id}/records')
                self.assertEqual(response.status_code, 200, response.text)
                records = response.json()
                self.assertEqual([{key: value for key, value in row.items() if key != 'side'}
                                  for row in records['deposits']], deposits)
                [handover] = records['handovers']
                self.assertEqual(handover['id'], f'rental-{broken_id}-{side}')
                self.assertEqual(handover['items'][0]['result'], 'unchanged')

    def test_roster_pii_stays_deferred_in_both_deposit_apis(self):
        tenant_id = self.tenant.id
        profile = self.roster(self.tenant.email)
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': OTHER_KEY}):
            profile.phone = '0987654321'
            self.db.flush()
        self.lease(profile, date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31))
        self.db.commit()
        client = client_for(self.engine, admin_user_records_api.router)
        for path in ('/api/admin/deposits', f'/api/admin/users/{tenant_id}/records'):
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200, response.text)
                [deposit] = response.json()['deposits']
                self.assertEqual(deposit['tenantDeclared'], 24000)


class RepairDecryptTests(AdminRepairTestCase):
    def test_one_bad_phone_does_not_hide_any_ticket_or_other_fields(self):
        first_id = self.ticket.id
        self.ticket.phone = '0911111111'
        second = self.make_ticket(description='馬桶漏水', days_ago=1)
        second.phone = '0922222222'
        self.db.flush()
        second_id = second.id
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': OTHER_KEY}):
            broken = self.make_ticket(description='電話解不開', days_ago=2)
            broken.phone = '0933333333'
            self.db.flush()
        broken_id = broken.id
        self.db.commit()

        with Session(self.engine) as db:
            with self.assertRaises(InvalidTag):
                db.query(RepairTicket.phone).filter(RepairTicket.id == broken_id).scalar()

        client = client_for(self.engine, admin_repairs_api.router)
        response = client.get('/api/admin/repairs')
        self.assertEqual(response.status_code, 200, response.text)
        items = response.json()['items']
        self.assertEqual([item['id'] for item in items], list(map(str, (first_id, second_id, broken_id))))
        self.assertEqual([item['phone'] for item in items], ['0911111111', '0922222222', ''])
        self.assertEqual([item['description'] for item in items], ['冷氣不會冷', '馬桶漏水', '電話解不開'])
        self.assertTrue(all(item['address'] == '臺北市測試路 1 號' for item in items))
        self.assertTrue(all(item['landlord'] == '房東阿明' for item in items))
        response = client.get(f'/api/admin/repairs/{broken_id}')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), items[-1])
        # 管理員註記也要能寫在解不開的那筆上，回傳的檢視同樣只缺電話
        response = client.patch(f'/api/admin/repairs/{broken_id}', json={'updates': {'adminNote': '已聯絡租客'}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['phone'], '')
        self.assertEqual(response.json()['adminNote'], '已聯絡租客')

    def test_phone_resilience_does_not_add_queries_as_the_list_grows(self):
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': OTHER_KEY}):
            self.ticket.phone = '0911111111'
            self.db.flush()
        self.db.commit()
        client = client_for(self.engine, admin_repairs_api.router)
        counts = []
        for start, end in ((1, 2), (2, 10)):
            for index in range(start, end):
                ticket = self.make_ticket(description=f'工單 {index}')
                ticket.phone = '0922222222'
            self.db.commit()
            statements = []

            def record_sql(conn, cursor, statement, parameters, context, executemany):
                statements.append(statement)

            event.listen(self.engine, 'before_cursor_execute', record_sql)
            try:
                response = client.get('/api/admin/repairs')
            finally:
                event.remove(self.engine, 'before_cursor_execute', record_sql)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(len(response.json()['items']), end)
            self.assertEqual(sum(item['phone'] == '' for item in response.json()['items']), 1)
            counts.append(len(statements))
        # 原本同租約的 2 / 10 筆為 24 / 112 次：關聯與 inventory 仍逐筆查，電話不得再增加。
        self.assertEqual(counts, [24, 112])
        self.assertEqual(counts[1] - counts[0], 88)
