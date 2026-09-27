"""Exercise real SQLite copying without touching the developer database."""
import base64
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select, text
from database import Base
from migrations.upgrade_local_sqlite_v3 import migrate, plan, read_source
from schema_check import schema_problems


class UpgradeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / 'legacy.db'
        self.target = Path(self.tmp.name) / 'v3.db'
        env = patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'x' * 32).decode()})
        env.start()
        self.addCleanup(env.stop)
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript('''
                CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(254), status VARCHAR(9));
                INSERT INTO users VALUES (1, 'shared@example.com', 'active');
                CREATE TABLE user_roles (user_id INTEGER, role VARCHAR(20));
                INSERT INTO user_roles VALUES (1, 'tenant'), (1, 'landlord');
                CREATE TABLE user_password_credentials (user_id INTEGER, password_hash VARCHAR(255));
                INSERT INTO user_password_credentials VALUES (1, 'unchanged-argon2-hash');
                CREATE TABLE user_identities (id INTEGER PRIMARY KEY, user_id INTEGER, provider VARCHAR(20), provider_subject VARCHAR(255));
                INSERT INTO user_identities VALUES (1, 1, 'google', 'subject');
                CREATE TABLE landlord_properties (id INTEGER PRIMARY KEY, landlord_id INTEGER, name VARCHAR(100), address TEXT);
                INSERT INTO landlord_properties VALUES (7, 1, 'Property', 'Address');
                CREATE TABLE landlord_tenants (id INTEGER PRIMARY KEY, landlord_id INTEGER, name VARCHAR(100), phone VARCHAR(30));
                INSERT INTO landlord_tenants VALUES (8, 1, 'Tenant contact', '0912345678');
                CREATE TABLE note_households (id VARCHAR(36) PRIMARY KEY, owner_id INTEGER, name VARCHAR(100), invite_code VARCHAR(64));
                INSERT INTO note_households VALUES ('group-uuid', 1, 'Group', 'old-invite-more-than-twenty-characters');
                CREATE TABLE note_household_members (id VARCHAR(36) PRIMARY KEY, household_id VARCHAR(36), user_id INTEGER, name VARCHAR(100));
                INSERT INTO note_household_members VALUES ('member-uuid', 'group-uuid', 1, 'Member');
                CREATE TABLE note_household_tasks (id VARCHAR(36) PRIMARY KEY, household_id VARCHAR(36), title VARCHAR(200), note_date DATE, note_time VARCHAR(5), is_done BOOLEAN, assignee_id VARCHAR(36), creator_id VARCHAR(36));
                INSERT INTO note_household_tasks VALUES ('task-uuid', 'group-uuid', 'Task', '2026-09-24', '12:30', 1, 'member-uuid', 'member-uuid');
            ''')
            db.commit()

    def test_preserves_shared_account_roles_password_google_and_owned_data_with_backup(self):
        before = hashlib.sha256(self.source.read_bytes()).digest()
        counts = migrate(self.source, self.target)
        self.assertEqual(counts['users'], 1)
        self.assertEqual(counts['user_identities'], 1)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).digest(), before)
        self.assertEqual(read_source(self.target.with_name('v3-legacy-snapshot.db')), read_source(self.source))
        engine = create_engine('sqlite:///' + self.target.as_posix())
        try:
            self.assertEqual(schema_problems(engine), [])
            with engine.connect() as db:
                def rows(name):
                    return list(db.execute(select(Base.metadata.tables[name])).mappings())
                users = {row['id']: row for row in rows('users')}
                accounts = {row['role']: users[row['user_id']] for row in rows('user_roles')}
                self.assertEqual(set(accounts), {'tenant', 'landlord'})
                self.assertEqual(accounts['tenant']['id'], 1)
                self.assertEqual(accounts['tenant']['id'], accounts['landlord']['id'])
                self.assertEqual({row['password_hash'] for row in accounts.values()}, {'unchanged-argon2-hash'})
                self.assertEqual({row['user_id'] for row in rows('user_identities')}, {row['id'] for row in accounts.values()})
                self.assertEqual(rows('landlord_properties')[0]['landlord_id'], accounts['landlord']['id'])
                self.assertEqual(rows('landlord_tenants')[0]['phone'], '0912345678')
                encrypted = db.execute(text('SELECT phone FROM landlord_tenants')).scalar_one()
                self.assertIsInstance(encrypted, bytes)
                self.assertNotIn(b'0912345678', encrypted)
                group, member, task = rows('households')[0], rows('household_members')[0], rows('roommate_tasks')[0]
                self.assertEqual(group['created_by'], accounts['tenant']['id'])
                self.assertEqual(member['user_id'], accounts['tenant']['id'])
                self.assertEqual(task['assignee_member_id'], member['id'])
                self.assertEqual(task['creator_member_id'], member['id'])
                self.assertEqual(task['household_id'], group['id'])
                self.assertEqual(str(task['due_time']), '12:30:00')
                self.assertTrue(task['done'])
                self.assertIsNone(task['done_at'])
                self.assertLessEqual(len(group['invite_code']), 20)
                self.assertEqual(db.execute(text('PRAGMA foreign_key_check')).all(), [])
        finally:
            engine.dispose()

    def test_plan_is_read_only_and_never_overwrites_existing_target(self):
        before = self.source.read_bytes()
        self.assertEqual(len(plan(self.source)['users']), 1)
        self.assertFalse(self.target.exists())
        with self.assertRaises(ValueError):
            migrate(self.source, self.source)
        self.assertEqual(self.source.read_bytes(), before)

    def test_shared_account_notification_keeps_ownership(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript('CREATE TABLE notifications (id INTEGER, user_id INTEGER); INSERT INTO notifications VALUES (1, 1);')
        self.assertEqual(plan(self.source)['notifications'][0]['user_id'], 1)

    def test_missing_tenant_role_does_not_assign_household_to_landlord(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("DELETE FROM user_roles WHERE role = 'tenant'")
            db.commit()
        with self.assertRaisesRegex(ValueError, 'no tenant account'):
            plan(self.source)
