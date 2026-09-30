import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
from fastapi import HTTPException

from admin import admin_notifications, ai_usage, site_settings
from auth import security

TZ = timezone(timedelta(hours=8))


def at(text: str) -> float:
    """台灣時間的「2026-09-30 10:00」轉成 epoch 秒。"""
    return datetime.strptime(text, '%Y-%m-%d %H:%M').replace(tzinfo=TZ).timestamp()


class UsageTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            'AI_USAGE_DB': self.temp.name + '/ai-usage.db',
            'PLATFORM_SETTINGS_DB': self.temp.name + '/settings.db',
            'ADMIN_NOTIFICATIONS_DB': self.temp.name + '/center.db',
            'ADMIN_AUDIT_DB': self.temp.name + '/audit.db',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def set_quota(self, pages: int):
        site_settings.update_settings({'platformVisionPageQuota': pages}, actor='a@example.com')

    def alerts(self):
        return [item['title'] for item in reversed(admin_notifications.list_for(None))]


class RecordTests(UsageTestCase):
    def test_usage_adds_up_per_day_in_taiwan_time(self):
        ai_usage.record('vision', 3, 1, now=at('2026-09-30 10:00'))
        ai_usage.record('vision', 2, 1, now=at('2026-09-30 23:30'))
        # 台灣時間隔天凌晨，UTC 還是前一天：要算到隔天
        ai_usage.record('vision', 1, 1, now=at('2026-10-01 00:30'))
        self.assertEqual(
            ai_usage.daily(days=60, now=at('2026-10-01 12:00')),
            [
                {'date': '2026-09-30', 'provider': 'vision', 'units': 5, 'calls': 2},
                {'date': '2026-10-01', 'provider': 'vision', 'units': 1, 'calls': 1},
            ],
        )

    def test_old_days_fall_out_of_the_window(self):
        ai_usage.record('vision', 4, 1, now=at('2026-06-01 10:00'))
        self.assertEqual(ai_usage.daily(days=60, now=at('2026-09-30 10:00')), [])

    def test_bad_reports_are_rejected(self):
        for args in [('gemini', 1, 1), ('vision', -1, 1), ('vision', 1, -1), ('vision', 1.5, 1), ('vision', 100_001, 1)]:
            with self.subTest(args=args):
                with self.assertRaises(ValueError):
                    ai_usage.record(*args)


class QuotaAlertTests(UsageTestCase):
    def test_warn_and_critical_alert_once_per_month(self):
        self.set_quota(100)  # 預警 80%、告急 95%（預設）
        ai_usage.record('vision', 79, 1, now=at('2026-09-10 10:00'))
        self.assertEqual(self.alerts(), [])
        ai_usage.record('vision', 1, 1, now=at('2026-09-11 10:00'))
        ai_usage.record('vision', 5, 1, now=at('2026-09-12 10:00'))
        self.assertEqual(self.alerts(), ['Google Vision 本月額度已用 80%'])
        ai_usage.record('vision', 10, 1, now=at('2026-09-13 10:00'))
        ai_usage.record('vision', 3, 1, now=at('2026-09-14 10:00'))
        self.assertEqual(self.alerts(), ['Google Vision 本月額度已用 80%', 'Google Vision 本月額度已用 95%'])
        # 下個月重新計算
        ai_usage.record('vision', 85, 1, now=at('2026-10-02 10:00'))
        self.assertEqual(self.alerts()[-1], 'Google Vision 本月額度已用 85%')

    def test_jumping_straight_past_critical_only_sends_the_critical_alert(self):
        self.set_quota(100)
        ai_usage.record('vision', 99, 1, now=at('2026-09-10 10:00'))
        self.assertEqual(self.alerts(), ['Google Vision 本月額度已用 99%'])
        self.assertIn('告急', admin_notifications.list_for(None)[0]['body'])

    def test_alert_shows_the_same_percent_as_the_page(self):
        # 95.5%：監控頁用 Math.round 顯示 96%，通知不能寫 95%
        self.set_quota(200)
        ai_usage.record('vision', 191, 1, now=at('2026-09-10 10:00'))
        self.assertEqual(self.alerts(), ['Google Vision 本月額度已用 96%'])
        self.assertIn('告急門檻（95%）', admin_notifications.list_for(None)[0]['body'])

    def test_no_quota_means_no_alert(self):
        self.set_quota(0)
        ai_usage.record('vision', 500, 1, now=at('2026-09-10 10:00'))
        self.assertEqual(self.alerts(), [])


class ApiTests(UsageTestCase):
    admin = MagicMock(id=1, email='a@example.com')

    def service_token(self, **claims):
        payload = {'svc': 'ocr', 'exp': int(time.time()) + 60, **claims}
        return jwt.encode(payload, security.JWT_SECRET, algorithm='HS256')

    def test_ocr_service_can_report_with_its_token(self):
        from routers.ai_usage_api import UsageReport, report_usage

        report_usage(UsageReport(provider='vision', units=2, calls=1), x_service_token=self.service_token())
        self.assertEqual(ai_usage.daily(days=1)[0]['units'], 2)

    def test_other_tokens_are_refused(self):
        from routers.ai_usage_api import UsageReport, report_usage

        user_cookie = security.create_cookie_token(7, 'tenant@example.com', 'tenant')
        for token in [None, 'garbage', user_cookie, self.service_token(svc='web')]:
            with self.subTest(token=token):
                with self.assertRaises(HTTPException) as caught:
                    report_usage(UsageReport(provider='vision', units=2, calls=1), x_service_token=token)
                self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(ai_usage.daily(days=1), [])

    def test_service_token_is_not_a_login(self):
        # 反過來也不行：OCR 服務的憑證不能拿來當使用者的登入
        request = MagicMock(cookies={security.AUTH_COOKIE_NAME: self.service_token()})
        with self.assertRaises(HTTPException):
            security.get_current_user(request, db=MagicMock())

    def test_admin_listing(self):
        from routers.ai_usage_api import read_usage

        ai_usage.record('vision', 3, 1)
        body = read_usage(admin=self.admin)
        self.assertEqual(body['providers'], [{'id': 'vision', 'label': 'Google Cloud Vision', 'unit': 'page'}])
        self.assertEqual(body['daily'][0]['units'], 3)


if __name__ == '__main__':
    unittest.main()
