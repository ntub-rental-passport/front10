"""後台的公告、首頁輪播與通知模板：存在後端，所有裝置看同一份。

原本三者都存在管理員的瀏覽器裡（前端的 createAdminCollection）：後台改了，
只有那台瀏覽器看得到，首頁訪客與租客看到的永遠是程式裡寫死的示範資料。

## 誰讀

- 公開首頁、租客首頁、租客通知中心：/api/content/public，只給「現在生效中」的
  公告與輪播。草稿、排程中、已結束的不送出去 —— 還沒要公開的內容不該先被看到。
- 後台：/api/admin/...，全部都給，改動寫進稽核紀錄（稽核的寫法沿用前端原本的字）。

## 初始資料

第一次讀的時候建檔，並寫入原本程式裡的示範內容（2026-09-30 決定全部照搬：
四則公告、三張輪播、五個模板）。只寫這一次：管理員刪光之後不會自己長回來。

## 存哪裡

專案的資料庫（announcements、banners、notification_templates、content_meta）。
2026-10-01 從 SQLite 搬進來。量很小，但放在同一個資料庫才進得了 ER 圖與備份。
"""

from contextlib import contextmanager

from db.sqlstore import Row, Store, open_store


@contextmanager
def _open():
    """第一次用到時寫入原本放在前端的示範公告、輪播與通知模板。

    這段原本在自己開 SQLite 檔的 _open() 裡（用 content_meta 的 seeded 當旗標）。
    搬進共用資料庫之後旗標照舊，只是表不再由程式建立。
    """
    with open_store() as db:
        if db.execute("SELECT 1 FROM content_meta WHERE `key` = 'seeded'").fetchone() is None:
            _seed(db)
        yield db

import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ANNOUNCEMENT_LEVELS = ('info', 'warning', 'urgent')
ANNOUNCEMENT_AUDIENCES = ('all', 'tenant', 'landlord')
TEMPLATE_CATEGORIES = ('系統', '租約', '補貼', '帳務')
TEMPLATE_CHANNELS = ('inapp', 'email', 'push')

DAY = 86400


def _now() -> float:
    return time.time()


def _iso(ts: float) -> str:
    """跟 JavaScript 的 toISOString() 同一個格式。"""
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _parse_iso(value: str) -> float:
    text = value.strip()
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        raise ValueError('missing timezone')
    return parsed.timestamp()


def _seed_announcements(now: float) -> list[tuple]:
    """原本 src/mocks/admin/content.ts 的四則公告，日期照原本的相對天數換算。"""
    return [
        ('an-1', '系統維護預告', '本平台將於本週日凌晨 2:00–4:00 進行維護，屆時暫停服務。', 'warning', 'all', 1,
         _iso(now - DAY), _iso(now + 5 * DAY), _iso(now - DAY)),
        ('an-2', '租金補貼開放申請', '300 億元中央擴大租金補貼受理中，請至租補專區試算並提出申請。', 'info', 'tenant', 1,
         _iso(now - 3 * DAY), None, _iso(now - 3 * DAY)),
        ('an-3', '颱風假服務調整', '颱風期間客服回覆較慢，敬請見諒。', 'urgent', 'all', 1,
         _iso(now - 30 * DAY), _iso(now - 20 * DAY), _iso(now - 30 * DAY)),
        ('an-4', '新功能預告', '點交存證影像比對即將上線，敬請期待。', 'info', 'tenant', 0,
         _iso(now - 2 * DAY), None, _iso(now - 2 * DAY)),
    ]


def _seed_banners(now: float) -> list[tuple]:
    return [
        ('ban-1', '租補試算上線', '/banners/subsidy.webp', '/app/subsidy', 0, 1, _iso(now - 6 * DAY), None, _iso(now - 6 * DAY)),
        ('ban-2', '契約分析教學', '/banners/contract.webp', '/app/contract', 1, 1, _iso(now - 6 * DAY), None, _iso(now - 6 * DAY)),
        ('ban-3', '點交存證', '/banners/handover.webp', '/app/handover', 2, 1, _iso(now - 6 * DAY), None, _iso(now - 6 * DAY)),
    ]


