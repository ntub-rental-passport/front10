import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from admin import audit_service
from admin import site_settings as site
from auth import security


class SiteSettingsTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / 'settings.db'
        self.env = patch.dict(os.environ, {
            'PLATFORM_SETTINGS_DB': str(self.db_path),
            'ADMIN_AUDIT_DB': self.temp.name + '/audit.db',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def audit(self):
        return [(e['action'], e['target'], e['detail']) for e in reversed(audit_service.list_events())]


class DefaultsTests(SiteSettingsTestCase):
    def test_defaults_without_creating_a_file(self):
        # 每個頁面載入都會讀公開設定；讀的時候建檔，測試就會在 backend/ 底下留資料庫
        values = site.get_settings()
        self.assertEqual(values['siteName'], 'RentMate 租隊友')
        self.assertFalse(values['maintenanceMode'])
        self.assertEqual(values['platformVisionPageQuota'], 3000)
        self.assertEqual(site.list_outages(), [])
        self.assertFalse(self.db_path.exists())


class UpdateTests(SiteSettingsTestCase):
    def test_update_is_persisted_and_returns_the_full_settings(self):
        values = site.update_settings({'maintenanceOverdueDays': 10}, actor='admin@example.com')
        self.assertEqual(values['maintenanceOverdueDays'], 10)
        self.assertEqual(site.get_settings()['maintenanceOverdueDays'], 10)
        self.assertEqual(values['siteName'], 'RentMate 租隊友')

    def test_changed_fields_are_audited_in_chinese_with_before_and_after(self):
        site.update_settings(
            {'maintenanceOverdueDays': 10, 'platformVisionPageQuota': 5000, 'quotaWarnPercent': 70, 'siteName': '租隊友'},
            actor='admin@example.com',
        )
        self.assertEqual(self.audit(), [(
            '系統設定', '平台設定',
            '網站名稱：已更新；報修逾期提醒門檻：7 → 10 天；Vision 每月頁數上限：3,000 → 5,000 頁；額度預警門檻：80 → 70%',
        )])

    def test_maintenance_switch_gets_its_own_audit_entry(self):
        site.update_settings({'maintenanceMode': True, 'maintenanceStartsAt': '2026-10-01T02:00'}, actor='a@example.com')
        site.update_settings({'maintenanceMode': False}, actor='a@example.com')
        self.assertEqual(self.audit(), [
            ('系統設定', '維護模式', '開啟維護模式'),
            ('系統設定', '平台設定', '維護開始時間：未設定 → 10/1 02:00'),
            ('系統設定', '維護模式', '關閉維護模式'),
        ])

    def test_unchanged_values_write_nothing(self):
        site.update_settings({'siteName': 'RentMate 租隊友'}, actor='a@example.com')
        self.assertEqual(self.audit(), [])
        self.assertFalse(self.db_path.exists())

    def test_invalid_values_are_rejected_with_a_readable_reason(self):
        for changes, fragment in [
            ({'siteName': '  '}, '請輸入網站名稱'),
            ({'supportEmail': 'not-an-email'}, '有效的 Email'),
            ({'quotaWarnPercent': 95}, '預警門檻需小於告急門檻'),
            ({'quotaCriticalPercent': 101}, '1 到 100'),
            ({'responseOkMs': 1000}, '正常門檻必須小於變慢門檻'),
            ({'responseDegradedMs': 6000}, '50 到 5000'),
            ({'maintenanceMode': True, 'maintenanceMessage': ''}, '必須填寫維護說明'),
            ({'maintenanceStartsAt': '2026-10-02T00:00', 'maintenanceEndsAt': '2026-10-01T00:00'}, '結束時間必須晚於開始時間'),
            ({'maintenanceStartsAt': 'tomorrow'}, '時間格式'),
            ({'maintenanceAllowlist': 'ok@example.com\nbad'}, '「bad」不是有效的 Email'),
            ({'auditRetentionDays': 3651}, '3650'),
            ({'maintenanceOverdueDays': 0}, '1 到 90'),
            ({'aiQuotaCriticalDays': 7.5}, '整數'),
            ({'maintenanceOverdueDays': True}, '整數'),
            ({'maintenanceMode': 'yes'}, '開關'),
            ({'unknown': 1}, '不認得'),
        ]:
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError) as caught:
                    site.update_settings(changes, actor='a@example.com')
                self.assertIn(fragment, str(caught.exception))
        self.assertEqual(self.audit(), [])

    def test_zero_or_negative_retention_means_keep_forever(self):
        self.assertEqual(site.update_settings({'auditRetentionDays': 0}, actor='a@example.com')['auditRetentionDays'], 0)
        self.assertEqual(site.update_settings({'auditRetentionDays': -1}, actor='a@example.com')['auditRetentionDays'], -1)

    def test_whole_number_floats_are_accepted_as_integers(self):
        # 前端的數字欄位送過來可能是 10.0
        self.assertEqual(site.update_settings({'maintenanceOverdueDays': 10.0}, actor='a@example.com')['maintenanceOverdueDays'], 10)


class PublicViewTests(SiteSettingsTestCase):
    def test_public_view_leaves_out_the_allowlist_and_the_thresholds(self):
        site.update_settings({'maintenanceMode': True, 'maintenanceAllowlist': 'vip@example.com'}, actor='a@example.com')
        view = site.public_settings()
        self.assertEqual(set(view), {'siteName', 'supportEmail', 'maintenance'})
        self.assertEqual(
            view['maintenance'],
            {'mode': True, 'message': site.get_settings()['maintenanceMessage'], 'startsAt': '', 'endsAt': ''},
        )
        self.assertNotIn('vip@example.com', repr(view))

    def test_bypass_matches_the_allowlist_ignoring_case_and_spaces(self):
        site.update_settings({'maintenanceAllowlist': 'VIP@example.com\n  other@example.com  '}, actor='a@example.com')
        self.assertTrue(site.maintenance_bypass('vip@EXAMPLE.com'))
        self.assertTrue(site.maintenance_bypass(' other@example.com'))
        self.assertFalse(site.maintenance_bypass('someone@example.com'))
        self.assertFalse(site.maintenance_bypass(None))


class OutageTests(SiteSettingsTestCase):
    def test_closing_a_feature_records_when_and_why(self):
        outage = site.close_feature('handover', ' 看圖模型逾時 ', '', None, actor='a@example.com')
        self.assertEqual(outage['featureKey'], 'handover')
        self.assertEqual(outage['internalReason'], '看圖模型逾時')
        self.assertIsNone(outage['etaAt'])
        self.assertTrue(outage['closedAt'].endswith('Z'))
        self.assertEqual(self.audit(), [('系統', '點交存證', '關閉功能：看圖模型逾時（未填預計時間）')])

    def test_updating_keeps_the_original_closed_time(self):
        first = site.close_feature('contract-analysis', '額度用完', '', None, actor='a@example.com')
        second = site.close_feature(
            'contract-analysis', '額度用完，已申請', '明天恢復', '2026-10-01T06:00:00.000Z', actor='a@example.com'
        )
        self.assertEqual(second['closedAt'], first['closedAt'])
        self.assertEqual(second['publicNote'], '明天恢復')
        self.assertEqual(len(site.list_outages()), 1)
        self.assertEqual(self.audit()[-1], ('系統', '契約分析', '更新維護資訊：額度用完，已申請（預計恢復 2026/10/01 14:00）'))

    def test_reopening_removes_it_and_records_how_long_it_was_closed(self):
        with patch.object(site, '_now', return_value=1_000_000.0):
            site.close_feature('garbage', '資料源掛了', '', None, actor='a@example.com')
        with patch.object(site, '_now', return_value=1_000_000.0 + 3 * 3600 + 20 * 60):
            site.reopen_feature('garbage', actor='a@example.com')
        self.assertEqual(site.list_outages(), [])
        self.assertEqual(self.audit()[-1], ('系統', '垃圾車查詢', '恢復功能，共關閉 3 小時 20 分'))

    def test_reopening_something_that_is_not_closed_raises_lookup_error(self):
        with self.assertRaises(LookupError):
            site.reopen_feature('notes', actor='a@example.com')

    def test_bad_input_is_rejected(self):
        for args, fragment in [
            (('unknown', '原因', '', None), '不認得的功能'),
            (('notes', '  ', '', None), '必須填寫內部原因'),
            (('notes', '原因', '', 'soon'), '時間格式'),
        ]:
            with self.subTest(args=args):
                with self.assertRaises(ValueError) as caught:
                    site.close_feature(*args, actor='a@example.com')
                self.assertIn(fragment, str(caught.exception))

    def test_public_outages_leave_out_the_internal_reason(self):
        site.close_feature('subsidy', 'API 金鑰過期', '補助查詢暫停', None, actor='a@example.com')
        public = site.public_outages()
        self.assertEqual(len(public), 1)
        self.assertEqual(set(public[0]), {'featureKey', 'publicNote', 'closedAt', 'etaAt'})
        self.assertNotIn('API 金鑰過期', repr(public))


class ApiTests(SiteSettingsTestCase):
    admin = MagicMock(email='admin@example.com')

    def request_as(self, email=None):
        cookies = {security.AUTH_COOKIE_NAME: security.create_cookie_token(7, email, 'tenant')} if email else {}
        return MagicMock(cookies=cookies)

    def test_allowlisted_visitors_bypass_maintenance_without_seeing_the_list(self):
        from routers.platform_settings_api import read_public_settings

        site.update_settings({'maintenanceMode': True, 'maintenanceAllowlist': 'vip@example.com'}, actor='a@example.com')
        self.assertTrue(read_public_settings(self.request_as('vip@example.com'))['maintenanceBypass'])
        self.assertFalse(read_public_settings(self.request_as('someone@example.com'))['maintenanceBypass'])
        anonymous = read_public_settings(self.request_as())
        self.assertFalse(anonymous['maintenanceBypass'])
        self.assertTrue(anonymous['maintenance']['mode'])
        self.assertNotIn('vip@example.com', repr(anonymous))

    def test_a_forged_cookie_does_not_bypass(self):
        from routers.platform_settings_api import read_public_settings

        site.update_settings({'maintenanceMode': True, 'maintenanceAllowlist': 'vip@example.com'}, actor='a@example.com')
        forged = MagicMock(cookies={security.AUTH_COOKIE_NAME: 'not-a-real-token'})
        self.assertFalse(read_public_settings(forged)['maintenanceBypass'])

    def test_public_settings_list_outages_without_the_internal_reason(self):
        from routers.platform_settings_api import read_public_settings

        site.close_feature('notes', '資料庫連線池滿了', '記事暫停使用', None, actor='a@example.com')
        outages = read_public_settings(self.request_as())['featureOutages']
        self.assertEqual([o['featureKey'] for o in outages], ['notes'])
        self.assertNotIn('資料庫連線池滿了', repr(outages))

    def test_invalid_settings_are_a_400_with_the_reason(self):
        from routers.platform_settings_api import update_site_settings

        with self.assertRaises(HTTPException) as caught:
            update_site_settings({'quotaWarnPercent': 99}, admin=self.admin)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn('預警門檻', caught.exception.detail)

    def test_outage_endpoints_map_errors_to_status_codes(self):
        from routers.platform_settings_api import OutageUpdate, close_feature, reopen_feature

        with self.assertRaises(HTTPException) as missing_reason:
            close_feature('notes', OutageUpdate(internalReason=' '), admin=self.admin)
        self.assertEqual(missing_reason.exception.status_code, 400)
        with self.assertRaises(HTTPException) as not_closed:
            reopen_feature('notes', admin=self.admin)
        self.assertEqual(not_closed.exception.status_code, 404)
        self.assertEqual(close_feature('notes', OutageUpdate(internalReason='測試'), admin=self.admin)['featureKey'], 'notes')
        self.assertIsNone(reopen_feature('notes', admin=self.admin))


class DurationLabelTests(unittest.TestCase):
    def test_label_gets_coarser_as_time_passes(self):
        for seconds, label in [
            (30, '不到 1 分鐘'),
            (5 * 60, '5 分'),
            (3 * 3600 + 20 * 60, '3 小時 20 分'),
            (2 * 86400 + 5 * 3600, '2 天 5 小時'),
        ]:
            self.assertEqual(site.duration_label(seconds), label)


if __name__ == '__main__':
    unittest.main()
