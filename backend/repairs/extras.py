"""MySQL 不需遷移的工單流程欄位；序號與更新共用 SQLite 寫入鎖。"""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

TZ = timezone(timedelta(hours=8))


def path():
    return Path(os.environ.get('REPAIR_EXTRAS_DB') or Path(__file__).resolve().parents[1] / 'repair-extras.db')


@contextmanager
def transaction():
    location = path()
    location.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(location, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('CREATE TABLE IF NOT EXISTS repair_extras (ticket_id INTEGER PRIMARY KEY, ticket_no TEXT UNIQUE NOT NULL, data TEXT NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS repair_sequences (day TEXT PRIMARY KEY, value INTEGER NOT NULL)')
        connection.execute('BEGIN IMMEDIATE')
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def reserve_number(connection, now=None):
    now = now or datetime.now(TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    day = now.astimezone(TZ).strftime('%Y%m%d')
    connection.execute('INSERT INTO repair_sequences(day,value) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET value=value+1', (day,))
    value = connection.execute('SELECT value FROM repair_sequences WHERE day=?', (day,)).fetchone()[0]
    return f'R-{day}-{value:02d}'


def read_all():
    # 查空列表不能在開發目錄留下資料庫。
    if not path().is_file():
        return {}
    with sqlite3.connect(path()) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute('SELECT ticket_id,ticket_no,data FROM repair_extras').fetchall()
    return {row['ticket_id']: {'ticketNo': row['ticket_no'], **json.loads(row['data'])} for row in rows}


def read(connection, ticket_id):
    row = connection.execute('SELECT ticket_no,data FROM repair_extras WHERE ticket_id=?', (ticket_id,)).fetchone()
    return {'ticketNo': row['ticket_no'], **json.loads(row['data'])} if row else None


def write(connection, ticket_id, data):
    payload = dict(data)
    number = payload.pop('ticketNo')
    connection.execute('INSERT INTO repair_extras(ticket_id,ticket_no,data) VALUES (?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET data=excluded.data', (ticket_id, number, json.dumps(payload, ensure_ascii=False)))
