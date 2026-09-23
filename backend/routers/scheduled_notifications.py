"""後台排程通知 API。

⚠️ 每一支端點都掛 `Depends(get_current_admin)`。排程等於「在未來對所有
使用者發信」，是這個系統裡破壞力最大的動作之一 —— 不可以靠「前端沒給
連結」當防護，攻擊者是直接對 API 發請求。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import scheduled_notification_service as service
from models import User
from security import get_current_admin

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


@router.post('', status_code=201)
def create_schedule(payload: ScheduleInput, admin: User = Depends(get_current_admin)) -> dict:
    try:
        return service.create(admin.email, payload.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete('/{identifier}')
def cancel_schedule(identifier: str, admin: User = Depends(get_current_admin)) -> dict:
    try:
        return service.cancel(identifier)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        # 已經在送或已送完 —— 用 409 而不是 400：請求本身沒錯，是狀態不允許。
        raise HTTPException(status_code=409, detail=str(error)) from error
