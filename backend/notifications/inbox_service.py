"""站內通知：收件匣與發送紀錄，存在後端（2026-09-30 起）。

原本後台的「立即發送」是前端直接寫 localStorage：收件人是瀏覽器裡的示範帳號，
通知也只存在操作的那台瀏覽器，真實使用者收不到；Email、推播只標成「待接通」。

## 收件人

讀 MySQL 的真實帳號，規則跟排程通知一樣（scheduled_notification_service 也改用這裡）：
- 角色群發：停用的不算、管理員不算。前端「全部租客」送的身分代碼是 user，
  資料庫存的是 tenant，要換過來 —— 以前直接拿 user 去比對，永遠找不到人。
- 指定使用者：照點名的送（管理員也可以，例如「先寄給我自己」），
  但必須是註冊過、沒被停用的帳號，站內通知才有收件匣可以放。

## 管道

- 站內：寫進收件匣，馬上看得到。收件匣 API 不分身分：房東端之後要做收件匣可以
  直接接（2026-09-30 決定先假裝房東收得到，畫面上不註明）。
- Email：送出後在背景寄（routers/inbox_api.py 用 BackgroundTasks），每位收件人
  各自記寄出／失敗，發送詳情頁看得到。
- 推播：沒有接（需要 VAPID 與每位使用者的裝置訂閱），維持 pending（待接通）。

## 存哪裡

SQLite（NOTIFICATION_INBOX_DB），VM 上在掛載的 data/garbage/，備份腳本會一起備份。
公告的已讀、關閉狀態也放這裡：以前存在瀏覽器，換一台裝置就又變成未讀。
"""

import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

CATEGORIES = ('系統', '租約', '補貼', '帳務')
CHANNELS = ('inapp', 'email', 'push')
#: 前端的收件人代碼 → 資料庫的身分。None 是「全部一般使用者」
ROLE_CODES = {'all': None, 'user': 'tenant', 'landlord': 'landlord'}
BROADCAST_ROLES = {'tenant', 'landlord'}

_HTTP_URL = re.compile(r'^https?://[^\s/$.?#][^\s]*$', re.IGNORECASE)


def inbox_db() -> Path:
    """⚠️ 一定要在呼叫時才讀環境變數（理由同 garbage_service.reminder_db）。"""
    return Path(os.getenv('NOTIFICATION_INBOX_DB') or (_REPO_ROOT / 'backend/notification-inbox.db'))


def _now() -> float:
    return time.time()


def _iso(ts: float) -> str:
    """跟 JavaScript 的 toISOString() 同一個格式。"""
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


@contextmanager
def _open():
    path = inbox_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        with db:
            db.execute(
                'CREATE TABLE IF NOT EXISTS messages ('
                'id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, user_id INTEGER NOT NULL, user_email TEXT NOT NULL, '
                'title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, channels TEXT NOT NULL, '
                'inapp_state TEXT, email_state TEXT, push_state TEXT, '
                'recipient_label TEXT NOT NULL, source_label TEXT NOT NULL, source_type TEXT NOT NULL, '
                'action_url TEXT, action_label TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)'
            )
            db.execute('CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id, created_at)')
            db.execute('CREATE INDEX IF NOT EXISTS messages_batch ON messages(batch_id)')
            db.execute(
                'CREATE TABLE IF NOT EXISTS announcement_reads ('
                'user_id INTEGER NOT NULL, announcement_id TEXT NOT NULL, read_at TEXT NOT NULL, '
                'PRIMARY KEY (user_id, announcement_id))'
            )
            db.execute(
                'CREATE TABLE IF NOT EXISTS announcement_dismissals ('
                'user_id INTEGER NOT NULL, dismiss_key TEXT NOT NULL, dismissed_at TEXT NOT NULL, '
                'PRIMARY KEY (user_id, dismiss_key))'
            )
        with db:
            yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 收件人
# ---------------------------------------------------------------------------


def _load_accounts() -> list[dict]:
    """MySQL 裡所有帳號的 id、email、狀態與身分。測試會換掉這個函式。"""
    from sqlalchemy.orm import selectinload

    from db.database import SessionLocal
    from db.models import User

    if SessionLocal is None:
        raise RuntimeError('後端未設定 DATABASE_URL，無法取得收件人。')
    db = SessionLocal()
    try:
        users = db.query(User).options(selectinload(User.roles)).all()
        return [
            {'id': user.id, 'email': user.email, 'status': user.status, 'roles': {role.role for role in user.roles}}
            for user in users
            if user.email
        ]
    finally:
        db.close()


