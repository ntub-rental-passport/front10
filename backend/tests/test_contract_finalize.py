"""終版契約落地：只有使用者確認過的合約才進資料庫，個資欄位必須加密。"""
import base64
import os
import unittest
from unittest.mock import patch

from cryptography.exceptions import InvalidTag
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import database
from db.database import Base, get_db
from db.models import Rental, User, UserRole
from routers import contract
from auth.security import CurrentUser, get_current_user


def rental_payload(**overrides):
    payload = {
        'review_date': '2025-07-14',
        'review_days': 3,
        'has_landlord_review_signature': True,
        'has_tenant_review_signature': True,
        'address': '臺北市中正區羅斯福路一段 2 號 5 樓',
        'land_number': '中正段一小段 123 地號',
        'building_number': '00649-000 建號',
        'building_area': '30.50',
        'tax_id': None,
        'has_annex_building': False,
        'annex_building_purpose': '陽台',
        'annex_building_area': '5.00',
        'rental_scope': 'entire',
        'rental_room': None,
        'rental_area': None,
        'has_parking': True,
        'car_parking_count': 1,
        'car_parking_type': '平面式',
        'car_parking_floor': 'B1 層',
        'car_parking_number': '第 20 號',
        'motorcycle_parking_count': None,
        'motorcycle_parking_floor': None,
        'motorcycle_parking_number': None,
        'parking_usage_time': '全日',
        'has_equipment': True,
        'equipment_list': '冷氣、熱水器',
        'start_date': '2025-08-01',
        'end_date': '2026-07-31',
        'handover_date': '2025-08-01',
        'rent_amount': 20000,
        'payment_interval_months': 1,
        'payment_day': 5,
        'payment_method': '轉帳繳付',
        'bank_account': '金融機構：台灣銀行，戶名：陳大文，帳號：012345678901',
        'total_periods': 12,
        'deposit_months': 2,
        'deposit_amount': 40000,
        'management_fee_rule': '包含於租金',
        'water_fee_rule': '依帳單分攤',
        'electricity_fee_type': '依台電帳單',
        'electricity_fee_rate': '每度 5 元',
        'gas_fee_rule': None,
        'network_fee_rule': None,
        'other_fees_rule': None,
        'abandoned_items_rule': '視為拋棄其所有權',
        'jurisdiction_court': '臺灣臺北地方法院',
        'landlord_name': '陳大文',
        'landlord_national_id': 'A123456789',
        'landlord_registered_address': '臺北市大安區和平東路二段 10 號',
        'landlord_contact_address': '臺北市大安區和平東路二段 10 號',
        'landlord_phone': '0912-345-678',
        'tenant_name': '王小明',
        'tenant_national_id': 'B234567890',
        'tenant_registered_address': '新北市板橋區文化路一段 1 號',
        'tenant_contact_address': '新北市板橋區文化路一段 1 號',
        'tenant_phone': '0987-654-321',
        'agent_name': None,
        'agent_national_id': None,
        'authorization_document': None,
        'sublease_consent': None,
    }
    payload.update(overrides)
    return payload


class ContractFinalizeTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {
            'AUTH_TOKEN_SECRET': 'finalize-test-secret',
            'PII_ENCRYPTION_KEY': base64.b64encode(b'f' * 32).decode(),
        })
        env.start()
        self.addCleanup(env.stop)

        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False},
                                    poolclass=StaticPool)
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
            db.add_all([
                User(id=user_id, email=f'{user_id}@test.example', roles=[UserRole(role='tenant')])
                for user_id in (1, 2)
            ])
            db.commit()

        app = FastAPI()
        app.include_router(contract.router)

        def test_db():
            with self.Session() as db:
                yield db

        self.user_id = 1
        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.user_id, email=f'{self.user_id}@test.example', role='tenant')
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def finalize(self, **overrides):
        body = {
            'is_final': True,
            'rental': rental_payload(),
            'contract_tag': '中正路小套房',
        }
        body.update(overrides)
        return self.client.post('/api/contract/finalize', json=body)

    def test_confirmed_contract_creates_rental_and_analysis(self):
        response = self.finalize()
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body['encrypted_field_count'], 11)

        with self.Session() as db:
            rental = db.get(Rental, body['rental_id'])
            self.assertEqual(rental.user_id, 1)
            self.assertEqual(rental.contract_tag, '中正路小套房')
            self.assertEqual(rental.rent_amount, 20000)
            self.assertEqual(rental.total_periods, 12)
            self.assertEqual(rental.landlord_name, '陳大文')
            self.assertEqual(rental.tenant_name, '王小明')
            self.assertIsNotNone(rental.confirmed_at)
            # 車位欄位逐格存放，回拼契約時不必反解析字串
            self.assertEqual(rental.car_parking_number, '第 20 號')
            self.assertEqual(rental.car_parking_count, 1)
            self.assertIsNone(rental.motorcycle_parking_count)

            # 存檔同時建立每期帳單，儀表板才有東西可讀
            bills = sorted(rental.bills, key=lambda bill: bill.period_index)
            self.assertEqual(len(bills), 12)
            self.assertEqual(bills[0].due_date.isoformat(), '2025-08-05')
            self.assertEqual(bills[0].rent_amount, 20000)
            self.assertEqual(bills[-1].period_end.isoformat(), '2026-07-31')
            # 水電要等實際帳單，不能預設 0
            self.assertIsNone(bills[0].electricity_amount)
            self.assertIsNone(bills[0].paid_at)

    def test_personal_data_columns_are_unreadable_without_the_key(self):
        rental_id = self.finalize().json()['rental_id']
        with self.Session() as db:
            stored = db.execute(
                text('SELECT landlord_name, tenant_phone FROM rentals WHERE id = :id'),
                {'id': rental_id},
            ).one()
        self.assertNotIn(b'\xe9\x99\xb3', bytes(stored[0]))  # 「陳」的 UTF-8 不應出現在密文中
        self.assertNotIn(b'0987', bytes(stored[1]))

        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'z' * 32).decode()}):
            with self.Session() as db:
                with self.assertRaises(InvalidTag):
                    db.get(Rental, rental_id).landlord_name

    def test_draft_contract_is_rejected_and_nothing_is_written(self):
        response = self.finalize(is_final=False)
        self.assertEqual(response.status_code, 422)
        with self.Session() as db:
            self.assertEqual(db.query(Rental).count(), 0)

    def test_end_date_before_start_date_is_rejected(self):
        response = self.finalize(rental=rental_payload(end_date='2025-07-01'))
        self.assertEqual(response.status_code, 422)
        with self.Session() as db:
            self.assertEqual(db.query(Rental).count(), 0)

    def test_same_address_and_period_is_not_stored_twice(self):
        self.assertEqual(self.finalize().status_code, 201)
        duplicate = self.finalize()
        self.assertEqual(duplicate.status_code, 409)
        with self.Session() as db:
            self.assertEqual(db.query(Rental).count(), 1)

    def test_another_user_may_store_the_same_address(self):
        self.assertEqual(self.finalize().status_code, 201)
        self.user_id = 2
        self.assertEqual(self.finalize().status_code, 201)
        with self.Session() as db:
            self.assertEqual({rental.user_id for rental in db.query(Rental)}, {1, 2})

    def test_unknown_fields_are_rejected_rather_than_silently_dropped(self):
        response = self.finalize(rental=rental_payload(rental_status='terminated'))
        self.assertEqual(response.status_code, 422)

    def test_contract_text_and_file_cannot_be_stored_at_all(self):
        # 存全文等於把所有姓名、身分證、地址、電話明文寫進資料庫，
        # 抵銷旁邊那些加密欄位；端點必須連收都不收。
        for extra in ({'ocr_text': '租賃契約全文'}, {'contract_file_name': 'contract.pdf'},
                      {'risk_report': [{'id': 'deposit-limit'}]}):
            with self.subTest(field=next(iter(extra))):
                self.assertEqual(self.finalize(**extra).status_code, 422)
        self.assertNotIn('contract_analyses', Base.metadata.tables)

    def test_stored_contract_can_be_read_back_decrypted_for_reassembly(self):
        rental_id = self.finalize().json()['rental_id']

        listing = self.client.get('/api/contract/rentals')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()[0]['rental_id'], rental_id)
        self.assertEqual(listing.json()[0]['contract_tag'], '中正路小套房')

        document = self.client.get(f'/api/contract/rentals/{rental_id}/document')
        self.assertEqual(document.status_code, 200, document.text)
        fields = document.json()['rental']
        self.assertEqual(fields['landlord_name'], '陳大文')
        self.assertEqual(fields['tenant_name'], '王小明')
        self.assertEqual(fields['tenant_phone'], '0987-654-321')
        self.assertEqual(fields['car_parking_number'], '第 20 號')
        self.assertIn('012345678901', fields['bank_account'])

    def test_another_users_contract_cannot_be_read(self):
        rental_id = self.finalize().json()['rental_id']
        self.user_id = 2
        self.assertEqual(self.client.get(f'/api/contract/rentals/{rental_id}/document').status_code, 404)
        self.assertEqual(self.client.get('/api/contract/rentals').json(), [])

    def test_reading_with_a_changed_key_reports_the_key_problem(self):
        rental_id = self.finalize().json()['rental_id']
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'z' * 32).decode()}):
            response = self.client.get(f'/api/contract/rentals/{rental_id}/document')
        self.assertEqual(response.status_code, 500)
        self.assertIn('解密', response.json()['detail'])

    def test_missing_encryption_key_fails_the_whole_write(self):
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': ''}):
            response = self.finalize()
        self.assertEqual(response.status_code, 500)
        self.assertIn('加密', response.json()['detail'])
        with self.Session() as db:
            self.assertEqual(db.query(Rental).count(), 0)


if __name__ == '__main__':
    unittest.main()
