import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import scheduled_notification_service as service


class ScheduledNotificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        # 一定要 patch 環境變數而不是模組常數：service 用的是「呼叫時才讀」，
        # 這樣每個測試才會拿到自己的暫存 DB，不會互相污染。
        self.env = patch.dict(os.environ, {
            'ADMIN_SCHEDULE_DB': self.temp.name + '/schedule.db',
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
        # 站內與推播後端送不出去。悄悄收下再不送，就是這個功能要避免的謊。
        with self.assertRaises(ValueError):
            self.create(channels=['inapp'])
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

    # -------------------- capabilities --------------------

    def test_capabilities_says_why_a_channel_is_unavailable(self):
        caps = service.capabilities()
        self.assertTrue(caps['email'])
        self.assertFalse(caps['inapp'])
        self.assertIn('瀏覽器', caps['unsupportedReason']['inapp'])


if __name__ == '__main__':
    unittest.main()
