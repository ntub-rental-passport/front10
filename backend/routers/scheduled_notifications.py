"""後台排程通知 API。

⚠️ 每一支端點都掛 `Depends(get_current_admin)`。排程等於「在未來對所有
使用者發信」，是這個系統裡破壞力最大的動作之一 —— 不可以靠「前端沒給
連結」當防護，攻擊者是直接對 API 發請求。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from admin import audit_service
from notifications import scheduled_notification_service as service
from db.models import User
from auth.security import get_current_admin

router = APIRouter(prefix='/api/admin/scheduled-notifications', tags=['Admin'])


class RecipientInput(BaseModel):
    kind: str = Field(pattern='^(role|users)$')
    role: str | None = None
    emails: list[str] | None = None


class ScheduleInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    category: str
    channels: list[str]
    recipient: RecipientInput
    recipientLabel: str = Field(default='', max_length=50)
    sourceLabel: str = Field(default='', max_length=100)
    scheduledAt: str


@router.get('')
def list_schedules(admin: User = Depends(get_current_admin)) -> dict:
    """排程清單 + 哪些管道真的送得出去。

    capabilities 一起回傳，畫面才能說明「為什麼沒有站內選項」，
    而不是靜靜地少一個勾選框。
    """
    return {'items': service.list_all(), 'capabilities': service.capabilities()}


_CHANNEL_LABELS = {'email': 'Email', 'inapp': '站內', 'push': '推播'}


def _when(iso: str) -> str:
    """「9/28 09:00」。service 回的是台灣時間的 ISO 字串。"""
    moment = datetime.fromisoformat(iso)
    return f'{moment.month}/{moment.day} {moment:%H:%M}'


def _audit(item: dict, detail: str, admin: User) -> None:
    audit_service.record(
        '通知管理',
        f"排程通知「{item['title']}」",
        detail,
        actor=admin.email,
        subject=f"scheduled:{item['id']}",
    )


@router.post('', status_code=201)
def create_schedule(payload: ScheduleInput, admin: User = Depends(get_current_admin)) -> dict:
    try:
        item = service.create(admin.email, payload.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    channels = '、'.join(_CHANNEL_LABELS.get(c, c) for c in item['channels'])
    recipients = item['recipientLabel'] or '指定收件人'
    _audit(item, f"排定 {_when(item['scheduledAt'])} 以 {channels} 寄給{recipients}", admin)
    return item


@router.delete('/{identifier}')
def cancel_schedule(identifier: str, admin: User = Depends(get_current_admin)) -> dict:
    try:
        item = service.cancel(identifier)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        # 已經在送或已送完 —— 用 409 而不是 400：請求本身沒錯，是狀態不允許。
        raise HTTPException(status_code=409, detail=str(error)) from error
    _audit(item, f"取消排程（原定 {_when(item['scheduledAt'])}）", admin)
    return item
