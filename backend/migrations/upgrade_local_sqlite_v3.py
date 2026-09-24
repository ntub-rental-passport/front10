"""Copy a legacy local SQLite database into a separate schema-v3 database.

Default: read-only plan. --apply creates a new file; --activate switches .env
only after schema, foreign-key, row-count and decryption checks pass.
The original database is never edited. Multi-role users become separate accounts.
"""
import argparse
import base64
from contextlib import closing
from datetime import datetime, time
from decimal import Decimal
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from sqlalchemy import MetaData, Numeric, create_engine, select, event, text
from dotenv import dotenv_values
from database import Base
import models
from schema_check import require_current_schema
from encrypted_fields import EncryptedText

RENAMES = {'notes': 'personal_notes', 'note_households': 'households',
           'note_household_members': 'household_members', 'note_household_tasks': 'roommate_tasks'}


def read_source(path):
    path = Path(path).resolve(strict=True)
    engine = create_engine('sqlite://', creator=lambda: sqlite3.connect(path.as_uri() + '?mode=ro', uri=True))
    try:
        metadata = MetaData()
        metadata.reflect(engine)
        with engine.connect() as connection:
            return {name: [dict(row) for row in connection.execute(select(table)).mappings()]
                    for name, table in metadata.tables.items()}
    finally:
        engine.dispose()


