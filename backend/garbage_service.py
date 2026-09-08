"""Taipei schedules and durable, single-delivery reminder queue (SQLite)."""
import csv
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

TZ = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def stops():
    with (ROOT / 'public/data/taipei-garbage.csv').open(encoding='utf-8-sig', newline='') as file:
        result = {}
        for row in csv.DictReader(file):
            key = '|'.join(row[name].strip() for name in ['行政區', '里別', '路線', '車次', '地點', '抵達時間'])
            raw = row['抵達時間'].strip().replace(':', '').zfill(4)
            result[key] = {'address': row['地點'], 'arrival': f'{raw[:2]}:{raw[2:]}'}
        return result


@contextmanager
def connect():
    path = Path(os.getenv('GARBAGE_REMINDER_DB', str(ROOT / 'backend/garbage-reminders.db')))
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('''CREATE TABLE IF NOT EXISTS garbage_reminders (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, payload TEXT NOT NULL,
        due REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        email_status TEXT NOT NULL, push_status TEXT NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS garbage_due ON garbage_reminders(active, due)')
    try:
        with db:
            yield db
    finally:
        db.close()


def capabilities():
    try:
        import pywebpush  # noqa: F401
        push_library = True
    except ImportError:
        push_library = False
    return {
        'email': bool(os.getenv('SMTP_USERNAME') and os.getenv('SMTP_APP_PASSWORD')),
        'push': bool(push_library and os.getenv('VAPID_PRIVATE_KEY') and os.getenv('VAPID_PUBLIC_KEY') and os.getenv('VAPID_SUBJECT')),
        'publicKey': os.getenv('VAPID_PUBLIC_KEY', ''),
    }


def public_reminder(row):
    data = json.loads(row['payload'])
    return {k: v for k, v in data.items() if k not in ('recipient', 'subscription')} | {
        'id': row['id'], 'active': bool(row['active']),
        'emailStatus': row['email_status'], 'pushStatus': row['push_status'],
    }


def create_reminder(user_id, recipient, values):
    station = stops().get(values['stationId'])
    if not station:
        raise ValueError('找不到清運站點，請重新選擇。')
    service_day = datetime.fromisoformat(f"{values['date']}T00:00:00+08:00")
    hour, minute = map(int, station['arrival'].split(':'))
    arrival = service_day + timedelta(hours=hour, minutes=minute)
    if service_day.weekday() in (2, 6):
        raise ValueError('週三、週日為例行停收日，請選擇其他日期。')
    due = arrival - timedelta(minutes=values['minutesBefore'])
    if due <= datetime.now(TZ) or due > datetime.now(TZ) + timedelta(days=366):
        raise ValueError('提醒時間須在現在之後，且在一年內。')
    if not values['notifyPush'] and not values['notifyEmail']:
        raise ValueError('請至少選擇一種通知方式。')
    caps = capabilities()
    if values['notifyEmail'] and not caps['email']:
        raise ValueError('Gmail 寄信服務尚未設定。')
    if values['notifyPush'] and (not caps['push'] or not values.get('subscription')):
        raise ValueError('系統推播尚未設定，或尚未允許此裝置接收通知。')
    payload = values | {'recipient': recipient, 'stationName': station['address'], 'arrival': station['arrival'], 'dueAt': due.isoformat()}
    with connect() as db:
        if db.execute('SELECT count(*) FROM garbage_reminders WHERE user_id=? AND active=1 AND due>?', (user_id, datetime.now(TZ).timestamp())).fetchone()[0] >= 50:
            raise ValueError('最多可設定 50 筆待發送提醒。')
        identifier = str(uuid4())
        db.execute('INSERT INTO garbage_reminders VALUES (?, ?, ?, ?, 1, ?, ?)', (
            identifier, user_id, json.dumps(payload, ensure_ascii=False), due.timestamp(),
            'pending' if values['notifyEmail'] else 'disabled', 'pending' if values['notifyPush'] else 'disabled',
        ))
        return public_reminder(db.execute('SELECT * FROM garbage_reminders WHERE id=?', (identifier,)).fetchone())


def send_email(data):
    import smtplib
    import ssl
    from email.message import EmailMessage
    username = os.environ['SMTP_USERNAME'].strip()
    message = EmailMessage()
    message['Subject'] = 'RentMate 垃圾清運到達提醒'
    message['From'] = os.getenv('SMTP_FROM_EMAIL', username)
    message['To'] = data['recipient']
    message.set_content(f"清運提醒：{data['stationName']}\n日期：{data['date']}\n表定抵達：{data['arrival']}\n提前 {data['minutesBefore']} 分鐘提醒。\n\n此為表定時間提醒；實際抵達及臨時停收以環保局公告為準。")
    with smtplib.SMTP(os.getenv('SMTP_HOST', 'smtp.gmail.com'), int(os.getenv('SMTP_PORT', '587')), timeout=15) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(username, os.environ['SMTP_APP_PASSWORD'].replace(' ', ''))
        smtp.send_message(message)


def send_push(data):
    from pywebpush import webpush
    webpush(subscription_info=data['subscription'], data=json.dumps({
        'id': data['stationId'] + '|' + data['date'],
        'title': 'RentMate 清運提醒', 'body': f"{data['stationName']}，表定 {data['arrival']} 抵達。", 'url': '/app/garbage',
    }, ensure_ascii=False), vapid_private_key=os.environ['VAPID_PRIVATE_KEY'], vapid_claims={'sub': os.environ['VAPID_SUBJECT']}, ttl=300, timeout=15)


def dispatch_due(now=None):
    timestamp = (now or datetime.now(TZ)).timestamp()
    for channel, sender in [('email', send_email), ('push', send_push)]:
        column = channel + '_status'
        with connect() as db:
            # Do not deliver old notifications after downtime.
            db.execute(f"UPDATE garbage_reminders SET {column}='missed' WHERE active=1 AND due<? AND {column}='pending'", (timestamp - 300,))
            rows = db.execute(f"SELECT * FROM garbage_reminders WHERE active=1 AND due<=? AND {column}='pending' LIMIT 50", (timestamp,)).fetchall()
        for row in rows:
            # Atomic claim prevents duplicate sends across workers. An interrupted
            # SMTP transaction remains 'sending' rather than silently being retried.
            with connect() as db:
                claimed = db.execute(f"UPDATE garbage_reminders SET {column}='sending' WHERE id=? AND active=1 AND {column}='pending'", (row['id'],)).rowcount
            if not claimed:
                continue
            try:
                sender(json.loads(row['payload']))
                state = 'sent'
            except Exception:
                logger.warning('Garbage %s delivery failed for reminder %s', channel, row['id'])
                state = 'failed'
            with connect() as db:
                db.execute(f'UPDATE garbage_reminders SET {column}=? WHERE id=?', (state, row['id']))
