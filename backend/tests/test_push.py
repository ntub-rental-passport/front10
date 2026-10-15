"""全站推播的訂閱、交易與寄送狀態；所有外部推播都以替身驗證。"""
import builtins
import hashlib
import json
from datetime import datetime, timedelta
from unittest.mock import Mock

import pywebpush
import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient
from requests import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from auth.security import CurrentUser, get_current_user
from db import database
from db.database import Base, get_db
from db.models import InboxMessage, PushSubscription, User
from notifications import inbox_service, push_service, scheduled_notification_service, user_notify
from routers import push_api
from routers.inbox_api import send_notification

ENDPOINT = 'https://fcm.googleapis.com/secret-device-token'
PAYLOAD = {'endpoint': ENDPOINT, 'keys': {'p256dh': 'public-key', 'auth': 'auth-key-value'}}
FIELDS = dict(title='帳單提醒', body='請確認帳單', category='帳務', source_label='測試', created_by='system')
SEND_TO_USER = push_service.send_to_user


@pytest.fixture
def db(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    monkeypatch.setattr(database, 'engine', engine)
    with Session(engine) as session:
        session.add_all([User(id=1, email='tenant@example.com'), User(id=2, email='other@example.com')])
        session.commit()
        yield session
    engine.dispose()


@pytest.fixture(autouse=True)
def vapid(monkeypatch):
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'test-public-key')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'test-private-key')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:test@example.com')


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(push_api.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=1, email='tenant@example.com', role='tenant')
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def webpush(monkeypatch):
    sender = Mock()
    monkeypatch.setattr(pywebpush, 'webpush', sender)
    monkeypatch.setattr(push_service, 'send_to_user', SEND_TO_USER)
    return sender


def subscribe(db, *, endpoint=ENDPOINT, user_id=1, expired_at=None):
    subscription = PushSubscription(
        user_id=user_id, endpoint=endpoint, endpoint_hash=hashlib.sha256(endpoint.encode()).hexdigest(),
        **PAYLOAD['keys'], expired_at=expired_at,
    )
    db.add(subscription)
    db.commit()
    return subscription


def message(db, **kwargs):
    return user_notify.notify_user(db, db.get(User, 1), audience_role='tenant', **FIELDS, **kwargs)


def send():
    return push_service.send_to_user(1, title='帳單提醒', body='請確認帳單', url='/app', tag='nm-test')


def test_status_without_vapid(client, monkeypatch):
    monkeypatch.delenv('VAPID_PRIVATE_KEY')
    assert client.get('/api/push/status').json() == {
        'supported': False, 'publicKey': '', 'subscribed': False, 'deviceCount': 0,
    }


@pytest.mark.parametrize('name', ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])
def test_each_vapid_setting_is_required(monkeypatch, name):
    monkeypatch.delenv(name)
    assert push_service.push_available() is False
    if name == 'VAPID_PUBLIC_KEY':
        assert push_service.public_key() == ''


def test_missing_library_disables_push(monkeypatch):
    original_import = builtins.__import__

    def without_webpush(name, *args, **kwargs):
        if name == 'pywebpush':
            raise ImportError('未安裝推播套件')
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, '__import__', without_webpush)
    assert push_service.push_available() is False


def test_subscribe_updates_status_and_truncates_user_agent(client, db):
    response = client.post('/api/push/subscribe', json=PAYLOAD, headers={'User-Agent': 'a' * 300})
    assert response.status_code == 201
    assert response.json() == {
        'supported': True, 'publicKey': 'test-public-key', 'subscribed': True, 'deviceCount': 1,
    }
    assert client.get('/api/push/status').json() == response.json()
    row = db.query(PushSubscription).one()
    assert row.endpoint_hash == hashlib.sha256(ENDPOINT.encode()).hexdigest()
    assert row.user_agent == 'a' * 255
    assert row.created_at is not None


