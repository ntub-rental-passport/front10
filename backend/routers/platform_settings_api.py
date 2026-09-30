"""平台設定 API（見 platform_settings.py 與 site_settings.py）。

- `GET /api/settings/public`：不需登入，每個頁面都會讀（前端有快取）。
  - 註冊頁要知道密碼最短長度，才能在送出前就提示。
  - 換頁時要知道維護模式與停用中的功能。
  只放本來就會顯示在畫面上的值；維護白名單、停用的內部原因、各種門檻都不在這裡。
- `GET/PUT /api/admin/settings`：安全設定，僅限管理員。
- `GET/PUT /api/admin/site-settings`：系統設定頁的其他欄位，僅限管理員。
- `GET /api/admin/feature-outages`、`PUT/DELETE /api/admin/feature-outages/{key}`：功能停用。

所有修改都寫進稽核紀錄。
"""

import jwt
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from admin import platform_settings, site_settings
from db.models import User
from auth import security
from auth.security import get_current_admin

router = APIRouter(tags=['Settings'])


def _admin_view() -> dict:
    values = platform_settings.get_settings()
    return {
        'passwordMinLength': values['password_min_length'],
        'passwordMinLengthRange': list(platform_settings.PASSWORD_MIN_LENGTH_RANGE),
        'passwordMaxLength': platform_settings.PASSWORD_MAX_LENGTH,
        'sessionMinutes': values['session_minutes'],
        'sessionMinuteOptions': list(platform_settings.SESSION_MINUTE_OPTIONS),
        'adminSessionMinutes': platform_settings.ADMIN_SESSION_MINUTES,
        'adminIdleMinutes': platform_settings.ADMIN_IDLE_MINUTES,
        'defaults': {
            'passwordMinLength': platform_settings.DEFAULT_PASSWORD_MIN_LENGTH,
            'sessionMinutes': platform_settings.DEFAULT_SESSION_MINUTES,
        },
    }


def _cookie_email(request: Request) -> str | None:
    """登入後的 cookie 裡有 email（管理員也有）。讀不到或無效就當作沒登入，不報錯。"""
    token = request.cookies.get(security.AUTH_COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, security.JWT_SECRET, algorithms=[security.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    email = payload.get('email')
    return str(email) if email else None


@router.get('/api/settings/public')
def read_public_settings(request: Request) -> dict:
    site = site_settings.public_settings()
    # 只有維護開著才需要知道是誰；平常不必解 cookie
    bypass = site['maintenance']['mode'] and site_settings.maintenance_bypass(_cookie_email(request))
    return {
        'passwordMinLength': platform_settings.password_min_length(),
        'passwordMaxLength': platform_settings.PASSWORD_MAX_LENGTH,
        **site,
        'maintenanceBypass': bypass,
        'featureOutages': site_settings.public_outages(),
    }


class SettingsUpdate(BaseModel):
    passwordMinLength: int | None = None
    sessionMinutes: int | None = None


@router.get('/api/admin/settings')
def read_admin_settings(admin: User = Depends(get_current_admin)) -> dict:
    return _admin_view()


@router.put('/api/admin/settings')
def update_admin_settings(payload: SettingsUpdate, admin: User = Depends(get_current_admin)) -> dict:
    changes = {}
    if payload.passwordMinLength is not None:
        changes['password_min_length'] = payload.passwordMinLength
    if payload.sessionMinutes is not None:
        changes['session_minutes'] = payload.sessionMinutes
    try:
        platform_settings.update_settings(changes, actor=admin.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _admin_view()


# ---------------------------------------------------------------------------
# 系統設定頁的其他欄位、功能停用（site_settings.py）
# ---------------------------------------------------------------------------


@router.get('/api/admin/site-settings')
def read_site_settings(admin: User = Depends(get_current_admin)) -> dict:
    return site_settings.get_settings()


@router.put('/api/admin/site-settings')
def update_site_settings(payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    """只送有改的欄位也可以；跨欄位的規則（例如預警要小於告急）會拿合併後的結果檢查。"""
    try:
        return site_settings.update_settings(payload, actor=admin.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get('/api/admin/feature-outages')
def read_feature_outages(admin: User = Depends(get_current_admin)) -> list[dict]:
    return site_settings.list_outages()


class OutageUpdate(BaseModel):
    internalReason: str = ''
    publicNote: str = ''
    etaAt: str | None = None


@router.put('/api/admin/feature-outages/{feature_key}')
def close_feature(feature_key: str, payload: OutageUpdate, admin: User = Depends(get_current_admin)) -> dict:
    """關閉功能；已經關閉的再送一次是更新說明與預計時間，不會重算關閉時間。"""
    try:
        return site_settings.close_feature(
            feature_key, payload.internalReason, payload.publicNote, payload.etaAt, actor=admin.email,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete('/api/admin/feature-outages/{feature_key}', status_code=204)
def reopen_feature(feature_key: str, admin: User = Depends(get_current_admin)) -> None:
    try:
        site_settings.reopen_feature(feature_key, actor=admin.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail='這個功能目前沒有停用。') from error
