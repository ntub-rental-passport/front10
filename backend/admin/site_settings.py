"""後台「系統設定」的其餘欄位與功能停用：存在後端，所有裝置看同一份。

platform_settings.py 管的是後端真的會照著執行的安全設定（密碼長度、登入期限）。
這裡管的是系統設定頁的其他欄位（網站名稱、維護模式、各種提醒門檻），以及
系統監控頁的「功能停用」。三者放在同一個 SQLite 檔（PLATFORM_SETTINGS_DB）的
不同資料表 —— VM 上那個檔本來就在會保留的資料夾裡，不用多設路徑。

## 維護模式和功能停用只擋畫面

前端換頁時會看公開設定（有快取），把一般頁面導到維護頁、把停用的功能換成
維護說明。API 本身不擋：展示時看起來一樣，萬一設定錯也不會把管理員自己
鎖在外面（2026-09-30 決定）。

## 公開與不公開

- 公開（/api/settings/public）：網站名稱、客服信箱、維護模式的開關／說明／時段、
  功能停用的對外說明與預計恢復時間。
- 不公開：維護白名單（裡面是使用者的 email）、功能停用的內部原因、各種門檻。
  白名單由後端直接回答「這個人能不能進站」（maintenance_bypass），不把名單送出去。

## 稽核紀錄保留天數不刪資料

只是稽核頁的篩選，理由見 audit_service.py 的說明。

## 讀取不建立檔案

跟 platform_settings 一樣：檔案不存在就回預設值。每個頁面載入都會讀公開設定，
讀的時候建檔的話，每支測試都會在 backend/ 底下留一個資料庫。
"""

from sqlalchemy.exc import SQLAlchemyError

from db.sqlstore import Row, open_store as _open

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


TZ = timezone(timedelta(hours=8))

EMAIL_PATTERN = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
#: 後台用 <input type="datetime-local">，值沒有時區，照管理員看到的本地時間解讀
LOCAL_DATETIME = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$')


@dataclass(frozen=True)
class Field:
    label: str
    kind: str  # text | boolean | datetime | number
    default: object
    unit: str | None = None
    max_length: int = 0
    minimum: int | None = None
    maximum: int | None = None
    range_message: str = ''


#: 欄位、預設值與範圍要跟前端一致：src/mocks/admin/settings.ts、src/utils/settings-validate.ts。
#: 順序就是稽核紀錄裡列出變更的順序（跟 src/utils/settings-labels.ts 一樣）。
FIELDS: dict[str, Field] = {
    'siteName': Field('網站名稱', 'text', 'RentMate 租隊友', max_length=60),
    'supportEmail': Field('客服信箱', 'text', 'support@rentmate.tw', max_length=254),
    'maintenanceMode': Field('維護模式', 'boolean', False),
    'maintenanceMessage': Field('維護說明文字', 'text', '系統維護中，預計 30 分鐘後恢復，造成不便敬請見諒。', max_length=500),
    'maintenanceStartsAt': Field('維護開始時間', 'datetime', ''),
    'maintenanceEndsAt': Field('維護結束時間', 'datetime', ''),
    'maintenanceAllowlist': Field('維護白名單', 'text', 'admin@rentmate.tw', max_length=2000),
    # 0 或負數代表不限制，所以只有上限
    'auditRetentionDays': Field(
        '稽核紀錄保留天數', 'number', 90, unit='天', maximum=3650,
        range_message='保留天數不可超過 3650 天（0 或負數代表不限制）',
    ),
    'maintenanceOverdueDays': Field(
        '報修逾期提醒門檻', 'number', 7, unit='天', minimum=1, maximum=90, range_message='逾期門檻需介於 1 到 90 天',
    ),
    'subscriptionExpiringSoonDays': Field(
        '訂閱到期提醒天數', 'number', 14, unit='天', minimum=1, maximum=90, range_message='到期提醒天數需介於 1 到 90 天',
    ),
    'platformVisionPageQuota': Field(
        'Vision 每月頁數上限', 'number', 3_000, unit='頁', minimum=0, range_message='Vision 頁數額度不可為負數',
    ),
    'quotaWarnPercent': Field(
        '額度預警門檻', 'number', 80, unit='%', minimum=1, maximum=100, range_message='預警門檻需介於 1 到 100',
    ),
    'quotaCriticalPercent': Field(
        '額度告急門檻', 'number', 95, unit='%', minimum=1, maximum=100, range_message='告急門檻需介於 1 到 100',
    ),
    'aiQuotaCriticalDays': Field(
        '剩餘天數告急門檻', 'number', 3, unit='天', minimum=1, maximum=30, range_message='告急天數需介於 1 到 30 天',
    ),
    # 上限 5000：前端量回應時間 5 秒就放棄（useSystemHealth.ts 的 TIMEOUT_MS）
    'responseOkMs': Field(
        '回應時間正常門檻', 'number', 300, unit='ms', minimum=50, maximum=5000, range_message='正常門檻需介於 50 到 5000 毫秒',
    ),
    'responseDegradedMs': Field(
        '回應時間變慢門檻', 'number', 1000, unit='ms', minimum=50, maximum=5000, range_message='變慢門檻需介於 50 到 5000 毫秒',
    ),
}

