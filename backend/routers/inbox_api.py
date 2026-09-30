"""站內通知的 API（見 notifications/inbox_service.py）。

- 後台（Bearer，僅限管理員）：
  - `POST /api/admin/notifications/send`：立即發送。站內當下送到，Email 回應之後在背景寄。
  - `GET /api/admin/notifications/messages`：發送紀錄（每位收件人一筆，前端依批次分組）。
- 收件匣（cookie，任何登入的人，不分身分）：
  - `GET /api/notifications`：自己的站內通知，加上公告的已讀、關閉狀態。
  - `POST /api/notifications/{id}/read`、`POST /api/notifications/read-all`
  - `POST /api/notifications/announcements/{id}/read`、`POST /api/notifications/announcements/dismiss`

驗證都在 inbox_service 裡做，錯誤訊息是中文、畫面直接顯示。
"""

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from pydantic import BaseModel

from auth.security import CurrentUser, get_current_admin, get_current_user
from db.models import User
from notifications import inbox_service

router = APIRouter(tags=['Notifications'])


@router.post('/api/admin/notifications/send', status_code=201)
def send_notification(
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    admin: User = Depends(get_current_admin),
) -> dict:
    try:
        result = inbox_service.create_batch(payload, payload.get('recipient') or {}, actor=admin.email)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if result['emailQueued']:
        # 群發幾十封信要好一陣子，不能讓管理員的畫面等到寄完
        background_tasks.add_task(inbox_service.send_pending_emails, result['batchId'])
    return {'batchId': result['batchId'], 'recipientCount': result['recipientCount']}


@router.get('/api/admin/notifications/messages')
def admin_messages(admin: User = Depends(get_current_admin)) -> list[dict]:
    return inbox_service.list_messages()


@router.get('/api/notifications')
def my_inbox(user: CurrentUser = Depends(get_current_user)) -> dict:
    return {'messages': inbox_service.user_inbox(user.id), **inbox_service.announcement_state(user.id)}


@router.post('/api/notifications/{message_id}/read', status_code=204)
def read_message(message_id: str, user: CurrentUser = Depends(get_current_user)) -> None:
    try:
        inbox_service.mark_read(user.id, message_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail='找不到這則通知。') from error


@router.post('/api/notifications/read-all', status_code=204)
def read_all(payload: dict = Body(...), user: CurrentUser = Depends(get_current_user)) -> None:
    try:
        inbox_service.mark_all_read(user.id, payload.get('announcementIds') or [])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post('/api/notifications/announcements/{announcement_id}/read', status_code=204)
def read_announcement(announcement_id: str, user: CurrentUser = Depends(get_current_user)) -> None:
    try:
        inbox_service.mark_announcement_read(user.id, announcement_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class Dismissal(BaseModel):
    key: str


@router.post('/api/notifications/announcements/dismiss', status_code=204)
def dismiss_announcement(payload: Dismissal, user: CurrentUser = Depends(get_current_user)) -> None:
    try:
        inbox_service.dismiss_announcement(user.id, payload.key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
