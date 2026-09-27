"""管理員排程通知：真正跑在後端的佇列（SQLite）。

## 為什麼這個檔案存在

後台的「發送通知」原本是前端直接寫 localStorage（見前端的
services/notificationApi.ts）。那條路徑上沒有任何東西能在指定時間醒來，
所以「排程發送」只有兩種做法：前端定時器（後台開著才會觸發，半夜不會送，
而且不會報錯），或是後端真的有一個排程器。這裡是後者。

結構刻意照抄 garbage_service.py —— 那個排程器已經在正式站跑過，
踩過的坑（容器路徑、測試污染、重複寄送、停機後補送舊通知）都修好了，
重寫一套只會把同樣的坑再踩一次。

## 誠實邊界：排程目前只送 Email

- **Email**：真的寄。走 email_service 的 SMTP，跟驗證信同一條路。
- **站內**：租客的收件匣現在存在**瀏覽器的 localStorage**，後端寫不進去。
  要讓排程的站內通知成立，收件匣得先搬到後端（一張表 + 一支租客端拉取的
  端點）。在那之前，排程不提供站內選項 —— 提供了卻不送，就是這個功能
  一開始要避免的那種謊。
- **推播**：需要每個使用者的 web push subscription，目前只有垃圾車提醒
  會蒐集，而且是綁在單筆提醒上。同理，先不提供。

畫面上必須把這件事寫出來，不能只是「剛好沒有那個勾選框」。
"""
import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

TZ = timezone(timedelta(hours=8))
logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[1]

#: 排程一次最多能排多久以後（與垃圾車提醒一致）
MAX_LEAD = timedelta(days=366)

#: 同時存在的待送排程上限。沒有上限的話，一個壞掉的迴圈可以把佇列灌爆。
MAX_PENDING = 100

#: 停機超過這段時間才輪到的排程一律標成 missed，不補送。
#: 半夜兩點的維護公告在早上九點才寄出去，比沒寄更糟。
MISSED_AFTER = timedelta(minutes=30)

#: 目前後端真的送得出去的管道。見檔頭的「誠實邊界」。
SUPPORTED_CHANNELS = ('email',)

CATEGORIES = ('系統', '租約', '補貼', '帳務')


def schedule_db() -> Path:
    """排程佇列的 SQLite。

    ⚠️ 一定要在**呼叫時**才讀環境變數。做成模組層級常數的話，測試在
    setUp() 裡 patch 這個變數時模組早就 import 完了，每個測試都會去寫
    同一個真實檔案而互相污染 —— garbage_service 就是這樣踩過的。
    """
    return Path(os.getenv('ADMIN_SCHEDULE_DB') or (_REPO_ROOT / 'backend/scheduled-notifications.db'))


@contextmanager
def connect():
    path = schedule_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('''CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        channels TEXT NOT NULL,
        recipient TEXT NOT NULL,
        recipient_label TEXT NOT NULL,
        source_label TEXT NOT NULL,
        due REAL NOT NULL,
        created_at REAL NOT NULL,
        status TEXT NOT NULL,
        sent_at REAL,
        result TEXT)''')
    db.execute('CREATE INDEX IF NOT EXISTS schedule_due ON scheduled_notifications(status, due)')
    try:
        with db:
            yield db
    finally:
        db.close()


def email_configured() -> bool:
    return bool(os.getenv('SMTP_USERNAME') and os.getenv('SMTP_APP_PASSWORD'))


def capabilities() -> dict:
    """畫面要知道哪些管道真的送得出去，才不會給出送不到的選項。"""
    return {
        'email': email_configured(),
        # 這兩個是 False，而且理由要一起給前端顯示，不能只是靜靜地少一個勾選框
        'inapp': False,
        'push': False,
        'unsupportedReason': {
            'inapp': '站內通知目前存在瀏覽器，後端無法在排程時間寫入收件匣。',
            'push': '推播需要每位使用者的裝置訂閱，目前只有垃圾車提醒會蒐集。',
        },
    }


