"""The MySQL upgrade's checks run before anything is dropped; the rebuild itself is rehearsed on a real MySQL copy."""
import copy
from datetime import datetime
from pathlib import Path
import re
import unittest

from database import Base
from migrations.upgrade_mysql_v3 import prepare, schema_statements

CREATED = datetime(2026, 9, 1, 8, 0)
LEGACY = {
    'users': [{'id': 1, 'email': ' Shared@Example.com ', 'display_name': 'Shared', 'role': 'tenant',
               'google_sub': 'google-subject', 'password_hash': 'stale-hash', 'status': 'active',
               'created_at': CREATED}],
    'user_roles': [{'id': 5, 'user_id': 1, 'role': 'tenant', 'created_at': CREATED},
                   {'id': 6, 'user_id': 1, 'role': 'landlord', 'created_at': CREATED}],
    'user_password_credentials': [{'user_id': 1, 'password_hash': 'current-hash', 'password_changed_at': CREATED}],
    'user_identities': [{'id': 3, 'user_id': 1, 'provider': 'google', 'provider_subject': 'google-subject',
                         'provider_email': 'shared@example.com', 'created_at': CREATED}],
    'pending_registrations': [{'id': 'expired-code', 'email': 'someone@example.com', 'role': 'tenant'}],
    'pending_admin_logins': [{'id': 'code', 'user_id': 1, 'email': 'shared@example.com'}],
    'admin_sessions': [{'id': 'sid-1', 'user_id': 1}, {'id': 'sid-2', 'user_id': 1}],
}


class PrepareTests(unittest.TestCase):
    def test_keeps_the_account_as_the_old_login_saw_it(self):
        data, _ = prepare(copy.deepcopy(LEGACY))
        [user] = data['users']
        self.assertEqual(user['id'], 1)
        self.assertEqual(user['email'], 'shared@example.com')
        # 舊版登入核對的是 user_password_credentials，不是 users 上殘留的欄位
        self.assertEqual(user['password_hash'], 'current-hash')
        self.assertNotIn('google_sub', user)
        self.assertEqual(sorted(row['role'] for row in data['user_roles']), ['landlord', 'tenant'])
        self.assertEqual([row['provider_subject'] for row in data['user_identities']], ['google-subject'])

    def test_discards_only_short_lived_rows(self):
        data, discarded = prepare(copy.deepcopy(LEGACY))
        self.assertEqual(discarded, {'pending_registrations': 1, 'pending_admin_logins': 1, 'admin_sessions': 2})
        for name in discarded:
            self.assertEqual(data[name], [])

    def test_refuses_a_value_that_would_not_fit_before_anything_is_dropped(self):
        legacy = copy.deepcopy(LEGACY)
        legacy['users'][0]['display_name'] = 'x' * 101
        with self.assertRaisesRegex(ValueError, r'users\.display_name'):
            prepare(legacy)

    def test_refuses_an_empty_required_value(self):
        legacy = copy.deepcopy(LEGACY)
        legacy['users'][0]['status'] = None
        with self.assertRaisesRegex(ValueError, r'users\.status'):
            prepare(legacy)


class SchemaStatementTests(unittest.TestCase):
    def test_creates_every_table_and_leaves_the_database_name_to_the_connection(self):
        sql = (Path(__file__).parents[1] / 'database.sql').read_text(encoding='utf-8')
        statements = schema_statements(sql)
        created = {re.match(r'CREATE TABLE `(\w+)`', statement).group(1)
                   for statement in statements if statement.startswith('CREATE TABLE')}
        self.assertEqual(created, set(Base.metadata.tables))
        # 本機叫 115-rentmate、伺服器叫 115-RentMate —— 寫死的 USE 會重建錯資料庫
        self.assertFalse([statement for statement in statements if re.match(r'USE\b', statement, re.I)])
        self.assertFalse([statement for statement in statements if statement.lstrip().startswith('--')])


if __name__ == '__main__':
    unittest.main()