def resolve_recipients(recipient: dict) -> list[dict]:
    """把收件人條件換成真實帳號（id 與 email）。條件不對或點名的人不存在就丟 ValueError。"""
    kind = recipient.get('kind') if isinstance(recipient, dict) else None
    if kind == 'users':
        wanted = []
        for email in recipient.get('emails') or []:
            if isinstance(email, str) and email.strip() and email.strip().lower() not in wanted:
                wanted.append(email.strip().lower())
        if not wanted:
            raise ValueError('請至少選擇一位收件人。')
        by_email = {account['email'].lower(): account for account in _load_accounts()}
        missing = [email for email in wanted if by_email.get(email, {}).get('status') != 'active']
        if missing:
            raise ValueError(f'找不到這些使用者，或帳號已停用：{"、".join(missing)}')
        return [by_email[email] for email in wanted]

    if kind == 'role' and recipient.get('role') in ROLE_CODES:
        role = ROLE_CODES[recipient['role']]
        matched = [
            account for account in _load_accounts()
            if account['status'] == 'active'
            and 'admin' not in account['roles']
            and (account['roles'] & BROADCAST_ROLES if role is None else role in account['roles'])
        ]
        return sorted(matched, key=lambda account: account['email'])

    raise ValueError('收件人條件不正確。')


# ---------------------------------------------------------------------------
# 發送
# ---------------------------------------------------------------------------


def _email_configured() -> bool:
    from notifications.scheduled_notification_service import email_configured

    return email_configured()


def _text(values: dict, key: str, max_length: int, message: str) -> str:
    value = values.get(key)
    if not isinstance(value, str) or value.strip() == '':
        raise ValueError(message)
    value = value.strip()
    if len(value) > max_length:
        raise ValueError(f'{message.rstrip("。")}，而且不可超過 {max_length} 個字。')
    return value


def _clean_message(values: dict) -> dict:
    title = _text(values, 'title', 100, '請輸入通知標題。')
    body = _text(values, 'body', 2000, '請輸入通知內容。')
    if values.get('category') not in CATEGORIES:
        raise ValueError('不認得的通知分類。')
    channels = values.get('channels')
    if not isinstance(channels, list) or not channels:
        raise ValueError('發送管道至少選一個。')
    if any(channel not in CHANNELS for channel in channels):
        raise ValueError('不認得的發送管道。')
    channels = [channel for channel in CHANNELS if channel in channels]
    if 'email' in channels and not _email_configured():
        raise ValueError('寄信（SMTP）尚未設定，不能選 Email。')
    action_url = (values.get('actionUrl') or '').strip() or None
    if action_url is not None:
        site_path = action_url.startswith('/') and not action_url.startswith(('//', '/\\'))
        if not (site_path or _HTTP_URL.match(action_url)):
            raise ValueError('按鈕連結必須是站內頁面或完整的 http(s) 連結。')
    # 有連結才有按鈕；只有文字沒有連結的話，收件匣不會顯示任何按鈕
    action_label = (values.get('actionLabel') or '').strip()[:20] or None if action_url else None
    return {
        'title': title,
        'body': body,
        'category': values['category'],
        'channels': channels,
        'recipient_label': str(values.get('recipientLabel') or '').strip()[:60],
        'source_label': str(values.get('sourceLabel') or '一次性撰寫').strip()[:60] or '一次性撰寫',
        'action_url': action_url,
        'action_label': action_label,
    }


def _insert_messages(db, batch_id: str, fields: dict, recipients: list[dict], *, created_by: str,
                     source_type: str, email_states: dict[str, str] | None = None) -> None:
    created_at = _iso(_now())
    channels = fields['channels']
    for account in recipients:
        email_state = None
        if 'email' in channels:
            email_state = (email_states or {}).get(account['email'].lower(), 'pending')
        db.execute(
            'INSERT INTO messages (id, batch_id, user_id, user_email, title, body, category, channels, '
            'inapp_state, email_state, push_state, recipient_label, source_label, source_type, action_url, '
            'action_label, created_by, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
            (
                f'nm-{uuid.uuid4().hex[:12]}', batch_id, account['id'], account['email'], fields['title'],
                fields['body'], fields['category'], json.dumps(channels),
                'sent' if 'inapp' in channels else None, email_state, 'pending' if 'push' in channels else None,
                fields['recipient_label'], fields['source_label'], source_type, fields['action_url'],
                fields['action_label'], created_by, created_at,
            ),
        )


