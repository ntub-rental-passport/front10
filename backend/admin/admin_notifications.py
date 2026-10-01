"""管理員通知中心：系統告警與內部備註，存在後端（2026-09-30 起）。

原本整個通知中心是瀏覽器裡的示範資料：告警是寫死的假事件，備註只有自己那台
瀏覽器看得到，沒有任何地方會真的產生告警。

## 告警從哪來

- 服務斷線與恢復：監控每 60 秒檢查一次（monitoring_service.run_checks），
  狀態一變就通知一次；還是壞的時候不會每分鐘再通知。
- 排程通知寄送失敗、錯過預定時間（scheduled_notification_service）。
- AI 額度到警戒線：AI 用量做好之後接上。
- 後端自己停機「不」發告警：每次部署、主機休眠都會記一筆，發成告警只會把
  真正的問題淹掉；那些還是看得到，在監控頁的事件紀錄裡。
- 「使用者訊息」沒有來源（使用者沒有地方可以寫信給管理員），畫面上先隱藏。

## 已讀

告警與備註所有管理員共用一份，已讀狀態每位管理員各自記：一位看過，
不代表其他人也看過。

## 寫不進去不能擋住別的事

跟稽核紀錄一樣：告警是附帶的，寫入失敗只記 log，不能讓監控或寄信本身失敗。
"""

from db.sqlstore import open_store as _open

import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

TITLE_MAX_LENGTH = 100
BODY_MAX_LENGTH = 2000
LIST_LIMIT = 300


def _iso(ts: float) -> str:
    # 取到微秒：列表靠 created_at 排序，毫秒在連續寫入時會打平，順序就不穩定了
    # （SQLite 時代是靠 rowid 當第二順位，搬進共用資料庫之後沒有那個欄位）
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def _insert(source: str, title: str, body: str, *, action_url=None, action_label=None,
            sender_name=None, sender_email=None) -> str:
    notification_id = f'adn-{uuid.uuid4().hex[:12]}'
    with _open() as db:
        db.execute(
            'INSERT INTO admin_notifications (id, source, title, body, action_url, action_label, sender_name, '
            'sender_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (notification_id, source, title, body, action_url, action_label, sender_name, sender_email, _iso(time.time())),
        )
    return notification_id


def record_alert(title: str, body: str, *, action_url: str | None = None, action_label: str | None = None) -> None:
    """系統自己發的告警。寫不進去只記 log（見模組說明）。"""
    try:
        _insert('alert', title[:TITLE_MAX_LENGTH], body[:BODY_MAX_LENGTH], action_url=action_url,
                action_label=action_label)
    except Exception:
        logger.exception('Could not record admin alert %s', title)


def add_note(title: str, body: str, *, sender_email: str, sender_name: str, sender_id: int | None = None) -> dict:
    """管理員之間的內部備註。不合法就丟 ValueError，訊息直接給畫面顯示。

    寄件人自己那份直接算已讀：自己剛寫的東西不該變成自己的待辦。"""
    title = (title or '').strip()
    body = (body or '').strip()
    if not title or not body:
        raise ValueError('備註的標題與內容都要填。')
    if len(title) > TITLE_MAX_LENGTH or len(body) > BODY_MAX_LENGTH:
        raise ValueError(f'標題不可超過 {TITLE_MAX_LENGTH} 個字，內容不可超過 {BODY_MAX_LENGTH} 個字。')
    notification_id = _insert('admin-note', title, body, sender_name=sender_name, sender_email=sender_email)
    if sender_id is not None:
        mark_read(sender_id, notification_id)

    from admin import audit_service

    audit_service.record('通知中心', '內部備註', f'發送備註「{title}」', actor=sender_email,
                         subject=f'admin-notification:{notification_id}')
    return next(item for item in list_for(sender_id) if item['id'] == notification_id)


def list_for(admin_id: int | None, limit: int = LIST_LIMIT) -> list[dict]:
    """新到舊，已讀狀態是這位管理員自己的。"""
    with _open() as db:
        rows = db.execute(
            'SELECT n.*, r.read_at FROM admin_notifications n '
            'LEFT JOIN admin_notification_reads r ON r.notification_id = n.id AND r.admin_id = ? '
            'ORDER BY n.created_at DESC, n.id DESC LIMIT ?',
            (admin_id, limit),
        ).fetchall()
    items = []
    for row in rows:
        item = {
            'id': row['id'],
            'source': row['source'],
            'title': row['title'],
            'body': row['body'],
            'createdAt': row['created_at'],
            'read': row['read_at'] is not None,
        }
        if row['action_url']:
            item['actionUrl'] = row['action_url']
            item['actionLabel'] = row['action_label'] or '查看'
        if row['sender_name']:
            item['senderName'] = row['sender_name']
        items.append(item)
    return items


def _require(db, notification_id: str) -> None:
    if db.execute('SELECT 1 FROM admin_notifications WHERE id = ?', (notification_id,)).fetchone() is None:
        raise LookupError(notification_id)


def mark_read(admin_id: int, notification_id: str) -> None:
    with _open() as db:
        _require(db, notification_id)
        db.insert_ignore('admin_notification_reads',
                         {'notification_id': notification_id, 'admin_id': admin_id},
                         {'read_at': _iso(time.time())})


def mark_unread(admin_id: int, notification_id: str) -> None:
    with _open() as db:
        _require(db, notification_id)
        db.execute('DELETE FROM admin_notification_reads WHERE notification_id = ? AND admin_id = ?',
                   (notification_id, admin_id))


def mark_all_read(admin_id: int) -> None:
    with _open() as db:
        # 一次把全部標成已讀：逐筆寫，避免用到只有某一邊資料庫才有的語法
        now = _iso(time.time())
        for row in db.execute('SELECT id FROM admin_notifications').fetchall():
            db.insert_ignore('admin_notification_reads',
                             {'notification_id': row['id'], 'admin_id': admin_id}, {'read_at': now})