def public_row(row: sqlite3.Row) -> dict:
    """對外表示。收件人條件會原樣回傳，但指定名單只回人數不回 email ——
    排程列表是整頁可見的，不需要把每個人的信箱攤在上面。"""
    recipient = json.loads(row['recipient'])
    safe_recipient = dict(recipient)
    if recipient.get('kind') == 'users':
        safe_recipient = {'kind': 'users', 'count': len(recipient.get('emails', []))}
    return {
        'id': row['id'],
        'createdBy': row['created_by'],
        'title': row['title'],
        'body': row['body'],
        'category': row['category'],
        'channels': json.loads(row['channels']),
        'recipient': safe_recipient,
        'recipientLabel': row['recipient_label'],
        'sourceLabel': row['source_label'],
        'scheduledAt': datetime.fromtimestamp(row['due'], TZ).isoformat(),
        'createdAt': datetime.fromtimestamp(row['created_at'], TZ).isoformat(),
        'status': row['status'],
        'sentAt': datetime.fromtimestamp(row['sent_at'], TZ).isoformat() if row['sent_at'] else None,
        'result': json.loads(row['result']) if row['result'] else None,
    }


def create(created_by: str, values: dict) -> dict:
    """建立一筆排程。

    驗證在這裡做完而不是交給前端：排程端點是公開的 HTTP API，
    攻擊者不會經過你的畫面。
    """
    title = (values.get('title') or '').strip()
    body = (values.get('body') or '').strip()
    if not title or not body:
        raise ValueError('標題與內文不可為空。')

    category = values.get('category')
    if category not in CATEGORIES:
        raise ValueError('分類不正確。')

    channels = list(values.get('channels') or [])
    if not channels:
        raise ValueError('請至少選擇一種管道。')
    unsupported = [c for c in channels if c not in SUPPORTED_CHANNELS]
    if unsupported:
        raise ValueError(f"排程目前只支援 Email；{'、'.join(unsupported)} 無法在排程時間送出。")
    if 'email' in channels and not email_configured():
        raise ValueError('Gmail 寄信服務尚未設定，無法排程 Email。')

    recipient = values.get('recipient') or {}
    if recipient.get('kind') == 'users':
        emails = [e for e in (recipient.get('emails') or []) if e]
        if not emails:
            raise ValueError('請至少選擇一位收件人。')
        recipient = {'kind': 'users', 'emails': emails}
    elif recipient.get('kind') == 'role' and recipient.get('role') in ('user', 'landlord', 'all'):
        recipient = {'kind': 'role', 'role': recipient['role']}
    else:
        raise ValueError('收件人條件不正確。')

    due = datetime.fromisoformat(values['scheduledAt'])
    if due.tzinfo is None:
        due = due.replace(tzinfo=TZ)
    now = datetime.now(TZ)
    if due <= now:
        raise ValueError('排程時間必須在現在之後。')
    if due > now + MAX_LEAD:
        raise ValueError('排程時間最多只能排到一年後。')

    with connect() as db:
        pending = db.execute(
            "SELECT count(*) FROM scheduled_notifications WHERE status='pending'"
        ).fetchone()[0]
        if pending >= MAX_PENDING:
            raise ValueError(f'最多可同時存在 {MAX_PENDING} 筆待送排程。')

        identifier = str(uuid4())
        db.execute(
            'INSERT INTO scheduled_notifications '
            '(id, created_by, title, body, category, channels, recipient, recipient_label, '
            ' source_label, due, created_at, status, sent_at, result) '
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)",
            (
                identifier, created_by, title, body, category,
                json.dumps(channels), json.dumps(recipient, ensure_ascii=False),
                (values.get('recipientLabel') or '').strip() or '全部使用者',
                (values.get('sourceLabel') or '').strip() or '一次性撰寫',
                due.timestamp(), now.timestamp(),
            ),
        )
        return public_row(
            db.execute('SELECT * FROM scheduled_notifications WHERE id=?', (identifier,)).fetchone()
        )


