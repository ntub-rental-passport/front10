"""儀表板讀的是資料庫，不是示範資料。"""
import base64
import datetime
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import CurrentUser, get_current_user
from db.billing import build_bill_rows
from db import database
from db.database import Base, get_db
from db.models import Bill, Rental, User, UserRole
from routers import dashboard


class DashboardTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {
            'AUTH_TOKEN_SECRET': 'dashboard-test',
            'PII_ENCRYPTION_KEY': base64.b64encode(b'd' * 32).decode(),
        })
        env.start()
        self.addCleanup(env.stop)

        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False},
                                    poolclass=StaticPool)
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
            db.add_all([User(id=i, email=f'{i}@test.example', roles=[UserRole(role='tenant')])
                        for i in (1, 2)])
            db.flush()
            rental = Rental(
                id=1, user_id=1, contract_tag='中正路小套房',
                address='臺北市中正區羅斯福路一段 2 號 5 樓',
                start_date=datetime.date(2025, 8, 1), end_date=datetime.date(2026, 7, 31),
                rent_amount=20000, payment_day=5, payment_interval_months=1,
                total_periods=12, deposit_amount=40000,
                landlord_name='陳大文', electricity_fee_type='依台電帳單',
                water_fee_rule='依帳單分攤',
            )
            db.add(rental)
            db.flush()
            for row in build_bill_rows(
                start_date=rental.start_date, end_date=rental.end_date,
                total_periods=rental.total_periods, payment_interval_months=1,
                payment_day=5, rent_amount=20000,
            ):
                db.add(Bill(rental_id=rental.id, **row))
            db.commit()

        app = FastAPI()
        app.include_router(dashboard.router)

        def test_db():
            with self.Session() as db:
                yield db

        self.user_id = 1
        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            id=self.user_id, email=f'{self.user_id}@test.example', role='tenant')
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def contracts(self):
        response = self.client.get('/api/dashboard/contracts')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_contract_comes_from_the_database_with_decrypted_landlord(self):
        [contract] = self.contracts()
        self.assertEqual(contract['title'], '中正路小套房')
        self.assertEqual(contract['city'], '臺北市')
        self.assertEqual(contract['landlord'], '陳大文')
        self.assertEqual(contract['leaseMonths'], 12)
        self.assertEqual(contract['dueDay'], 5)
        self.assertEqual(len(contract['cycles']), 12)

    def test_utility_amounts_start_as_null_not_zero(self):
        # NULL = 帳單還沒來。填 0 會讓畫面顯示「這期水電 0 元」。
        [contract] = self.contracts()
        self.assertIsNone(contract['cycles'][0]['electricityAmount'])
        self.assertIsNone(contract['cycles'][0]['waterAmount'])
        self.assertIsNone(contract['cycles'][0]['paidAt'])

    def test_utilities_persist_calculations_and_partial_unknowns(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        payload = {'electricity': {'method': 'meter', 'previous': '0', 'current': '120', 'rate': '5'},
                   'water': {'method': 'pending'}}
        response = self.client.put(f'/api/dashboard/bills/{bill_id}/utilities', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        stored = self.contracts()[0]['cycles'][0]
        self.assertEqual(stored['electricityAmount'], 600)
        self.assertIsNone(stored['waterAmount'])
        self.assertEqual(stored['utilityDetails']['electricity']['current'], '120')
        payload['water'] = {'method': 'included'}
        self.client.put(f'/api/dashboard/bills/{bill_id}/utilities', json=payload)
        self.assertEqual(self.contracts()[0]['cycles'][0]['waterAmount'], 0)

    def test_automatic_previous_reading_and_tenant_method_restrictions(self):
        cycles = self.contracts()[0]['cycles']
        first, second = cycles[0]['id'], cycles[1]['id']
        payload = {'electricity': {'method': 'meter', 'previous': 0, 'current': 120, 'rate': 5}, 'water': {'method': 'pending'}}
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{first}/utilities', json=payload).status_code, 200)
        initial_context = self.client.get(f'/api/dashboard/bills/{first}/utilities/context').json()
        self.assertFalse(initial_context['initial'])
        self.assertEqual(initial_context['previous'], '0')
        context = self.client.get(f'/api/dashboard/bills/{second}/utilities/context').json()
        self.assertEqual(context['previous'], '120')
        self.assertFalse(context['initial'])
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{second}/utilities', json=payload).status_code, 409)
        payload['electricity'] = {'method': 'meter', 'previous': 120, 'current': 220, 'rate': 5}
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{second}/utilities', json=payload).status_code, 200)
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{first}/utilities', json=payload).status_code, 409)
        payload['electricity'] = {'method': 'shared', 'total': 900, 'share': 1, 'shares': 2}
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{second}/utilities', json=payload).status_code, 422)

    def test_direct_and_landlord_paid_are_not_charged_to_tenant(self):
        bill = self.contracts()[0]['cycles'][0]['id']
        for payer in ('tenant_direct', 'landlord_absorb'):
            response = self.client.put(f'/api/dashboard/bills/{bill}/utilities', json={
                'electricity': {'method': 'amount', 'payer': payer}, 'water': {'method': 'included'}})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['electricityAmount'], 0)
            self.assertEqual(response.json()['utilityDetails']['electricity']['payer'], payer)

    def test_utilities_reject_other_accounts_paid_bills_and_invalid_values(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        url = f'/api/dashboard/bills/{bill_id}/utilities'
        payload = {'electricity': {'method': 'amount', 'amount': 520}, 'water': {'method': 'included'}}
        self.user_id = 2
        self.assertEqual(self.client.put(url, json=payload).status_code, 404)
        self.user_id = 1
        invalid = {**payload, 'electricity': {'method': 'meter', 'previous': 200, 'current': 100, 'rate': 5}}
        self.assertEqual(self.client.put(url, json=invalid).status_code, 422)
        self.assertIsNone(self.contracts()[0]['cycles'][0]['electricityAmount'])
        self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json={'paid_at': '2025-08-03'})
        self.assertEqual(self.client.put(url, json=payload).status_code, 409)
        self.client.delete(f'/api/dashboard/bills/{bill_id}/payment')
        self.assertEqual(self.client.put(url, json=payload).status_code, 200)

    def test_water_nonbilling_month_is_zero_and_receipt_total_is_only_counted_once(self):
        cycles = self.contracts()[0]['cycles']
        for bill, water, expected in [
            (cycles[0], {'method': 'amount', 'amount': 604}, 604),
            (cycles[1], {'method': 'no_bill'}, 0),
            (cycles[2], {'method': 'amount', 'amount': 0}, 0),
            (cycles[3], {'method': 'pending'}, None),
        ]:
            response = self.client.put(f"/api/dashboard/bills/{bill['id']}/utilities", json={
                'electricity': {'method': 'amount', 'payer': 'tenant_direct'}, 'water': water})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['electricityAmount'], 0)
        stored = self.contracts()[0]['cycles']
        self.assertEqual([b['waterAmount'] for b in stored[:4]], [604, 0, 0, None])
        self.assertEqual(stored[1]['utilityDetails']['water']['method'], 'no_bill')
        self.assertEqual(stored[1]['rentAmount'] + stored[1]['electricityAmount'] + stored[1]['waterAmount'], 20000)

    def test_water_payer_persists_and_only_landlord_collection_is_receivable(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        url = f'/api/dashboard/bills/{bill_id}/utilities'
        entries = [({'method': 'amount', 'amount': 604}, 604),
                   ({'method': 'meter', 'previous': 100, 'current': 120, 'rate': 5}, 100)]
        for entry, amount in entries:
            for payer in ('tenant_direct', 'landlord_absorb', 'landlord_collect'):
                with self.subTest(method=entry['method'], payer=payer):
                    response = self.client.put(url, json={
                        'electricity': {'method': 'amount', 'payer': 'tenant_direct'},
                        'water': {**entry, 'payer': payer}})
                    self.assertEqual(response.status_code, 200, response.text)
                    stored = self.contracts()[0]['cycles'][0]
                    self.assertEqual(stored['waterAmount'], amount if payer == 'landlord_collect' else 0)
                    self.assertEqual(stored['utilityDetails']['water']['payer'], payer)
        response = self.client.put(url, json={
            'electricity': {'method': 'pending'},
            'water': {'method': 'amount', 'payer': 'tenant_direct'}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['waterAmount'], 0)

    def test_a_user_without_contracts_gets_an_empty_list_not_sample_data(self):
        self.user_id = 2
        self.assertEqual(self.contracts(), [])

    def test_another_users_contract_is_not_listed(self):
        self.user_id = 2
        self.assertEqual(self.contracts(), [])
        self.user_id = 1
        self.assertEqual(len(self.contracts()), 1)

    def test_recording_a_payment_persists_it(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        response = self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json={
            'paid_at': '2025-08-03', 'payment_method': 'bank-transfer',
            'payment_note': '已轉帳', 'payment_proof_name': 'proof.jpg',
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['paidAt'], '2025-08-03')

        stored = self.contracts()[0]['cycles'][0]
        self.assertEqual(stored['paymentMethod'], 'bank-transfer')
        self.assertEqual(stored['paymentNote'], '已轉帳')

    def test_paying_twice_is_refused_so_the_first_record_is_not_overwritten(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        body = {'paid_at': '2025-08-03', 'payment_method': 'cash',
                'payment_note': '', 'payment_proof_name': None}
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json=body).status_code, 200)
        self.assertEqual(self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json=body).status_code, 409)

    def test_undo_returns_the_period_to_unpaid(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json={
            'paid_at': '2025-08-03', 'payment_method': 'cash',
            'payment_note': '', 'payment_proof_name': None})
        response = self.client.delete(f'/api/dashboard/bills/{bill_id}/payment')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['paidAt'])
        self.assertIsNone(self.contracts()[0]['cycles'][0]['paymentMethod'])

    def test_cannot_touch_another_users_bill(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        self.user_id = 2
        self.assertEqual(self.client.delete(f'/api/dashboard/bills/{bill_id}/payment').status_code, 404)

    def test_unknown_payment_method_is_refused(self):
        bill_id = self.contracts()[0]['cycles'][0]['id']
        response = self.client.put(f'/api/dashboard/bills/{bill_id}/payment', json={
            'paid_at': '2025-08-03', 'payment_method': 'bitcoin',
            'payment_note': '', 'payment_proof_name': None})
        self.assertEqual(response.status_code, 422)


if __name__ == '__main__':
    unittest.main()