def plan(source):
    rows = read_source(source)
    roles = {}
    for row in rows.get('user_roles', []):
        roles.setdefault(row['user_id'], set()).add(row['role'])
    users = {row['id']: row for row in rows.get('users', [])}
    for credential in rows.get('user_password_credentials', []):
        user = users[credential['user_id']]
        user['password_hash'] = credential['password_hash']
        user['password_changed_at'] = credential.get('password_changed_at')

    account_ids = {}
    next_id = max(users, default=0) + 1
    split_users = []
    for user_id, user in users.items():
        available = roles.get(user_id, {user['role']} if user.get('role') else set())
        if not available or not available <= {'tenant', 'landlord', 'admin'}:
            raise ValueError(f'User {user_id}: invalid or missing legacy role')
        # Tenant IDs are also used by the separate garbage-reminder SQLite
        # queue and browser caches. Preserve that ID; remap landlord foreign keys.
        for index, role in enumerate(sorted(available, key={'tenant': 0, 'landlord': 1, 'admin': 2}.get)):
            new_id = user_id if index == 0 else next_id
            if index:
                next_id += 1
            account_ids[user_id, role] = new_id
            split_users.append({**user, 'id': new_id, 'role': role,
                                'email': user['email'].strip().lower()})
    rows['users'] = split_users

    identities = []
    next_identity = max((row['id'] for row in rows.get('user_identities', [])), default=0) + 1
    for identity in rows.get('user_identities', []):
        targets = [new for (old, role), new in account_ids.items() if old == identity['user_id']]
        if not targets:
            raise ValueError('Identity points to a missing account')
        for index, user_id in enumerate(targets):
            identities.append({**identity, 'user_id': user_id,
                               'id': identity['id'] if index == 0 else next_identity})
            if index:
                next_identity += 1
    rows['user_identities'] = identities

    def account_id(old_id, required_role):
        if (old_id, required_role) not in account_ids:
            raise ValueError(f'User {old_id} has no {required_role} account for owned data')
        return account_ids[old_id, required_role]

    role_columns = {
        'rentals': {'user_id': 'tenant'},
        'landlord_properties': {'landlord_id': 'landlord'},
        'landlord_tenants': {'landlord_id': 'landlord'},
        'repair_tickets': {'tenant_user_id': 'tenant'},
        'personal_notes': {'user_id': 'tenant'},
        'households': {'created_by': 'tenant'},
        'household_members': {'user_id': 'tenant'},
        'trash_favorites': {'user_id': 'tenant'},
        'subsidy_applications': {'user_id': 'tenant'},
        'pending_admin_logins': {'user_id': 'admin'},
        'admin_settings': {'updated_by': 'admin'},
        'admin_audit_logs': {'actor_user_id': 'admin'},
    }

    known = set(Base.metadata.tables) | set(RENAMES) | {'user_roles', 'user_password_credentials', 'utility_outages'}
    for name, data in rows.items():
        if data and name not in known:
            raise ValueError(f'Unmapped nonempty table: {name}; preserve it before upgrading')
    if rows.get('utility_outages'):
        raise ValueError('Legacy utility_outages contains data; an explicit archive decision is required')
    if rows.get('bills') and any('period_start' not in row or 'period_end' not in row for row in rows['bills']):
        raise ValueError('Legacy bills need explicit billing-period dates; this tool will not invent them')

    maps = {name: {str(row['id']): index for index, row in enumerate(sorted(rows.get(name, []), key=lambda r: str(r['id'])), 1)}
            for name in ['note_households', 'note_household_members', 'note_household_tasks']}
    output = {name: [] for name in Base.metadata.tables}
    now = datetime.utcnow()
    for old_name, data in rows.items():
        name = RENAMES.get(old_name, old_name)
        if name not in output:
            continue
        if old_name in RENAMES and rows.get(name):
            raise ValueError(f'Both legacy and v3 tables contain records: {old_name}, {name}')
        for original in data:
            row = dict(original)
            if old_name in maps:
                row['id'] = maps[old_name][str(row['id'])]
            if old_name in ['note_household_members', 'note_household_tasks']:
                row['household_id'] = maps['note_households'][str(row['household_id'])]
            if old_name == 'note_households':
                row['created_by'] = row.pop('owner_id')
                # Existing invites exceed VARCHAR(20); rotate, preserving old DB.
                if len(row['invite_code']) > 20:
                    row['invite_code'] = secrets.token_urlsafe(15)
            if old_name == 'note_household_members':
                if row.get('user_id') is None:
                    raise ValueError('Unlinked household member requires a real user account before migration')
                row['display_name'] = row.pop('name')
                row.setdefault('joined_at', now)
            if old_name in ['notes', 'note_household_tasks']:
                row['due_date'] = row.pop('note_date')
                value = row.pop('note_time')
                row['due_time'] = time.fromisoformat(value) if value else None
                row['done'] = row.pop('is_done')
                # No fake historical completion timestamp: done_at stays NULL.
                row.setdefault('created_at', now)
                row.setdefault('updated_at', now)
            if old_name == 'note_household_tasks':
                for old, new in [('assignee_id', 'assignee_member_id'), ('creator_id', 'creator_member_id')]:
                    value = row.pop(old)
                    row[new] = maps['note_household_members'][str(value)] if value else None
            if name == 'inspection_records' and 'description' in row:
                row['user_note'] = row.pop('description')
            if name == 'bills':
                for old, new in [('period_number', 'period_index'), ('rent_fee', 'rent_amount'), ('electricity_fee', 'electricity_amount'), ('water_fee', 'water_amount')]:
                    if old in row:
                        row[new] = row.pop(old)
                if row.get('bill_status') == 'paid' and not row.get('paid_at'):
                    raise ValueError('Paid bill has no paid_at timestamp; resolve explicitly')
            columns = Base.metadata.tables[name].columns
            row = {key: value for key, value in row.items() if key in columns}
            if name not in {'users', 'user_identities'}:
                for column in columns:
                    if row.get(column.name) is None or not any(fk.target_fullname == 'users.id' for fk in column.foreign_keys):
                        continue
                    old_id = row[column.name]
                    required_role = role_columns.get(name, {}).get(column.name)
                    if required_role:
                        row[column.name] = account_id(old_id, required_role)
                    else:
                        targets = [new for (old, role), new in account_ids.items() if old == old_id]
                        if len(targets) != 1:
                            raise ValueError(f'Ambiguous ownership: {name}.{column.name}; explicit mapping needed')
                        row[column.name] = targets[0]
            if name == 'pending_registrations':
                row['email'] = row['email'].strip().lower()
            for column in columns:
                if column.name in row and row[column.name] is not None:
                    value = row[column.name]
                    if isinstance(column.type, Numeric):
                        decimal = Decimal(str(value))
                        rounded = decimal.quantize(Decimal(10) ** -column.type.scale)
                        if rounded != decimal:
                            raise ValueError(f'{name}.{column.name}: conversion would lose precision')
                        row[column.name] = rounded
                    choices = getattr(column.type, 'enums', None)
                    if choices and value not in choices:
                        raise ValueError(f'{name}.{column.name}: legacy value is not in the new ENUM')
                    if isinstance(column.type, EncryptedText):
                        if not isinstance(value, str):
                            raise ValueError(f'{name}.{column.name}: expected legacy plaintext')
                        if len(value.encode('utf-8')) + 29 > column.type.length:
                            raise ValueError(f'{name}.{column.name}: encrypted value would exceed column length')
            output[name].append(row)
    return output


