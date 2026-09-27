"""Rebuild a legacy MySQL database in place as schema v3, keeping every account.

Default: read-only plan. --apply --confirm DATABASE drops every table in the
connected database, runs backend/database.sql, copies the planned rows back and
checks values, row counts and the schema. Dropped tables cannot be brought back
by this tool: take a mysqldump first and restore from it if a step fails.

Rows are mapped by upgrade_local_sqlite_v3.plan_rows, so accounts keep their IDs,
roles, passwords and Google identities. Only short-lived rows are discarded:
pending registrations, pending admin logins and admin sessions (people halfway
through signing up start again; administrators sign in again).
"""
import argparse
from pathlib import Path
import re
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import MetaData, String, inspect, select
from database import Base
import models  # noqa: F401  Register every v3 table.
from migrations.upgrade_local_sqlite_v3 import plan_rows
from schema_check import require_current_schema, schema_problems

SCHEMA_SQL = BACKEND / 'database.sql'
TRANSIENT = ('pending_registrations', 'pending_admin_logins', 'admin_sessions')


def read_legacy(engine):
    """Every table's rows, read inside one transaction (one InnoDB snapshot)."""
    metadata = MetaData()
    metadata.reflect(engine)
    with engine.connect() as connection:
        return {name: [dict(row) for row in connection.execute(select(table)).mappings()]
                for name, table in metadata.tables.items()}


def prepare(rows):
    """Plan the v3 rows, raising before anything is dropped if one cannot be written."""
    discarded = {name: len(rows.pop(name, None) or []) for name in TRANSIENT}
    data = plan_rows(rows)
    for name, table_rows in data.items():
        for column in Base.metadata.tables[name].columns:
            length = column.type.length if isinstance(column.type, String) else None
            for row in table_rows:
                value = row.get(column.name)
                if value is None and column.name in row and not column.nullable:
                    raise ValueError(f'{name}.{column.name}: legacy value is empty but the column is required')
                if length and isinstance(value, str) and len(value) > length:
                    raise ValueError(f'{name}.{column.name}: legacy value is longer than {length} characters')
    return data, discarded


def schema_statements(sql):
    """database.sql as single statements. USE is left out: the connection already
    points at the database being rebuilt, and its name differs between machines."""
    lines = [line for line in sql.splitlines() if not line.lstrip().startswith('--')]
    statements = [part.strip() for part in '\n'.join(lines).split(';')]
    return [statement for statement in statements if statement and not re.match(r'USE\b', statement, re.I)]


def rebuild(engine, data):
    with engine.connect() as connection:
        raw = connection.execution_options(no_parameters=True)
        raw.exec_driver_sql('SET FOREIGN_KEY_CHECKS = 0')
        try:
            for name in inspect(connection).get_table_names():
                raw.exec_driver_sql(f'DROP TABLE `{name}`')
            for statement in schema_statements(SCHEMA_SQL.read_text(encoding='utf-8')):
                raw.exec_driver_sql(statement)
        finally:
            raw.exec_driver_sql('SET FOREIGN_KEY_CHECKS = 1')
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            for row in data[table.name]:
                connection.execute(table.insert().values(**row))


def verify(engine, data):
    """Every planned row reads back unchanged and nothing else was written."""
    with engine.connect() as connection:
        for table in Base.metadata.sorted_tables:
            keys = [column.name for column in table.primary_key.columns]
            stored = {tuple(row[key] for key in keys): row
                      for row in connection.execute(select(table)).mappings()}
            expected = data[table.name]
            if len(stored) != len(expected):
                raise ValueError('Row count mismatch: ' + table.name)
            for row in expected:
                actual = stored.get(tuple(row[key] for key in keys))
                if actual is None or any(actual[column] != value for column, value in row.items()):
                    raise ValueError('Value verification failed: ' + table.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='drop every table and rebuild as schema v3')
    parser.add_argument('--confirm', metavar='DATABASE', help='name of the database being rebuilt (required with --apply)')
    args = parser.parse_args()
    from database import engine
    if engine is None or engine.dialect.name != 'mysql':
        raise SystemExit('DATABASE_URL must point at the MySQL database to upgrade (SQLite: upgrade_local_sqlite_v3.py)')
    database = engine.url.database
    if not schema_problems(engine):
        raise SystemExit(f'{database} already uses schema v3; nothing to do')
    data, discarded = prepare(read_legacy(engine))
    print(f'Database: {database} on {engine.url.host}')
    print('Rows to copy:', {name: len(rows) for name, rows in data.items() if rows})
    print('Short-lived rows to discard:', {name: count for name, count in discarded.items() if count} or 'none')
    if not args.apply:
        print('Read-only plan; nothing changed. Back up with mysqldump before --apply.')
        return
    if args.confirm != database:
        raise SystemExit(f'--apply drops every table in {database}; pass --confirm {database} to proceed')
    rebuild(engine, data)
    verify(engine, data)
    require_current_schema(engine)
    print('Rebuilt as schema v3; every copied row verified.')


if __name__ == '__main__':
    main()
