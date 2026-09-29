import os
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from admin import platform_settings
from db.database import Base
from db.models import AdminSession, User, UserRole
from auth.security import ADMIN_IDLE_DETAIL, create_access_token, get_current_admin, read_access_token


class AccessTokenTest(unittest.TestCase):
    def test_signed_token_round_trip(self):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            token = create_access_token(42, "landlord")
            payload = read_access_token(token)
        self.assertEqual(payload["sub"], 42)
        self.assertEqual(payload["role"], "landlord")

    def test_tampered_token_is_rejected(self):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            token = create_access_token(42, "landlord")
            with self.assertRaises(HTTPException):
                read_access_token(f"{token[:-1]}x")


class AdminGuardTest(unittest.TestCase):
    """後台守門員 get_current_admin 的行為。

    重點不在「管理員能進來」，而在「其他人都進不來」——
    後台端點一旦漏檢查，等於整站資料對外公開。
    """

    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.admin = User(roles=[UserRole(role="admin")], email="admin@example.com")
        self.tenant = User(roles=[UserRole(role="tenant")], email="tenant@example.com")
        self.db.add_all([self.admin, self.tenant])
        self.db.commit()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _call(self, authorization):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            return get_current_admin(authorization, self.db)

    def _token(self, user_id, role, sid=None):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            return f"Bearer {create_access_token(user_id, role, sid=sid)}"

    def _session(self, user_id, idle_minutes=0):
        """管理員登入後的伺服器端紀錄；idle_minutes 是「上次操作到現在」多久。"""
        now = datetime.utcnow()
        session = AdminSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            created_at=now - timedelta(minutes=idle_minutes),
            last_active_at=now - timedelta(minutes=idle_minutes),
        )
        self.db.add(session)
        self.db.commit()
        return session.id

    def _admin_token(self, idle_minutes=0):
        return self._token(self.admin.id, "admin", sid=self._session(self.admin.id, idle_minutes))

    def test_admin_passes(self):
        self.assertEqual(self._call(self._admin_token()).email, "admin@example.com")

    def test_admin_token_without_a_server_session_is_401(self):
        # 改版前簽發的憑證沒有 sid：請他重新登入一次，不讓舊憑證繞過閒置判斷
        with self.assertRaises(HTTPException) as ctx:
            self._call(self._token(self.admin.id, "admin"))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_idle_admin_is_logged_out_and_the_session_is_gone(self):
        token = self._admin_token(idle_minutes=platform_settings.ADMIN_IDLE_MINUTES + 1)
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, ADMIN_IDLE_DETAIL)
        self.assertEqual(self.db.query(AdminSession).count(), 0)

    def test_just_under_the_idle_limit_still_passes(self):
        token = self._admin_token(idle_minutes=platform_settings.ADMIN_IDLE_MINUTES - 1)
        self.assertEqual(self._call(token).email, "admin@example.com")

    def test_session_of_another_admin_is_not_accepted(self):
        other = User(email="other-admin@example.com")
        self.db.add(other)
        self.db.commit()
        self.db.add(UserRole(user_id=other.id, role="admin"))
        self.db.commit()
        # 拿別人的 sid 塞進自己的 token：sid 跟帳號對不上，一樣擋
        token = self._token(self.admin.id, "admin", sid=self._session(other.id))
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_activity_report_postpones_idle_logout(self):
        from routers.auth import report_admin_activity

        token = self._admin_token(idle_minutes=platform_settings.ADMIN_IDLE_MINUTES - 1)
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            report_admin_activity(authorization=token, db=self.db)
        session = self.db.query(AdminSession).one()
        self.assertLess((datetime.utcnow() - session.last_active_at).total_seconds(), 5)

    def test_activity_report_cannot_revive_an_idle_session(self):
        from routers.auth import report_admin_activity

        token = self._admin_token(idle_minutes=platform_settings.ADMIN_IDLE_MINUTES + 1)
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            with self.assertRaises(HTTPException) as ctx:
                report_admin_activity(authorization=token, db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_header_is_401(self):
        with self.assertRaises(HTTPException) as ctx:
            self._call(None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_tenant_token_is_403(self):
        with self.assertRaises(HTTPException) as ctx:
            self._call(self._token(self.tenant.id, "tenant"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_forged_admin_claim_is_rejected(self):
        """token 自稱 admin 但資料庫沒有這個角色 —— 必須擋下。

        涵蓋兩種情況：一般使用者拿到偽造/竄改的 token，
        以及管理員權限被撤銷後、舊 token 還沒過期。
        """
        with self.assertRaises(HTTPException) as ctx:
            self._call(self._token(self.tenant.id, "admin"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_revoked_admin_loses_access_immediately(self):
        token = self._admin_token()
        self.admin.roles = [UserRole(role="tenant")]
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            self._call(token)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_cookie_is_not_accepted(self):
        """後台只收 Bearer 標頭，不收 cookie（避免 CSRF）。"""
        with self.assertRaises(HTTPException) as ctx:
            self._call("Cookie: rentmate_session=whatever")
        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
