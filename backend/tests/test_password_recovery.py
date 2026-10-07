import os
import smtplib
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from auth.security import create_access_token, create_cookie_token, get_current_landlord, get_current_tenant
from db import database
from db.database import Base, get_db
from db.models import PasswordResetChallenge, User, UserRole
from migrations.create_password_reset_challenges import upgrade
from routers import auth, password


class PasswordRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.enterContext(patch.object(database, 'engine', self.engine))
        self.enterContext(patch.dict(os.environ, {'VERIFICATION_CODE_SECRET': 'v' * 40, 'AUTH_TOKEN_SECRET': 'test-token-secret'}))
        self.enterContext(patch.object(password, '_smtp_config', return_value={}))
        self.mail = self.enterContext(patch.object(password, 'send_password_reset_code'))
        self.enterContext(patch.object(password, 'generate_verification_code', return_value='123456'))
        password._change_attempts.clear()
        with self.Session() as db:
            user = User(email='member@example.com', password_hash=auth.password_hasher.hash('Original-pass-1'),
                        password_changed_at=datetime.utcnow() - timedelta(days=1), email_verified_at=datetime.utcnow(),
                        roles=[UserRole(role='tenant'), UserRole(role='landlord')])
            db.add(user)
            db.commit()
            self.user_id = user.id
        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(password.router)
        def session():
            with self.Session() as db:
                yield db
        app.dependency_overrides[get_db] = session
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def start(self, email='member@example.com'):
        return self.client.post('/api/auth/password/reset/start', json={'email': email})

    def complete(self, challenge, code='123456', new='Replacement-pass-2'):
        return self.client.post('/api/auth/password/reset/complete', json={
            'challengeId': challenge, 'code': code, 'newPassword': new})

    def login(self, value='Original-pass-1', role='tenant'):
        return self.client.post('/api/auth/login', json={'email': 'member@example.com', 'password': value, 'role': role})

    def expire_cooldown(self):
        with self.Session() as db:
            row = db.query(PasswordResetChallenge).filter_by(email='member@example.com').one()
            row.resend_available_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()

    def test_reset_changes_shared_password_and_is_single_use(self):
        start = self.start()
        self.assertEqual(start.status_code, 200, start.text)
        self.mail.assert_called_once_with('member@example.com', '123456')
        self.assertNotIn('123456', start.text)
        cid = start.json()['challengeId']
        with self.Session() as db:
            self.assertNotEqual(db.get(PasswordResetChallenge, cid).code_hash, '123456')
        self.assertEqual(self.complete(cid).status_code, 200)
        self.assertEqual(self.complete(cid).status_code, 400)
        self.assertEqual(self.login().status_code, 401)
        for role in ['tenant', 'landlord']:
            self.assertEqual(self.login('Replacement-pass-2', role).status_code, 200)

    def test_unknown_and_google_accounts_have_same_public_response(self):
        known = self.start().json()
        unknown = self.start('missing@example.com').json()
        self.assertEqual(set(known), set(unknown))
        self.assertEqual(known['message'], unknown['message'])
        self.assertEqual(self.complete(unknown['challengeId']).status_code, 400)
        with self.Session() as db:
            user = db.get(User, self.user_id)
            user.password_hash = None
            db.commit()
        self.expire_cooldown()
        self.mail.reset_mock()
        google = self.start()
        self.assertEqual(google.status_code, 200)
        self.mail.assert_not_called()
        self.assertEqual(self.complete(google.json()['challengeId']).status_code, 400)

    def test_suspended_and_admin_accounts_cannot_reset_here(self):
        for state in ['suspended', 'admin']:
            with self.subTest(state=state), self.Session() as db:
                db.query(PasswordResetChallenge).delete()
                user = db.get(User, self.user_id)
                user.status = 'suspended' if state == 'suspended' else 'active'
                if state == 'admin': user.roles.append(UserRole(role='admin'))
                db.commit()
                self.mail.reset_mock()
                result = self.start()
                self.assertEqual(result.status_code, 200)
                self.mail.assert_not_called()
                self.assertEqual(self.complete(result.json()['challengeId']).status_code, 400)

    def test_resend_has_cooldown_and_invalidates_previous_code(self):
        first = self.start().json()['challengeId']
        self.assertEqual(self.start().status_code, 429)
        self.expire_cooldown()
        with patch.object(password, 'generate_verification_code', return_value='654321'):
            second = self.start().json()['challengeId']
        self.assertNotEqual(first, second)
        self.assertEqual(self.complete(first).status_code, 400)
        self.assertEqual(self.complete(second).status_code, 400)
        self.assertEqual(self.complete(second, code='654321').status_code, 200)

    def test_wrong_attempts_are_persisted_and_lock_correct_code(self):
        cid = self.start().json()['challengeId']
        for _ in range(5): self.assertEqual(self.complete(cid, code='000000').status_code, 400)
        self.assertEqual(self.complete(cid).status_code, 400)
        with self.Session() as db:
            self.assertEqual(db.get(PasswordResetChallenge, cid).attempt_count, 5)

    def test_expired_challenge_is_rejected(self):
        cid = self.start().json()['challengeId']
        with self.Session() as db:
            db.get(PasswordResetChallenge, cid).expires_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.complete(cid).status_code, 400)

    def test_email_budget_recovers_after_window(self):
        self.start()
        with self.Session() as db:
            row = db.query(PasswordResetChallenge).one()
            row.send_count = 5
            row.resend_available_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.start().status_code, 429)
        with self.Session() as db:
            db.query(PasswordResetChallenge).one().window_started_at = datetime.utcnow() - timedelta(hours=2)
            db.commit()
        self.assertEqual(self.start().status_code, 200)

    def test_mail_failure_is_reported_and_request_can_be_retried(self):
        self.mail.side_effect = smtplib.SMTPException('test failure')
        self.assertEqual(self.start().status_code, 503)
        with self.Session() as db: self.assertEqual(db.query(PasswordResetChallenge).count(), 0)
        self.mail.side_effect = None
        self.assertEqual(self.start().status_code, 200)

    def test_policy_and_confirmation_do_not_consume_valid_code(self):
        cid = self.start().json()['challengeId']
        self.assertEqual(self.complete(cid, new='short').status_code, 422)
        self.assertEqual(self.complete(cid, new='Original-pass-1').status_code, 422)
        self.assertEqual(self.complete(cid).status_code, 200)

    def test_reset_revokes_cookie_and_bearer_for_both_roles(self):
        tokens = {role: create_access_token(self.user_id, role) for role in ['tenant', 'landlord']}
        cookie = create_cookie_token(self.user_id, 'member@example.com', 'tenant')
        cid = self.start().json()['challengeId']
        self.assertEqual(self.complete(cid).status_code, 200)
        self.client.cookies.set('access_token', cookie)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        with self.Session() as db:
            for role, guard in [('tenant', get_current_tenant), ('landlord', get_current_landlord)]:
                with self.assertRaises(HTTPException) as caught:
                    guard('Bearer ' + tokens[role], db)
                self.assertEqual(caught.exception.status_code, 401)

    def test_authenticated_change_requires_current_password_and_revokes_challenge(self):
        cid = self.start().json()['challengeId']
        self.assertEqual(self.login().status_code, 200)
        def change(old):
            return self.client.post('/api/auth/password/change', json={'currentPassword': old, 'newPassword': 'Changed-pass-2'})
        self.assertEqual(change('wrong').status_code, 400)
        self.assertEqual(change('Original-pass-1').status_code, 200)
        self.assertEqual(self.complete(cid).status_code, 400)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.login('Changed-pass-2').status_code, 200)

    def test_change_without_login_is_rejected(self):
        result = self.client.post('/api/auth/password/change', json={'currentPassword': 'Original-pass-1', 'newPassword': 'Changed-pass-2'})
        self.assertEqual(result.status_code, 401)

    def test_challenge_cannot_replace_a_newer_password(self):
        cid = self.start().json()['challengeId']
        with self.Session() as db:
            db.get(User, self.user_id).password_hash = auth.password_hasher.hash('Changed-elsewhere-3')
            db.commit()
        self.assertEqual(self.complete(cid).status_code, 400)

    def test_migration_is_idempotent_and_preserves_accounts(self):
        PasswordResetChallenge.__table__.drop(self.engine)
        upgrade(self.engine)
        upgrade(self.engine)
        with self.Session() as db:
            self.assertEqual(db.query(User).count(), 1)

    def test_current_password_attempts_are_limited(self):
        self.login()
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/password/change', json={
                'currentPassword': 'wrong-password', 'newPassword': 'Changed-pass-2'}).status_code, 400)
        self.assertEqual(self.client.post('/api/auth/password/change', json={
            'currentPassword': 'Original-pass-1', 'newPassword': 'Changed-pass-2'}).status_code, 429)

    def test_platform_password_policy_is_enforced(self):
        cid = self.start().json()['challengeId']
        with patch.object(password.platform_settings, 'password_min_length', return_value=20):
            self.assertEqual(self.complete(cid, new='Too-short-2').status_code, 422)

    def test_reissued_bearer_preserves_cookie_issue_time(self):
        from auth.security import read_access_token
        import jwt
        self.login()
        issued = jwt.decode(self.client.cookies.get('access_token'), options={'verify_signature': False})['iat']
        response = self.client.get('/api/auth/me')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(read_access_token(response.json()['accessToken'])['iat'], issued)

    def test_email_configuration_failure_is_uniform(self):
        with patch.object(password, '_smtp_config', side_effect=password.EmailConfigurationError('test')):
            self.assertEqual(self.start().status_code, 503)
            self.assertEqual(self.start('missing@example.com').status_code, 503)
