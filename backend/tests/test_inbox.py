import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from fastapi import BackgroundTasks, HTTPException

from tests.admin_store import AdminStoreTestCase
from admin import audit_service
from auth.security import CurrentUser
from notifications import inbox_service as inbox

ACCOUNTS = [
    {'id': 1, 'email': 'tenant@example.com', 'status': 'active', 'roles': {'tenant'}},
    {'id': 2, 'email': 'landlord@example.com', 'status': 'active', 'roles': {'landlord'}},
    {'id': 3, 'email': 'both@example.com', 'status': 'active', 'roles': {'tenant', 'landlord'}},
    {'id': 4, 'email': 'admin@example.com', 'status': 'active', 'roles': {'admin'}},
    {'id': 5, 'email': 'suspended@example.com', 'status': 'suspended', 'roles': {'tenant'}},
    {'id': 6, 'email': 'admin-tenant@example.com', 'status': 'active', 'roles': {'admin', 'tenant'}},
]

def message(**overrides):
    values = {
        'title': '停水通知', 'body': '週六停水', 'category': '系統', 'channels': ['inapp'],
        'recipientLabel': '全部使用者', 'sourceLabel': '一次性撰寫', 'actionUrl': None, 'actionLabel': None,
    }
    values.update(overrides)
    return values

class InboxTestCase(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'NOTIFICATION_INBOX_DB': self.temp.name + '/inbox.db',
            'MONITOR_DB': self.temp.name + '/monitor.db',
            'SMTP_USERNAME': 'sender@example.com',
            'SMTP_APP_PASSWORD': 'app-password',
        })
        self.env.start()
        self.accounts = patch.object(inbox, '_load_accounts', return_value=ACCOUNTS)
        self.accounts.start()

    def tearDown(self):
        self.accounts.stop()
        self.env.stop()
        self.temp.cleanup()

    def send(self, recipient, **overrides):
        return inbox.create_batch(message(**overrides), recipient, actor='admin@example.com')

class RecipientTests(InboxTestCase):
    def emails(self, recipient):
        return [account['email'] for account in inbox.resolve_recipients(recipient)]

    def test_everyone_means_active_non_admin_users(self):
        self.assertEqual(
            self.emails({'kind': 'role', 'role': 'all'}),
            ['both@example.com', 'landlord@example.com', 'tenant@example.com'],
        )

    def test_tenants_are_stored_as_tenant_even_though_the_page_sends_user(self):
        # 前端「全部租客」送的是 user，資料庫存的是 tenant；以前這樣比對永遠找不到人
        self.assertEqual(self.emails({'kind': 'role', 'role': 'user'}), ['both@example.com', 'tenant@example.com'])
        self.assertEqual(self.emails({'kind': 'role', 'role': 'landlord'}), ['both@example.com', 'landlord@example.com'])

    def test_named_users_are_sent_as_picked_ignoring_case(self):
        self.assertEqual(self.emails({'kind': 'users', 'emails': ['ADMIN@example.com']}), ['admin@example.com'])

    def test_unknown_or_suspended_named_users_are_rejected(self):
        for emails, fragment in [
            (['nobody@example.com'], 'nobody@example.com'),
            (['suspended@example.com'], 'suspended@example.com'),
            ([], '至少選擇一位'),
        ]:
            with self.subTest(emails=emails):
                with self.assertRaises(ValueError) as caught:
                    inbox.resolve_recipients({'kind': 'users', 'emails': emails})
                self.assertIn(fragment, str(caught.exception))

    def test_bad_condition_is_rejected(self):
        with self.assertRaises(ValueError):
            inbox.resolve_recipients({'kind': 'role', 'role': 'admin'})

