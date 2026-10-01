"""平台設定：後端實際執行、所有管理員共用的那幾項。

後台「系統設定」頁的其他欄位（提醒門檻、維護模式）仍存在管理員的瀏覽器裡，
只影響後台畫面。這裡只放**後端真的會照著做**的兩項：

- 密碼最短長度：註冊時檢查（routers/auth.py）
- 登入有效時間：簽發登入憑證時決定期限（security.py）

## 為什麼管理員的登入期限不吃這個設定

把一般使用者的期限設錯（例如設得太短）時，管理員必須還進得來改回去。
管理員的期限固定在 ADMIN_SESSION_MINUTES。

## 讀取不建立檔案

登入、註冊每次都會讀設定。檔案不存在時直接回預設值、不建立 ——
否則每個會簽發憑證的測試都會在 backend/ 底下留一個資料庫檔。
"""

from sqlalchemy.exc import SQLAlchemyError

from db.sqlstore import open_store as _open

from pathlib import Path

#: 預設值。登入有效時間的預設見 DEFAULT_SESSION_MINUTES 的說明
DEFAULT_PASSWORD_MIN_LENGTH = 8
PASSWORD_MIN_LENGTH_RANGE = (8, 64)
#: 密碼上限不開放調整：argon2 對超長輸入沒有意義，只會變成 DoS 的材料
PASSWORD_MAX_LENGTH = 128

#: 一般使用者（租客、房東）登入後多久要重新登入。從登入起算，不因重新整理延長。
#: 預設 1 天：改版前的實際行為就是「常在用的人 24 小時才要重新登入」（cookie 的期限）。
DEFAULT_SESSION_MINUTES = 1440
#: 只給選單上的這幾個值：自由輸入很容易打出 1 分鐘這種讓所有人一登入就被登出的值
SESSION_MINUTE_OPTIONS = (30, 60, 120, 480, 1440, 4320, 10080)

#: 管理員固定，不受設定影響（見模組說明）。一個工作天收一次信箱驗證碼。
ADMIN_SESSION_MINUTES = 480
#: 管理員閒置超過這麼久就要重新登入，由伺服器判斷（見 models.AdminSession）
ADMIN_IDLE_MINUTES = 20

LABELS = {
    'password_min_length': ('密碼最短長度', '字元'),
    'session_minutes': ('登入有效時間', '分鐘'),
}


def _defaults() -> dict:
    return {
        'password_min_length': DEFAULT_PASSWORD_MIN_LENGTH,
        'session_minutes': DEFAULT_SESSION_MINUTES,
    }


def get_settings() -> dict:
    values = _defaults()
    try:
        with _open() as db:
            for row in db.execute('SELECT `key`, value FROM platform_settings').fetchall():
                if row['key'] in values:
                    values[row['key']] = int(row['value'])
    except SQLAlchemyError:
        # 讀不到就用預設值：登入與註冊不能因為設定檔壞掉而整個停擺
        return _defaults()
    return values


def password_min_length() -> int:
    return get_settings()['password_min_length']


def session_minutes() -> int:
    return get_settings()['session_minutes']


def validate(changes: dict) -> dict:
    """只接受認得的欄位與合法的值；不合法就丟 ValueError，訊息直接給畫面顯示。"""
    clean: dict = {}
    for key, value in changes.items():
        if key not in LABELS:
            raise ValueError(f'不認得的設定：{key}')
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f'{LABELS[key][0]}必須是整數。')
        if key == 'password_min_length':
            low, high = PASSWORD_MIN_LENGTH_RANGE
            if not low <= value <= high:
                raise ValueError(f'密碼最短長度必須介於 {low} 到 {high} 個字元。')
        if key == 'session_minutes' and value not in SESSION_MINUTE_OPTIONS:
            raise ValueError('登入有效時間只能從選單裡選。')
        clean[key] = value
    return clean


def _describe(key: str, before: int, after: int) -> str:
    label, unit = LABELS[key]
    return f'{label}：{before} → {after} {unit}'


def update_settings(changes: dict, *, actor: str) -> dict:
    """驗證、寫入、每個有變的欄位各記一筆稽核。回傳更新後的完整設定。"""
    clean = validate(changes)
    before = get_settings()
    changed = {key: value for key, value in clean.items() if before[key] != value}
    if changed:
        with _open() as db:
            for key, value in changed.items():
                db.upsert('platform_settings', {'key': key}, {'value': value})
        from admin import audit_service

        for key, value in changed.items():
            audit_service.record('系統設定', '安全性設定', _describe(key, before[key], value), actor=actor)
    return get_settings()
