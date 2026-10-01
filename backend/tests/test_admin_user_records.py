"""後台使用者詳情的押金對帳與點交存證（admin/user_records.py）。"""
import base64
import os
import unittest
from datetime import date, datetime
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from admin import user_records
from auth.security import get_current_admin
from db import database
from db.database import Base, get_db
from db.models import (
    InspectionItem, InspectionRecord, LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant,
    Rental, User, UserRole,
)
from routers import admin_user_records_api


class RecordsTestCase(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'r' * 32).decode()})
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        # 後台的設定等資料也在同一個資料庫（db/sqlstore.py 直接用 database.engine），
        # 不換掉的話登入、報修這些流程會去連真正的開發資料庫。
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.db = sessionmaker(bind=self.engine)()
        self.addCleanup(self.db.close)

        self.landlord = User(roles=[UserRole(role='landlord')], email='owner@example.com')
        self.tenant = User(roles=[UserRole(role='tenant')], email='tenant@example.com')
        self.db.add_all([self.landlord, self.tenant])
        self.db.flush()
        self.property = LandlordProperty(landlord_id=self.landlord.id, name='測試公寓', address='臺北市測試路 1 號')
        self.db.add(self.property)
        self.db.flush()
        self.room = LandlordRoom(property_id=self.property.id, number='301')
        self.db.add(self.room)
        self.db.flush()

    # ── 建資料的小工具 ─────────────────────────────────────────────

    def roster(self, email, name='王小明', deleted=False):
        profile = LandlordTenant(landlord_id=self.landlord.id, name=name, phone='0911111111', email=email,
                                 deleted_at=datetime(2026, 9, 1) if deleted else None)
        self.db.add(profile)
        self.db.flush()
        return profile

    def lease(self, profile, start, end, deposit=24000, rent=12000):
        lease = LandlordLease(tenant_id=profile.id, property_id=self.property.id, room_id=self.room.id,
                              start_date=start, end_date=end, monthly_rent=rent, deposit_amount=deposit,
                              payment_day=5, status='active')
        self.db.add(lease)
        self.db.flush()
        return lease

    def rental(self, user, start, end, deposit=24000, address='臺北市測試路 1 號 3 樓'):
        rental = Rental(user_id=user.id, address=address, start_date=start, end_date=end, rent_amount=12000,
                        payment_day=5, total_periods=12, deposit_amount=deposit)
        self.db.add(rental)
        self.db.flush()
        return rental

    def item(self, rental, name, result=None, baseline=True, checkout=True, room='客廳'):
        records = {}
        for phase, wanted, kind in (('baseline', baseline, 'check_in'), ('checkout', checkout, 'check_out')):
            if wanted:
                record = InspectionRecord(rental_id=rental.id, type=kind, photo_url=f'{name}-{phase}.jpg',
                                          captured_at=datetime(2026, 9, 10 if phase == 'baseline' else 20, 8, 0))
                self.db.add(record)
                self.db.flush()
                records[phase] = record.id
        item = InspectionItem(rental_id=rental.id, room_name=room, item_name=name,
                              baseline_record_id=records.get('baseline'), checkout_record_id=records.get('checkout'),
                              comparison_result=result, created_at=datetime(2026, 9, 1, 8, 0))
        self.db.add(item)
        self.db.flush()
        return item

    def records_of(self, user):
        self.db.commit()
        return user_records.user_records(self.db, user)


class DepositTests(RecordsTestCase):
    def test_tenant_sees_the_landlord_lease_paired_with_own_contract(self):
        self.lease(self.roster('  Tenant@Example.COM '), date(2026, 1, 1), date(2026, 12, 31), deposit=24000)
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), deposit=20000)
        [deposit] = self.records_of(self.tenant)['deposits']
        self.assertEqual(deposit['side'], 'tenant')
        self.assertEqual(deposit['address'], '臺北市測試路 1 號（房號 301）')
        self.assertEqual((deposit['monthlyRent'], deposit['landlordDeclared'], deposit['tenantDeclared']),
                         (12000, 24000, 20000))
        self.assertEqual((deposit['landlordId'], deposit['tenantId']), (self.landlord.id, self.tenant.id))

    def test_landlord_sees_the_same_pair_from_the_other_side(self):
        self.lease(self.roster('tenant@example.com'), date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), deposit=24000)
        [deposit] = self.records_of(self.landlord)['deposits']
        self.assertEqual(deposit['side'], 'landlord')
        self.assertEqual(deposit['tenantDeclared'], 24000)
        self.assertEqual(deposit['tenantId'], self.tenant.id)

    def test_contract_for_another_period_does_not_count(self):
        self.lease(self.roster('tenant@example.com'), date(2026, 1, 1), date(2026, 6, 30))
        self.rental(self.tenant, date(2025, 1, 1), date(2025, 12, 31), deposit=10000)
        [deposit] = self.records_of(self.tenant)['deposits']
        self.assertIsNone(deposit['tenantDeclared'])

    def test_the_contract_overlapping_the_most_wins(self):
        self.lease(self.roster('tenant@example.com'), date(2026, 1, 1), date(2026, 12, 31))
        self.rental(self.tenant, date(2025, 7, 1), date(2026, 1, 31), deposit=10000)  # 重疊 31 天
        self.rental(self.tenant, date(2026, 2, 1), date(2027, 1, 31), deposit=30000)  # 重疊 334 天
        [deposit] = self.records_of(self.tenant)['deposits']
        self.assertEqual(deposit['tenantDeclared'], 30000)

    def test_tenant_without_an_account_is_listed_as_undeclared(self):
        self.lease(self.roster('nobody@example.com'), date(2026, 1, 1), date(2026, 12, 31))
        [deposit] = self.records_of(self.landlord)['deposits']
        self.assertIsNone(deposit['tenantDeclared'])
        self.assertIsNone(deposit['tenantId'])

    def test_deleted_roster_entries_are_ignored(self):
        self.lease(self.roster('tenant@example.com', deleted=True), date(2026, 1, 1), date(2026, 12, 31))
        self.assertEqual(self.records_of(self.tenant)['deposits'], [])
        self.assertEqual(self.records_of(self.landlord)['deposits'], [])

    def test_blank_emails_never_link_accounts(self):
        blank = User(roles=[UserRole(role='tenant')], email='')
        self.db.add(blank)
        self.db.flush()
        self.lease(self.roster(''), date(2026, 1, 1), date(2026, 12, 31))
        self.assertEqual(self.records_of(blank)['deposits'], [])
        [deposit] = self.records_of(self.landlord)['deposits']
        self.assertIsNone(deposit['tenantId'])

    def test_other_tenants_leases_stay_out(self):
        self.lease(self.roster('other@example.com'), date(2026, 1, 1), date(2026, 12, 31))
        self.assertEqual(self.records_of(self.tenant)['deposits'], [])


