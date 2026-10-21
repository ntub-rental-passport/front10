"""在暫存 SQLite 資料庫驗證個資金鑰輪替，不連線至實際資料庫。"""
import base64
from contextlib import redirect_stderr, redirect_stdout
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Column, Integer, LargeBinary, String, Table, create_engine, event, text
from sqlalchemy.dialects import mysql

from db import models
from db.database import Base
from db.encrypted_fields import EncryptedText
from migrations import rotate_pii_key


class RotatePiiKeyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'pii.db'
        self.old_key, self.new_key = b'o' * 32, b'n' * 32
        self.old_env = base64.b64encode(self.old_key).decode()
        self.new_env = base64.b64encode(self.new_key).decode()
        env = patch.dict(os.environ, {
            'DATABASE_URL': 'sqlite:///' + self.path.as_posix(),
            'OLD_PII_ENCRYPTION_KEY': self.old_env,
            'PII_ENCRYPTION_KEY': self.new_env,
            'PYTHON_DOTENV_DISABLED': '1',
        })
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine(os.environ['DATABASE_URL'])
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, 'connect', lambda connection, _: connection.execute('PRAGMA foreign_keys=ON'))
        Base.metadata.create_all(self.engine)
        with self.engine.begin() as connection:
            with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': self.old_env}):
                connection.execute(models.User.__table__.insert().values(
                    id=1, email='old@example.com', national_id='A123456789'))
                connection.execute(models.LandlordTenant.__table__.insert().values(
                    id=1, landlord_id=1, name='舊金鑰租客', phone='0912345678',
                    contact_address='臺北市測試路一號', emergency_phone=''))
            connection.execute(models.User.__table__.insert().values(
                id=2, email='new@example.com', national_id='B123456789'))
            connection.execute(models.User.__table__.insert().values(id=3, email='null@example.com'))
            connection.execute(models.LandlordTenant.__table__.insert().values(
                id=2, landlord_id=1, name='新金鑰租客', phone='0923456789', national_id='C123456789'))
        self.plaintexts = {
            ('users', 1, 'national_id'): 'A123456789',
            ('users', 2, 'national_id'): 'B123456789',
            ('landlord_tenants', 1, 'phone'): '0912345678',
            ('landlord_tenants', 1, 'contact_address'): '臺北市測試路一號',
            ('landlord_tenants', 1, 'emergency_phone'): '',
            ('landlord_tenants', 2, 'phone'): '0923456789',
            ('landlord_tenants', 2, 'national_id'): 'C123456789',
        }

    def snapshot(self):
        with self.engine.connect() as connection:
            return {name: [dict(row) for row in connection.execute(
                text(f'SELECT * FROM "{name}" ORDER BY 1')).mappings()]
                for name in Base.metadata.tables}

    def run_main(self, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = rotate_pii_key.main(list(args))
        return result, stdout.getvalue(), stderr.getvalue()

    def encrypt(self, key, plaintext):
        nonce = os.urandom(12)
        return b'\x01' + nonce + AESGCM(key).encrypt(nonce, plaintext.encode(), b'rentmate-pii-v1')

    def assert_no_secrets(self, output, snapshot):
        for secret in (self.old_env, self.new_env, os.environ['DATABASE_URL']):
            self.assertNotIn(secret, output)
        for plaintext in self.plaintexts.values():
            if plaintext:
                self.assertNotIn(plaintext, output)
        for rows in snapshot.values():
            for row in rows:
                for value in row.values():
                    if isinstance(value, bytes):
                        self.assertNotIn(repr(value), output)
                        if value:
                            self.assertNotIn(value.hex(), output)
                            self.assertNotIn(base64.b64encode(value).decode(), output)

    def test_dry_run_reports_every_encrypted_column_without_writes(self):
        before = self.snapshot()
        before_file = self.path.read_bytes()
        result, stdout, stderr = self.run_main()
        self.assertEqual(result, 0, stderr)
        self.assertEqual(stderr, '')
        expected = {
            'users.national_id': (1, 1),
            'landlord_tenants.phone': (1, 1),
            'landlord_tenants.national_id': (1, 0),
            'landlord_tenants.contact_address': (0, 1),
            'landlord_tenants.emergency_phone': (0, 1),
        }
        for table in Base.metadata.sorted_tables:
            for column in table.columns:
                if isinstance(column.type, EncryptedText):
                    name = f'{table.name}.{column.name}'
                    new, old = expected.get(name, (0, 0))
                    self.assertIn(f'{name}: new={new} old={old} undecryptable=0', stdout)
        self.assertIn('僅檢查', stdout)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.path.read_bytes(), before_file)
        self.assert_no_secrets(stdout + stderr, before)

    def test_apply_rotates_raw_values_preserves_nulls_and_is_idempotent(self):
        before = self.snapshot()
        with patch.object(EncryptedText, 'process_bind_param', side_effect=AssertionError('不可走型別加密')), \
                patch.object(EncryptedText, 'process_result_value', side_effect=AssertionError('不可走型別解密')):
            result, stdout, stderr = self.run_main('--apply')
        self.assertEqual(result, 0, stderr)
        self.assertIn('已輪替 4 個值。', stdout)
        after = self.snapshot()
        for table, rows in after.items():
            for previous, row in zip(before[table], rows):
                for column, value in row.items():
                    key = (table, row['id'], column)
                    if key not in self.plaintexts:
                        self.assertEqual(value, previous[column], key)
                        continue
                    plaintext = AESGCM(self.new_key).decrypt(value[1:13], value[13:], b'rentmate-pii-v1')
                    self.assertEqual(plaintext.decode(), self.plaintexts[key])
                    if row['id'] == 1:
                        self.assertNotEqual(value[1:13], previous[column][1:13])
                    else:
                        self.assertEqual(value, previous[column])
        self.assert_no_secrets(stdout + stderr, before)
        result, stdout, stderr = self.run_main('--apply')
        self.assertEqual(result, 0, stderr)
        self.assertIn('已輪替 0 個值。', stdout)
        self.assertEqual(self.snapshot(), after)

    def test_undecryptable_values_report_only_location_and_abort_before_updates(self):
        valid = self.encrypt(self.old_key, '損毀測試')
        invalid_values = [b'', b'\x01' + b'x' * 27, b'\x02' + valid[1:],
                          self.encrypt(b'x' * 32, '未知金鑰'),
                          valid[:-1] + bytes([valid[-1] ^ 1]), '未加密資料']
        for invalid in invalid_values:
            with self.subTest(value_type=type(invalid).__name__, length=len(invalid)):
                with self.engine.begin() as connection:
                    connection.execute(text('UPDATE users SET national_id = :value WHERE id = 3'), {'value': invalid})
                before = self.snapshot()
                result, stdout, stderr = self.run_main()
                self.assertEqual(result, 0, stderr)
                self.assertIn('users.national_id: new=1 old=1 undecryptable=1', stdout)
                self.assertIn("無法解密：資料表=users 主鍵={'id': 3} 欄位=national_id", stdout)
                updates = []

                def record_updates(connection, cursor, statement, parameters, context, executemany):
                    if statement.startswith('UPDATE '):
                        updates.append(statement)

                event.listen(self.engine, 'before_cursor_execute', record_updates)
                try:
                    with patch.object(rotate_pii_key, 'create_engine', return_value=self.engine):
                        result, stdout, stderr = self.run_main('--apply')
                finally:
                    event.remove(self.engine, 'before_cursor_execute', record_updates)
                self.assertEqual(result, 1)
                self.assertIn('存在無法解密的值', stderr)
                self.assertEqual(updates, [])
                self.assertEqual(self.snapshot(), before)
                self.assert_no_secrets(stdout + stderr, before)
                self.assertNotIn('未加密資料', stdout + stderr)

    def test_identical_invalid_or_missing_environment_inputs_are_rejected_before_connecting(self):
        cases = [{'OLD_PII_ENCRYPTION_KEY': self.new_env}, {'DATABASE_URL': ''}]
        for name in ('OLD_PII_ENCRYPTION_KEY', 'PII_ENCRYPTION_KEY'):
            for value in ('', '不是 base64', '***', base64.b64encode(b'x' * 31).decode(),
                          base64.b64encode(b'x' * 33).decode()):
                cases.append({name: value})
        for env in cases:
            with self.subTest(names=list(env)):
                with patch.dict(os.environ, env), patch.object(rotate_pii_key, 'create_engine') as create:
                    result, stdout, stderr = self.run_main('--apply')
                self.assertEqual(result, 1)
                self.assertEqual(stdout, '')
                self.assertTrue(stderr)
                create.assert_not_called()
                self.assert_no_secrets(stdout + stderr, self.snapshot())

    def test_compare_and_swap_conflict_rolls_back_prior_updates(self):
        before = self.snapshot()
        updates = []
        replacement = self.encrypt(self.new_key, '同時修改')

        def change_second_value(connection, cursor, statement, parameters, context, executemany):
            if statement.startswith('UPDATE '):
                updates.append(statement)
                if len(updates) == 2:
                    # 模擬掃描後第二筆密文已被改寫，第一筆輪替必須一起回復。
                    cursor.execute('UPDATE landlord_tenants SET phone = ? WHERE id = 1', (replacement,))

        event.listen(self.engine, 'before_cursor_execute', change_second_value)
        self.addCleanup(event.remove, self.engine, 'before_cursor_execute', change_second_value)
        with patch.object(rotate_pii_key, 'create_engine', return_value=self.engine):
            result, stdout, stderr = self.run_main('--apply')
        self.assertEqual(result, 1)
        self.assertIn('並行修改', stderr)
        self.assertEqual(len(updates), 2)
        self.assertEqual(self.snapshot(), before)
        self.assertNotIn('已輪替', stdout)

    def test_verification_failure_rolls_back_all_updates(self):
        for replacement in (b'broken', self.encrypt(self.new_key, '錯誤的明文')):
            with self.subTest(length=len(replacement)):
                with self.engine.begin() as connection:
                    connection.execute(text('DROP TRIGGER IF EXISTS corrupt_rotation'))
                    connection.execute(text(f'''
                        CREATE TRIGGER corrupt_rotation AFTER UPDATE OF phone ON landlord_tenants
                        WHEN NEW.id = 1
                        BEGIN
                            UPDATE users SET national_id = X'{replacement.hex()}' WHERE id = 1;
                        END
                    '''))
                before = self.snapshot()
                result, stdout, stderr = self.run_main('--apply')
                self.assertEqual(result, 1)
                self.assertIn('解密驗證失敗', stderr)
                self.assertEqual(self.snapshot(), before)
                self.assertNotIn('已輪替', stdout)

    def test_dynamic_discovery_handles_composite_primary_keys_and_quoted_identifiers(self):
        extra = Table('rotation extra', Base.metadata,
                      Column('group', Integer, primary_key=True), Column('key', String(20), primary_key=True),
                      Column('secret value', EncryptedText(255)))
        self.addCleanup(Base.metadata.remove, extra)
        extra.create(self.engine)
        with patch.dict(os.environ, {'PII_ENCRYPTION_KEY': self.old_env}), self.engine.begin() as connection:
            connection.execute(extra.insert(), [
                {'group': 1, 'key': 'a', 'secret value': '第一筆'},
                {'group': 1, 'key': 'b', 'secret value': '第二筆'},
            ])
        result, stdout, stderr = self.run_main('--apply')
        self.assertEqual(result, 0, stderr)
        self.assertIn('rotation extra.secret value: new=0 old=2 undecryptable=0', stdout)
        self.assertIn('已輪替 6 個值。', stdout)
        with self.engine.connect() as connection:
            rows = connection.execute(extra.select().order_by(extra.c.key)).mappings().all()
        self.assertEqual([row['secret value'] for row in rows], ['第一筆', '第二筆'])

    def test_raw_update_compiles_for_mysql_without_type_decorator_or_timestamp_update(self):
        raw_table, _, _ = next(target for target in rotate_pii_key.encrypted_tables()
                               if target[0].name == 'landlord_tenants')
        self.assertIsInstance(raw_table.c.phone.type, LargeBinary)
        statement = raw_table.update().where(raw_table.c.id == 1, raw_table.c.phone == b'old').values(phone=b'new')
        compiled = statement.compile(dialect=mysql.dialect())
        self.assertIn('WHERE landlord_tenants.id = %s AND landlord_tenants.phone = %s', str(compiled))
        self.assertNotIn('updated_at', str(compiled))
        for parameter in compiled.binds.values():
            self.assertNotIsInstance(parameter.type, EncryptedText)

    def test_module_and_direct_script_entry_points(self):
        backend = Path(__file__).parents[1]
        for arguments, count in [(['-m', 'migrations.rotate_pii_key', '--apply'], 4),
                                 (['migrations/rotate_pii_key.py', '--apply'], 0)]:
            result = subprocess.run([sys.executable, *arguments], cwd=backend, env=os.environ.copy(),
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f'已輪替 {count} 個值。', result.stdout)

    def test_database_and_argument_errors_do_not_echo_sensitive_inputs(self):
        before = self.snapshot()
        secret = self.old_env + os.environ['DATABASE_URL'] + 'A123456789'
        with patch.object(rotate_pii_key, 'create_engine', side_effect=RuntimeError(secret)):
            result, stdout, stderr = self.run_main('--apply')
        self.assertEqual(result, 1)
        self.assert_no_secrets(stdout + stderr, before)
        for arguments in (['--old-key', secret], ['--apply=' + secret]):
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr), self.assertRaises(SystemExit) as error:
                rotate_pii_key.main(arguments)
            self.assertNotEqual(error.exception.code, 0)
            self.assert_no_secrets(stdout.getvalue() + stderr.getvalue(), before)
