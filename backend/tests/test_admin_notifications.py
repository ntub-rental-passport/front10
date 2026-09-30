import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from admin import admin_notifications as center
from admin import audit_service, monitoring_service


class CenterTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'ADMIN_NOTIFICATIONS_DB': self.temp.name + '/center.db',
            'ADMIN_AUDIT_DB': self.temp.name + '/audit.db',
            'MONITOR_DB': self.temp.name + '/monitor.db',
            'ADMIN_SCHEDULE_DB': self.temp.name + '/schedule.db',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def titles(self, admin_id=1):
        return [item['title'] for item in center.list_for(admin_id)]


class StoreTests(CenterTestCase):
    def test_alerts_are_shared_but_read_state_is_per_admin(self):
        center.record_alert('OCR 服務連不上', '連線逾時。', action_url='/admin/monitoring', action_label='查看監控')
        first = center.list_for(1)[0]
        self.assertEqual((first['source'], first['read']), ('alert', False))
        self.assertEqual(first['actionUrl'], '/admin/monitoring')
        center.mark_read(1, first['id'])
        self.assertTrue(center.list_for(1)[0]['read'])
        # 另一位管理員還沒看過
        self.assertFalse(center.list_for(2)[0]['read'])

    def test_unread_and_read_all(self):
        center.record_alert('A', 'a')
        center.record_alert('B', 'b')
        newest = center.list_for(1)[0]['id']
        center.mark_all_read(1)
        self.assertTrue(all(item['read'] for item in center.list_for(1)))
        center.mark_unread(1, newest)
        self.assertEqual([item['read'] for item in center.list_for(1)], [False, True])

    def test_newest_first(self):
        center.record_alert('舊的', 'x')
        center.record_alert('新的', 'x')
        self.assertEqual(self.titles(), ['新的', '舊的'])

    def test_unknown_id_raises_lookup_error(self):
        with self.assertRaises(LookupError):
            center.mark_read(1, 'missing')
        with self.assertRaises(LookupError):
            center.mark_unread(1, 'missing')

    def test_notes_record_the_sender_and_are_audited(self):
        note = center.add_note(' 明天停機 ', ' 早上 9 點要重新部署 ', sender_email='a@example.com', sender_name='系統管理員')
        self.assertEqual((note['source'], note['title'], note['senderName']), ('admin-note', '明天停機', '系統管理員'))
        self.assertEqual(
            [(e['actor'], e['action'], e['target'], e['detail']) for e in audit_service.list_events()],
            [('a@example.com', '通知中心', '內部備註', '發送備註「明天停機」')],
        )

    def test_notes_need_a_title_and_a_body(self):
        for title, body in [(' ', '內容'), ('標題', ''), ('x' * 101, '內容')]:
            with self.subTest(title=title, body=body):
                with self.assertRaises(ValueError):
                    center.add_note(title, body, sender_email='a@example.com', sender_name='a')

    def test_a_broken_alert_store_never_breaks_the_caller(self):
        # 告警是附帶的：寫不進去只記 log，不能讓監控或寄信本身跟著失敗
        with patch.object(center, '_open', side_effect=OSError('disk full')), \
                self.assertLogs('admin.admin_notifications', level='ERROR'):
            center.record_alert('x', 'y')


class AlertSourceTests(CenterTestCase):
    def test_service_down_and_recovered_raise_alerts_once(self):
        with patch.dict(monitoring_service.PROBES, {'ocr': lambda: (False, '連線逾時')}, clear=True):
            monitoring_service.run_checks(now=1000.0)
            monitoring_service.run_checks(now=1060.0)  # 還是壞的：不再通知一次
        with patch.dict(monitoring_service.PROBES, {'ocr': lambda: (True, None)}, clear=True):
            monitoring_service.run_checks(now=1000.0 + 3 * 3600 + 20 * 60)
        items = center.list_for(1)
        self.assertEqual([item['title'] for item in items], ['OCR 服務已恢復', 'OCR 服務連不上'])
        self.assertIn('連線逾時', items[1]['body'])
        self.assertIn('3 小時 20 分', items[0]['body'])

    def test_backend_downtime_is_not_an_alert(self):
        # 每次部署、主機休眠都會記一筆停機，發成告警只會把真正的問題淹掉
        monitoring_service.heartbeat(now=1000.0)
        monitoring_service.heartbeat(now=5000.0)
        self.assertEqual(center.list_for(1), [])

    def test_scheduled_notification_failures_raise_alerts(self):
        from notifications import scheduled_notification_service as scheduled

        scheduled._record_monitor_event('notification-failed', '「系統維護預告」：3 人寄送失敗')
        scheduled._record_monitor_event('notification-missed', '「颱風停班」')
        self.assertEqual(self.titles(), ['排程通知錯過預定時間', '排程通知寄送失敗'])
        self.assertEqual(center.list_for(1)[0]['actionUrl'], '/admin/notifications?tab=schedule')


class ApiTests(CenterTestCase):
    admin = MagicMock(id=1, email='a@example.com', display_name='系統管理員')

    def test_list_and_mark(self):
        from routers.admin_notifications_api import list_notifications, read_all, read_one, unread_one

        center.record_alert('A', 'a')
        item = list_notifications(admin=self.admin)[0]
        read_one(item['id'], admin=self.admin)
        self.assertTrue(list_notifications(admin=self.admin)[0]['read'])
        unread_one(item['id'], admin=self.admin)
        self.assertFalse(list_notifications(admin=self.admin)[0]['read'])
        read_all(admin=self.admin)
        self.assertTrue(list_notifications(admin=self.admin)[0]['read'])

    def test_note_uses_the_admins_name_and_rejects_empty_input(self):
        from routers.admin_notifications_api import send_note

        note = send_note({'title': '交接', 'body': '記得看監控'}, admin=self.admin)
        self.assertEqual(note['senderName'], '系統管理員')
        # 寄件人自己看是已讀，其他管理員看是未讀
        self.assertTrue(note['read'])
        self.assertFalse(center.list_for(2)[0]['read'])
        with self.assertRaises(HTTPException) as caught:
            send_note({'title': '', 'body': 'x'}, admin=self.admin)
        self.assertEqual(caught.exception.status_code, 400)

    def test_unknown_id_is_a_404(self):
        from routers.admin_notifications_api import read_one

        with self.assertRaises(HTTPException) as caught:
            read_one('missing', admin=self.admin)
        self.assertEqual(caught.exception.status_code, 404)


if __name__ == '__main__':
    unittest.main()
