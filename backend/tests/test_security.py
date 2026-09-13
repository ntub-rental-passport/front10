import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import User, UserRole
from security import create_access_token, get_current_admin, read_access_token


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
        self.admin = User(email="admin@example.com")
        self.tenant = User(email="tenant@example.com")
        self.db.add_all([self.admin, self.tenant])
        self.db.commit()
        self.db.add_all(
            [
                UserRole(user_id=self.admin.id, role="admin"),
                UserRole(user_id=self.tenant.id, role="tenant"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _call(self, authorization):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            return get_current_admin(authorization, self.db)

    def _token(self, user_id, role):
        with patch.dict(os.environ, {"AUTH_TOKEN_SECRET": "test-secret"}):
            return f"Bearer {create_access_token(user_id, role)}"

    def test_admin_passes(self):
        self.assertEqual(self._call(self._token(self.admin.id, "admin")).email, "admin@example.com")

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
        token = self._token(self.admin.id, "admin")
        self.db.query(UserRole).filter(UserRole.user_id == self.admin.id).delete()
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
