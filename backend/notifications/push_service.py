"""帳號層級的瀏覽器推播與站內通知寄送狀態。

推播不分 tenant／landlord 身分，但通知中心會依當下登入身分過濾 audience_role。
同時具有兩種身分的人可能收到推播，點進去卻因目前身分不同而看不到該則通知；
這是既有身分切換設計的限制，此處不調整通知中心的過濾規則。
"""
import json
import logging
import os
from datetime import datetime
from urllib.parse import urlparse

from db.sqlstore import open_store

logger = logging.getLogger(__name__)


def validate_push_endpoint(raw_endpoint):
    """只允許既有推播服務的 HTTPS 端點，避免伺服器代送請求到任意主機。"""
    if not isinstance(raw_endpoint, str) or len(raw_endpoint) > 2000:
        raise ValueError('推播訂閱無效。')
    endpoint = urlparse(raw_endpoint)
    host = endpoint.hostname or ''
    allowed = host == 'fcm.googleapis.com' or host == 'updates.push.services.mozilla.com' or host.endswith('.notify.windows.com') or host == 'web.push.apple.com'
    if endpoint.scheme != 'https' or endpoint.port not in (None, 443) or not allowed or endpoint.username or endpoint.password:
        raise ValueError('不支援此裝置的推播服務。')


def validate_subscription(subscription):
    """全站與垃圾車提醒共用訂閱驗證，保留垃圾車既有的限制與錯誤訊息。"""
    if not isinstance(subscription, dict):
        raise ValueError('推播訂閱無效。')
    validate_push_endpoint(subscription.get('endpoint', ''))
    keys = subscription.get('keys', {})
    if not isinstance(keys, dict):
        raise ValueError('推播金鑰無效。')
    if not all(isinstance(keys.get(k), str) and 10 <= len(keys[k]) <= 200 for k in ('p256dh', 'auth')):
        raise ValueError('推播金鑰無效。')


def push_available() -> bool:
    try:
        import pywebpush  # noqa: F401
        push_library = True
    except ImportError:
        push_library = False
    return bool(push_library and os.getenv('VAPID_PRIVATE_KEY')
                and os.getenv('VAPID_PUBLIC_KEY') and os.getenv('VAPID_SUBJECT'))


def public_key() -> str:
    return os.getenv('VAPID_PUBLIC_KEY', '')


def send_to_user(user_id, *, title, body, url, tag) -> str | None:
    if not push_available():
        return None

    from pywebpush import WebPushException, webpush

    with open_store() as db:
        subscriptions = db.execute(
            'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND expired_at IS NULL',
            (user_id,),
        ).fetchall()
    if not subscriptions:
        return None

    sent = False
    payload = json.dumps({'title': title, 'body': body, 'url': url, 'tag': tag}, ensure_ascii=False)
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={'endpoint': subscription['endpoint'], 'keys': {
                    'p256dh': subscription['p256dh'], 'auth': subscription['auth'],
                }},
                data=payload, vapid_private_key=os.environ['VAPID_PRIVATE_KEY'],
                vapid_claims={'sub': os.environ['VAPID_SUBJECT']}, ttl=300, timeout=15,
            )
        except WebPushException as error:
            # 錯誤 response 本身可能被視為 False，必須明確檢查是否為 None。
            if error.response is not None and error.response.status_code in (404, 410):
                with open_store() as db:
                    db.execute('UPDATE push_subscriptions SET expired_at = ? WHERE id = ?',
                               (datetime.utcnow(), subscription['id']))
            else:
                # 例外文字可能包含 endpoint 憑證，不能輸出例外或 traceback。
                logger.warning('推播失敗：訂閱 id=%s，user_id=%s', subscription['id'], user_id)
        except Exception:
            logger.warning('推播失敗：訂閱 id=%s，user_id=%s', subscription['id'], user_id)
        else:
            sent = True
            with open_store() as db:
                db.execute('UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?',
                           (datetime.utcnow(), subscription['id']))
    return 'sent' if sent else 'failed'


def deliver_messages(message_ids: list[str]) -> None:
    """交易提交後送出業務通知；先認領並提交，避免背景工作重複推播。"""
    for message_id in message_ids:
        with open_store() as db:
            claimed = db.execute(
                "UPDATE inbox_messages SET push_state = 'sending' WHERE id = ? AND push_state = 'pending'",
                (message_id,),
            ).rowcount
            if not claimed:
                continue
            row = db.execute('SELECT user_id, title, body, action_url FROM inbox_messages WHERE id = ?',
                             (message_id,)).fetchone()
        try:
            state = send_to_user(row['user_id'], title=row['title'], body=row['body'],
                                 url=row['action_url'] or '/app', tag=message_id)
        except Exception:
            state = 'failed'
            logger.warning('通知推播失敗：user_id=%s', row['user_id'])
        with open_store() as db:
            db.execute('UPDATE inbox_messages SET push_state = ? WHERE id = ?', (state, message_id))
