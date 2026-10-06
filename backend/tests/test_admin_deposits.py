"""全站押金對帳沿用使用者詳情的規則，且查詢數不隨租約數量增加。"""
import os
import unittest
from datetime import date
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from admin import user_records
from auth.security import create_access_token, get_current_admin
from db.database import get_db
from db.models import LandlordProperty, LandlordRoom, User, UserRole
from routers import admin_user_records_api
from test_admin_user_records import RecordsTestCase


class AllDepositsTests(RecordsTestCase):
    def client(self, admin_ok=True):
        app = FastAPI()
        app.include_router(admin_user_records_api.router)

        def get_test_db():
            yield self.db

        app.dependency_overrides[get_db] = get_test_db
        if admin_ok:
            app.dependency_overrides[get_current_admin] = lambda: self.landlord
        return TestClient(app)

    def deposits(self):
        self.db.commit()
        response = self.client().get('/api/admin/deposits')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {'deposits'})
        return response.json()['deposits']

    def test_all_landlords_leases_include_matching_differing_and_missing_declarations(self):
        first_landlord_id = self.landlord.id
        equal = self.lease(self.roster(self.tenant.email), date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31))
        other_tenant = User(roles=[UserRole(role='tenant')], email='other@example.com')
        self.db.add(other_tenant)
        self.db.flush()
        different = self.lease(self.roster(other_tenant.email), date(2026, 2, 1), date(2026, 12, 31))
        self.rental(other_tenant, date(2026, 2, 1), date(2026, 12, 31), deposit=20000)

        self.landlord = User(roles=[UserRole(role='landlord')], email='second-owner@example.com')
        self.db.add(self.landlord)
        self.db.flush()
        self.property = LandlordProperty(landlord_id=self.landlord.id, name='另一間公寓', address='臺北市測試路 2 號')
        self.db.add(self.property)
        self.db.flush()
        self.room = LandlordRoom(property_id=self.property.id, number='101')
        self.db.add(self.room)
        self.db.flush()
        missing = self.lease(self.roster('nobody@example.com'), date(2026, 2, 1), date(2026, 12, 31))

        deposits = self.deposits()
        self.assertEqual([row['id'] for row in deposits],
                         [f'lease-{missing.id}', f'lease-{different.id}', f'lease-{equal.id}'])
        self.assertEqual(deposits[2], {
            'id': f'lease-{equal.id}',
            'address': '臺北市測試路 1 號（房號 301）',
            'startDate': '2026-01-01',
            'endDate': '2026-12-31',
            'monthlyRent': 12000,
            'landlordDeclared': 24000,
            'tenantDeclared': 24000,
            'landlordId': first_landlord_id,
            'tenantId': self.tenant.id,
        })
        self.assertEqual((deposits[1]['landlordDeclared'], deposits[1]['tenantDeclared'], deposits[1]['tenantId']),
                         (24000, 20000, other_tenant.id))
        self.assertEqual(deposits[1]['landlordId'], first_landlord_id)
        self.assertEqual(deposits[0]['landlordId'], self.landlord.id)
        self.assertIsNone(deposits[0]['tenantDeclared'])
        self.assertIsNone(deposits[0]['tenantId'])
        for row in deposits:
            self.assertEqual(set(row), set(deposits[2]))

    def test_deleted_roster_entries_are_excluded(self):
        self.lease(self.roster(self.tenant.email, deleted=True), date(2026, 1, 1), date(2026, 12, 31))
        kept = self.lease(self.roster(self.tenant.email), date(2026, 1, 1), date(2026, 12, 31))
        self.assertEqual([row['id'] for row in self.deposits()], [f'lease-{kept.id}'])

    def test_email_matching_ignores_case_and_surrounding_spaces(self):
        self.tenant.email = '  TENANT@Example.com  '
        self.lease(self.roster(' tenant@example.COM '), date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), deposit=20000)
        [row] = self.deposits()
        self.assertEqual((row['tenantDeclared'], row['tenantId']), (20000, self.tenant.id))

    def test_blank_and_null_emails_never_link_accounts(self):
        blank = User(roles=[UserRole(role='tenant')], email='')
        self.db.add(blank)
        self.db.flush()
        self.rental(blank, date(2026, 1, 1), date(2026, 12, 31))
        for email in ('  ', None):
            self.lease(self.roster(email), date(2026, 1, 1), date(2026, 12, 31))
        rows = self.deposits()
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertIsNone(row['tenantDeclared'])
            self.assertIsNone(row['tenantId'])

    def test_account_without_contract_keeps_tenant_id(self):
        self.lease(self.roster(self.tenant.email), date(2026, 1, 1), date(2026, 12, 31))
        [row] = self.deposits()
        self.assertIsNone(row['tenantDeclared'])
        self.assertEqual(row['tenantId'], self.tenant.id)

    def test_contract_for_another_period_is_undeclared(self):
        self.lease(self.roster(self.tenant.email), date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2025, 1, 1), date(2025, 12, 31))
        [row] = self.deposits()
        self.assertIsNone(row['tenantDeclared'])
        self.assertEqual(row['tenantId'], self.tenant.id)

    def test_global_and_user_apis_choose_the_same_contracts(self):
        profile = self.roster(' Tenant@Example.COM ')
        most_overlap = self.lease(profile, date(2026, 1, 1), date(2026, 12, 31))
        newest_tie = self.lease(profile, date(2027, 1, 1), date(2027, 12, 31))
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), deposit=30000)
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 1, 31), deposit=10000)
        self.rental(self.tenant, date(2027, 1, 1), date(2027, 12, 31), deposit=40000)
        self.rental(self.tenant, date(2027, 1, 1), date(2027, 12, 31), deposit=50000)
        global_rows = {row['id']: row for row in self.deposits()}
        self.assertEqual(global_rows[f'lease-{most_overlap.id}']['tenantDeclared'], 30000)
        self.assertEqual(global_rows[f'lease-{newest_tie.id}']['tenantDeclared'], 50000)
        client = self.client()
        for user in (self.landlord, self.tenant):
            with self.subTest(user_id=user.id):
                response = client.get(f'/api/admin/users/{user.id}/records')
                self.assertEqual(response.status_code, 200)
                rows = response.json()['deposits']
                self.assertEqual(len(rows), len(global_rows))
                for row in rows:
                    self.assertEqual({key: value for key, value in row.items() if key != 'side'},
                                     global_rows[row['id']])

    def test_query_count_is_three_for_two_and_ten_leases(self):
        def add_leases(start, end):
            for index in range(start, end):
                tenant = User(roles=[UserRole(role='tenant')], email=f'bulk-{index}@example.com')
                self.db.add(tenant)
                self.db.flush()
                self.lease(self.roster(tenant.email), date(2026, 1, 1), date(2026, 12, 31))
                self.rental(tenant, date(2026, 1, 1), date(2026, 12, 31))
            self.db.commit()

        def count_queries(expected_rows):
            statements = []

            def record_sql(conn, cursor, statement, parameters, context, executemany):
                statements.append(statement)

            event.listen(self.engine, 'before_cursor_execute', record_sql)
            try:
                # 使用新的 Session，避免已載入的關聯掩蓋逐筆查詢。
                with Session(self.engine) as db:
                    rows = user_records.all_deposits(db)
            finally:
                event.remove(self.engine, 'before_cursor_execute', record_sql)
            self.assertEqual(len(rows), expected_rows)
            self.assertTrue(all(row['tenantDeclared'] == 24000 for row in rows))
            return len(statements)

        add_leases(0, 2)
        two_queries = count_queries(2)
        add_leases(2, 10)
        ten_queries = count_queries(10)
        self.assertEqual(two_queries, ten_queries)
        self.assertEqual(two_queries, 3)

    def test_empty_site_returns_empty_deposits(self):
        self.assertEqual(self.deposits(), [])

    def test_unauthenticated_request_is_rejected_like_user_records(self):
        self.db.commit()
        client = self.client(admin_ok=False)
        response = client.get('/api/admin/deposits')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.status_code,
                         client.get(f'/api/admin/users/{self.tenant.id}/records').status_code)

    def test_authenticated_non_admin_is_rejected(self):
        self.db.commit()
        with patch.dict(os.environ, {'AUTH_TOKEN_SECRET': 'test-secret'}):
            token = create_access_token(self.tenant.id, 'tenant')
            response = self.client(admin_ok=False).get('/api/admin/deposits',
                                                       headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(response.status_code, 403)


if __name__ == '__main__':
    unittest.main()