def create_batch(values: dict, recipient: dict, *, actor: str, source_type: str = 'admin') -> dict:
    """立即發送：每位收件人一筆，站內當下就送到；Email 由呼叫端交給背景寄（send_pending_emails）。"""
    fields = _clean_message(values)
    recipients = resolve_recipients(recipient)
    if not recipients:
        raise ValueError('沒有符合條件的收件人。')
    batch_id = f'nb-{uuid.uuid4().hex[:12]}'
    with _open() as db:
        _insert_messages(db, batch_id, fields, recipients, created_by=actor, source_type=source_type)

    from admin import audit_service

    audit_service.record('通知管理', fields['source_label'], f'發送給 {len(recipients)} 位使用者', actor=actor,
                         subject=f'batch:{batch_id}')
    return {'batchId': batch_id, 'recipientCount': len(recipients), 'emailQueued': 'email' in fields['channels']}


def send_pending_emails(batch_id: str, send_email=None) -> dict:
    """寄出這個批次還沒寄的 Email。每一筆先原子認領（pending → sending）才寄，重跑不會重複寄。"""
    if send_email is None:
        from notifications.scheduled_notification_service import _default_send_email as send_email

    with _open() as db:
        rows = db.execute(
            "SELECT id, user_email, title, body, source_label, created_by FROM messages "
            "WHERE batch_id = ? AND email_state = 'pending'",
            (batch_id,),
        ).fetchall()

    sent = failed = 0
    for row in rows:
        with _open() as db:
            claimed = db.execute(
                "UPDATE messages SET email_state = 'sending' WHERE id = ? AND email_state = 'pending'", (row['id'],)
            ).rowcount
        if not claimed:
            continue
        try:
            send_email(row['user_email'], row['title'], row['body'])
            state = 'sent'
            sent += 1
        except Exception:
            # 單一收件者失敗不能讓整批停下來，但也不能被吞掉：詳情頁要看得到誰沒寄到
            state = 'failed'
            failed += 1
        with _open() as db:
            db.execute('UPDATE messages SET email_state = ? WHERE id = ?', (state, row['id']))

    if rows and (sent or failed):
        from admin import audit_service

        detail = f'Email：寄出 {sent} 人' + (f'，{failed} 人失敗' if failed else '')
        audit_service.record('通知管理', rows[0]['source_label'], detail, actor='system', subject=f'batch:{batch_id}')
    return {'sent': sent, 'failed': failed}


def deliver_scheduled(emails: list[str], row, email_states: dict[str, str]) -> int:
    """排程通知到期時的站內部分：只放得進有帳號的人的收件匣。回傳送到幾人。

    Email 由排程自己寄（scheduled_notification_service），這裡只把結果記下來，
    發送紀錄才看得到同一批的站內與 Email 狀態。
    """
    wanted = {email.strip().lower() for email in emails if isinstance(email, str)}
    recipients = [
        account for account in _load_accounts()
        if account['email'].lower() in wanted and account['status'] == 'active'
    ]
    if not recipients:
        return 0
    fields = {
        'title': row['title'],
        'body': row['body'],
        'category': row['category'] if row['category'] in CATEGORIES else '系統',
        'channels': [channel for channel in CHANNELS if channel in json.loads(row['channels'])],
        'recipient_label': row['recipient_label'],
        'source_label': row['source_label'],
        'action_url': None,
        'action_label': None,
    }
    with _open() as db:
        _insert_messages(db, f'sched-{row["id"]}', fields, recipients, created_by=row['created_by'],
                         source_type='admin', email_states={k.lower(): v for k, v in email_states.items()})
    return len(recipients)


# ---------------------------------------------------------------------------
# 讀取
# ---------------------------------------------------------------------------


def _delivery(row: sqlite3.Row) -> dict:
    states = {'inapp': row['inapp_state'], 'email': row['email_state'], 'push': row['push_state']}
    # sending 是寄信當下的過渡狀態，畫面上還是「待送」
    return {channel: ('pending' if state == 'sending' else state) for channel, state in states.items() if state}