class SendTests(InboxTestCase):
    def test_every_recipient_gets_a_message_and_the_send_is_audited(self):
        result = self.send({'kind': 'role', 'role': 'user'})
        self.assertEqual(result['recipientCount'], 2)
        messages = inbox.list_messages()
        self.assertEqual(sorted(m['userEmail'] for m in messages), ['both@example.com', 'tenant@example.com'])
        self.assertEqual({m['batchId'] for m in messages}, {result['batchId']})
        self.assertEqual(messages[0]['deliveryStatus'], {'inapp': 'sent'})
        self.assertEqual(
            [(e['action'], e['target'], e['detail']) for e in audit_service.list_events()],
            [('通知管理', '一次性撰寫', '發送給 2 位使用者')],
        )

    def test_email_starts_pending_and_push_stays_pending(self):
        self.send({'kind': 'users', 'emails': ['tenant@example.com']}, channels=['inapp', 'email', 'push'])
        self.assertEqual(inbox.list_messages()[0]['deliveryStatus'], {'inapp': 'sent', 'email': 'pending', 'push': 'pending'})

    def test_invalid_messages_are_rejected(self):
        for overrides, fragment in [
            ({'title': ' '}, '標題'),
            ({'category': '行銷'}, '分類'),
            ({'channels': []}, '至少選'),
            ({'channels': ['sms']}, '管道'),
            ({'actionUrl': 'javascript:alert(1)'}, '按鈕連結'),
        ]:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError) as caught:
                    self.send({'kind': 'role', 'role': 'all'}, **overrides)
                self.assertIn(fragment, str(caught.exception))
        self.assertEqual(inbox.list_messages(), [])

    def test_email_needs_smtp(self):
        with patch.dict(os.environ, {'SMTP_USERNAME': '', 'SMTP_APP_PASSWORD': ''}):
            with self.assertRaises(ValueError) as caught:
                self.send({'kind': 'role', 'role': 'all'}, channels=['email'])
        self.assertIn('SMTP', str(caught.exception))

    def test_nobody_matching_is_rejected_instead_of_sending_an_empty_batch(self):
        with patch.object(inbox, '_load_accounts', return_value=[ACCOUNTS[3]]):
            with self.assertRaises(ValueError) as caught:
                self.send({'kind': 'role', 'role': 'all'})
        self.assertIn('沒有符合條件', str(caught.exception))

class EmailTests(InboxTestCase):
    def test_pending_emails_are_sent_once_and_each_result_is_kept(self):
        batch = self.send({'kind': 'role', 'role': 'all'}, channels=['inapp', 'email'])
        sent_to = []

        def fake_send(address, title, body):
            if address == 'landlord@example.com':
                raise OSError('mailbox unavailable')
            sent_to.append((address, title))

        self.assertEqual(inbox.send_pending_emails(batch['batchId'], send_email=fake_send), {'sent': 2, 'failed': 1})
        statuses = {m['userEmail']: m['deliveryStatus']['email'] for m in inbox.list_messages()}
        self.assertEqual(statuses, {'both@example.com': 'sent', 'landlord@example.com': 'failed', 'tenant@example.com': 'sent'})
        self.assertEqual(sorted(sent_to), [('both@example.com', '停水通知'), ('tenant@example.com', '停水通知')])
        # 再跑一次不會重寄
        self.assertEqual(inbox.send_pending_emails(batch['batchId'], send_email=fake_send), {'sent': 0, 'failed': 0})
        self.assertIn(('通知管理', '一次性撰寫', 'Email：寄出 2 人，1 人失敗'),
                      [(e['action'], e['target'], e['detail']) for e in audit_service.list_events()])

