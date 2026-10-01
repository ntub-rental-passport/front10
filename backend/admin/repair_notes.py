"""後台對報修工單的內部註記與旗標（2026-10-01 起）。

報修本體在 MySQL（repair_tickets，見 routers/repairs.py），那是租客與房東共用的
資料。管理員另外要記的三件事只有後台會用到：

- 內部註記：跟誰聯絡過、協調到哪，租客與房東都看不到
- 要求平台介入：租客或房東提出的，管理員據此分流
- 手動加入待辦：分流規則以外的個案，管理員自己標的

這三個放 SQLite 小檔（ADMIN_REPAIR_NOTES_DB），不動組員維護的 MySQL 結構——
後端啟動時會逐欄檢查資料表，為了三個欄位再跑一次遷移不划算。
"""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

FIELDS = {'adminNote': '', 'interventionRequested': False, 'manuallyQueued': False}


def notes_db() -> Path:
    """⚠️ 一定要在呼叫時才讀環境變數（理由同 garbage_service.reminder_db）。"""
    return Path(os.getenv('ADMIN_REPAIR_NOTES_DB') or (_REPO_ROOT / 'backend/admin-repair-notes.db'))


@contextmanager
def _open():
    path = notes_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS repair_notes (ticket_id TEXT PRIMARY KEY, value TEXT NOT NULL)')
        with db:
            yield db
    finally:
        db.close()


def _clean(values: dict) -> dict:
    """只收這三個欄位，型別不對就丟 ValueError（訊息給管理員看）。"""
    unknown = set(values) - set(FIELDS)
    if unknown:
        raise ValueError('包含管理員不能修改的欄位。')
    cleaned = {}
    for key, value in values.items():
        if key == 'adminNote':
            if not isinstance(value, str):
                raise ValueError('內部註記必須是文字。')
            cleaned[key] = value.strip()[:2000]
        else:
            if not isinstance(value, bool):
                raise ValueError(f'{key} 必須是是或否。')
            cleaned[key] = value
    return cleaned


def all_notes() -> dict[str, dict]:
    """全部的註記，key 是工單 id。還沒有人寫過就回空的，不建檔。"""
    if not notes_db().exists():
        return {}
    with _open() as db:
        rows = db.execute('SELECT ticket_id, value FROM repair_notes').fetchall()
    return {row['ticket_id']: {**FIELDS, **json.loads(row['value'])} for row in rows}


def notes_for(ticket_id: str) -> dict:
    return all_notes().get(str(ticket_id), dict(FIELDS))


def update(ticket_id: str, values: dict) -> dict:
    merged = {**notes_for(ticket_id), **_clean(values)}
    with _open() as db:
        db.execute('INSERT INTO repair_notes (ticket_id, value) VALUES (?, ?) '
                   'ON CONFLICT(ticket_id) DO UPDATE SET value = excluded.value',
                   (str(ticket_id), json.dumps(merged, ensure_ascii=False)))
    return merged
