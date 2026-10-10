"""後台如實回報付費者用量，避免角色或成員身分混入別人的額度。"""
import base64
import os
import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import create_access_token, get_current_admin
from db import database
from db.database import Base, get_db
from db.models import (
    Household, HouseholdMember, LandlordProperty, LandlordRoom, LandlordTeamMember,
    User, UserRole,
)
from routers import admin


class AdminUserUsageTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {
            'PII_ENCRYPTION_KEY': base64.b64encode(b'u' * 32).decode(),
            'AUTH_TOKEN_SECRET': 'admin-usage-test-secret',
        })
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        engine_patch = patch.object(database, 'engine', self.engine)
        engine_patch.start()
        self.addCleanup(engine_patch.stop)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.addCleanup(self.db.close)

        self.app = FastAPI()
        self.app.include_router(admin.router)

        def get_test_db():
            # 每次請求使用新 Session，避免快取掩蓋逐列發出的 SQL。
            with self.session_factory() as db:
                yield db

        self.app.dependency_overrides[get_db] = get_test_db
        self.app.dependency_overrides[get_current_admin] = lambda: User(id=9999, email='admin@example.com')
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def user(self, email, *roles, name=None):
        user = User(email=email, display_name=name, roles=[UserRole(role=role) for role in roles])
        self.db.add(user)
        self.db.flush()
        return user

    def property(self, owner, name, *statuses):
        prop = LandlordProperty(landlord_id=owner.id, name=name)
        self.db.add(prop)
        self.db.flush()
        self.db.add_all([
            LandlordRoom(property_id=prop.id, number=str(index), status=status)
            for index, status in enumerate(statuses)
        ])
        return prop

    def space(self, owner, name, *members, created_at=None):
        space = Household(
            created_by=owner.id, name=name, invite_code=name,
            created_at=created_at or datetime(2026, 1, 1),
        )
        self.db.add(space)
        self.db.flush()
        self.db.add_all([
            HouseholdMember(household_id=space.id, user_id=user.id, display_name=user.email)
            for user in (owner, *members)
        ])
        return space

    def rows(self):
        self.db.commit()
        response = self.client.get('/api/admin/users')
        self.assertEqual(response.status_code, 200)
        return {row['id']: row for row in response.json()}

    def test_landlord_counts_all_rooms_and_only_own_active_team_members(self):
        owner = self.user('owner@example.com', 'landlord')
        other = self.user('other@example.com', 'landlord')
        self.property(owner, '公寓一', 'vacant', 'occupied')
        self.property(owner, '公寓二', 'maintenance')
        self.property(other, '其他房東的公寓', 'turnover')
        self.db.add_all([
            LandlordTeamMember(owner_id=owner.id, email=f'member{index}@example.com', status=status)
            for index, status in enumerate(('active', 'active', 'pending', 'revoked'))
        ])
        self.db.add(LandlordTeamMember(
            owner_id=other.id, email=owner.email, member_user_id=owner.id, status='active',
        ))
        rows = self.rows()
        self.assertEqual(rows[owner.id]['usage'], {
            'landlord': {'properties': 2, 'rooms': 3, 'seats': 3}, 'tenant': None,
        })
        self.assertEqual(rows[other.id]['usage']['landlord'], {'properties': 1, 'rooms': 1, 'seats': 2})

    def test_empty_landlord_still_counts_the_owner_seat(self):
        owner = self.user('owner@example.com', 'landlord')
        self.assertEqual(self.rows()[owner.id]['usage'], {
            'landlord': {'properties': 0, 'rooms': 0, 'seats': 1}, 'tenant': None,
        })

    def test_role_blocks_are_present_only_for_the_corresponding_roles(self):
        tenant = self.user('tenant@example.com', 'tenant')
        landlord = self.user('landlord@example.com', 'landlord')
        both = self.user('both@example.com', 'tenant', 'landlord')
        administrator = self.user('admin@example.com', 'admin')
        rows = self.rows()
        self.assertEqual(rows[tenant.id]['usage'], {
            'landlord': None, 'tenant': {'ownedSpaces': [], 'joinedSpaces': []},
        })
        self.assertIsNone(rows[landlord.id]['usage']['tenant'])
        self.assertEqual(rows[both.id]['usage'], {
            'landlord': {'properties': 0, 'rooms': 0, 'seats': 1},
            'tenant': {'ownedSpaces': [], 'joinedSpaces': []},
        })
        self.assertEqual(rows[administrator.id]['usage'], {'landlord': None, 'tenant': None})

    def test_shared_space_counts_the_owner_and_belongs_to_the_payer(self):
        owner = self.user('a@example.com', 'tenant', name='租客 A')
        guest = self.user('b@example.com', 'tenant')
        roommate = self.user('c@example.com', 'tenant')
        space = self.space(owner, '共享空間', guest, roommate)
        expected = {
            'id': space.id, 'name': '共享空間', 'ownerId': owner.id,
            'ownerName': '租客 A', 'memberCount': 3,
        }
        rows = self.rows()
        self.assertEqual(rows[owner.id]['usage']['tenant'], {'ownedSpaces': [expected], 'joinedSpaces': []})
        self.assertEqual(rows[guest.id]['usage']['tenant'], {'ownedSpaces': [], 'joinedSpaces': [expected]})

    def test_multiple_owned_and_joined_spaces_are_sorted_by_creation_time_then_id(self):
        owner = self.user('a@example.com', 'tenant')
        guest = self.user('b@example.com', 'tenant')
        later = self.space(owner, '較晚建立', guest, created_at=datetime(2026, 2, 1))
        first = self.space(owner, '較早建立一', guest)
        second = self.space(owner, '較早建立二', guest)
        rows = self.rows()
        self.assertEqual(
            [space['id'] for space in rows[owner.id]['usage']['tenant']['ownedSpaces']],
            [first.id, second.id, later.id],
        )
        self.assertEqual(
            [space['id'] for space in rows[guest.id]['usage']['tenant']['joinedSpaces']],
            [first.id, second.id, later.id],
        )
        self.assertTrue(all(
            space['memberCount'] == 2 for space in rows[owner.id]['usage']['tenant']['ownedSpaces']
        ))

    def test_two_owned_spaces_are_reported_without_applying_a_plan_limit(self):
        owner = self.user('owner@example.com', 'tenant')
        first = self.space(owner, '空間一')
        second = self.space(owner, '空間二')
        spaces = self.rows()[owner.id]['usage']['tenant']['ownedSpaces']
        self.assertEqual([space['id'] for space in spaces], [first.id, second.id])
        self.assertEqual([space['memberCount'] for space in spaces], [1, 1])

    def test_owner_name_falls_back_to_email_for_missing_or_empty_display_name(self):
        guest = self.user('guest@example.com', 'tenant')
        for index, name in enumerate((None, '')):
            owner = self.user(f'owner{index}@example.com', 'tenant', name=name)
            self.space(owner, f'空間{index}', guest)
        spaces = self.rows()[guest.id]['usage']['tenant']['joinedSpaces']
        self.assertEqual([space['ownerName'] for space in spaces], ['owner0@example.com', 'owner1@example.com'])

    def test_owned_space_without_members_reports_zero(self):
        owner = self.user('owner@example.com', 'tenant')
        self.db.add(Household(created_by=owner.id, name='空空間', invite_code='empty'))
        spaces = self.rows()[owner.id]['usage']['tenant']['ownedSpaces']
        self.assertEqual(len(spaces), 1)
        self.assertEqual(spaces[0]['memberCount'], 0)

    def test_query_count_is_equal_for_two_and_ten_users(self):
        owner = self.user('owner@example.com', 'landlord', 'tenant')
        guest = self.user('guest@example.com', 'landlord', 'tenant')
        self.property(owner, '物件', 'occupied')
        self.space(owner, '空間', guest)
        self.db.add(LandlordTeamMember(owner_id=owner.id, email=guest.email, member_user_id=guest.id, status='active'))
        self.db.commit()

        def count_request(expected_users):
            statements = []

            def count_sql(conn, cursor, statement, parameters, context, executemany):
                statements.append(statement)

            event.listen(self.engine, 'before_cursor_execute', count_sql)
            try:
                response = self.client.get('/api/admin/users')
            finally:
                event.remove(self.engine, 'before_cursor_execute', count_sql)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()), expected_users)
            self.assertEqual(len(response.json()[0]['usage']['tenant']['ownedSpaces']), 1)
            return len(statements)

        two_users = count_request(2)
        for index in range(8):
            user = self.user(f'user{index}@example.com', 'landlord', 'tenant')
            self.property(user, f'物件{index}', 'vacant')
            self.space(user, f'空間{index}', owner)
        self.db.commit()
        ten_users = count_request(10)
        self.assertEqual(two_users, ten_users)
        self.assertEqual(two_users, 8)  # 使用者、角色、登入方式各一次，用量固定五次。

    def test_status_update_returns_the_same_real_usage_as_the_directory(self):
        owner = self.user('owner@example.com', 'landlord', 'tenant')
        other = self.user('other@example.com', 'tenant', name='其他建立者')
        self.property(owner, '公寓', 'occupied')
        self.space(owner, '空間')
        joined = self.space(other, '加入的空間', owner)
        expected = self.rows()[owner.id]['usage']
        self.assertEqual(expected['tenant']['joinedSpaces'], [{
            'id': joined.id, 'name': '加入的空間', 'ownerId': other.id,
            'ownerName': '其他建立者', 'memberCount': 2,
        }])
        with patch.object(admin.audit_service, 'record'):
            response = self.client.patch(f'/api/admin/users/{owner.id}/status', json={'status': 'suspended'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'suspended')
        self.assertEqual(response.json()['usage'], expected)

    def test_non_admin_tokens_are_forbidden_by_the_existing_guard(self):
        user = self.user('tenant@example.com', 'tenant')
        self.db.commit()
        del self.app.dependency_overrides[get_current_admin]
        for role in ('tenant', 'landlord', 'admin'):
            with self.subTest(role=role):
                token = create_access_token(user.id, role)
                response = self.client.get('/api/admin/users', headers={'Authorization': f'Bearer {token}'})
                self.assertEqual(response.status_code, 403)

    def test_unauthenticated_request_is_rejected(self):
        del self.app.dependency_overrides[get_current_admin]
        self.assertEqual(self.client.get('/api/admin/users').status_code, 401)


if __name__ == '__main__':
    unittest.main()