class UserInboxTests(InboxTestCase):
    def test_users_only_see_their_own_messages_newest_first(self):
        self.send({'kind': 'users', 'emails': ['tenant@example.com']}, title='第一則')
        self.send({'kind': 'users', 'emails': ['tenant@example.com', 'landlord@example.com']}, title='第二則')
        self.assertEqual([m['title'] for m in inbox.user_inbox(1)], ['第二則', '第一則'])
        self.assertEqual([m['title'] for m in inbox.user_inbox(2)], ['第二則'])
        self.assertNotIn('userEmail', inbox.user_inbox(1)[0])

    def test_marking_read_only_touches_your_own_messages(self):
        self.send({'kind': 'users', 'emails': ['tenant@example.com', 'landlord@example.com']})
        mine = inbox.user_inbox(1)[0]['id']
        theirs = inbox.user_inbox(2)[0]['id']
        with self.assertRaises(LookupError):
            inbox.mark_read(1, theirs)
        inbox.mark_read(1, mine)
        self.assertTrue(inbox.user_inbox(1)[0]['read'])
        self.assertFalse(inbox.user_inbox(2)[0]['read'])

    def test_mark_all_read_covers_messages_and_the_given_announcements(self):
        self.send({'kind': 'users', 'emails': ['tenant@example.com']})
        inbox.mark_all_read(1, ['an-1', 'an-2'])
        self.assertTrue(all(m['read'] for m in inbox.user_inbox(1)))
        self.assertEqual(inbox.announcement_state(1)['readAnnouncementIds'], ['an-1', 'an-2'])

    def test_announcement_states_are_per_user_and_idempotent(self):
        inbox.mark_announcement_read(1, 'an-1')
        inbox.mark_announcement_read(1, 'an-1')
        inbox.dismiss_announcement(1, 'an-1:2026-09-01T00:00:00.000Z')
        self.assertEqual(inbox.announcement_state(1), {
            'readAnnouncementIds': ['an-1'],
            'dismissedAnnouncementKeys': ['an-1:2026-09-01T00:00:00.000Z'],
        })
        self.assertEqual(inbox.announcement_state(2), {'readAnnouncementIds': [], 'dismissedAnnouncementKeys': []})

class ApiTests(InboxTestCase):
    admin = MagicMock(email='admin@example.com')
    tenant = CurrentUser(id=1, email='tenant@example.com', role='tenant')

    def test_send_queues_the_emails_in_the_background(self):
        from routers.inbox_api import send_notification

        tasks = BackgroundTasks()
        result = send_notification(tasks, {**message(channels=['email']), 'recipient': {'kind': 'role', 'role': 'all'}},
                                   admin=self.admin)
        self.assertEqual(result['recipientCount'], 3)
        self.assertEqual(len(tasks.tasks), 1)

    def test_send_without_email_needs_no_background_work(self):
        from routers.inbox_api import send_notification

        tasks = BackgroundTasks()
        send_notification(tasks, {**message(), 'recipient': {'kind': 'role', 'role': 'all'}}, admin=self.admin)
        self.assertEqual(tasks.tasks, [])

    def test_bad_send_is_a_400(self):
        from routers.inbox_api import send_notification

        with self.assertRaises(HTTPException) as caught:
            send_notification(BackgroundTasks(), {**message(), 'recipient': {'kind': 'users', 'emails': ['nobody@example.com']}},
                              admin=self.admin)
        self.assertEqual(caught.exception.status_code, 400)

    def test_inbox_endpoints_work_for_the_logged_in_user(self):
        from routers.inbox_api import my_inbox, read_all, read_message

        self.send({'kind': 'users', 'emails': ['tenant@example.com']})
        body = my_inbox(user=self.tenant)
        self.assertEqual(set(body), {'messages', 'readAnnouncementIds', 'dismissedAnnouncementKeys'})
        read_message(body['messages'][0]['id'], user=self.tenant)
        self.assertTrue(my_inbox(user=self.tenant)['messages'][0]['read'])
        read_all({'announcementIds': ['an-1']}, user=self.tenant)
        self.assertEqual(my_inbox(user=self.tenant)['readAnnouncementIds'], ['an-1'])

    def test_someone_elses_message_is_a_404(self):
        from routers.inbox_api import read_message

        self.send({'kind': 'users', 'emails': ['landlord@example.com']})
        theirs = inbox.user_inbox(2)[0]['id']
        with self.assertRaises(HTTPException) as caught:
            read_message(theirs, user=self.tenant)
        self.assertEqual(caught.exception.status_code, 404)

if __name__ == '__main__':
    unittest.main()
