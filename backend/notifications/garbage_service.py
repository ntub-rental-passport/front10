"""台北市清運時刻表，以及「只送一次」的提醒佇列（存在專案的資料庫）。"""
import csv
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from db.sqlstore import open_store

TZ = timezone(timedelta(hours=8))
logger = logging.getLogger(__name__)

# 路徑：本機從 repo 根目錄跑，容器裡 backend/ 就是 /app
#
# 原本寫死 Path(__file__).resolve().parents[1]，那在開發機上剛好是 repo 根，
# 但容器的 Dockerfile 是 `COPY . .` 從 ./backend 進 /app —— parents[1] 變成
# 根目錄 `/`，於是去找 /public/data，那裡沒有東西。
# 2026-09-19 正式站實測：排程每 20 秒噴一次找不到檔案。
#
# 預設值維持原本的 repo 佈局（開發機行為不變），容器由 compose 設環境變數覆寫。
_REPO_ROOT = Path(__file__).resolve().parents[2]

# ⚠️ 下面這個一定要在**呼叫時**才讀環境變數，不能做成模組層級常數：
# 測試會 patch 環境變數指向暫存目錄，那時模組早就 import 完了 —— 常數會停在
# 開發機的真實路徑上，每個測試都去讀寫同一個位置，狀態互相污染。


def data_dir() -> Path:
    """垃圾車站點資料（唯讀）。容器裡由 compose 以唯讀 volume 掛進來。"""
    return Path(os.getenv('GARBAGE_DATA_DIR') or (_REPO_ROOT / 'public/data'))


@lru_cache(maxsize=1)
def stops():
    with (data_dir() / 'taipei-garbage.csv').open(encoding='utf-8-sig', newline='') as file:
        result = {}
        for row in csv.DictReader(file):
            key = '|'.join(row[name].strip() for name in ['行政區', '里別', '路線', '車次', '地點', '抵達時間'])
            raw = row['抵達時間'].strip().replace(':', '').zfill(4)
            result[key] = {'address': row['地點'], 'arrival': f'{raw[:2]}:{raw[2:]}'}
    new_taipei = data_dir() / 'new-taipei-garbage.json'
    if new_taipei.exists():
        days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for row in json.loads(new_taipei.read_text(encoding='utf-8')):
            key = '|'.join(['ntpc', row['lineid'], row['rank'], row['latitude'], row['longitude']])
            result[key] = {
                'address': '新北市' + row['city'] + row['name'].strip(),
                'arrival': row['time'],
                'days': [i for i, day in enumerate(days) if any(
                    row.get(prefix + day, '').upper() == 'Y'
                    for prefix in ('garbage', 'recycling', 'foodscraps'))],
            }
    return result


def connect():
    """提醒佇列的連線。2026-10-02 起是專案的資料庫，不再是 SQLite 檔。

    名字保留不改，呼叫端（含 admin/monitoring_service.py 的佇列統計）就不用動。
    一個 `with` 就是一次交易：正常結束 commit、丟例外 rollback，跟原本一樣。
    """
    return open_store()


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
    if 'days' in station and service_day.weekday() not in station['days']:
        raise ValueError('此站點在所選日期沒有表定收運，請選擇其他日期。')
    if 'days' not in station and service_day.weekday() in (2, 6):
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
        db.execute(
            'INSERT INTO garbage_reminders '
            '(id, user_id, payload, due, active, email_status, push_status) VALUES (?, ?, ?, ?, 1, ?, ?)',
            (identifier, user_id, json.dumps(payload, ensure_ascii=False), due.timestamp(),
             'pending' if values['notifyEmail'] else 'disabled',
             'pending' if values['notifyPush'] else 'disabled'),
        )
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


class PushSubscriptionGone(Exception):
    """推播端點已失效；重送不會恢復，必須由使用者重新訂閱。"""


def send_push(data):
    from pywebpush import WebPushException, webpush
    try:
        webpush(subscription_info=data['subscription'], data=json.dumps({
            'id': data['stationId'] + '|' + data['date'],
            'title': 'RentMate 清運提醒', 'body': f"{data['stationName']}，表定 {data['arrival']} 抵達。", 'url': '/app/garbage',
        }, ensure_ascii=False), vapid_private_key=os.environ['VAPID_PRIVATE_KEY'], vapid_claims={'sub': os.environ['VAPID_SUBJECT']}, ttl=300, timeout=15)
    except WebPushException as error:
        # requests 的錯誤 response 會被視為 False，不能用 if error.response 判斷。
        if error.response is not None and error.response.status_code in (404, 410):
            raise PushSubscriptionGone() from error
        raise


def expire_push_subscription(row):
    endpoint = json.loads(row['payload'])['subscription']['endpoint']
    with connect() as db:
        # 訂閱各自存在提醒 payload，連未到期／暫停的 pending 提醒也要清掉。
        # 鎖住列再改，避免覆蓋其他 worker 已領取的狀態。
        reminders = db.lock(
            "SELECT id, payload FROM garbage_reminders WHERE user_id=? AND (id=? OR push_status='pending')",
            (row['user_id'], row['id']),
        ).fetchall()
        for reminder in reminders:
            payload = json.loads(reminder['payload'])
            if payload.get('subscription', {}).get('endpoint') != endpoint:
                continue
            payload.pop('subscription')
            db.execute("UPDATE garbage_reminders SET push_status='expired', payload=? WHERE id=?",
                       (json.dumps(payload, ensure_ascii=False), reminder['id']))
    logger.warning('Garbage push subscription expired for reminder %s', row['id'])


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
            except PushSubscriptionGone:
                expire_push_subscription(row)
                continue
            except Exception:
                logger.warning('Garbage %s delivery failed for reminder %s', channel, row['id'])
                state = 'failed'
            with connect() as db:
                db.execute(f'UPDATE garbage_reminders SET {column}=? WHERE id=?', (state, row['id']))
