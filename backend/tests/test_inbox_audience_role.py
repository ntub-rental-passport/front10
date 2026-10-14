import unittest
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from auth.security import CurrentUser
from db.models import InboxMessage, User, UserRole
from notifications import inbox_service as inbox
from notifications import scheduled_notification_service as scheduled
from notifications.user_notify import notify_user
from routers.inbox_api import my_inbox
from tests.admin_store import AdminStoreTestCase
from tests.test_inbox import InboxTestCase


class BusinessAudienceTests(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.user = User(email='both@example.com', roles=[UserRole(role='tenant'), UserRole(role='landlord')])
        self.db.add(self.user)
        self.db.commit()
        self.fields = dict(title='通知', body='內容', category='系統', source_label='測試', created_by='system')

    def send(self, audience_role, title='通知'):
        return notify_user(self.db, self.user, **{**self.fields, 'title': title}, audience_role=audience_role)

    def test_audience_role_is_required_and_keyword_only(self):
        with self.assertRaises(TypeError):
            notify_user(self.db, self.user, **self.fields)
        with self.assertRaises(TypeError):
            notify_user(self.db, self.user, 'tenant', **self.fields)
        self.assertEqual(self.db.query(InboxMessage).count(), 0)

    def test_invalid_audience_role_is_rejected(self):
        for role in ('admin', 'user', 'all', '', 1):
            with self.subTest(role=role):
                with self.assertRaises(ValueError):
                    self.send(role)
        self.assertEqual(self.db.query(InboxMessage).count(), 0)

    def test_valid_audience_roles_are_persisted(self):
        for role in ('tenant', 'landlord', None):
            with self.subTest(role=role):
                message = self.send(role)
                self.db.commit()
                self.db.refresh(message)
                self.assertEqual(message.audience_role, role)

    def test_dual_role_account_sees_only_current_role_messages_through_api(self):
        self.send('tenant', title='租客通知')
        self.send('landlord', title='房東通知')
        self.db.commit()
        self.assertEqual({role.role for role in self.user.roles}, {'tenant', 'landlord'})
        for role, title in (('tenant', '租客通知'), ('landlord', '房東通知')):
            with self.subTest(role=role):
                user = CurrentUser(id=self.user.id, email=self.user.email, role=role)
                self.assertEqual([m['title'] for m in my_inbox(user=user)['messages']], [title])
                self.assertEqual([m['title'] for m in inbox.user_inbox(self.user.id, role)], [title])

    def test_legacy_unlabelled_message_is_visible_to_both_roles(self):
        self.db.add(InboxMessage(
            id='legacy', batch_id='legacy-batch', user_id=self.user.id, user_email=self.user.email,
            **self.fields, channels='["inapp"]', inapp_state='sent', recipient_label='本人',
            source_type='landlord', created_at='2026-10-14T00:00:00Z',
        ))
        self.db.commit()
        for role in ('tenant', 'landlord'):
            with self.subTest(role=role):
                self.assertEqual([m['id'] for m in inbox.user_inbox(self.user.id, role)], ['legacy'])

    def test_admin_sees_only_unlabelled_messages(self):
        self.user.roles.append(UserRole(role='admin'))
        self.send('tenant', title='租客通知')
        self.send('landlord', title='房東通知')
        self.send(None, title='共用通知')
        self.db.commit()
        user = CurrentUser(id=self.user.id, email=self.user.email, role='admin')
        self.assertEqual([m['title'] for m in my_inbox(user=user)['messages']], ['共用通知'])


class BatchAudienceTests(InboxTestCase):
    def assert_batch_audience(self, recipient, expected):
        batch = self.send(recipient)
        with inbox._open() as db:
            rows = db.execute('SELECT audience_role FROM inbox_messages WHERE batch_id = ?',
                              (batch['batchId'],)).fetchall()
        self.assertEqual(len(rows), batch['recipientCount'])
        self.assertEqual({row['audience_role'] for row in rows}, {expected})

    def test_tenant_broadcast_is_tenant_only(self):
        self.assert_batch_audience({'kind': 'role', 'role': 'user'}, 'tenant')

    def test_landlord_broadcast_is_landlord_only(self):
        self.assert_batch_audience({'kind': 'role', 'role': 'landlord'}, 'landlord')

    def test_all_roles_broadcast_is_unlabelled(self):
        self.assert_batch_audience({'kind': 'role', 'role': 'all'}, None)

    def test_named_accounts_are_unlabelled_regardless_of_roles(self):
        self.assert_batch_audience(
            {'kind': 'users', 'emails': ['tenant@example.com', 'landlord@example.com',
                                        'both@example.com', 'admin@example.com']}, None,
        )


class ScheduledAudienceTests(InboxTestCase):
    def assert_scheduled_audience(self, recipient, expected):
        due = datetime.now(scheduled.TZ) + timedelta(hours=1)
        item = scheduled.create('admin@example.com', {
            'title': '排程通知', 'body': '內容', 'category': '系統', 'channels': ['inapp'],
            'recipient': recipient, 'scheduledAt': due.isoformat(),
        })
        self.assertEqual(scheduled.dispatch_due(now=due + timedelta(minutes=1)), 1)
        with inbox._open() as db:
            rows = db.execute('SELECT user_id, audience_role FROM inbox_messages WHERE batch_id = ?',
                              (f'sched-{item["id"]}',)).fetchall()
        self.assertEqual({row['user_id'] for row in rows},
                         {account['id'] for account in inbox.resolve_recipients(recipient)})
        self.assertEqual({row['audience_role'] for row in rows}, {expected})

    def test_tenant_schedule_is_tenant_only(self):
        self.assert_scheduled_audience({'kind': 'role', 'role': 'user'}, 'tenant')

    def test_landlord_schedule_is_landlord_only(self):
        self.assert_scheduled_audience({'kind': 'role', 'role': 'landlord'}, 'landlord')

    def test_all_roles_schedule_is_unlabelled(self):
        self.assert_scheduled_audience({'kind': 'role', 'role': 'all'}, None)

    def test_named_accounts_schedule_is_unlabelled(self):
        self.assert_scheduled_audience({'kind': 'users', 'emails': ['both@example.com', 'admin@example.com']}, None)


if __name__ == '__main__':
    unittest.main()
