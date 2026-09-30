"""AI 用量的 API（見 admin/ai_usage.py）。

- `POST /api/internal/ai-usage`：OCR 服務回報 Vision 用量。要帶 `X-Service-Token`：
  用兩邊共用的 JWT_SECRET 簽、`svc` 是 `ocr` 的短效憑證。使用者的登入 cookie
  也是同一把鑰匙簽的，但沒有 `svc`，拿來冒充會被擋；反過來服務憑證沒有 `sub`，
  也不能拿來當登入（security.get_current_user 會拒絕）。
- `GET /api/admin/ai-usage`：後台 AI 用量頁，僅限管理員。
"""

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from admin import ai_usage
from auth import security
from auth.security import get_current_admin
from db.models import User

router = APIRouter(tags=['AI usage'])


class UsageReport(BaseModel):
    provider: str
    units: int
    calls: int = 1


def _require_service(token: str | None) -> None:
    if not token:
        raise HTTPException(status_code=401, detail='缺少服務憑證。')
    try:
        payload = jwt.decode(token, security.JWT_SECRET, algorithms=[security.JWT_ALGORITHM])
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail='服務憑證無效。') from error
    if payload.get('svc') != 'ocr':
        raise HTTPException(status_code=401, detail='服務憑證無效。')


@router.post('/api/internal/ai-usage', status_code=204)
def report_usage(payload: UsageReport, x_service_token: str | None = Header(default=None)) -> None:
    _require_service(x_service_token)
    try:
        ai_usage.record(payload.provider, payload.units, payload.calls)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get('/api/admin/ai-usage')
def read_usage(admin: User = Depends(get_current_admin)) -> dict:
    return {
        'providers': [{'id': key, **meta} for key, meta in ai_usage.PROVIDERS.items()],
        'daily': ai_usage.daily(),
    }
