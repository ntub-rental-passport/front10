"""平台設定 API（見 platform_settings.py）。

- `GET /api/settings/public`：不需登入。註冊頁要知道密碼最短長度，才能在送出前就提示。
  只放這種「本來就會顯示在註冊頁上」的值。
- `GET/PUT /api/admin/settings`：僅限管理員，每次修改寫進稽核紀錄。
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import platform_settings
from models import User
from security import get_current_admin

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


@router.get('/api/settings/public')
def read_public_settings() -> dict:
    return {
        'passwordMinLength': platform_settings.password_min_length(),
        'passwordMaxLength': platform_settings.PASSWORD_MAX_LENGTH,
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
