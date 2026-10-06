"""Personal date reminders only. No government connection or identity documents."""
from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from auth.security import get_current_tenant
from db.models import User
from notifications import scheduled_notification_service as service

router = APIRouter(prefix='/api/subsidy/reminders', tags=['Subsidy'])


class ReminderInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    applicationDate: date
    days: Literal[7, 14, 30]


def owner(user):
    return f'subsidy-user:{user.id}'


@router.get('')
def list_reminders(user: User = Depends(get_current_tenant)):
    with service.connect() as db:
        rows = db.execute(
            'SELECT * FROM scheduled_notifications WHERE created_by=? ORDER BY due DESC LIMIT 100',
            (owner(user),),
        ).fetchall()
    return [service.public_row(row) for row in rows]


@router.post('', status_code=201)
def create_reminder(payload: ReminderInput, user: User = Depends(get_current_tenant)):
    if payload.applicationDate > datetime.now(service.TZ).date():
        raise HTTPException(400, '申請日期不能在未來。')
    due = datetime.combine(payload.applicationDate + timedelta(days=payload.days), time(9), service.TZ)
    with service.connect() as db:
        pending = db.execute(
            "SELECT id FROM scheduled_notifications WHERE created_by=? AND status IN ('pending','sending')",
            (owner(user),),
        ).fetchone()
    if pending:
        raise HTTPException(409, '已有待送出的租補提醒，請先取消後再重新設定。')
    try:
        return service.create(owner(user), {
            'title': '租補申請後提醒：到政府網站確認',
            'body': f'你記錄的申請日期是 {payload.applicationDate.isoformat()}。這是申請後 {payload.days} 天的自訂提醒，並非政府審查結果或補件通知。請自行前往政府租補網站查詢，並留意官方通知。https://has.nlma.gov.tw/subsidyOnline/house300e/',
            'category': '補貼', 'channels': ['inapp'],
            'recipient': {'kind': 'users', 'emails': [user.email]},
            'recipientLabel': '本人',
            'sourceLabel': f'租補申請日 {payload.applicationDate.isoformat()}／{payload.days} 天後提醒',
            'scheduledAt': due.isoformat(),
        })
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.delete('/{identifier}')
def cancel_reminder(identifier: str, user: User = Depends(get_current_tenant)):
    with service.connect() as db:
        row = db.execute('SELECT id FROM scheduled_notifications WHERE id=? AND created_by=?',
                         (identifier, owner(user))).fetchone()
    if row is None:
        raise HTTPException(404, '找不到這筆提醒。')
    try:
        return service.cancel(identifier)
    except (ValueError, LookupError) as error:
        raise HTTPException(409, str(error)) from error