def list_all(limit: int = 200) -> list[dict]:
    """待送的排在前面（時間近的更前），送完／取消的按時間由新到舊。"""
    with connect() as db:
        rows = db.execute(
            'SELECT * FROM scheduled_notifications '
            "ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'sending' THEN 0 ELSE 1 END, "
            "CASE WHEN status IN ('pending','sending') THEN due END ASC, due DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [public_row(row) for row in rows]


def cancel(identifier: str) -> dict:
    """只有還沒開始送的才能取消。

    已經進入 sending 的不給取消 —— SMTP 交易可能正在進行，
    這時把狀態改掉只會讓畫面顯示「已取消」而信照樣寄出去。
    """
    with connect() as db:
        changed = db.execute(
            "UPDATE scheduled_notifications SET status='cancelled' WHERE id=? AND status='pending'",
            (identifier,),
        ).rowcount
        row = db.execute('SELECT * FROM scheduled_notifications WHERE id=?', (identifier,)).fetchone()
    if row is None:
        raise LookupError('找不到這筆排程。')
    if not changed:
        raise ValueError(f"這筆排程已經是「{row['status']}」，無法取消。")
    return public_row(row)


def _default_resolve(recipient: dict) -> list[str]:
    """把收件人條件解析成真實 email。

    刻意在**送出時**才解析，而不是排程當下存快照：「全部租客」的意思
    就是送出那一刻的全部租客，排程期間新加入的人本來就該收到。

    讀的是 MySQL 的 users 表（真正註冊過的帳號），不是後台前端那份
    localStorage 的示範資料。
    """
    from database import SessionLocal
    from models import User, UserRole

    if recipient.get('kind') == 'users':
        return list(recipient.get('emails') or [])
    if SessionLocal is None:
        raise RuntimeError('後端未設定 DATABASE_URL，無法解析角色收件人。')

    db = SessionLocal()
    try:
        query = db.query(User).filter(User.status == 'active')
        role = recipient.get('role')
        if role in ('user', 'landlord'):
            query = query.join(UserRole, UserRole.user_id == User.id).filter(UserRole.role == role)
        else:
            query = query.join(UserRole, UserRole.user_id == User.id).filter(UserRole.role != 'admin')
        return sorted({user.email for user in query.all() if user.email})
    finally:
        db.close()


def _default_send_email(recipient_email: str, title: str, body: str) -> None:
    from email.message import EmailMessage

    from email_service import _send, _smtp_config

    config = _smtp_config()
    message = EmailMessage()
    message['Subject'] = title
    message['From'] = f"{config['from_name']} <{config['from_email']}>"
    message['To'] = recipient_email
    message.set_content(f'{body}\n\n—— RentMate 租隊友')
    _send(message, config)


def dispatch_due(now=None, resolve=None, send_email=None) -> int:
    """送出所有到期的排程。回傳這一輪實際處理的筆數。

    resolve / send_email 可注入，測試才不需要真的連 MySQL 或真的寄信。

    流程與 garbage_service.dispatch_due 相同：
    1. 先把停機期間錯過太久的標成 missed，不補送。
    2. 用 `UPDATE ... WHERE status='pending'` 的 rowcount 做原子認領，
       多個 worker 同時跑也不會重複寄。中斷的交易會停在 sending 而不是
       被悄悄重試 —— 寧可少送也不要重複轟炸收件者。
    """
    resolve = resolve or _default_resolve
    send_email = send_email or _default_send_email
    moment = now or datetime.now(TZ)
    timestamp = moment.timestamp()

    # 錯過的逐筆標記，而不是一個整批 UPDATE：要知道「這一輪是我標的」才能記事件，
    # 否則多個 worker 同時跑時，同一筆錯過會被每個 worker 各記一次。
    with connect() as db:
        stale = db.execute(
            "SELECT id, title FROM scheduled_notifications WHERE status='pending' AND due < ?",
            (timestamp - MISSED_AFTER.total_seconds(),),
        ).fetchall()
    for row in stale:
        with connect() as db:
            marked = db.execute(
                "UPDATE scheduled_notifications SET status='missed' WHERE id=? AND status='pending'",
                (row['id'],),
            ).rowcount
        if marked:
            _record_monitor_event('notification-missed', f"「{row['title']}」")
            _record_audit(row, '錯過預定時間，沒有寄出（後端當時沒有在執行）')

    with connect() as db:
        rows = db.execute(
            "SELECT * FROM scheduled_notifications WHERE status='pending' AND due <= ? LIMIT 50",
            (timestamp,),
        ).fetchall()

    handled = 0
    for row in rows:
        with connect() as db:
            claimed = db.execute(
                "UPDATE scheduled_notifications SET status='sending' WHERE id=? AND status='pending'",
                (row['id'],),
            ).rowcount
        if not claimed:
            continue

        handled += 1
        result = {'email': {'sent': 0, 'failed': 0}}
        status = 'sent'
        try:
            emails = resolve(json.loads(row['recipient']))
            if 'email' in json.loads(row['channels']):
                for address in emails:
                    try:
                        send_email(address, row['title'], row['body'])
                        result['email']['sent'] += 1
                    except Exception:
                        # 單一收件者失敗不該讓整批停下來，但也不能被吞掉：
                        # 計入 failed，畫面上要看得到「30 人裡 3 人沒寄成功」。
                        logger.warning('Scheduled notification %s failed for a recipient', row['id'])
                        result['email']['failed'] += 1
            if result['email']['failed'] and not result['email']['sent']:
                status = 'failed'
        except Exception:
            logger.exception('Scheduled notification %s could not be dispatched', row['id'])
            status = 'failed'

        with connect() as db:
            db.execute(
                'UPDATE scheduled_notifications SET status=?, sent_at=?, result=? WHERE id=?',
                (status, timestamp, json.dumps(result, ensure_ascii=False), row['id']),
            )

        # 部分失敗也要記 —— 「30 人裡 3 人沒寄到」在排程列表上看得到，
        # 但沒有人會每天去翻；監控的事件紀錄才是會被看到的地方。
        failed = result['email']['failed']
        sent = result['email']['sent']
        if status == 'failed' and failed == 0:
            _record_monitor_event('notification-failed', f"「{row['title']}」：無法取得收件人")
            _record_audit(row, '無法取得收件人，沒有寄出')
        elif status == 'failed':
            _record_monitor_event('notification-failed', f"「{row['title']}」：全部 {failed} 人寄送失敗")
            _record_audit(row, f'全部 {failed} 人寄送失敗')
        elif failed > 0:
            _record_monitor_event('notification-failed', f"「{row['title']}」：{failed} 人寄送失敗")
            _record_audit(row, f'寄出 {sent} 人，{failed} 人失敗')
        elif sent > 0:
            _record_audit(row, f'已寄出給 {sent} 人')
        else:
            _record_audit(row, '沒有符合條件的收件人，沒有寄出')
    return handled


def _record_audit(row, detail: str) -> None:
    """寫進後台稽核紀錄，跟「誰排的、誰取消的」放在一起。

    監控事件只留 30 天，只靠它的話，一個月後回頭看會只剩「某人排了一則通知」，
    看不到它後來怎麼了 —— 更糟的是看起來像從來沒出過事。成功寄出也要記，
    一則通知從誰排的到寄給了幾個人，才是完整的一段。
    """
    try:
        import audit_service

        audit_service.record(
            '通知管理',
            f"排程通知「{row['title']}」",
            detail,
            actor=audit_service.SYSTEM_ACTOR,
            subject=f"scheduled:{row['id']}",
        )
    except Exception:
        logger.exception('Could not record audit event for scheduled notification %s', row['id'])


def _record_monitor_event(kind: str, detail: str) -> None:
    """寫進後台監控的事件紀錄。寫不進去不能影響寄送本身。"""
    try:
        import monitoring_service  # 延遲 import：monitoring_service 也會讀這個模組的佇列

        monitoring_service.record_event('scheduled-notification', kind, detail)
    except Exception:
        logger.exception('Could not record monitor event %s', kind)