def migrate(source, target):
    source, target = Path(source).resolve(strict=True), Path(target).resolve()
    if source == target or target.exists():
        raise ValueError('Target must be a new file distinct from the source')
    # Snapshot first: all copied tables come from the same SQLite snapshot.
    snapshot = target.with_name(target.stem + '-legacy-snapshot.db')
    with snapshot.open('xb'):
        pass
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src, closing(sqlite3.connect(snapshot)) as dest:
        src.backup(dest)
    data = plan(snapshot)
    with target.open('xb'):
        pass
    engine = create_engine('sqlite:///' + target.as_posix())
    event.listen(engine, 'connect', lambda connection, _: connection.execute('PRAGMA foreign_keys=ON'))
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            for table in Base.metadata.sorted_tables:
                for row in data[table.name]:
                    connection.execute(table.insert().values(**row))
            if connection.execute(text('PRAGMA foreign_key_check')).fetchall():
                raise ValueError('Foreign-key verification failed')
            for table in Base.metadata.sorted_tables:
                actual = [dict(row) for row in connection.execute(select(table)).mappings()]
                expected = data[table.name]
                if len(actual) != len(expected):
                    raise ValueError('Row count mismatch: ' + table.name)
                key = list(table.primary_key.columns)[0].name
                by_id = {row[key]: row for row in actual}
                for row in expected:
                    for column, value in row.items():
                        if by_id[row[key]][column] != value:
                            raise ValueError(f'Value verification failed: {table.name}.{column}')
        require_current_schema(engine)
    finally:
        engine.dispose()
    return {name: len(rows) for name, rows in data.items() if rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    data = plan(args.source)
    print('Ready to copy:', {name: len(rows) for name, rows in data.items() if rows})
    if not args.apply:
        print('Read-only plan; no files changed')
        return
    env_path = ROOT / '.env'
    original_env = env_path.read_text(encoding='utf-8')
    key = os.environ.get('PII_ENCRYPTION_KEY') or dotenv_values(env_path).get('PII_ENCRYPTION_KEY')
    if not key:
        if not args.activate:
            raise ValueError('Configure PII_ENCRYPTION_KEY or use --activate to securely save a new key')
        key = base64.b64encode(secrets.token_bytes(32)).decode()
    os.environ['PII_ENCRYPTION_KEY'] = key
    counts = migrate(args.source, args.target)
    if args.activate:
        if env_path.read_text(encoding='utf-8') != original_env:
            raise ValueError('.env changed during migration; activation cancelled')
        backup = ROOT / 'logs' / ('env-before-v3-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.env')
        backup.parent.mkdir(exist_ok=True)
        with backup.open('x', encoding='utf-8') as file:
            file.write(original_env)
        updated = original_env
        for name, value in [('DATABASE_URL', 'sqlite:///' + args.target.resolve().as_posix()), ('PII_ENCRYPTION_KEY', key)]:
            line = f'{name}="{value}"'
            if re.search(r'^' + name + r'\s*=', updated, re.M):
                updated = re.sub(r'^' + name + r'\s*=.*$', lambda _: line, updated, flags=re.M)
            else:
                updated = updated.rstrip() + '\n' + line + '\n'
        pending = env_path.with_name('.env.v3-pending')
        with pending.open('x', encoding='utf-8') as file:
            file.write(updated)
        pending.replace(env_path)
        print('Activated verified v3 database; original database and .env backup retained')
    print('Verified copied rows:', counts)


if __name__ == '__main__':
    main()