def test_resubscribe_updates_keys_without_duplicate(client, db):
    client.post('/api/push/subscribe', json=PAYLOAD)
    response = client.post('/api/push/subscribe', json={
        'endpoint': ENDPOINT, 'keys': {'p256dh': 'new-public-key', 'auth': 'new-auth-key'},
    }, headers={'User-Agent': 'updated-browser'})
    assert response.status_code == 201
    assert response.json()['deviceCount'] == 1
    row = db.query(PushSubscription).one()
    assert (row.p256dh, row.auth, row.user_agent) == ('new-public-key', 'new-auth-key', 'updated-browser')


def test_subscribe_without_user_agent_stores_null(client, db):
    client.headers.pop('User-Agent', None)
    assert client.post('/api/push/subscribe', json=PAYLOAD).status_code == 201
    assert db.query(PushSubscription).one().user_agent is None


def test_resubscribe_revives_expired_subscription(client, db):
    row = subscribe(db, expired_at=datetime.utcnow())
    assert client.get('/api/push/status').json()['deviceCount'] == 0
    assert client.post('/api/push/subscribe', json=PAYLOAD).status_code == 201
    db.refresh(row)
    assert row.expired_at is None
    assert client.get('/api/push/status').json()['deviceCount'] == 1


def test_delete_is_idempotent_and_scoped_to_account(client, db):
    subscribe(db)
    other = subscribe(db, user_id=2)
    for _ in range(2):
        response = client.request('DELETE', '/api/push/subscribe', json={'endpoint': ENDPOINT})
        assert response.status_code == 200
        assert response.json() == {
            'supported': True, 'publicKey': 'test-public-key', 'subscribed': False, 'deviceCount': 0,
        }
    assert db.query(PushSubscription).one().id == other.id


def test_status_counts_all_active_devices_only(client, db, monkeypatch):
    subscribe(db)
    subscribe(db, endpoint=ENDPOINT + '-second')
    subscribe(db, endpoint=ENDPOINT + '-expired', expired_at=datetime.utcnow())
    subscribe(db, user_id=2)
    monkeypatch.delenv('VAPID_PUBLIC_KEY')
    assert client.get('/api/push/status').json() == {
        'supported': False, 'publicKey': '', 'subscribed': True, 'deviceCount': 2,
    }


def test_subscribe_without_vapid_is_unavailable(client, monkeypatch):
    monkeypatch.delenv('VAPID_SUBJECT')
    response = client.post('/api/push/subscribe', json=PAYLOAD)
    assert response.status_code == 503
    assert response.json()['detail'] == '伺服器尚未設定推播金鑰，請聯絡管理員。'


@pytest.mark.parametrize('payload', [
    {**PAYLOAD, 'endpoint': 'http://fcm.googleapis.com/device'},
    {'keys': PAYLOAD['keys']},
    {'endpoint': ENDPOINT},
    {**PAYLOAD, 'keys': {'auth': 'auth-key'}},
    {**PAYLOAD, 'keys': {'p256dh': 'public-key'}},
    {**PAYLOAD, 'keys': {'p256dh': '', 'auth': 'auth-key'}},
    {**PAYLOAD, 'keys': []},
])
def test_invalid_subscription_returns_chinese_detail(client, payload):
    response = client.post('/api/push/subscribe', json=payload)
    assert response.status_code == 422
    assert isinstance(response.json()['detail'], str)
    assert any('\u4e00' <= char <= '\u9fff' for char in response.json()['detail'])


@pytest.mark.parametrize('endpoint', [
    'http://fcm.googleapis.com/push',
    'https://fcm.googleapis.com:8443/push',
    'https://127.0.0.1/push',
    'https://140.131.114.242/push',
    'https://example.com/push',
    'https://fcm.googleapis.com.evil.test/push',
    'https://device.notify.windows.com.evil.test/push',
    'https://notify.windows.com/push',
    'https://user@fcm.googleapis.com/push',
    'https://user:password@fcm.googleapis.com/push',
    'https://:password@fcm.googleapis.com/push',
])
@pytest.mark.parametrize('method', ['POST', 'DELETE'])
def test_subscription_rejects_unsafe_endpoints(client, db, endpoint, method):
    response = client.request(method, '/api/push/subscribe', json={**PAYLOAD, 'endpoint': endpoint})
    assert response.status_code == 422
    assert isinstance(response.json()['detail'], str)
    assert db.query(PushSubscription).count() == 0