def _seed_templates(now: float) -> list[tuple]:
    """原本 src/mocks/admin/notifications.ts 的五個模板。"""
    return [
        ('nt-1', '租約到期提醒', '租約', ['inapp', 'email'], '您的租約將於 {{到期日}} 到期',
         '{{姓名}} 您好，您位於 {{地址}} 的租約即將於 {{到期日}} 到期，請儘早與房東確認續約意願。', 1, now - 3 * DAY),
        ('nt-2', '補貼審核通過', '補貼', ['inapp', 'push'], '租金補貼審核通過',
         '{{姓名}} 您好，您申請的租金補貼已審核通過，每月核定金額為 {{金額}} 元，將於 {{撥款日}} 起撥款。', 1, now - 7 * DAY),
        ('nt-3', '帳單待繳提醒', '帳務', ['inapp', 'email', 'push'], '本期帳單 {{金額}} 元待繳',
         '您的本期帳單金額為 {{金額}} 元，應繳日為 {{應繳日}}，逾期將產生滯納金。', 1, now - DAY),
        ('nt-4', '系統維護預告', '系統', ['inapp'], '系統維護預告',
         '本平台將於 {{維護時間}} 進行系統維護，屆時暫停服務，造成不便敬請見諒。', 1, now - 5 * DAY),
        ('nt-5', '合約分析完成', '系統', ['inapp'], '合約分析完成',
         '您上傳的「{{檔名}}」已完成 AI 分析，可至合約專區查看結果。', 0, now - 20 * DAY),
    ]


def _seed(db: Store) -> None:
    now = _now()
    # 倒著寫：列表是新到舊（updated_at 新的在前），倒著寫才會照原本的順序顯示
    for row in reversed(_seed_announcements(now)):
        db.execute('INSERT INTO announcements (id, title, body, level, audience, published, start_at, end_at, updated_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', row)
    for row in _seed_banners(now):
        db.execute('INSERT INTO banners (id, title, image_url, link_url, sort_order, published, start_at, end_at, updated_at) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', row)
    for (tid, name, category, channels, title, body, enabled, updated) in reversed(_seed_templates(now)):
        db.execute('INSERT INTO notification_templates (id, name, category, channels, title, body, action_url, action_label, '
                   'enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)',
                   (tid, name, category, json.dumps(channels), title, body, enabled, _iso(updated)))
    db.execute("INSERT INTO content_meta (`key`, value) VALUES ('seeded', ?)", (_iso(now),))


def _new_id(prefix: str) -> str:
    return f'{prefix}-{uuid.uuid4().hex[:10]}'


def _audit(action: str, target: str, detail: str, *, actor: str, subject: str) -> None:
    from admin import audit_service

    audit_service.record(action, target, detail, actor=actor, subject=subject)


# ---------------------------------------------------------------------------
# 共用的驗證
# ---------------------------------------------------------------------------


def _text(values: dict, key: str, label: str, max_length: int, *, required_message: str) -> str:
    value = values.get(key)
    if not isinstance(value, str) or value.strip() == '':
        raise ValueError(required_message)
    value = value.strip()
    if len(value) > max_length:
        raise ValueError(f'{label}不可超過 {max_length} 個字。')
    return value


def _flag(values: dict, key: str, label: str) -> int:
    value = values.get(key)
    if not isinstance(value, bool):
        raise ValueError(f'{label}必須是開關（true／false）。')
    return 1 if value else 0


def _schedule(values: dict) -> tuple[str, str | None]:
    """開始時間必填、結束時間可空（長期）。結束不能早於開始。"""
    try:
        start = _iso(_parse_iso(values.get('startAt') or ''))
        end_raw = values.get('endAt')
        end = _iso(_parse_iso(end_raw)) if end_raw else None
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError('開始或結束時間的時間格式不正確。') from error
    if end is not None and _parse_iso(end) <= _parse_iso(start):
        raise ValueError('結束時間必須晚於開始時間。')
    return start, end


def _is_site_path(value: str) -> bool:
    """站內路徑。//example.com、/\\example.com 這種瀏覽器會當成外部網站的寫法不算。"""
    return value.startswith('/') and not value.startswith('//') and not value.startswith('/\\')


_HTTP_URL = re.compile(r'^https?://[^\s/$.?#][^\s]*$', re.IGNORECASE)


def _is_image_url(value: str) -> bool:
    """跟前端 isValidImageUrl 同樣的規則：http(s) 外部網址，或站內的內建圖片。"""
    return _is_site_path(value) or bool(_HTTP_URL.match(value))


def _active(row: Row, now: float) -> bool:
    """跟前端 resolvePhase 一樣：發布中、已經開始、還沒結束（結束時間當下仍算生效）。"""
    if not row['published']:
        return False
    if now < _parse_iso(row['start_at']):
        return False
    return row['end_at'] is None or now <= _parse_iso(row['end_at'])