def _user_view(row: sqlite3.Row) -> dict:
    view = {
        'id': row['id'],
        'title': row['title'],
        'body': row['body'],
        'category': row['category'],
        'channels': json.loads(row['channels']),
        'sourceType': row['source_type'],
        'createdAt': row['created_at'],
        'read': row['read_at'] is not None,
    }
    if row['action_url']:
        view['actionUrl'] = row['action_url']
        if row['action_label']:
            view['actionLabel'] = row['action_label']
    return view


def list_messages(limit: int = 5000) -> list[dict]:
    """後台的發送紀錄：每位收件人一筆（前端依 batchId 分組成批次），新到舊。"""
    if not inbox_db().exists():
        return []
    with _open() as db:
        rows = db.execute('SELECT * FROM messages ORDER BY created_at DESC, rowid DESC LIMIT ?', (limit,)).fetchall()
    return [
        {
            **_user_view(row),
            'userEmail': row['user_email'],
            'deliveryStatus': _delivery(row),
            'batchId': row['batch_id'],
            'recipientLabel': row['recipient_label'],
            'sourceLabel': row['source_label'],
        }
        for row in rows
    ]


def user_inbox(user_id: int) -> list[dict]:
    """這個人收件匣裡的站內通知，新到舊。只寄 Email 的不算。"""
    if not inbox_db().exists():
        return []
    with _open() as db:
        rows = db.execute(
            'SELECT * FROM messages WHERE user_id = ? AND inapp_state IS NOT NULL '
            'ORDER BY created_at DESC, rowid DESC LIMIT 500',
            (user_id,),
        ).fetchall()
    return [_user_view(row) for row in rows]


def mark_read(user_id: int, message_id: str) -> None:
    """只能標自己的。不是自己的（或不存在）一律 LookupError，不透露別人有沒有這筆。"""
    with _open() as db:
        exists = db.execute('SELECT 1 FROM messages WHERE id = ? AND user_id = ?', (message_id, user_id)).fetchone()
        if exists is None:
            raise LookupError(message_id)
        db.execute('UPDATE messages SET read_at = ? WHERE id = ? AND read_at IS NULL', (_iso(_now()), message_id))


def _clean_ids(values, max_length: int) -> list[str]:
    if not isinstance(values, list) or len(values) > 500:
        raise ValueError('清單格式不正確。')
    cleaned = []
    for value in values:
        if not isinstance(value, str) or not value or len(value) > max_length:
            raise ValueError('清單格式不正確。')
        cleaned.append(value)
    return cleaned


def mark_all_read(user_id: int, announcement_ids: list[str]) -> None:
    ids = _clean_ids(announcement_ids, 64)
    now = _iso(_now())
    with _open() as db:
        db.execute('UPDATE messages SET read_at = ? WHERE user_id = ? AND read_at IS NULL', (now, user_id))
        for announcement_id in ids:
            db.execute('INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id, read_at) VALUES (?, ?, ?)',
                       (user_id, announcement_id, now))


def mark_announcement_read(user_id: int, announcement_id: str) -> None:
    (announcement_id,) = _clean_ids([announcement_id], 64)
    with _open() as db:
        db.execute('INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id, read_at) VALUES (?, ?, ?)',
                   (user_id, announcement_id, _iso(_now())))


def dismiss_announcement(user_id: int, key: str) -> None:
    """首頁公告橫幅按了關閉。key 是「id:updatedAt」：公告改過內容就會再出現。"""
    (key,) = _clean_ids([key], 128)
    with _open() as db:
        db.execute('INSERT OR IGNORE INTO announcement_dismissals (user_id, dismiss_key, dismissed_at) VALUES (?, ?, ?)',
                   (user_id, key, _iso(_now())))


def announcement_state(user_id: int) -> dict:
    if not inbox_db().exists():
        return {'readAnnouncementIds': [], 'dismissedAnnouncementKeys': []}
    with _open() as db:
        reads = db.execute('SELECT announcement_id FROM announcement_reads WHERE user_id = ? ORDER BY rowid',
                           (user_id,)).fetchall()
        dismissals = db.execute('SELECT dismiss_key FROM announcement_dismissals WHERE user_id = ? ORDER BY rowid',
                                (user_id,)).fetchall()
    return {
        'readAnnouncementIds': [row['announcement_id'] for row in reads],
        'dismissedAnnouncementKeys': [row['dismiss_key'] for row in dismissals],
    }
