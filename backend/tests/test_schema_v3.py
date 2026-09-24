"""Check the SQL contract independently of the API's compatibility field names."""
import base64
from datetime import date, datetime, timedelta
import os
from pathlib import Path
import re
import unittest
from unittest.mock import patch
from cryptography.exceptions import InvalidTag

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text, UniqueConstraint
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from encrypted_fields import EncryptedText
from models import User, UserIdentity, PendingRegistration, LandlordTenant, Rental, Bill, InspectionRecord
from routers import auth, admin
from schema_check import schema_problems
from security import create_access_token
from verification import hash_verification_code


class SchemaContractTests(unittest.TestCase):
    def test_every_table_column_type_nullability_and_foreign_key_matches_sql(self):
        sql = (Path(__file__).parents[1] / 'database.sql').read_text(encoding='utf-8')
        tables = dict(re.findall(r'CREATE TABLE `([^`]+)`\s*\((.*?)\) ENGINE', sql, re.S))
        self.assertEqual(len(tables), 27)
        self.assertEqual(set(tables), set(Base.metadata.tables))
        for name, body in tables.items():
            columns = dict(re.findall(r'^\s*`([^`]+)`\s+([^\n]+)', body, re.M))
            model = Base.metadata.tables[name]
            self.assertEqual(set(columns), set(model.columns.keys()), name)
            for column_name, declaration in columns.items():
                with self.subTest(table=name, column=column_name):
                    column = model.c[column_name]
                    self.assertEqual(column.nullable, not ('NOT NULL' in declaration or 'PRIMARY KEY' in declaration))
                    actual = str(column.type.compile(dialect=mysql.dialect())).replace(' ', '').upper()
                    expected = declaration.split(' COMMENT ')[0].split(' DEFAULT ')[0].split(' NOT NULL')[0].split(' PRIMARY')[0].split(' AUTO_INCREMENT')[0].split(' UNIQUE')[0].split(' CHARACTER')[0].rstrip(',')
                    expected = expected.replace(' ', '').upper().replace('BOOLEAN', 'BOOL').replace('INTEGER', 'INT')
                    self.assertEqual(actual.replace('INTEGER', 'INT'), expected)
            expected_fks = {(c, f'{t}.{k}', d) for c, t, k, d in re.findall(r'FOREIGN KEY\s*\(`([^`]+)`\)\s*REFERENCES\s*`([^`]+)`\s*\(`([^`]+)`\)\s*ON DELETE (CASCADE|RESTRICT|SET NULL)', body)}
            self.assertEqual({(fk.parent.name, fk.target_fullname, fk.ondelete) for fk in model.foreign_keys}, expected_fks)
            expected_indexes = {name: tuple(re.findall(r'`([^`]+)`', cols)) for name, cols in re.findall(r'INDEX `([^`]+)`\s*\(([^)]+)\)', body)}
            self.assertEqual({index.name: tuple(c.name for c in index.columns) for index in model.indexes}, expected_indexes)
            expected_unique = {tuple(re.findall(r'`([^`]+)`', cols)) for cols in re.findall(r'UNIQUE KEY `[^`]+`\s*\(([^)]+)\)', body)}
            expected_unique.update((column,) for column, declaration in columns.items() if 'UNIQUE' in declaration)
            self.assertEqual({tuple(c.name for c in constraint.columns) for constraint in model.constraints if isinstance(constraint, UniqueConstraint)}, expected_unique)

    def test_schema_check_is_read_only_and_detects_old_tables(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)'))
        self.assertIn('Missing column: users.role', schema_problems(engine))
        self.assertEqual(inspect(engine).get_table_names(), ['users'])


class NewSchemaApiTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {'AUTH_TOKEN_SECRET': 'schema-test-secret', 'PII_ENCRYPTION_KEY': base64.b64encode(b'x' * 32).decode()})
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        event.listen(self.engine, 'connect', lambda c, _: c.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(admin.router)
        def get_test_db():
            with self.Session() as db:
                yield db
        app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_new_schema_passes_read_only_check(self):
        self.assertEqual(schema_problems(self.engine), [])

    def test_registration_and_login_store_single_role_and_password_in_users(self):
        pending_id = '11111111-1111-1111-1111-111111111111'
        now = datetime.utcnow()
        with self.Session() as db:
            db.add(PendingRegistration(id=pending_id, email='new@example.com', provider='password', role='landlord',
                password_hash=auth.password_hasher.hash('test-password-123'), verification_code_hash=hash_verification_code(pending_id, '123456'),
                expires_at=now + timedelta(minutes=5), resend_available_at=now))
            db.commit()
        response = self.client.post('/api/auth/registration/verify', json={'registrationId': pending_id, 'code': '123456'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['role'], 'landlord')
        with self.Session() as db:
            user = db.query(User).one()
            self.assertEqual(user.role, 'landlord')
            self.assertTrue(auth.password_hasher.verify(user.password_hash, 'test-password-123'))
            self.assertIsNotNone(user.password_changed_at)
        payload = {'email': 'new@example.com', 'password': 'test-password-123', 'role': 'landlord'}
        self.assertEqual(self.client.post('/api/auth/login', json=payload).status_code, 200)
        payload['role'] = 'tenant'
        self.assertEqual(self.client.post('/api/auth/login', json=payload).status_code, 404)
        with self.Session() as db:
            db.query(User).one().role = 'tenant'
            db.commit()
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_same_email_two_roles_register_and_login_independently(self):
        ids = {}
        with patch.object(auth, 'send_verification_email'), patch.object(auth, 'generate_verification_code', return_value='123456'):
            # Both requests can remain pending without replacing one another.
            pending = {}
            for role in ['tenant', 'landlord']:
                response = self.client.post('/api/auth/registration/start', json={
                    'email': ' Shared@Example.com ', 'password': role + '-password-123', 'role': role})
                self.assertEqual(response.status_code, 200, response.text)
                pending[role] = response.json()['registrationId']
            self.assertNotEqual(pending['tenant'], pending['landlord'])
            for role, registration_id in pending.items():
                response = self.client.post('/api/auth/registration/verify', json={'registrationId': registration_id, 'code': '123456'})
                self.assertEqual(response.status_code, 200, response.text)
                ids[role] = response.json()['userId']
                duplicate = self.client.post('/api/auth/registration/start', json={
                    'email': 'SHARED@example.com', 'password': 'another-password', 'role': role})
                self.assertEqual(duplicate.status_code, 409, duplicate.text)
        self.assertNotEqual(ids['tenant'], ids['landlord'])
        for role, user_id in ids.items():
            response = self.client.post('/api/auth/login', json={
                'email': 'shared@example.com', 'password': role + '-password-123', 'role': role})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['userId'], user_id)
            other = 'landlord' if role == 'tenant' else 'tenant'
            response = self.client.post('/api/auth/login', json={
                'email': 'shared@example.com', 'password': other + '-password-123', 'role': role})
            self.assertEqual(response.status_code, 401)
        with self.Session() as db:
            db.add(User(email='shared@example.com', role='tenant'))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()

    def test_google_same_subject_can_register_both_roles_and_select_correct_account(self):
        account = auth.GoogleAccountResponse(email='google@example.com', emailVerified=True, name='Google', picture=None, subject='same-subject')
        ids = {}
        with patch.object(auth, '_google_config', return_value=('id', 'secret-for-tests', '', '')), patch.object(auth, 'send_verification_email'), patch.object(auth, 'generate_verification_code', return_value='123456'):
            for role in ['tenant', 'landlord']:
                ticket = auth._store_ticket(account, role, '/')
                result = self.client.post('/api/auth/google/session', json={'ticket': ticket})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertTrue(result.json()['registrationRequired'])
                pending = self.client.post('/api/auth/registration/start', json={
                    'role': role, 'googleRegistrationToken': result.json()['registrationToken']})
                self.assertEqual(pending.status_code, 200, pending.text)
                result = self.client.post('/api/auth/registration/verify', json={'registrationId': pending.json()['registrationId'], 'code': '123456'})
                self.assertEqual(result.status_code, 200, result.text)
                ids[role] = result.json()['userId']
            for role, user_id in ids.items():
                ticket = auth._store_ticket(account, role, '/')
                result = self.client.post('/api/auth/google/session', json={'ticket': ticket})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertFalse(result.json()['registrationRequired'])
                self.assertEqual(result.json()['userId'], user_id)
        self.assertNotEqual(ids['tenant'], ids['landlord'])

    def test_admin_two_factor_and_directory_use_users_role(self):
        with self.Session() as db:
            user = User(email='admin@example.com', role='admin', password_hash=auth.password_hasher.hash('test-password-123'))
            db.add(user)
            db.commit()
            user_id = user.id
        with patch.object(auth, 'send_admin_login_code'), patch.object(auth, 'generate_verification_code', return_value='123456'):
            response = self.client.post('/api/auth/admin/login', json={'email': 'admin@example.com', 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 200, response.text)
        verified = self.client.post('/api/auth/admin/verify', json={'challengeId': response.json()['challengeId'], 'code': '123456'})
        self.assertEqual(verified.status_code, 200, verified.text)
        headers = {'Authorization': 'Bearer ' + verified.json()['accessToken']}
        response = self.client.get('/api/admin/users', headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]['roles'], ['admin'])
        self.assertTrue(response.json()[0]['hasPassword'])
        with self.Session() as db:
            db.get(User, user_id).role = 'tenant'
            db.commit()
        self.assertEqual(self.client.get('/api/admin/users', headers=headers).status_code, 403)

    def test_sensitive_values_are_encrypted_at_rest_and_round_trip(self):
        with self.Session() as db:
            owner = User(email='owner@example.com', role='landlord')
            db.add(owner)
            db.flush()
            tenant = LandlordTenant(landlord_id=owner.id, name='Test', phone='0912345678', national_id='A123456789', contact_address='台北市測試路')
            db.add(tenant)
            db.commit()
            raw = db.execute(text('SELECT phone, national_id, contact_address FROM landlord_tenants')).one()
            self.assertIsInstance(raw.phone, bytes)
            self.assertNotIn(b'0912345678', raw.phone)
            db.expire_all()
            self.assertEqual(db.query(LandlordTenant).one().phone, '0912345678')
            self.assertEqual(db.query(LandlordTenant).one().contact_address, '台北市測試路')

    def test_bills_and_inspections_use_new_columns(self):
        with self.Session() as db:
            user = User(email='tenant@example.com', role='tenant')
            db.add(user)
            db.flush()
            rental = Rental(user_id=user.id, address='Test', start_date=date(2026, 1, 1), end_date=date(2027, 1, 1), rent_amount=10000, deposit_amount=20000, payment_day=5, total_periods=12)
            db.add(rental)
            db.flush()
            db.add(Bill(rental_id=rental.id, period_index=1, period_start=date(2026, 1, 1), period_end=date(2026, 1, 31), due_date=date(2026, 1, 5), rent_amount=10000))
            db.add(InspectionRecord(rental_id=rental.id, type='check_in', photo_url='/photo', user_note='Test', vlm_result={'damage': False}))
            db.commit()
            self.assertIsNone(db.query(Bill).one().electricity_amount)
            self.assertIsNone(db.query(Bill).one().paid_at)
            self.assertEqual(db.query(InspectionRecord).one().vlm_result, {'damage': False})


class EncryptionFailureTests(unittest.TestCase):
    def test_missing_key_and_oversized_plaintext_fail_closed(self):
        field = EncryptedText(255)
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': ''}):
            with self.assertRaises(ValueError):
                field.process_bind_param('secret', None)
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'x' * 32).decode()}):
            with self.assertRaises(ValueError):
                field.process_bind_param('a' * 227, None)
            encrypted = field.process_bind_param('a' * 226, None)
            self.assertEqual(len(encrypted), 255)
            with self.assertRaises(ValueError):
                field.process_result_value(b'legacy plaintext', None)
            with self.assertRaises(InvalidTag):
                field.process_result_value(encrypted[:-1] + bytes([encrypted[-1] ^ 1]), None)
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': base64.b64encode(b'y' * 32).decode()}):
            with self.assertRaises(InvalidTag):
                field.process_result_value(encrypted, None)
