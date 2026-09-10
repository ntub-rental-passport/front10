"""Google 登入的 session 交換。

## 為什麼有這支測試

2026-09-10 正式站的 Google 登入回 500：

    NameError: name 'user' is not defined  (routers/auth.py)

原因是合併 main 時留下的一行 `create_cookie_token(user.id, ...)`，
但這個函式裡從來沒有 user 這個變數 —— 只要真的執行到就必爆。

之所以幾週都沒被發現，是因為 Google 的 redirect URI 還沒設定完成，
這支端點根本到不了。設定完成的第一次登入就 500。

**「沒有人回報錯誤」不等於「程式是對的」，只代表那條路徑沒被走過。**
"""

import unittest

from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import User, UserIdentity, UserRole
from routers.auth import (
    GoogleAccountResponse,
    GoogleTicketRequest,
    _store_ticket,
    exchange_google_ticket,
)

ACCOUNT = GoogleAccountResponse(
    email="tenant@example.com",
    emailVerified=True,
    name="測試租客",
    picture=None,
    subject="google-subject-123",
)


class GoogleSessionTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.response = Response()

    def tearDown(self):
        self.db.close()

    def _bound_user(self, status: str = "active") -> User:
        """建立一個已綁定 Google 的租客帳號。"""
        user = User(email=ACCOUNT.email, display_name="測試租客", status=status)
        self.db.add(user)
        self.db.commit()
        self.db.add_all([
            UserRole(user_id=user.id, role="tenant"),
            UserIdentity(
                user_id=user.id,
                provider="google",
                provider_subject=ACCOUNT.subject,
                provider_email=ACCOUNT.email,
            ),
        ])
        self.db.commit()
        return user

    def _exchange(self):
        ticket = _store_ticket(ACCOUNT, "tenant", "/app")
        return exchange_google_ticket(
            GoogleTicketRequest(ticket=ticket), self.response, self.db
        )

    def test_bound_account_logs_in(self):
        """這一項就是當初 500 的情境 —— 已綁定帳號交換票證。"""
        user = self._bound_user()
        result = self._exchange()

        self.assertFalse(result.registrationRequired)
        self.assertEqual(result.userId, user.id)
        self.assertTrue(result.accessToken)
        cookies = self.response.headers.getlist("set-cookie")
        self.assertTrue(any("HttpOnly" in c for c in cookies), cookies)

    def test_login_time_is_recorded(self):
        user = self._bound_user()
        self.assertIsNone(user.last_login_at)
        self._exchange()
        self.db.refresh(user)
        self.assertIsNotNone(user.last_login_at)

    def test_unbound_account_gets_registration_token_not_a_session(self):
        """還沒綁定的 Google 帳號只能拿到註冊票證，不可直接登入。"""
        result = self._exchange()

        self.assertTrue(result.registrationRequired)
        self.assertIsNone(result.userId)
        self.assertIsNone(result.accessToken)
        cookies = self.response.headers.getlist("set-cookie")
        self.assertFalse(any("HttpOnly" in c for c in cookies), cookies)

    def test_suspended_account_cannot_log_in(self):
        """停用的帳號改用 Google 登入也要擋 —— 否則停用形同虛設。"""
        self._bound_user(status="suspended")
        with self.assertRaises(HTTPException) as ctx:
            self._exchange()
        self.assertEqual(ctx.exception.status_code, 403)

    def test_ticket_cannot_be_reused(self):
        """票證用過即失效，攔截到也重放不了。"""
        self._bound_user()
        ticket = _store_ticket(ACCOUNT, "tenant", "/app")
        exchange_google_ticket(GoogleTicketRequest(ticket=ticket), self.response, self.db)
        with self.assertRaises(HTTPException) as ctx:
            exchange_google_ticket(GoogleTicketRequest(ticket=ticket), Response(), self.db)
        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
