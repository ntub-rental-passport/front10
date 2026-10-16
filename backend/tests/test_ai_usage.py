import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
from fastapi import HTTPException

from tests.admin_store import AdminStoreTestCase
from admin import admin_notifications, ai_usage, site_settings
from auth import security

TZ = timezone(timedelta(hours=8))

def at(text: str) -> float:
    """台灣時間的「2026-09-30 10:00」轉成 epoch 秒。"""
    return datetime.strptime(text, '%Y-%m-%d %H:%M').replace(tzinfo=TZ).timestamp()

class UsageTestCase(AdminStoreTestCase):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
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
                {'date': '2026-09-30', 'provider': 'vision', 'feature': '', 'units': 5, 'calls': 2,
                 'failed': 0, 'prompt_tokens': 0, 'completion_tokens': 0},
                {'date': '2026-10-01', 'provider': 'vision', 'feature': '', 'units': 1, 'calls': 1,
                 'failed': 0, 'prompt_tokens': 0, 'completion_tokens': 0},
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

class NvidiaRecordTests(UsageTestCase):
    def test_calls_failures_tokens_and_features_accumulate(self):
        ts = at('2026-10-01 00:30')
        ai_usage.record_call('nvidia', 'contract-analysis', ok=True, prompt_tokens=100, completion_tokens=20, now=ts)
        ai_usage.record_call('nvidia', 'contract-analysis', ok=False, now=ts)
        ai_usage.record_call('nvidia', 'law-chat', ok=True, prompt_tokens=30, completion_tokens=5, now=ts)
        ai_usage.record_call('nvidia', 'inspection', ok=True, now=ts)
        ai_usage.record_call('nvidia', 'inspection', ok=True, now=at('2026-09-30 23:30'))
        ai_usage.record('vision', 8, 1, now=ts)
        rows = [row for row in ai_usage.daily(days=1, now=ts) if row['provider'] == 'nvidia']
        self.assertEqual(rows, [
            {'date': '2026-10-01', 'provider': 'nvidia', 'feature': 'contract-analysis',
             'units': 2, 'calls': 2, 'failed': 1, 'prompt_tokens': 100, 'completion_tokens': 20},
            {'date': '2026-10-01', 'provider': 'nvidia', 'feature': 'inspection',
             'units': 1, 'calls': 1, 'failed': 0, 'prompt_tokens': 0, 'completion_tokens': 0},
            {'date': '2026-10-01', 'provider': 'nvidia', 'feature': 'law-chat',
             'units': 1, 'calls': 1, 'failed': 0, 'prompt_tokens': 30, 'completion_tokens': 5},
        ])
        self.assertEqual(ai_usage.month_to_date('nvidia', now=ts), 4)
        self.assertEqual(ai_usage.month_to_date('vision', now=ts), 8)
        self.assertEqual(ai_usage.month_to_date('nvidia', now=at('2026-11-01 00:00')), 0)

    def test_legacy_insert_and_update_can_omit_new_columns(self):
        # 模擬部署前的舊版 upsert，預設值必須在資料庫端生效。
        with ai_usage._open() as db:
            for units in (3, 2):
                db.upsert('daily_usage', {'date': '2026-10-01', 'provider': 'vision'},
                          {'units': units, 'calls': 1}, add=True)
        row = ai_usage.daily(days=1, now=at('2026-10-01 12:00'))[0]
        self.assertEqual(row, {'date': '2026-10-01', 'provider': 'vision', 'feature': '',
                              'units': 5, 'calls': 2, 'failed': 0, 'prompt_tokens': 0, 'completion_tokens': 0})

    def test_database_and_quota_errors_are_logged_without_escaping(self):
        for target in ('_open', '_check_quota'):
            with self.subTest(target=target), patch.object(ai_usage, target, side_effect=RuntimeError('unavailable')):
                with self.assertLogs(ai_usage.logger, level='WARNING') as logs:
                    ai_usage.record_call('nvidia', 'law-chat', ok=True)
                self.assertIn('AI 用量記錄失敗', logs.output[0])

    def test_nvidia_quota_alerts_are_per_threshold_month_and_provider(self):
        site_settings.update_settings({'platformNvidiaCallQuota': 20, 'platformVisionPageQuota': 20}, actor='a@example.com')
        september = at('2026-09-10 10:00')
        for _ in range(18):
            ai_usage.record_call('nvidia', 'law-chat', ok=True, now=september)
        self.assertEqual(self.alerts(), ['NVIDIA 本月額度已用 80%'])
        notification = admin_notifications.list_for(None)[0]
        self.assertEqual(notification['body'], '本月已用 16 次，額度 20 次，已超過預警門檻（80%）。額度與門檻可以在系統設定調整。')
        self.assertEqual(notification['actionUrl'], '/admin/monitoring#ai-usage')
        for _ in range(3):
            ai_usage.record_call('nvidia', 'inspection', ok=False, now=september)
        self.assertEqual(self.alerts(), ['NVIDIA 本月額度已用 80%', 'NVIDIA 本月額度已用 95%'])
        self.assertIn('本月已用 19 次，額度 20 次，已超過告急門檻（95%）', admin_notifications.list_for(None)[0]['body'])
        ai_usage.record('vision', 16, 1, now=september)
        self.assertEqual(self.alerts()[-1], 'Google Vision 本月額度已用 80%')
        for _ in range(16):
            ai_usage.record_call('nvidia', 'law-chat', ok=True, now=at('2026-10-01 10:00'))
        self.assertEqual(self.alerts()[-1], 'NVIDIA 本月額度已用 80%')
        with ai_usage._open() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM usage_meta WHERE `key` LIKE 'alerted:nvidia:%'").fetchone()[0], 3)

    def test_zero_quota_does_not_alert_and_direct_critical_skips_warn(self):
        site_settings.update_settings({'platformNvidiaCallQuota': 0}, actor='a@example.com')
        ts = at('2026-10-01 10:00')
        ai_usage.record_call('nvidia', 'inspection', ok=True, now=ts)
        self.assertEqual(self.alerts(), [])
        site_settings.update_settings({'platformNvidiaCallQuota': 1}, actor='a@example.com')
        ai_usage.record_call('nvidia', 'inspection', ok=True, now=ts)
        ai_usage.record_call('nvidia', 'inspection', ok=True, now=ts)
        self.assertEqual(self.alerts(), ['NVIDIA 本月額度已用 100%'])
        self.assertIn('告急', admin_notifications.list_for(None)[0]['body'])

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
        self.assertEqual(body['providers'], [
            {'id': 'vision', 'label': 'Google Cloud Vision', 'unit': 'page'},
            {'id': 'nvidia', 'label': 'NVIDIA', 'unit': 'call'},
        ])
        self.assertEqual(body['daily'][0]['units'], 3)

if __name__ == '__main__':
    unittest.main()
