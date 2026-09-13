import math
import os
import time
from datetime import date, datetime
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from security import get_current_tenant
from garbage_service import capabilities, connect, create_reminder, public_reminder, TZ

router = APIRouter(prefix='/api/garbage', tags=['Taipei garbage'])
_cache = {'expires': 0, 'data': None}


class ReminderInput(BaseModel):
    stationId: str = Field(max_length=1000)
    date: date
    minutesBefore: int = Field(ge=1, le=120)
    notifyPush: bool
    notifyEmail: bool
    subscription: dict | None = None


class ActiveInput(BaseModel):
    active: bool


def validate_subscription(subscription):
    if not isinstance(subscription, dict):
        raise ValueError('推播訂閱無效。')
    raw_endpoint = subscription.get('endpoint', '')
    if not isinstance(raw_endpoint, str) or len(raw_endpoint) > 2000:
        raise ValueError('推播訂閱無效。')
    endpoint = urlparse(raw_endpoint)
    host = endpoint.hostname or ''
    allowed = host == 'fcm.googleapis.com' or host == 'updates.push.services.mozilla.com' or host.endswith('.notify.windows.com') or host == 'web.push.apple.com'
    if endpoint.scheme != 'https' or endpoint.port not in (None, 443) or not allowed or endpoint.username or endpoint.password:
        raise ValueError('不支援此裝置的推播服務。')
    keys = subscription.get('keys', {})
    if not isinstance(keys, dict):
        raise ValueError('推播金鑰無效。')
    if not all(isinstance(keys.get(k), str) and 10 <= len(keys[k]) <= 200 for k in ('p256dh', 'auth')):
        raise ValueError('推播金鑰無效。')


@router.get('/capabilities')
def get_capabilities():
    return capabilities()


@router.get('/vehicles')
def vehicles():
    url = os.getenv('TAIPEI_GARBAGE_GPS_URL', '').strip()
    if not url:
        return {'status': 'unconfigured', 'message': '車輛 GPS 尚未接通；目前顯示官方表定時間。', 'vehicles': []}
    if time.monotonic() < _cache['expires']:
        return _cache['data']
    try:
        response = requests.get(url, timeout=8)
        response.raise_for_status()
        rows = response.json()['vehicles']
        if not isinstance(rows, list):
            raise ValueError('schema')
        valid = []
        now = datetime.now(TZ)
        for item in rows[:5000]:
            try:
                lat, lng = float(item['lat']), float(item['lng'])
                stamp = datetime.fromisoformat(item['updatedAt'].replace('Z', '+00:00'))
                age = (now - stamp).total_seconds()
                if math.isfinite(lat) and math.isfinite(lng) and 24.9 <= lat <= 25.3 and 121.4 <= lng <= 121.7 and -30 <= age <= 120:
                    valid.append({'plate': str(item['plate']), 'lat': lat, 'lng': lng, 'updatedAt': stamp.isoformat()})
            except (KeyError, ValueError, TypeError):
                continue
        data = {'status': 'live' if valid else 'stale', 'message': 'GPS 已連線' if valid else '目前沒有兩分鐘內更新的車輛定位。', 'vehicles': valid}
    except (requests.RequestException, KeyError, TypeError, ValueError):
        data = {'status': 'unavailable', 'message': '車輛定位服務暫時無法連線。', 'vehicles': []}
    _cache.update(expires=time.monotonic() + 20, data=data)
    return data


@router.get('/reminders')
def list_reminders(user=Depends(get_current_tenant)):
    with connect() as db:
        return [public_reminder(row) for row in db.execute('SELECT * FROM garbage_reminders WHERE user_id=? ORDER BY due DESC', (user.id,)).fetchall()]


@router.post('/reminders', status_code=201)
def add_reminder(values: ReminderInput, user=Depends(get_current_tenant)):
    data = values.model_dump(mode='json')
    try:
        if data['notifyPush']:
            validate_subscription(data.get('subscription'))
        return create_reminder(user.id, user.email, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.patch('/reminders/{identifier}')
def toggle_reminder(identifier: str, values: ActiveInput, user=Depends(get_current_tenant)):
    with connect() as db:
        row = db.execute('SELECT * FROM garbage_reminders WHERE id=? AND user_id=?', (identifier, user.id)).fetchone()
        if row is None:
            raise HTTPException(404, '找不到提醒。')
        if row['due'] <= datetime.now(TZ).timestamp():
            raise HTTPException(422, '此提醒時間已到，請新增其他日期的提醒。')
        db.execute('UPDATE garbage_reminders SET active=? WHERE id=? AND user_id=?', (int(values.active), identifier, user.id))
    return {'ok': True}


@router.delete('/reminders/{identifier}')
def delete_reminder(identifier: str, user=Depends(get_current_tenant)):
    with connect() as db:
        changed = db.execute('DELETE FROM garbage_reminders WHERE id=? AND user_id=?', (identifier, user.id)).rowcount
        if not changed:
            raise HTTPException(404, '找不到提醒。')
    return {'ok': True}
