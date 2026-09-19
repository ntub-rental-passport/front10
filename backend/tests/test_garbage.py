import os
import tempfile
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
import garbage_service as service
from routers.garbage import ActiveInput, list_reminders, toggle_reminder, delete_reminder, validate_subscription


class GarbageReminderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'GARBAGE_REMINDER_DB': self.temp.name + '/reminders.db'})
        self.env.start()
        self.caps = patch.object(service, 'capabilities', return_value={'email': True, 'push': True})
        self.caps.start()
        self.user = SimpleNamespace(id=10, email='tenant@example.com')
        self.other = SimpleNamespace(id=11)
        day = datetime.now(service.TZ).date() + timedelta(days=1)
        while day.weekday() in (2, 6):
            day += timedelta(days=1)
        self.values = {'stationId': next(iter(service.stops())), 'date': day.isoformat(), 'minutesBefore': 15, 'notifyPush': False, 'notifyEmail': True}

    def tearDown(self):
        self.caps.stop()
        self.env.stop()
        self.temp.cleanup()

    def create(self):
        return service.create_reminder(self.user.id, self.user.email, self.values)

    def test_reminder_is_owned_and_does_not_expose_email_or_subscription(self):
        reminder = self.create()
        self.assertEqual(len(list_reminders(self.user)), 1)
        self.assertEqual(list_reminders(self.other), [])
        self.assertNotIn('recipient', reminder)
        with self.assertRaises(HTTPException):
            delete_reminder(reminder['id'], self.other)
        with self.assertRaises(HTTPException):
            toggle_reminder(reminder['id'], ActiveInput(active=False), self.other)

    def test_new_taipei_uses_station_weekdays_instead_of_taipei_closure(self):
        key = next(key for key in service.stops() if key.startswith('ntpc|'))
        self.assertIn('days', service.stops()[key])
        day = datetime.now(service.TZ).date() + timedelta(days=1)
        while day.weekday() != 2:
            day += timedelta(days=1)
        self.values.update(stationId=key, date=day.isoformat())
        with patch.object(service, 'stops', return_value={key: {
            'address': '新北市測試站', 'arrival': '18:30', 'days': [2],
        }}):
            reminder = self.create()
            self.assertEqual(reminder['stationName'], '新北市測試站')
            self.values['date'] = (day + timedelta(days=1)).isoformat()
            with self.assertRaisesRegex(ValueError, '沒有表定收運'):
                self.create()

    def test_rejects_closed_day_and_past_due_and_unavailable_channel(self):
        self.values['date'] = '2026-09-09'
        with self.assertRaisesRegex(ValueError, '週三'):
            self.create()
        self.values['date'] = '2020-01-02'
        with self.assertRaisesRegex(ValueError, '現在之後'):
            self.create()
        self.values['stationId'] = 'fake'
        with self.assertRaisesRegex(ValueError, '找不到'):
            self.create()

    def test_atomic_dispatch_once_and_persisted_delivery_status(self):
        reminder = self.create()
        due = datetime.fromisoformat(reminder['dueAt'])
        with patch.object(service, 'send_email') as send:
            service.dispatch_due(due - timedelta(seconds=1))
            send.assert_not_called()
            service.dispatch_due(due)
            service.dispatch_due(due + timedelta(seconds=30))
            send.assert_called_once()
            self.assertEqual(send.call_args.args[0]['recipient'], self.user.email)
        self.assertEqual(list_reminders(self.user)[0]['emailStatus'], 'sent')

    def test_24_hour_time_is_scheduled_on_next_calendar_day(self):
        identifier = next(key for key, stop in service.stops().items() if stop['arrival'] == '24:11')
        self.values['stationId'] = identifier
        reminder = self.create()
        due = datetime.fromisoformat(reminder['dueAt'])
        midnight = datetime.fromisoformat(self.values['date'] + 'T00:00:00+08:00')
        self.assertEqual(due, midnight + timedelta(hours=24, minutes=11 - 15))

    def test_unconfigured_channel_cannot_be_saved_as_success(self):
        self.caps.stop()
        with patch.object(service, 'capabilities', return_value={'email': False, 'push': False}):
            with self.assertRaisesRegex(ValueError, '尚未設定'):
                self.create()
        self.caps.start()

    def test_paused_reminders_do_not_send_and_late_reminders_expire(self):
        reminder = self.create()
        due = datetime.fromisoformat(reminder['dueAt'])
        toggle_reminder(reminder['id'], ActiveInput(active=False), self.user)
        with patch.object(service, 'send_email') as send:
            service.dispatch_due(due)
            send.assert_not_called()
            toggle_reminder(reminder['id'], ActiveInput(active=True), self.user)
            service.dispatch_due(due + timedelta(minutes=6))
            send.assert_not_called()
        self.assertEqual(list_reminders(self.user)[0]['emailStatus'], 'missed')

    def test_delivery_failure_is_not_reported_as_sent(self):
        reminder = self.create()
        with patch.object(service, 'send_email', side_effect=RuntimeError('offline')):
            service.dispatch_due(datetime.fromisoformat(reminder['dueAt']))
        self.assertEqual(list_reminders(self.user)[0]['emailStatus'], 'failed')

    def test_push_rejects_arbitrary_urls(self):
        for endpoint in ['http://fcm.googleapis.com/send/a', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.evil.test/push']:
            with self.assertRaises(ValueError):
                validate_subscription({'endpoint': endpoint, 'keys': {'auth': 'a' * 22, 'p256dh': 'b' * 87}})


if __name__ == '__main__':
    unittest.main()
