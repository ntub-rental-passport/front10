"""管理員通知中心的 API（見 admin/admin_notifications.py），僅限管理員。

已讀狀態是每位管理員自己的，所以每支都看是誰在問。
"""

from fastapi import APIRouter, Body, Depends, HTTPException

from admin import admin_notifications
from auth.security import get_current_admin
from db.models import User

router = APIRouter(prefix='/api/admin/notification-center', tags=['Admin'])

NOT_FOUND = '找不到這則通知。'


@router.get('')
def list_notifications(admin: User = Depends(get_current_admin)) -> list[dict]:
    return admin_notifications.list_for(admin.id)


@router.post('/notes', status_code=201)
def send_note(payload: dict = Body(...), admin: User = Depends(get_current_admin)) -> dict:
    try:
        return admin_notifications.add_note(
            payload.get('title') or '', payload.get('body') or '',
            sender_email=admin.email, sender_name=admin.display_name or admin.email, sender_id=admin.id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post('/read-all', status_code=204)
def read_all(admin: User = Depends(get_current_admin)) -> None:
    admin_notifications.mark_all_read(admin.id)


@router.post('/{notification_id}/read', status_code=204)
def read_one(notification_id: str, admin: User = Depends(get_current_admin)) -> None:
    try:
        admin_notifications.mark_read(admin.id, notification_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from error


@router.post('/{notification_id}/unread', status_code=204)
def unread_one(notification_id: str, admin: User = Depends(get_current_admin)) -> None:
    try:
        admin_notifications.mark_unread(admin.id, notification_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=NOT_FOUND) from error
