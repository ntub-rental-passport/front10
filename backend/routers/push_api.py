"""瀏覽器推播訂閱 API，使用 cookie 驗證，所有登入身分共用帳號訂閱。"""
import hashlib

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth.security import CurrentUser, get_current_user
from db.database import get_db
from db.models import PushSubscription
from notifications import push_service

router = APIRouter(prefix='/api/push', tags=['Notifications'])


def _status(db: Session, user_id: int) -> dict:
    count = db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id, PushSubscription.expired_at.is_(None),
    ).count()
    supported = push_service.push_available()
    return {'supported': supported, 'publicKey': push_service.public_key() if supported else '',
            'subscribed': count > 0, 'deviceCount': count}


def _endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode('utf-8')).hexdigest()


@router.get('/status')
def push_status(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return _status(db, user.id)


@router.post('/subscribe', status_code=201)
def subscribe(request: Request, payload: dict = Body(...), user: CurrentUser = Depends(get_current_user),
              db: Session = Depends(get_db)) -> dict:
    if not push_service.push_available():
        raise HTTPException(status_code=503, detail='伺服器尚未設定推播金鑰，請聯絡管理員。')
    try:
        push_service.validate_subscription(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    endpoint_hash = _endpoint_hash(payload['endpoint'])
    keys = payload['keys']
    subscription = db.query(PushSubscription).filter_by(user_id=user.id, endpoint_hash=endpoint_hash).one_or_none()
    if subscription is None:
        subscription = PushSubscription(user_id=user.id, endpoint=payload['endpoint'], endpoint_hash=endpoint_hash)
        db.add(subscription)
    subscription.p256dh = keys['p256dh']
    subscription.auth = keys['auth']
    subscription.user_agent = (request.headers.get('User-Agent') or '')[:255] or None
    subscription.expired_at = None
    db.commit()
    return _status(db, user.id)


@router.delete('/subscribe')
def unsubscribe(payload: dict = Body(...), user: CurrentUser = Depends(get_current_user),
                db: Session = Depends(get_db)) -> dict:
    try:
        push_service.validate_push_endpoint(payload.get('endpoint', ''))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    endpoint_hash = _endpoint_hash(payload['endpoint'])
    db.query(PushSubscription).filter_by(user_id=user.id, endpoint_hash=endpoint_hash).delete()
    db.commit()
    return _status(db, user.id)
