import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
from fastapi import HTTPException, Response

from admin import audit_service
from admin import platform_settings as settings
from auth import security


class PlatformSettingsTestCase(unittest.TestCase):
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


class StoreTests(PlatformSettingsTestCase):
    def test_defaults_without_creating_a_file(self):
        # 每個會簽發憑證的測試都會讀設定；讀的時候建檔，backend/ 底下就會多一堆資料庫
        self.assertEqual(settings.get_settings(), {'password_min_length': 8, 'session_minutes': 1440})
        self.assertFalse(self.db_path.exists())

    def test_update_is_persisted_and_audited_per_changed_field(self):
        settings.update_settings({'password_min_length': 12, 'session_minutes': 1440}, actor='admin@example.com')
        self.assertEqual(settings.password_min_length(), 12)
        # 登入有效時間沒變，只記一筆
        self.assertEqual(
            [(e['actor'], e['action'], e['detail']) for e in audit_service.list_events()],
            [('admin@example.com', '系統設定', '密碼最短長度：8 → 12 字元')],
        )

    def test_invalid_values_are_rejected_with_a_readable_reason(self):
        for changes, fragment in [
            ({'password_min_length': 7}, '8 到 64'),
            ({'password_min_length': 65}, '8 到 64'),
            ({'session_minutes': 45}, '選單'),
            ({'session_minutes': True}, '整數'),
            ({'unknown': 1}, '不認得'),
        ]:
            with self.assertRaises(ValueError) as caught:
                settings.update_settings(changes, actor='admin@example.com')
            self.assertIn(fragment, str(caught.exception))
        self.assertEqual(audit_service.list_events(), [])


class TokenLifetimeTests(PlatformSettingsTestCase):
    def exp_of(self, token: str) -> int:
        import base64
        import json

        body = token.split('.')[0]
        return json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))['exp']

    def test_user_tokens_follow_the_setting(self):
        settings.update_settings({'session_minutes': 480}, actor='admin@example.com')
        remaining = self.exp_of(security.create_access_token(1, 'tenant')) - int(time.time())
        self.assertAlmostEqual(remaining, 480 * 60, delta=5)

    def test_admin_tokens_ignore_the_setting(self):
        # 一般使用者的期限設錯時，管理員必須還進得來改回去
        settings.update_settings({'session_minutes': 30}, actor='admin@example.com')
        remaining = self.exp_of(security.create_access_token(1, 'admin')) - int(time.time())
        self.assertAlmostEqual(remaining, settings.ADMIN_SESSION_MINUTES * 60, delta=5)

    def test_reissued_token_keeps_the_original_expiry(self):
        # /me 每次重新整理都會重發：沿用 cookie 的期限，登入才不會被延長
        expires_at = int(time.time()) + 600
        self.assertEqual(self.exp_of(security.create_access_token(1, 'tenant', expires_at=expires_at)), expires_at)

    def test_cookie_max_age_follows_the_token(self):
        settings.update_settings({'session_minutes': 60}, actor='admin@example.com')
        token = security.create_cookie_token(1, 'a@example.com', 'tenant')
        response = Response()
        security.set_auth_cookie(response, token)
        cookie = response.headers['set-cookie']
        max_age = int(cookie.split('Max-Age=')[1].split(';')[0])
        self.assertAlmostEqual(max_age, 3600, delta=5)
        payload = jwt.decode(token, options={'verify_signature': False})
        self.assertAlmostEqual(payload['exp'] - int(time.time()), 3600, delta=5)

    def test_unreadable_cookie_token_falls_back_to_the_default(self):
        response = Response()
        security.set_auth_cookie(response, 'not-a-jwt')
        self.assertIn(f'Max-Age={settings.DEFAULT_SESSION_MINUTES * 60}', response.headers['set-cookie'])


class RegistrationPasswordTests(PlatformSettingsTestCase):
    def start(self, password: str):
        from routers.auth import RegistrationStartRequest, start_registration

        # 長度檢查在碰資料庫之前；過了檢查就會去查資料庫，用這個認出「有通過」
        db = MagicMock()
        db.query.side_effect = LookupError('passed the length check')
        return start_registration(RegistrationStartRequest(email='new@example.com', password=password), db=db)

    def test_registration_uses_the_configured_minimum(self):
        settings.update_settings({'password_min_length': 12}, actor='admin@example.com')
        with self.assertRaises(HTTPException) as caught:
            self.start('elevenchars')
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn('12 到 128', caught.exception.detail)
        with self.assertRaises(LookupError):
            self.start('twelve-chars')

    def test_default_minimum_is_still_eight(self):
        with self.assertRaises(HTTPException):
            self.start('seven77')
        with self.assertRaises(LookupError):
            self.start('eight888')


class ApiTests(PlatformSettingsTestCase):
    admin = MagicMock(email='admin@example.com')

    def test_public_settings_expose_only_what_the_register_page_needs(self):
        from routers.platform_settings_api import read_public_settings

        self.assertEqual(set(read_public_settings()), {'passwordMinLength', 'passwordMaxLength'})

    def test_update_rejects_invalid_values_with_400(self):
        from routers.platform_settings_api import SettingsUpdate, update_admin_settings

        with self.assertRaises(HTTPException) as caught:
            update_admin_settings(SettingsUpdate(sessionMinutes=45), admin=self.admin)
        self.assertEqual(caught.exception.status_code, 400)

    def test_update_returns_the_new_values_and_the_fixed_admin_session(self):
        from routers.platform_settings_api import SettingsUpdate, update_admin_settings

        view = update_admin_settings(SettingsUpdate(passwordMinLength=10, sessionMinutes=1440), admin=self.admin)
        self.assertEqual((view['passwordMinLength'], view['sessionMinutes']), (10, 1440))
        self.assertEqual(view['adminSessionMinutes'], settings.ADMIN_SESSION_MINUTES)


if __name__ == '__main__':
    unittest.main()
