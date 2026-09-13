import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, Response
from routers import auth
from models import User, UserIdentity, UserRole


class GoogleSessionTests(unittest.TestCase):
    def setUp(self):
        self.account = auth.GoogleAccountResponse(email='test@example.com', emailVerified=True,
                                                 name='Test', picture=None, subject='test-subject')
        self.ticket = auth._store_ticket(self.account, 'tenant', '/app')
        self.response = Response()
        self.db = MagicMock()
        self.records = {UserIdentity: SimpleNamespace(user_id=42),
                        UserRole: SimpleNamespace(role='tenant'),
                        User: SimpleNamespace(id=42, email='test@example.com')}
        self.db.query.side_effect = lambda model: SimpleNamespace(
            filter=lambda *args: SimpleNamespace(first=lambda: self.records[model]))
        self.patches = [patch.object(auth, '_google_config', return_value=('id', 'test-secret', '', '')),
                        patch.object(auth, 'create_access_token', return_value='test-access'),
                        patch.object(auth, 'create_cookie_token', return_value='test-cookie'),
                        patch.object(auth, '_create_google_registration_token', return_value='test-registration')]
        self.mocks = [p.start() for p in self.patches]

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        auth._oauth_tickets.pop(self.ticket, None)

    def exchange(self):
        return auth.exchange_google_ticket(auth.GoogleTicketRequest(ticket=self.ticket), self.response, self.db)

    def test_existing_account_gets_cookie_and_matching_user_id(self):
        result = self.exchange()
        self.assertEqual(result.userId, 42)
        self.assertFalse(result.registrationRequired)
        self.assertEqual(result.accessToken, 'test-access')
        self.assertIn('HttpOnly', self.response.headers['set-cookie'])
        self.mocks[2].assert_called_once_with(42, 'test@example.com', 'tenant')

    def test_new_account_only_gets_registration_ticket(self):
        self.records[UserIdentity] = None
        result = self.exchange()
        self.assertTrue(result.registrationRequired)
        self.assertIsNone(result.accessToken)
        self.assertEqual(result.registrationToken, 'test-registration')
        self.assertNotIn('set-cookie', self.response.headers)
        self.mocks[2].assert_not_called()

    def test_role_mismatch_does_not_issue_cookie(self):
        self.records[UserRole] = None
        with self.assertRaises(HTTPException) as error:
            self.exchange()
        self.assertEqual(error.exception.status_code, 403)
        self.assertNotIn('set-cookie', self.response.headers)

    def test_missing_member_does_not_issue_credentials(self):
        self.records[User] = None
        with self.assertRaises(HTTPException) as error:
            self.exchange()
        self.assertEqual(error.exception.status_code, 401)
        self.assertNotIn('set-cookie', self.response.headers)
        self.mocks[1].assert_not_called()

    def test_ticket_cannot_be_replayed(self):
        self.exchange()
        with self.assertRaises(HTTPException) as error:
            self.exchange()
        self.assertEqual(error.exception.status_code, 401)

    def test_expired_ticket_is_rejected(self):
        auth._oauth_tickets[self.ticket]['expiresAt'] = time.time() - 1
        with self.assertRaises(HTTPException) as error:
            self.exchange()
        self.assertEqual(error.exception.status_code, 401)