#: 跟前端 PLAN_FEATURES（src/utils/admin-entitlements.ts）同一組六項
FEATURE_LABELS = {
    'contract-analysis': '契約分析',
    'handover': '點交存證',
    'subsidy': '租金補貼',
    'garbage': '垃圾車查詢',
    'outage': '停水停電通知',
    'notes': '記事與室友協作',
}
PUBLIC_NOTE_MAX_LENGTH = 300
INTERNAL_REASON_MAX_LENGTH = 300


def _now() -> float:
    """獨立出來是為了讓測試可以固定「現在」。"""
    return time.time()


def _iso(ts: float) -> str:
    """跟 JavaScript 的 toISOString() 同一個格式，前端直接 new Date() 就能讀。"""
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_iso(value: str) -> datetime:
    """讀前端送來的 ISO 時間（toISOString 的格式）。沒有時區就不收：分不出是哪裡的幾點。"""
    text = value.strip()
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        raise ValueError('missing timezone')
    return parsed


def taipei_label(value: str) -> str:
    """稽核紀錄裡的時間，跟前端 formatDateTime 一樣是「2026/10/01 14:00」。"""
    return parse_iso(value).astimezone(TZ).strftime('%Y/%m/%d %H:%M')


def duration_label(seconds: float) -> str:
    """關了多久。跟前端 outageDurationLabel 同樣的級距：越久越粗。"""
    elapsed = max(0, int(seconds))
    if elapsed < 60:
        return '不到 1 分鐘'
    if elapsed < 3600:
        return f'{elapsed // 60} 分'
    if elapsed < 86400:
        return f'{elapsed // 3600} 小時 {elapsed % 3600 // 60} 分'
    return f'{elapsed // 86400} 天 {elapsed % 86400 // 3600} 小時'


# ---------------------------------------------------------------------------
# 系統設定
# ---------------------------------------------------------------------------


def _defaults() -> dict:
    return {key: field.default for key, field in FIELDS.items()}


def get_settings() -> dict:
    values = _defaults()
    try:
        with _open() as db:
            for row in db.execute('SELECT `key`, value FROM site_settings').fetchall():
                if row['key'] in values:
                    values[row['key']] = json.loads(row['value'])
    except (SQLAlchemyError, ValueError):
        # 讀不到就用預設值：每個頁面都會讀，不能因為設定檔壞掉讓網站打不開
        return _defaults()
    return values


def _clean_value(key: str, value: object) -> object:
    field = FIELDS[key]
    if field.kind == 'boolean':
        if not isinstance(value, bool):
            raise ValueError(f'{field.label}必須是開關（true／false）。')
        return value
    if field.kind == 'number':
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f'{field.label}必須是整數。')
        if (field.minimum is not None and value < field.minimum) or (field.maximum is not None and value > field.maximum):
            raise ValueError(f'{field.range_message}。')
        return value
    if not isinstance(value, str):
        raise ValueError(f'{field.label}必須是文字。')
    if field.kind == 'datetime':
        text = value.strip()
        if text and not LOCAL_DATETIME.match(text):
            raise ValueError(f'{field.label}的時間格式不正確。')
        return text
    if len(value) > field.max_length:
        raise ValueError(f'{field.label}不可超過 {field.max_length} 個字。')
    # 名稱與信箱存修剪過的；說明文字與白名單照原樣存，畫面要照打的樣子顯示回去
    return value.strip() if key in {'siteName', 'supportEmail'} else value