class HandoverTests(RecordsTestCase):
    def test_each_item_carries_the_ai_result_without_photos(self):
        rental = self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31))
        self.item(rental, '冷氣', {'type': 'new_damage', 'confidence': 0.82, 'summary': '面板有新裂痕',
                                   'computedAt': '2026-09-21T02:00:00+00:00'})
        self.item(rental, '沙發', {'type': 'unchanged', 'confidence': 0.9, 'summary': '沒有差異'})
        self.item(rental, '窗簾', checkout=False)
        self.item(rental, '燈具', baseline=False, checkout=False)
        self.item(rental, '書桌')  # 照片齊了但還沒比對
        self.item(rental, '衣櫃', {'type': 'something-else', 'summary': '?'})

        [handover] = self.records_of(self.tenant)['handovers']
        self.assertEqual((handover['side'], handover['address']), ('tenant', '臺北市測試路 1 號 3 樓'))
        items = {item['name']: item for item in handover['items']}
        self.assertEqual(items['冷氣']['result'], 'new_damage')
        self.assertEqual(items['冷氣']['summary'], '面板有新裂痕')
        self.assertEqual(items['冷氣']['confidence'], 0.82)
        self.assertEqual(items['沙發']['result'], 'unchanged')
        self.assertEqual((items['窗簾']['result'], items['窗簾']['missingPhoto']), (None, 'checkout'))
        self.assertEqual(items['燈具']['missingPhoto'], 'both')
        self.assertEqual((items['書桌']['result'], items['書桌']['missingPhoto']), (None, None))
        self.assertIsNone(items['衣櫃']['result'])  # 看不懂的結果不猜
        self.assertNotIn('url', str(handover))  # 不含照片
        # 最後更新：比對時間比所有照片都晚
        self.assertEqual(handover['updatedAt'], '2026-09-21T02:00:00+00:00')

    def test_contracts_without_items_are_skipped(self):
        self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31))
        self.assertEqual(self.records_of(self.tenant)['handovers'], [])

    def test_landlord_sees_handovers_of_paired_contracts_only(self):
        self.lease(self.roster('tenant@example.com'), date(2026, 1, 1), date(2026, 12, 31))
        paired = self.rental(self.tenant, date(2026, 1, 1), date(2026, 12, 31), address='這一份')
        unpaired = self.rental(self.tenant, date(2024, 1, 1), date(2024, 12, 31), address='別間')
        self.item(paired, '冷氣', {'type': 'unchanged', 'confidence': 0.9, 'summary': '一樣'})
        self.item(unpaired, '冷氣', {'type': 'missing', 'confidence': 0.9, 'summary': '不見了'})
        handovers = self.records_of(self.landlord)['handovers']
        self.assertEqual([(h['side'], h['address']) for h in handovers], [('landlord', '這一份')])


class ApiTests(RecordsTestCase):
    def client(self, admin_ok=True):
        app = FastAPI()
        app.include_router(admin_user_records_api.router)

        def get_test_db():
            yield self.db

        app.dependency_overrides[get_db] = get_test_db
        if admin_ok:
            app.dependency_overrides[get_current_admin] = lambda: self.landlord
        return TestClient(app)

    def test_returns_records_for_an_existing_account(self):
        self.db.commit()
        response = self.client().get(f'/api/admin/users/{self.tenant.id}/records')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'deposits': [], 'handovers': []})

    def test_unknown_account_is_404(self):
        self.db.commit()
        self.assertEqual(self.client().get('/api/admin/users/9999/records').status_code, 404)

    def test_requires_an_admin(self):
        self.db.commit()
        self.assertEqual(self.client(admin_ok=False).get(f'/api/admin/users/{self.tenant.id}/records').status_code, 401)


if __name__ == '__main__':
    unittest.main()