# ---------------------------------------------------------------------------
# 公告
# ---------------------------------------------------------------------------


def _announcement_view(row: Row) -> dict:
    return {
        'id': row['id'],
        'title': row['title'],
        'body': row['body'],
        'level': row['level'],
        'audience': row['audience'],
        'published': bool(row['published']),
        'startAt': row['start_at'],
        'endAt': row['end_at'],
        'updatedAt': row['updated_at'],
    }


def _clean_announcement(values: dict) -> tuple:
    title = _text(values, 'title', '公告標題', 100, required_message='請輸入公告標題。')
    body = _text(values, 'body', '公告內容', 2000, required_message='請輸入公告內容。')
    if values.get('level') not in ANNOUNCEMENT_LEVELS:
        raise ValueError('不認得的公告等級。')
    if values.get('audience') not in ANNOUNCEMENT_AUDIENCES:
        raise ValueError('不認得的公告對象。')
    published = _flag(values, 'published', '是否發布')
    start, end = _schedule(values)
    return title, body, values['level'], values['audience'], published, start, end


def list_announcements() -> list[dict]:
    """新到舊（最後建立的在最前面），跟後台原本的列表順序一樣。"""
    with _open() as db:
        # 最近更新的在前。原本靠 SQLite 的 rowid（插入順序），共用資料庫沒有那個欄位；
        # 對後台來說「剛改過的排前面」也比「先建立的排前面」有用。
        rows = db.execute('SELECT * FROM announcements ORDER BY updated_at DESC, id DESC').fetchall()
    return [_announcement_view(row) for row in rows]


def create_announcement(values: dict, *, actor: str) -> dict:
    title, body, level, audience, published, start, end = _clean_announcement(values)
    aid = _new_id('an')
    with _open() as db:
        db.execute(
            'INSERT INTO announcements (id, title, body, level, audience, published, start_at, end_at, updated_at) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (aid, title, body, level, audience, published, start, end, _iso(_now())),
        )
        row = db.execute('SELECT * FROM announcements WHERE id = ?', (aid,)).fetchone()
    _audit('內容管理', '公告', f'新增公告「{title}」', actor=actor, subject=f'announcement:{aid}')
    return _announcement_view(row)


def update_announcement(aid: str, values: dict, *, actor: str) -> dict:
    title, body, level, audience, published, start, end = _clean_announcement(values)
    with _open() as db:
        cursor = db.execute(
            'UPDATE announcements SET title = ?, body = ?, level = ?, audience = ?, published = ?, start_at = ?, '
            'end_at = ?, updated_at = ? WHERE id = ?',
            (title, body, level, audience, published, start, end, _iso(_now()), aid),
        )
        if cursor.rowcount == 0:
            raise LookupError(aid)
        row = db.execute('SELECT * FROM announcements WHERE id = ?', (aid,)).fetchone()
    _audit('內容管理', '公告', f'更新公告「{title}」', actor=actor, subject=f'announcement:{aid}')
    return _announcement_view(row)


def delete_announcement(aid: str, *, actor: str) -> None:
    with _open() as db:
        row = db.execute('SELECT title FROM announcements WHERE id = ?', (aid,)).fetchone()
        if row is None:
            raise LookupError(aid)
        db.execute('DELETE FROM announcements WHERE id = ?', (aid,))
    _audit('內容管理', '公告', f'刪除公告「{row["title"]}」', actor=actor, subject=f'announcement:{aid}')


# ---------------------------------------------------------------------------
# 首頁輪播
# ---------------------------------------------------------------------------


def _banner_view(row: Row) -> dict:
    return {
        'id': row['id'],
        'title': row['title'],
        'imageUrl': row['image_url'],
        'linkUrl': row['link_url'],
        'audience': row['audience'],
        'order': row['sort_order'],
        'published': bool(row['published']),
        'startAt': row['start_at'],
        'endAt': row['end_at'],
        'updatedAt': row['updated_at'],
    }


def _clean_banner(values: dict) -> tuple:
    title = _text(values, 'title', '輪播標題', 60, required_message='請輸入輪播標題。')
    image = values.get('imageUrl')
    if not isinstance(image, str) or not _is_image_url(image.strip()):
        raise ValueError('圖片網址格式不正確，請填完整的 http(s) 連結，或選用內建圖片。')
    link = values.get('linkUrl')
    if not isinstance(link, str) or not _is_site_path(link.strip()):
        # 輪播只導到站內頁面；外部連結可以把使用者帶去任何地方
        raise ValueError('輪播連結必須是站內的頁面。')
    audience = values.get('audience', 'all')
    if audience not in ANNOUNCEMENT_AUDIENCES:
        raise ValueError('輪播對象只能是全部、租客或房東。')
    published = _flag(values, 'published', '是否發布')
    start, end = _schedule(values)
    return title, image.strip(), link.strip(), audience, published, start, end


