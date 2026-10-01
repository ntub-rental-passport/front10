"""後台對報修工單的內部註記與旗標（2026-10-01 起）。

報修本體在 MySQL（repair_tickets，見 routers/repairs.py），那是租客與房東共用的
資料。管理員另外要記的三件事只有後台會用到：

- 內部註記：跟誰聯絡過、協調到哪，租客與房東都看不到
- 要求平台介入：租客或房東提出的，管理員據此分流
- 手動加入待辦：分流規則以外的個案，管理員自己標的

存在 repair_notes 這張表（見 migrations/20261001_admin_tables_to_mysql.sql）。
工單本體是組員維護的 repair_tickets，這裡不去動它的結構。
"""

import json

from db.sqlstore import open_store as _open

FIELDS = {'adminNote': '', 'interventionRequested': False, 'manuallyQueued': False}


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
    """全部的註記，key 是工單 id。還沒有人寫過就是空的。"""
    with _open() as db:
        rows = db.execute('SELECT ticket_id, value FROM repair_notes').fetchall()
    return {row['ticket_id']: {**FIELDS, **json.loads(row['value'])} for row in rows}


def notes_for(ticket_id: str) -> dict:
    return all_notes().get(str(ticket_id), dict(FIELDS))


def update(ticket_id: str, values: dict) -> dict:
    merged = {**notes_for(ticket_id), **_clean(values)}
    with _open() as db:
        db.upsert('repair_notes', {'ticket_id': str(ticket_id)},
                  {'value': json.dumps(merged, ensure_ascii=False)})
    return merged
