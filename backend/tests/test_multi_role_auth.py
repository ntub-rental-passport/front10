"""Authentication and authorization with shared account role memberships."""
from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

import manage_admin
from models import PendingRegistration, User, UserIdentity, UserRole
from routers import auth
from security import get_current_landlord, get_current_tenant
import test_schema_v3 as schema_tests
from verification import hash_verification_code


class MultiRoleAuthTests(unittest.TestCase):
    setUp = schema_tests.NewSchemaApiTests.setUp

    def account(self, roles=('tenant',), status='active'):
        with self.Session() as db:
            user = User(email='shared@example.com', display_name='Original name', status=status,
                        email_verified_at=datetime.utcnow(),
                        password_hash=auth.password_hasher.hash('original-password'),
                        roles=[UserRole(role=role) for role in roles])
            db.add(user)
            db.commit()
            return user.id

    def start(self, role='landlord', password='original-password', **kwargs):
        with patch.object(auth, 'send_verification_email'), patch.object(
            auth, 'generate_verification_code', return_value='123456'
        ):
            return self.client.post('/api/auth/registration/start', json={
                'email': 'shared@example.com', 'password': password, 'role': role, **kwargs})

    def verify(self, pending, code='123456'):
        return self.client.post('/api/auth/registration/verify', json={
            'registrationId': pending.json()['registrationId'], 'code': code})

    def test_add_role_requires_password_and_email_proof_and_preserves_account(self):
        user_id = self.account()
        self.assertEqual(self.start(password='wrong-password').status_code, 401)
        pending = self.start()
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertEqual(self.verify(pending, '000000').status_code, 400)
        with self.Session() as db:
            self.assertFalse(db.get(User, user_id).has_role('landlord'))
            original_hash = db.get(User, user_id).password_hash
        result = self.verify(pending)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['userId'], user_id)
        self.assertEqual(result.json()['displayName'], 'Original name')
        self.assertEqual(self.verify(pending).status_code, 404)
        with self.Session() as db:
            self.assertEqual(db.query(User).count(), 1)
            self.assertEqual(db.get(User, user_id).password_hash, original_hash)
            self.assertEqual(db.query(UserRole).count(), 2)

    def test_selected_role_guards_and_revocation(self):
        user_id = self.account(('tenant', 'landlord'))
        tokens = {}
        for role in ('tenant', 'landlord'):
            result = self.client.post('/api/auth/login', json={
                'email': 'SHARED@example.com', 'password': 'original-password', 'role': role})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['userId'], user_id)
            self.assertEqual(self.client.get('/api/auth/me').json()['role'], role)
            tokens[role] = 'Bearer ' + result.json()['accessToken']
        with self.Session() as db:
            self.assertEqual(get_current_tenant(tokens['tenant'], db).id, user_id)
            self.assertEqual(get_current_landlord(tokens['landlord'], db).id, user_id)
            with self.assertRaises(HTTPException):
                get_current_landlord(tokens['tenant'], db)
            db.get(User, user_id).roles = [r for r in db.get(User, user_id).roles if r.role != 'landlord']
            db.commit()
            with self.assertRaises(HTTPException):
                get_current_landlord(tokens['landlord'], db)
            self.assertEqual(get_current_tenant(tokens['tenant'], db).id, user_id)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_google_link_after_email_proof_preserves_password_and_profile(self):
        user_id = self.account()
        account = auth.GoogleAccountResponse(email='shared@example.com', emailVerified=True,
            name='Google name', picture=None, subject='google-subject')
        with patch.object(auth, '_google_config', return_value=('id', 'test-secret', '', '')):
            ticket = auth._store_ticket(account, 'landlord', '/')
            exchange = self.client.post('/api/auth/google/session', json={'ticket': ticket})
            self.assertTrue(exchange.json()['registrationRequired'])
            self.assertIsNone(exchange.json()['accessToken'])
            pending = self.start(googleRegistrationToken=exchange.json()['registrationToken'])
            result = self.verify(pending)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['userId'], user_id)
            for role in ('tenant', 'landlord'):
                ticket = auth._store_ticket(account, role, '/')
                result = self.client.post('/api/auth/google/session', json={'ticket': ticket})
                self.assertFalse(result.json()['registrationRequired'])
                self.assertEqual(result.json()['userId'], user_id)
        with self.Session() as db:
            self.assertEqual(db.query(UserIdentity).count(), 1)
            user = db.get(User, user_id)
            self.assertTrue(auth.password_hasher.verify(user.password_hash, 'original-password'))
            self.assertEqual(user.display_name, 'Original name')

    def test_suspended_account_cannot_add_role_or_complete_pending_registration(self):
        user_id = self.account()
        pending = self.start()
        with self.Session() as db:
            db.get(User, user_id).status = 'suspended'
            db.commit()
        self.assertEqual(self.start().status_code, 403)
        self.assertEqual(self.verify(pending).status_code, 403)
        with self.Session() as db:
            self.assertFalse(db.get(User, user_id).has_role('landlord'))

    def test_public_registration_never_grants_admin_even_from_pending_record(self):
        self.assertEqual(self.start(role='admin').status_code, 422)
        pending_id = '11111111-1111-1111-1111-111111111111'
        now = datetime.utcnow()
        with self.Session() as db:
            db.add(PendingRegistration(id=pending_id, email='shared@example.com', provider='password',
                role='admin', password_hash=auth.password_hasher.hash('original-password'),
                verification_code_hash=hash_verification_code(pending_id, '123456'),
                expires_at=now + timedelta(minutes=5), resend_available_at=now))
            db.commit()
        result = self.client.post('/api/auth/registration/verify', json={
            'registrationId': pending_id, 'code': '123456'})
        self.assertEqual(result.status_code, 403)

    def test_admin_grant_and_revoke_preserve_other_roles_and_active_status(self):
        user_id = self.account(('tenant', 'landlord'))
        with patch.object(manage_admin, 'SessionLocal', self.Session), patch.object(
            manage_admin, '_prompt_password', return_value='original-password'
        ), patch('builtins.print'):
            manage_admin.cmd_grant('shared@example.com')
            with self.Session() as db:
                self.assertEqual({r.role for r in db.get(User, user_id).roles}, {'tenant', 'landlord', 'admin'})
            manage_admin.cmd_revoke('shared@example.com')
        with self.Session() as db:
            user = db.get(User, user_id)
            self.assertEqual({r.role for r in user.roles}, {'tenant', 'landlord'})
            self.assertEqual(user.status, 'active')

    def test_duplicate_role_rejected_and_account_deletion_cascades(self):
        user_id = self.account(('tenant', 'landlord'))
        with self.Session() as db:
            db.add(UserRole(user_id=user_id, role='tenant'))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()
            db.delete(db.get(User, user_id))
            db.commit()
            self.assertEqual(db.query(UserRole).count(), 0)

    def test_google_identity_cannot_be_reassigned_to_matching_new_email(self):
        user_id = self.account()
        with self.Session() as db:
            other = User(email='other@example.com', roles=[UserRole(role='tenant')])
            db.add(other)
            db.flush()
            db.add(UserIdentity(user_id=other.id, provider='google', provider_subject='bound-subject'))
            db.commit()
        account = auth.GoogleAccountResponse(email='shared@example.com', emailVerified=True,
            name=None, picture=None, subject='bound-subject')
        with patch.object(auth, '_google_config', return_value=('id', 'test-secret', '', '')):
            ticket = auth._store_ticket(account, 'landlord', '/')
            result = self.client.post('/api/auth/google/session', json={'ticket': ticket})
            pending = self.start(googleRegistrationToken=result.json()['registrationToken'])
            self.assertEqual(pending.status_code, 409)
        with self.Session() as db:
            self.assertFalse(db.get(User, user_id).has_role('landlord'))
            self.assertNotEqual(db.query(UserIdentity).one().user_id, user_id)
