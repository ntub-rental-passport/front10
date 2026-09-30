"""公告、首頁輪播與通知模板的 API（見 admin/content_service.py）。

- `GET /api/content/public`：不需登入。公開首頁、租客首頁與租客通知中心讀這支，
  只有生效中的公告與輪播。
- `/api/admin/content/...`、`/api/admin/notification-templates/...`：僅限管理員，
  每次修改寫進稽核紀錄。

驗證都在 content_service 裡做，錯誤訊息是中文、畫面直接顯示；所以這裡收 dict，
不讓 pydantic 先擋下來回英文的 422。
"""

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from admin import content_service
from auth.security import get_current_admin
from db.models import User

router = APIRouter(tags=['Content'])

NOT_FOUND = '找不到這筆資料，可能已經被其他管理員刪除，請重新整理。'


def _run(action):
    try:
        return action()
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from error


@router.get('/api/content/public')
def read_public_content() -> dict:
    return content_service.public_content()


# ---------------------------------------------------------------------------
# 公告與輪播
# ---------------------------------------------------------------------------


@router.get('/api/admin/content')
def read_admin_content(admin: User = Depends(get_current_admin)) -> dict:
    return {
        'announcements': content_service.list_announcements(),
        'banners': content_service.list_banners(),
    }


@router.post('/api/admin/content/announcements', status_code=201)
def create_announcement(payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.create_announcement(payload, actor=admin.email))


@router.put('/api/admin/content/announcements/{announcement_id}')
def update_announcement(announcement_id: str, payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.update_announcement(announcement_id, payload, actor=admin.email))


@router.delete('/api/admin/content/announcements/{announcement_id}', status_code=204)
def delete_announcement(announcement_id: str, admin: User = Depends(get_current_admin)) -> None:
    _run(lambda: content_service.delete_announcement(announcement_id, actor=admin.email))


@router.post('/api/admin/content/banners', status_code=201)
def create_banner(payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.create_banner(payload, actor=admin.email))


@router.put('/api/admin/content/banners/{banner_id}')
def update_banner(banner_id: str, payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.update_banner(banner_id, payload, actor=admin.email))


@router.delete('/api/admin/content/banners/{banner_id}', status_code=204)
def delete_banner(banner_id: str, admin: User = Depends(get_current_admin)) -> None:
    _run(lambda: content_service.delete_banner(banner_id, actor=admin.email))


class BannerOrder(BaseModel):
    ids: list[str]
    #: 被移動的那一張，只用來寫稽核（「調整輪播「XX」的順序」）
    movedId: str | None = None


@router.put('/api/admin/content/banner-order')
def reorder_banners(payload: BannerOrder, admin: User = Depends(get_current_admin)) -> list[dict]:
    return _run(lambda: content_service.reorder_banners(payload.ids, moved_id=payload.movedId, actor=admin.email))


# ---------------------------------------------------------------------------
# 通知模板
# ---------------------------------------------------------------------------


@router.get('/api/admin/notification-templates')
def read_templates(admin: User = Depends(get_current_admin)) -> list[dict]:
    return content_service.list_templates()


@router.post('/api/admin/notification-templates', status_code=201)
def create_template(payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.create_template(payload, actor=admin.email))


@router.put('/api/admin/notification-templates/{template_id}')
def update_template(template_id: str, payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.update_template(template_id, payload, actor=admin.email))


class TemplateEnabled(BaseModel):
    enabled: bool


@router.patch('/api/admin/notification-templates/{template_id}/enabled')
def set_template_enabled(template_id: str, payload: TemplateEnabled, admin: User = Depends(get_current_admin)) -> dict:
    return _run(lambda: content_service.set_template_enabled(template_id, payload.enabled, actor=admin.email))


@router.delete('/api/admin/notification-templates/{template_id}', status_code=204)
def delete_template(template_id: str, admin: User = Depends(get_current_admin)) -> None:
    _run(lambda: content_service.delete_template(template_id, actor=admin.email))