def list_banners() -> list[dict]:
    with _open() as db:
        rows = db.execute('SELECT * FROM banners ORDER BY sort_order, id').fetchall()
    return [_banner_view(row) for row in rows]


def create_banner(values: dict, *, actor: str) -> dict:
    title, image, link, audience, published, start, end = _clean_banner(values)
    bid = _new_id('ban')
    with _open() as db:
        (last,) = db.execute('SELECT COALESCE(MAX(sort_order), -1) FROM banners').fetchone()
        db.execute(
            'INSERT INTO banners (id, title, image_url, link_url, sort_order, published, start_at, end_at, '
            'updated_at, audience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (bid, title, image, link, last + 1, published, start, end, _iso(_now()), audience),
        )
        row = db.execute('SELECT * FROM banners WHERE id = ?', (bid,)).fetchone()
    _audit('內容管理', 'Banner', f'新增輪播「{title}」', actor=actor, subject=f'banner:{bid}')
    return _banner_view(row)


def update_banner(bid: str, values: dict, *, actor: str) -> dict:
    title, image, link, audience, published, start, end = _clean_banner(values)
    with _open() as db:
        cursor = db.execute(
            'UPDATE banners SET title = ?, image_url = ?, link_url = ?, audience = ?, published = ?, start_at = ?, '
            'end_at = ?, updated_at = ? WHERE id = ?',
            (title, image, link, audience, published, start, end, _iso(_now()), bid),
        )
        if cursor.rowcount == 0:
            raise LookupError(bid)
        row = db.execute('SELECT * FROM banners WHERE id = ?', (bid,)).fetchone()
    _audit('內容管理', 'Banner', f'更新輪播「{title}」', actor=actor, subject=f'banner:{bid}')
    return _banner_view(row)


def delete_banner(bid: str, *, actor: str) -> None:
    with _open() as db:
        row = db.execute('SELECT title FROM banners WHERE id = ?', (bid,)).fetchone()
        if row is None:
            raise LookupError(bid)
        db.execute('DELETE FROM banners WHERE id = ?', (bid,))
    _audit('內容管理', 'Banner', f'刪除輪播「{row["title"]}」', actor=actor, subject=f'banner:{bid}')


def reorder_banners(ids: list[str], *, moved_id: str | None, actor: str) -> list[dict]:
    """照畫面上排好的順序重寫。清單必須剛好是現在所有的輪播，對不上就拒絕。"""
    with _open() as db:
        current = {row['id']: row['title'] for row in db.execute('SELECT id, title FROM banners').fetchall()}
        if len(ids) != len(set(ids)) or set(ids) != set(current):
            raise ValueError('輪播清單已經有變動，請重新整理後再調整順序。')
        for index, bid in enumerate(ids):
            db.execute('UPDATE banners SET sort_order = ? WHERE id = ?', (index, bid))
    detail = f'調整輪播「{current[moved_id]}」的順序' if moved_id in current else '調整輪播的順序'
    _audit('內容管理', 'Banner', detail, actor=actor, subject=f'banner:{moved_id}' if moved_id in current else 'banners')
    return list_banners()


# ---------------------------------------------------------------------------
# 通知模板
# ---------------------------------------------------------------------------


def _template_view(row: Row) -> dict:
    return {
        'id': row['id'],
        'name': row['name'],
        'category': row['category'],
        'channels': json.loads(row['channels']),
        'title': row['title'],
        'body': row['body'],
        'actionUrl': row['action_url'],
        'actionLabel': row['action_label'],
        'enabled': bool(row['enabled']),
        'updatedAt': row['updated_at'],
    }