def test_subscription_rejects_overlong_endpoint(client, db):
    endpoint = 'https://fcm.googleapis.com/'
    endpoint += 'a' * (2001 - len(endpoint))
    response = client.post('/api/push/subscribe', json={**PAYLOAD, 'endpoint': endpoint})
    assert response.status_code == 422
    assert response.json()['detail'] == '推播訂閱無效。'
    assert db.query(PushSubscription).count() == 0


@pytest.mark.parametrize('key', ['p256dh', 'auth'])
@pytest.mark.parametrize('length', [9, 201])
def test_subscription_rejects_invalid_key_lengths(client, key, length):
    response = client.post('/api/push/subscribe', json={
        **PAYLOAD, 'keys': {**PAYLOAD['keys'], key: 'a' * length},
    })
    assert response.status_code == 422
    assert response.json()['detail'] == '推播金鑰無效。'


@pytest.mark.parametrize('endpoint', [
    'https://fcm.googleapis.com:443/push',
    'https://updates.push.services.mozilla.com/push',
    'https://device.notify.windows.com/push',
    'https://web.push.apple.com/push',
])
def test_subscription_accepts_supported_push_services(client, endpoint):
    response = client.post('/api/push/subscribe', json={**PAYLOAD, 'endpoint': endpoint})
    assert response.status_code == 201
    assert response.json()['deviceCount'] == 1


@pytest.mark.parametrize('length', [10, 200])
def test_subscription_accepts_endpoint_and_key_length_limits(client, length):
    endpoint = 'https://fcm.googleapis.com/'
    endpoint += 'a' * (2000 - len(endpoint))
    response = client.post('/api/push/subscribe', json={
        'endpoint': endpoint, 'keys': {'p256dh': 'a' * length, 'auth': 'b' * length},
    })
    assert response.status_code == 201


