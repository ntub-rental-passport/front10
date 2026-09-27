"""後台稽核紀錄：後端記的那一份。

## 記什麼

只記「真的會改到後端」的操作與它們的後續。其他後台模組目前是展示資料，
那些操作仍記在管理員自己的瀏覽器裡（前端 useAdminAudit），畫面上會標清楚。

- 停用／啟用真實帳號（routers/admin.py），停用可以附原因
- 建立／取消排程通知（routers/scheduled_notifications.py），
  以及系統寄送的結果：寄出幾人、幾人失敗、錯過（scheduled_notification_service.py）
- 管理員登入成功；帳密正確但驗證碼錯誤、試滿次數被作廢（routers/auth.py）

帳密錯誤刻意不記：被暴力嘗試時會是成千上萬筆，把真正的操作洗掉；而且登入第一步
刻意不區分「帳號不存在」與「密碼錯」，記下來的多半是攻擊者亂打的信箱。
那一層交給限速與 fail2ban。「密碼對了、驗證碼卻過不了」才是值得被看到的：
那代表密碼很可能已經外洩。

## 不自動刪除

看多久由後台設定的「稽核紀錄保留天數」決定 —— 那是畫面上的篩選，不是刪除，
跟瀏覽器那份的行為一致。量很小，一天幾十筆就算多了。

## 寫不進去不能擋住操作

跟監控事件一樣：稽核寫入失敗只記 log，不能讓「停用帳號」本身失敗。
"""

import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]

#: 系統自己做的事（例如排程寄送的結果）用這個當操作者，前端顯示成「系統」
SYSTEM_ACTOR = 'system'

#: 停用原因的上限。這是給人看的一句話，不是報告
REASON_MAX_LENGTH = 200


def audit_db() -> Path:
    """⚠️ 一定要在呼叫時才讀環境變數（理由同 garbage_service.reminder_db）。"""
    return Path(os.getenv('ADMIN_AUDIT_DB') or (_REPO_ROOT / 'backend/admin-audit.db'))


@contextmanager
def _open():
    path = audit_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        db.execute('''CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at REAL NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT NOT NULL,
            detail TEXT NOT NULL,
            subject TEXT,
            ip TEXT)''')
        db.execute('CREATE INDEX IF NOT EXISTS audit_at ON audit_events(at)')
        db.execute('CREATE INDEX IF NOT EXISTS audit_subject ON audit_events(subject, at)')
        with db:
            yield db
    finally:
        db.close()


def _iso(ts: float) -> str:
    # 一定要帶時區：沒帶的話瀏覽器會當成本地時間，UTC+8 就差 8 小時
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def clean_reason(reason: str | None) -> str | None:
    """停用原因：去掉換行與多餘空白、截斷。空的就是沒填。

    換行要拿掉：這句話會進 CSV 的一格、畫面上的一列，多行只會把排版撐爛。
    """
    if reason is None:
        return None
    text = ' '.join(reason.split())
    return text[:REASON_MAX_LENGTH] or None


def record(
    action: str,
    target: str,
    detail: str,
    *,
    actor: str,
    subject: str | None = None,
    ip: str | None = None,
    now: float | None = None,
) -> None:
    """寫一筆稽核紀錄。

    `subject` 是穩定的識別（例如 `user:12`、`scheduled:<id>`）：target 存的是
    當下的 Email 或標題，之後改信箱就對不起來了，查某個帳號的紀錄要用它。
    """
    try:
        with _open() as db:
            db.execute(
                'INSERT INTO audit_events (at, actor, action, target, detail, subject, ip) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                (time.time() if now is None else now, actor, action, target, detail, subject, ip),
            )
    except Exception:
        logger.exception('Could not record audit event %s / %s', action, target)


def list_events(limit: int = 500, subject: str | None = None) -> list[dict]:
    """新到舊。"""
    with _open() as db:
        if subject:
            rows = db.execute(
                'SELECT * FROM audit_events WHERE subject = ? ORDER BY at DESC, id DESC LIMIT ?',
                (subject, limit),
            ).fetchall()
        else:
            rows = db.execute(
                'SELECT * FROM audit_events ORDER BY at DESC, id DESC LIMIT ?', (limit,)
            ).fetchall()
    return [
        {
            'id': row['id'],
            'at': _iso(row['at']),
            'actor': row['actor'],
            'action': row['action'],
            'target': row['target'],
            'detail': row['detail'],
            'subject': row['subject'],
            'ip': row['ip'],
        }
        for row in rows
    ]