def _clean_template(values: dict) -> tuple:
    name = _text(values, 'name', '模板名稱', 60, required_message='請輸入模板名稱。')
    if values.get('category') not in TEMPLATE_CATEGORIES:
        raise ValueError('不認得的模板分類。')
    channels = values.get('channels')
    if not isinstance(channels, list) or not channels:
        raise ValueError('發送管道至少選一個。')
    if any(channel not in TEMPLATE_CHANNELS for channel in channels):
        raise ValueError('不認得的發送管道。')
    channels = list(dict.fromkeys(channels))
    title = _text(values, 'title', '通知標題', 100, required_message='請輸入通知標題。')
    body = _text(values, 'body', '通知內容', 2000, required_message='請輸入通知內容。')
    action_url = (values.get('actionUrl') or '').strip() or None
    if action_url is not None and not (_is_site_path(action_url) or _HTTP_URL.match(action_url)):
        raise ValueError('按鈕連結必須是站內頁面或完整的 http(s) 連結。')
    action_label = (values.get('actionLabel') or '').strip() or None
    if action_label is not None and len(action_label) > 20:
        raise ValueError('按鈕文字不可超過 20 個字。')
    # 有連結才有按鈕；只有文字沒有連結的話，收件匣不會顯示任何按鈕
    if action_url is None:
        action_label = None
    enabled = _flag(values, 'enabled', '是否啟用')
    return name, values['category'], json.dumps(channels), title, body, action_url, action_label, enabled


def list_templates() -> list[dict]:
    with _open() as db:
        rows = db.execute('SELECT * FROM notification_templates ORDER BY updated_at DESC, id DESC').fetchall()
    return [_template_view(row) for row in rows]


def create_template(values: dict, *, actor: str) -> dict:
    fields = _clean_template(values)
    tid = _new_id('nt')
    with _open() as db:
        db.execute(
            'INSERT INTO notification_templates (id, name, category, channels, title, body, action_url, action_label, '
            'enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (tid, *fields, _iso(_now())),
        )
        row = db.execute('SELECT * FROM notification_templates WHERE id = ?', (tid,)).fetchone()
    _audit('通知管理', '模板', f'新增模板「{fields[0]}」', actor=actor, subject=f'template:{tid}')
    return _template_view(row)


def update_template(tid: str, values: dict, *, actor: str) -> dict:
    fields = _clean_template(values)
    with _open() as db:
        cursor = db.execute(
            'UPDATE notification_templates SET name = ?, category = ?, channels = ?, title = ?, body = ?, '
            'action_url = ?, action_label = ?, enabled = ?, updated_at = ? WHERE id = ?',
            (*fields, _iso(_now()), tid),
        )
        if cursor.rowcount == 0:
            raise LookupError(tid)
        row = db.execute('SELECT * FROM notification_templates WHERE id = ?', (tid,)).fetchone()
    _audit('通知管理', '模板', f'更新模板「{fields[0]}」', actor=actor, subject=f'template:{tid}')
    return _template_view(row)


def set_template_enabled(tid: str, enabled: bool, *, actor: str) -> dict:
    if not isinstance(enabled, bool):
        raise ValueError('是否啟用必須是開關（true／false）。')
    with _open() as db:
        cursor = db.execute(
            'UPDATE notification_templates SET enabled = ?, updated_at = ? WHERE id = ?',
            (1 if enabled else 0, _iso(_now()), tid),
        )
        if cursor.rowcount == 0:
            raise LookupError(tid)
        row = db.execute('SELECT * FROM notification_templates WHERE id = ?', (tid,)).fetchone()
    _audit('通知管理', '模板', f'{"啟用" if enabled else "停用"}模板「{row["name"]}」', actor=actor, subject=f'template:{tid}')
    return _template_view(row)


def delete_template(tid: str, *, actor: str) -> None:
    with _open() as db:
        row = db.execute('SELECT name FROM notification_templates WHERE id = ?', (tid,)).fetchone()
        if row is None:
            raise LookupError(tid)
        db.execute('DELETE FROM notification_templates WHERE id = ?', (tid,))
    _audit('通知管理', '模板', f'刪除模板「{row["name"]}」', actor=actor, subject=f'template:{tid}')


# ---------------------------------------------------------------------------
# 公開
# ---------------------------------------------------------------------------


def public_content() -> dict:
    """首頁與租客端要的：生效中的輪播（照順序）與公告（新開始的在前）。"""
    now = _now()
    with _open() as db:
        banners = db.execute('SELECT * FROM banners ORDER BY sort_order, id').fetchall()
        announcements = db.execute('SELECT * FROM announcements').fetchall()
    active = sorted(
        (row for row in announcements if _active(row, now)),
        key=lambda row: _parse_iso(row['start_at']),
        reverse=True,
    )
    return {
        'banners': [_banner_view(row) for row in banners if _active(row, now)],
        'announcements': [_announcement_view(row) for row in active],
    }