def _allowlist(raw: str) -> list[str]:
    return [line.strip().lower() for line in raw.split('\n') if line.strip()]


def _check_whole(values: dict) -> None:
    """跨欄位與必填的規則，跟前端 settings-validate.ts 一致。"""
    if values['siteName'] == '':
        raise ValueError('請輸入網站名稱。')
    if values['supportEmail'] == '':
        raise ValueError('請輸入客服信箱。')
    if not EMAIL_PATTERN.match(values['supportEmail']):
        raise ValueError('客服信箱請輸入有效的 Email。')
    if values['quotaWarnPercent'] >= values['quotaCriticalPercent']:
        # 黃燈門檻若不低於紅燈，狀態永遠跳不到「預警」
        raise ValueError('預警門檻需小於告急門檻。')
    if values['responseOkMs'] >= values['responseDegradedMs']:
        raise ValueError('正常門檻必須小於變慢門檻。')
    if values['maintenanceMode'] and values['maintenanceMessage'].strip() == '':
        raise ValueError('開啟維護模式時必須填寫維護說明。')
    starts, ends = values['maintenanceStartsAt'], values['maintenanceEndsAt']
    # 同樣格式的字串可以直接比大小；起訖顛倒的排程會讓維護永遠不生效
    if starts and ends and ends <= starts:
        raise ValueError('維護結束時間必須晚於開始時間。')
    for entry in _allowlist(values['maintenanceAllowlist']):
        if not EMAIL_PATTERN.match(entry):
            raise ValueError(f'維護白名單的「{entry}」不是有效的 Email。')


def validate(changes: dict, current: dict | None = None) -> dict:
    """回傳清理過的變更；不合法就丟 ValueError，訊息直接給畫面顯示。"""
    clean = {}
    for key, value in changes.items():
        if key not in FIELDS:
            raise ValueError(f'不認得的設定：{key}')
        clean[key] = _clean_value(key, value)
    _check_whole({**(current if current is not None else get_settings()), **clean})
    return clean


def _format_number(value: int) -> str:
    return f'{value:,}'


def _format_local(value: str) -> str:
    if not value:
        return '未設定'
    parsed = datetime.fromisoformat(value)
    return f'{parsed.month}/{parsed.day} {parsed:%H:%M}'


def _describe(key: str, before: object, after: object) -> str:
    """一個欄位的變更，跟前端 describeSettingChange 同樣的寫法。"""
    field = FIELDS[key]
    if field.kind == 'text':
        # 整段文案塞進稽核只會讓那一列撐得老長
        return f'{field.label}：已更新'
    if field.kind == 'boolean':
        return f'{field.label}：{"開啟" if after else "關閉"}'
    if field.kind == 'datetime':
        return f'{field.label}：{_format_local(before)} → {_format_local(after)}'
    after_text = _format_number(after)
    if field.unit == '%':
        after_text = f'{after_text}%'
    elif field.unit:
        after_text = f'{after_text} {field.unit}'
    return f'{field.label}：{_format_number(before)} → {after_text}'


def update_settings(changes: dict, *, actor: str) -> dict:
    """驗證、寫入，並記稽核：維護模式的開關獨立一筆，其他變更合成一筆。"""
    before = get_settings()
    clean = validate(changes, before)
    changed = {key: value for key, value in clean.items() if before[key] != value}
    if changed:
        with _open() as db:
            for key, value in changed.items():
                db.upsert('site_settings', {'key': key},
                          {'value': json.dumps(value, ensure_ascii=False)})
        from admin import audit_service

        if 'maintenanceMode' in changed:
            audit_service.record(
                '系統設定', '維護模式', '開啟維護模式' if changed['maintenanceMode'] else '關閉維護模式', actor=actor,
            )
        others = [_describe(key, before[key], changed[key]) for key in FIELDS if key in changed and key != 'maintenanceMode']
        if others:
            audit_service.record('系統設定', '平台設定', '；'.join(others), actor=actor)
    return get_settings()


def public_settings() -> dict:
    values = get_settings()
    return {
        'siteName': values['siteName'],
        'supportEmail': values['supportEmail'],
        'maintenance': {
            'mode': values['maintenanceMode'],
            'message': values['maintenanceMessage'],
            'startsAt': values['maintenanceStartsAt'],
            'endsAt': values['maintenanceEndsAt'],
        },
    }


