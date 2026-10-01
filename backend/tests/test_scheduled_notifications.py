import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from tests.admin_store import AdminStoreTestCase
from notifications import scheduled_notification_service as service


class ScheduledNotificationTests(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        # 一定要 patch 環境變數而不是模組常數：service 用的是「呼叫時才讀」，
        # 這樣每個測試才會拿到自己的暫存 DB，不會互相污染。
        self.env = patch.dict(os.environ, {
            'ADMIN_SCHEDULE_DB': self.temp.name + '/schedule.db',
            # 寄送失敗、錯過會寫進監控事件紀錄 —— 不指到暫存檔的話會寫進真的 monitoring.db
            'MONITOR_DB': self.temp.name + '/monitoring.db',
            # 寄送結果也會寫進稽核紀錄，同理
            # 寄送失敗、錯過也會通知管理員，同理
            'ADMIN_NOTIFICATIONS_DB': self.temp.name + '/admin-notifications.db',
            'SMTP_USERNAME': 'sender@example.com',
            'SMTP_APP_PASSWORD': 'app-password',
        })
        self.env.start()
        self.sent: list[tuple[str, str, str]] = []

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    # -------------------- helpers --------------------

    #: 測試用的預設排程時間。dispatch() 預設在這之後一分鐘跑 ——
    #: 不能隨便加幾小時，超過 MISSED_AFTER 的話每一筆都會先被標成 missed，
    #: 於是「沒有寄出」的測試會因為錯誤的理由而通過。
    LEAD = timedelta(hours=2)

    def values(self, **over):
        due = datetime.now(service.TZ) + self.LEAD
        return {
            'title': '系統維護預告',
            'body': '系統將於今晚進行維護。',
            'category': '系統',
            'channels': ['email'],
            'recipient': {'kind': 'role', 'role': 'user'},
            'recipientLabel': '全部租客',
            'sourceLabel': '系統維護預告',
            'scheduledAt': due.isoformat(),
            **over,
        }

    def create(self, **over):
        return service.create('admin@example.com', self.values(**over))

    def fake_send(self, address, title, body):
        self.sent.append((address, title, body))

    def dispatch(self, at=None, emails=('a@example.com', 'b@example.com'), send=None):
        return service.dispatch_due(
            now=at or datetime.now(service.TZ) + self.LEAD + timedelta(minutes=1),
            resolve=lambda recipient: list(emails),
            send_email=send or self.fake_send,
        )

    def status_of(self, identifier):
        return next(row for row in service.list_all() if row['id'] == identifier)['status']

    # -------------------- 建立與驗證 --------------------

    def test_created_schedule_is_pending_and_listed(self):
        item = self.create()
        self.assertEqual(item['status'], 'pending')
        self.assertEqual(item['recipientLabel'], '全部租客')
        self.assertEqual([row['id'] for row in service.list_all()], [item['id']])

    def test_past_time_is_rejected(self):
        past = (datetime.now(service.TZ) - timedelta(minutes=1)).isoformat()
        with self.assertRaises(ValueError):
            self.create(scheduledAt=past)

    def test_more_than_a_year_ahead_is_rejected(self):
        far = (datetime.now(service.TZ) + timedelta(days=400)).isoformat()
        with self.assertRaises(ValueError):
            self.create(scheduledAt=far)

    def test_empty_content_is_rejected(self):
        with self.assertRaises(ValueError):
            self.create(title='   ')
        with self.assertRaises(ValueError):
            self.create(body='')

    def test_channels_the_backend_cannot_deliver_are_rejected(self):
        # 推播後端送不出去。悄悄收下再不送，就是這個功能要避免的謊。
        with self.assertRaises(ValueError):
            self.create(channels=['push'])
        with self.assertRaises(ValueError):
            self.create(channels=['email', 'push'])
        with self.assertRaises(ValueError):
            self.create(channels=[])

    def test_email_channel_requires_smtp_to_be_configured(self):
        with patch.dict(os.environ, {'SMTP_USERNAME': '', 'SMTP_APP_PASSWORD': ''}):
            with self.assertRaises(ValueError):
                self.create()

    def test_bad_recipient_condition_is_rejected(self):
        with self.assertRaises(ValueError):
            self.create(recipient={'kind': 'role', 'role': 'admin'})
        with self.assertRaises(ValueError):
            self.create(recipient={'kind': 'users', 'emails': []})

    def test_named_recipients_are_not_exposed_in_the_listing(self):
        item = self.create(recipient={'kind': 'users', 'emails': ['a@example.com', 'b@example.com']})
        self.assertEqual(item['recipient'], {'kind': 'users', 'count': 2})
        self.assertNotIn('emails', item['recipient'])

    # -------------------- 取消 --------------------

    def test_pending_can_be_cancelled_and_is_then_not_dispatched(self):
        item = self.create()
        service.cancel(item['id'])
        self.assertEqual(self.status_of(item['id']), 'cancelled')
        self.assertEqual(self.dispatch(), 0)
        self.assertEqual(self.sent, [])

    def test_cancelling_twice_reports_the_real_state(self):
        item = self.create()
        service.cancel(item['id'])
        with self.assertRaises(ValueError):
            service.cancel(item['id'])

    def test_cancelling_an_unknown_id_raises_lookup_error(self):
        with self.assertRaises(LookupError):
            service.cancel('does-not-exist')

    # -------------------- 送出 --------------------

    def test_due_schedule_is_sent_once_to_every_recipient(self):
        item = self.create()
        self.assertEqual(self.dispatch(), 1)
        self.assertEqual([address for address, _, _ in self.sent], ['a@example.com', 'b@example.com'])
        row = next(r for r in service.list_all() if r['id'] == item['id'])
        self.assertEqual(row['status'], 'sent')
        self.assertEqual(row['result']['email'], {'sent': 2, 'failed': 0})
        self.assertIsNotNone(row['sentAt'])

    def test_schedule_before_its_time_is_left_alone(self):
        self.create()
        self.assertEqual(self.dispatch(at=datetime.now(service.TZ)), 0)
        self.assertEqual(self.sent, [])

    def test_a_second_dispatch_does_not_send_again(self):
        # 原子認領：同一筆不會因為排程器跑兩輪（或兩個 worker）而寄兩次。
        self.create()
        self.dispatch()
        self.sent.clear()
        self.assertEqual(self.dispatch(), 0)
        self.assertEqual(self.sent, [])

    def test_long_downtime_marks_as_missed_instead_of_sending_late(self):
        # 半夜兩點的維護公告，早上九點才寄出去比沒寄更糟。
        item = self.create()
        late = datetime.now(service.TZ) + self.LEAD + service.MISSED_AFTER + timedelta(minutes=1)
        self.assertEqual(self.dispatch(at=late), 0)
        self.assertEqual(self.status_of(item['id']), 'missed')
        self.assertEqual(self.sent, [])

    def test_short_delay_still_sends(self):
        item = self.create()
        slightly_late = datetime.now(service.TZ) + self.LEAD + timedelta(minutes=1)
        self.assertEqual(self.dispatch(at=slightly_late), 1)
        self.assertEqual(self.status_of(item['id']), 'sent')

    def test_one_bad_address_does_not_stop_the_batch(self):
        item = self.create()

        def flaky(address, title, body):
            if address == 'a@example.com':
                raise RuntimeError('mailbox full')
            self.sent.append((address, title, body))

        self.dispatch(send=flaky)
        row = next(r for r in service.list_all() if r['id'] == item['id'])
        self.assertEqual(row['result']['email'], {'sent': 1, 'failed': 1})
        # 有人收到了，所以整批不是「失敗」，但失敗數要看得到
        self.assertEqual(row['status'], 'sent')

    def test_everyone_failing_marks_the_batch_failed(self):
        item = self.create()

        def always_fail(address, title, body):
            raise RuntimeError('smtp down')

        self.dispatch(send=always_fail)
        row = next(r for r in service.list_all() if r['id'] == item['id'])
        self.assertEqual(row['status'], 'failed')
        self.assertEqual(row['result']['email'], {'sent': 0, 'failed': 2})

    def test_resolution_failure_marks_the_batch_failed_rather_than_sent(self):
        item = self.create()

        def broken_resolve(recipient):
            raise RuntimeError('database down')

        service.dispatch_due(
            now=datetime.now(service.TZ) + self.LEAD + timedelta(minutes=1),
            resolve=broken_resolve,
            send_email=self.fake_send,
        )
        self.assertEqual(self.status_of(item['id']), 'failed')
        self.assertEqual(self.sent, [])

    def test_recipients_are_resolved_at_send_time_not_at_schedule_time(self):
        # 「全部租客」指的是送出那一刻的全部租客，排程期間新加入的人也該收到。
        self.create()
        self.dispatch(emails=['new-tenant@example.com'])
        self.assertEqual([address for address, _, _ in self.sent], ['new-tenant@example.com'])

    # -------------------- 站內（2026-09-30 起） --------------------

    ACCOUNTS = [
        {'id': 1, 'email': 'a@example.com', 'status': 'active', 'roles': {'tenant'}},
        {'id': 2, 'email': 'b@example.com', 'status': 'active', 'roles': {'landlord'}},
        {'id': 3, 'email': 'admin@example.com', 'status': 'active', 'roles': {'admin', 'tenant'}},
    ]

    def test_all_tenants_really_finds_the_tenants(self):
        # 前端送 user，資料庫存 tenant。以前直接拿 user 比對，「全部租客」永遠是 0 人
        from notifications import inbox_service

        with patch.object(inbox_service, '_load_accounts', return_value=self.ACCOUNTS):
            self.assertEqual(service._default_resolve({'kind': 'role', 'role': 'user'}), ['a@example.com'])
            self.assertEqual(service._default_resolve({'kind': 'role', 'role': 'all'}), ['a@example.com', 'b@example.com'])

    def test_inapp_schedule_lands_in_the_inbox_with_the_email_results(self):
        from notifications import inbox_service

        with patch.dict(os.environ, {'NOTIFICATION_INBOX_DB': self.temp.name + '/inbox.db'}), \
                patch.object(inbox_service, '_load_accounts', return_value=self.ACCOUNTS):
            item = self.create(channels=['inapp', 'email'])

            def fail_for_b(address, title, body):
                if address == 'b@example.com':
                    raise OSError('mailbox unavailable')

            self.dispatch(send=fail_for_b)
            messages = inbox_service.list_messages()
            row = next(r for r in service.list_all() if r['id'] == item['id'])

        self.assertEqual(
            sorted((m['userEmail'], m['deliveryStatus']['inapp'], m['deliveryStatus']['email']) for m in messages),
            [('a@example.com', 'sent', 'sent'), ('b@example.com', 'sent', 'failed')],
        )
        self.assertEqual({m['batchId'] for m in messages}, {f"sched-{item['id']}"})
        self.assertEqual(row['status'], 'sent')
        self.assertEqual(row['result']['inapp'], {'sent': 2})

    def test_inapp_only_schedule_is_audited_by_inbox_count(self):
        from admin import audit_service

        self.create(channels=['inapp'])
        service.dispatch_due(
            now=datetime.now(service.TZ) + self.LEAD + timedelta(minutes=1),
            resolve=lambda recipient: ['a@example.com'],
            send_email=self.fake_send,
            deliver_inapp=lambda emails, row, states: len(emails),
        )
        self.assertEqual(self.sent, [])
        self.assertIn('站內送到 1 人', [e['detail'] for e in audit_service.list_events()])

    # -------------------- capabilities --------------------

    def test_capabilities_says_why_a_channel_is_unavailable(self):
        caps = service.capabilities()
        self.assertTrue(caps['email'])
        # 收件匣搬到後端之後，站內排程也送得到了
        self.assertTrue(caps['inapp'])
        self.assertFalse(caps['push'])
        self.assertIn('訂閱', caps['unsupportedReason']['push'])


    # -------------------- 監控事件 --------------------

    def monitor_kinds(self):
        from admin import monitoring_service
        return [(e['kind'], e['detail']) for e in reversed(monitoring_service.list_events())]

    def test_missed_schedule_is_recorded_once_in_the_monitor_log(self):
        self.create(title='凌晨維護公告')
        late = datetime.now(service.TZ) + self.LEAD + service.MISSED_AFTER + timedelta(minutes=1)
        self.dispatch(at=late)
        self.dispatch(at=late)  # 第二輪不會再記一次
        self.assertEqual(self.monitor_kinds(), [('notification-missed', '「凌晨維護公告」')])

    def test_partial_failure_is_recorded_with_the_count(self):
        self.create(title='續約提醒')

        def flaky(address, title, body):
            if address == 'a@example.com':
                raise RuntimeError('mailbox full')

        self.dispatch(send=flaky)
        self.assertEqual(self.monitor_kinds(), [('notification-failed', '「續約提醒」：1 人寄送失敗')])

    def test_successful_send_records_nothing(self):
        self.create()
        self.dispatch()
        self.assertEqual(self.monitor_kinds(), [])

    # -------------------- 稽核紀錄 --------------------

    def audit_of(self, item):
        from admin import audit_service
        return [
            (e['actor'], e['detail'])
            for e in reversed(audit_service.list_events(subject=f"scheduled:{item['id']}"))
        ]

    def test_successful_send_is_audited_with_the_count(self):
        # 監控只記失敗；稽核要記完整的一段：誰排的之後，還有「寄給了幾個人」
        item = self.create()
        self.dispatch()
        self.assertEqual(self.audit_of(item), [('system', '已寄出給 2 人')])

    def test_partial_and_total_failures_are_audited(self):
        partial = self.create(title='續約提醒')

        def flaky(address, title, body):
            if address == 'a@example.com':
                raise RuntimeError('mailbox full')

        self.dispatch(send=flaky)
        self.assertEqual(self.audit_of(partial), [('system', '寄出 1 人，1 人失敗')])

        total = self.create(title='繳費提醒')

        def broken(address, title, body):
            raise RuntimeError('smtp down')

        self.dispatch(send=broken)
        self.assertEqual(self.audit_of(total), [('system', '全部 2 人寄送失敗')])

    def test_missed_schedule_is_audited_once(self):
        item = self.create()
        late = datetime.now(service.TZ) + self.LEAD + service.MISSED_AFTER + timedelta(minutes=1)
        self.dispatch(at=late)
        self.dispatch(at=late)
        self.assertEqual(self.audit_of(item), [('system', '錯過預定時間，沒有寄出（後端當時沒有在執行）')])

    def test_nobody_to_send_to_is_audited_as_not_sent(self):
        # 「已寄出給 0 人」會被讀成寄成功了
        item = self.create()
        self.dispatch(emails=())
        self.assertEqual(self.audit_of(item), [('system', '沒有符合條件的收件人，沒有寄出')])


if __name__ == '__main__':
    unittest.main()