def test_push_api_requires_login(db):
    app = FastAPI()
    app.include_router(push_api.router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        for method, path in [('GET', '/api/push/status'), ('POST', '/api/push/subscribe'), ('DELETE', '/api/push/subscribe')]:
            assert client.request(method, path, json=PAYLOAD).status_code == 401


def test_one_success_overrides_another_device_failure(db, webpush, caplog):
    first = subscribe(db)
    second = subscribe(db, endpoint=ENDPOINT + '-second')

    def dispatch(**kwargs):
        if kwargs['subscription_info']['endpoint'] == first.endpoint:
            raise RuntimeError(first.endpoint)

    webpush.side_effect = dispatch
    assert send() == 'sent'
    db.refresh(first)
    db.refresh(second)
    assert first.last_success_at is None
    assert second.last_success_at is not None
    assert ENDPOINT not in caplog.text
    assert caplog.records
    kwargs = webpush.call_args.kwargs
    assert json.loads(kwargs['data']) == {'title': '帳單提醒', 'body': '請確認帳單', 'url': '/app', 'tag': 'nm-test'}
    assert '帳單提醒' in kwargs['data']
    assert kwargs['ttl'] == 300 and kwargs['timeout'] == 15
    assert kwargs['vapid_claims'] == {'sub': 'mailto:test@example.com'}
    assert kwargs['vapid_private_key'] == 'test-private-key'
    assert kwargs['subscription_info']['keys'] == PAYLOAD['keys']


@pytest.mark.parametrize('status', [404, 410, 500])
def test_webpush_errors_expire_only_gone_devices(db, webpush, status, caplog):
    row = subscribe(db)
    response = Response()
    response.status_code = status
    webpush.side_effect = pywebpush.WebPushException(ENDPOINT, response=response)
    assert send() == 'failed'
    db.refresh(row)
    assert (row.expired_at is not None) == (status in (404, 410))
    assert ENDPOINT not in caplog.text
    if status in (404, 410):
        assert send() is None
        webpush.assert_called_once()


def test_gone_device_does_not_override_success(db, webpush):
    subscribe(db)
    subscribe(db, endpoint=ENDPOINT + '-second')
    response = Response()
    response.status_code = 410
    webpush.side_effect = [pywebpush.WebPushException('訂閱失效', response=response), None]
    assert send() == 'sent'


def test_no_subscription_returns_none(db, webpush):
    assert send() is None
    webpush.assert_not_called()


def test_unavailable_push_returns_none(db, webpush, monkeypatch):
    subscribe(db)
    monkeypatch.delenv('VAPID_SUBJECT')
    assert send() is None
    webpush.assert_not_called()


def test_commit_starts_delivery_and_keeps_email_separate(db, monkeypatch):
    push = Mock()
    email = Mock()
    monkeypatch.setattr(user_notify, 'start_push_delivery', push)
    monkeypatch.setattr(user_notify, 'start_email_delivery', email)
    monkeypatch.setattr(user_notify, 'email_available', lambda: True)
    first = message(db, push=True, email=True)
    second = message(db, push=True)
    assert first.push_state == 'pending'
    assert json.loads(first.channels) == ['inapp', 'email', 'push']
    assert db.info['pending_push_messages'] == [first.id, second.id]
    push.assert_not_called()
    db.commit()
    push.assert_called_once_with([first.id, second.id])
    email.assert_called_once_with([first.batch_id])
    assert 'pending_push_messages' not in db.info


def test_rollback_discards_push_queue(db, monkeypatch):
    delivery = Mock()
    monkeypatch.setattr(user_notify, 'start_push_delivery', delivery)
    message(db, push=True)
    db.flush()
    db.rollback()
    db.commit()
    delivery.assert_not_called()
    assert 'pending_push_messages' not in db.info
    assert db.query(InboxMessage).count() == 0


def test_unavailable_and_default_notifications_do_not_queue_push(db, monkeypatch):
    default = message(db)
    monkeypatch.delenv('VAPID_SUBJECT')
    unavailable = message(db, push=True)
    for row in (default, unavailable):
        assert row.push_state is None
        assert 'push' not in json.loads(row.channels)
    assert 'pending_push_messages' not in db.info


def test_message_delivery_claims_before_sending_and_skips_reentry(db, webpush):
    subscribe(db)
    row = message(db, push=True, action_url='/app/repairs')
    db.commit()

    def dispatch(**kwargs):
        with Session(db.bind) as observer:
            assert observer.get(InboxMessage, row.id).push_state == 'sending'
        push_service.deliver_messages([row.id])
        assert json.loads(kwargs['data'])['url'] == '/app/repairs'
        assert json.loads(kwargs['data'])['tag'] == row.id

    webpush.side_effect = dispatch
    push_service.deliver_messages(['missing', row.id, row.id])
    db.refresh(row)
    assert row.push_state == 'sent'
    webpush.assert_called_once()


@pytest.mark.parametrize('result', [None, 'failed'])
def test_message_delivery_persists_non_success_result(db, monkeypatch, result):
    row = message(db, push=True)
    db.commit()
    monkeypatch.setattr(push_service, 'send_to_user', Mock(return_value=result))
    push_service.deliver_messages([row.id])
    db.refresh(row)
    assert row.push_state == result


def test_delivery_continues_after_unexpected_error(db, monkeypatch, caplog):
    first = message(db, push=True)
    second = message(db, push=True)
    db.commit()
    sender = Mock(side_effect=[RuntimeError(ENDPOINT), 'sent'])
    monkeypatch.setattr(push_service, 'send_to_user', sender)
    push_service.deliver_messages([first.id, second.id])
    db.refresh(first)
    db.refresh(second)
    assert [first.push_state, second.push_state] == ['failed', 'sent']
    assert ENDPOINT not in caplog.text


@pytest.fixture
def accounts(monkeypatch):
    monkeypatch.setattr(inbox_service, '_load_accounts', lambda: [
        {'id': 1, 'email': 'tenant@example.com', 'status': 'active', 'roles': {'tenant'}},
        {'id': 2, 'email': 'other@example.com', 'status': 'active', 'roles': {'tenant'}},
    ])


def test_admin_background_push_delivers_once(db, accounts, webpush):
    subscribe(db)
    tasks = BackgroundTasks()
    result = send_notification(tasks, {
        'title': '通知', 'body': '內容', 'category': '系統', 'channels': ['inapp', 'push'],
        'recipient': {'kind': 'role', 'role': 'user'},
    }, admin=db.get(User, 1))
    assert len(tasks.tasks) == 1
    assert tasks.tasks[0].func is inbox_service.send_pending_push
    assert tasks.tasks[0].args == (result['batchId'],)
    webpush.assert_not_called()

    def dispatch(**kwargs):
        assert inbox_service.send_pending_push(result['batchId']) == {'sent': 0, 'failed': 0}

    webpush.side_effect = dispatch
    assert inbox_service.send_pending_push(result['batchId']) == {'sent': 1, 'failed': 0}
    assert inbox_service.send_pending_push(result['batchId']) == {'sent': 0, 'failed': 0}
    assert {row.user_id: row.push_state for row in db.query(InboxMessage)} == {1: 'sent', 2: None}
    webpush.assert_called_once()


@pytest.mark.parametrize('channels', [['inapp', 'push'], ['push']])
def test_scheduled_notifications_send_push(db, accounts, webpush, channels):
    subscribe(db)
    due = datetime.now(scheduled_notification_service.TZ) + timedelta(hours=1)
    item = scheduled_notification_service.create('admin@example.com', {
        'title': '排程通知', 'body': '內容', 'category': '系統', 'channels': channels,
        'recipient': {'kind': 'role', 'role': 'user'}, 'scheduledAt': due.isoformat(),
    })
    assert scheduled_notification_service.dispatch_due(now=due + timedelta(minutes=1)) == 1
    rows = db.query(InboxMessage).filter_by(batch_id=f'sched-{item["id"]}').all()
    assert {row.user_id: row.push_state for row in rows} == {1: 'sent', 2: None}
    assert scheduled_notification_service.list_all()[0]['result']['push'] == {'sent': 1, 'failed': 0}
    if 'inapp' not in channels:
        assert all(row.inapp_state is None for row in rows)
        assert 'inapp' not in scheduled_notification_service.list_all()[0]['result']
    webpush.assert_called_once()


def test_push_only_schedule_records_failure(db, accounts, webpush):
    subscribe(db)
    webpush.side_effect = RuntimeError('推播服務暫時無法連線')
    due = datetime.now(scheduled_notification_service.TZ) + timedelta(hours=1)
    scheduled_notification_service.create('admin@example.com', {
        'title': '排程通知', 'body': '內容', 'category': '系統', 'channels': ['push'],
        'recipient': {'kind': 'role', 'role': 'user'}, 'scheduledAt': due.isoformat(),
    })
    assert scheduled_notification_service.dispatch_due(now=due + timedelta(minutes=1)) == 1
    result = scheduled_notification_service.list_all()[0]
    assert result['status'] == 'failed'
    assert result['result']['push'] == {'sent': 0, 'failed': 1}


@pytest.mark.parametrize('available', [True, False])
def test_scheduled_push_capabilities_follow_configuration(monkeypatch, available):
    monkeypatch.setattr(push_service, 'push_available', lambda: available)
    capabilities = scheduled_notification_service.capabilities()
    assert capabilities['push'] is available
    assert ('push' in capabilities['unsupportedReason']) is not available


def test_subscription_migration_matches_schema_snapshot():
    import re
    from pathlib import Path

    backend = Path(__file__).parents[1]
    migration = (backend / 'migrations/20261015_push_subscriptions.sql').read_text(encoding='utf-8')
    snapshot = (backend / 'db/database.sql').read_text(encoding='utf-8')
    statement = re.sub(r'--[^\n]*', '', migration).strip()
    assert statement in snapshot
    assert statement.count(';') == 1