def maintenance_bypass(email: str | None) -> bool:
    """這個人在不在維護白名單上。白名單本身不公開，由這裡回答。"""
    if not email:
        return False
    return email.strip().lower() in _allowlist(get_settings()['maintenanceAllowlist'])


# ---------------------------------------------------------------------------
# 功能停用
# ---------------------------------------------------------------------------


def _outage_view(row: Row) -> dict:
    return {
        'featureKey': row['feature_key'],
        'internalReason': row['internal_reason'],
        'publicNote': row['public_note'],
        'closedAt': row['closed_at'],
        'etaAt': row['eta_at'],
    }


def list_outages() -> list[dict]:
    with _open() as db:
        rows = db.execute('SELECT * FROM feature_outages ORDER BY closed_at').fetchall()
    return [_outage_view(row) for row in rows]


def public_outages() -> list[dict]:
    """內部原因只給管理員看（例如「XX API 金鑰過期」），不送給使用者。"""
    return [
        {key: outage[key] for key in ('featureKey', 'publicNote', 'closedAt', 'etaAt')}
        for outage in list_outages()
    ]


def _feature_label(key: str) -> str:
    if key not in FEATURE_LABELS:
        raise ValueError(f'不認得的功能：{key}')
    return FEATURE_LABELS[key]


def close_feature(key: str, internal_reason: str, public_note: str, eta_at: str | None, *, actor: str) -> dict:
    """關閉功能，或更新一筆已經關閉中的紀錄。

    已經關閉的功能再關一次是「更新」：closedAt 保留原值，不然每改一次說明，
    「已關閉多久」就被歸零。稽核也要分得出來，否則看起來像關了兩次只恢復一次。
    """
    label = _feature_label(key)
    reason = (internal_reason or '').strip()
    if reason == '':
        # 沒有原因的關閉，事後回頭看稽核完全看不出當初為什麼關
        raise ValueError('關閉功能必須填寫內部原因。')
    if len(reason) > INTERNAL_REASON_MAX_LENGTH:
        raise ValueError(f'內部原因不可超過 {INTERNAL_REASON_MAX_LENGTH} 個字。')
    note = (public_note or '').strip()
    if len(note) > PUBLIC_NOTE_MAX_LENGTH:
        raise ValueError(f'對外說明不可超過 {PUBLIC_NOTE_MAX_LENGTH} 個字。')
    eta = None
    if eta_at:
        try:
            eta = _iso(parse_iso(eta_at).timestamp())
        except ValueError as error:
            raise ValueError('預計恢復時間的時間格式不正確。') from error

    with _open() as db:
        existing = db.execute('SELECT * FROM feature_outages WHERE feature_key = ?', (key,)).fetchone()
        if existing:
            db.execute(
                'UPDATE feature_outages SET internal_reason = ?, public_note = ?, eta_at = ? WHERE feature_key = ?',
                (reason, note, eta, key),
            )
        else:
            db.execute(
                'INSERT INTO feature_outages (feature_key, internal_reason, public_note, closed_at, eta_at) '
                'VALUES (?, ?, ?, ?, ?)',
                (key, reason, note, _iso(_now()), eta),
            )
        row = db.execute('SELECT * FROM feature_outages WHERE feature_key = ?', (key,)).fetchone()

    from admin import audit_service

    eta_text = f'預計恢復 {taipei_label(eta)}' if eta else '未填預計時間'
    verb = '更新維護資訊' if existing else '關閉功能'
    audit_service.record('系統', label, f'{verb}：{reason}（{eta_text}）', actor=actor, subject=f'feature:{key}')
    return _outage_view(row)


def reopen_feature(key: str, *, actor: str) -> None:
    """恢復功能：移除紀錄，稽核記下這次總共關了多久。沒在關閉中就丟 LookupError。"""
    label = _feature_label(key)
    with _open() as db:
        existing = db.execute('SELECT * FROM feature_outages WHERE feature_key = ?', (key,)).fetchone()
        if not existing:
            raise LookupError(key)
        db.execute('DELETE FROM feature_outages WHERE feature_key = ?', (key,))

    from admin import audit_service

    closed_for = duration_label(_now() - parse_iso(existing['closed_at']).timestamp())
    audit_service.record('系統', label, f'恢復功能，共關閉 {closed_for}', actor=actor, subject=f'feature:{key}')
