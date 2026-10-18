"""停水停電排程：不連外，以實際通知與 activity 驗證分組、資格與去重。"""
import base64
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.database import Base
from db.models import (InboxMessage, LandlordLease, LandlordProperty, LandlordRoom, LandlordTenant,
                       LandlordTenantActivity, User, UserRole)
from notifications import outage_reminders, push_service, user_notify
from routers import outage

NOW = datetime(2026, 7, 20, 10, tzinfo=outage.TZ)
ADDRESS = "台北市中山區松江路88號"
QUERY_ADDRESS = "臺北市中山區松江路 88 號"
DAY = timedelta(days=1)


def power_record(**overrides):
    record = {
        "id": "power-1", "requestNo": "work-1", "work": "更換變壓器",
        "scope": "臺北市中山區松江路全段",
        "start": (NOW + timedelta(hours=23)).isoformat(),
        "end": (NOW + timedelta(hours=26)).isoformat(),
        "secondStart": None, "secondEnd": None,
    }
    record.update(overrides)
    record["_scope"] = outage._normalize(record["scope"])
    return record


def water_case(**overrides):
    case = {
        "id": "water-case-1", "type": 1, "waterOffReason": "搶修破裂水管",
        "startTime": "2026/07/20 09:00", "endTime": "2026/07/20 12:00",
    }
    case.update(overrides)
    return case


@pytest.fixture
def workspace(monkeypatch):
    monkeypatch.setenv("PII_ENCRYPTION_KEY", base64.b64encode(b"o" * 32).decode())
    monkeypatch.setattr(push_service, "push_available", lambda: True)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([], {}))
    monkeypatch.setattr(outage, "fetch_water_outage_case", Mock(return_value=None))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        db.add(User(id=1, email="owner@test.example", roles=[UserRole(role="landlord")]))
        db.commit()

    def add_lease(lease_id, address="中山區松江路 88 號", city="臺北市", **overrides):
        with factory() as db:
            db.add(User(id=lease_id + 1, email=f"tenant{lease_id}@test.example",
                        status=overrides.pop("user_status", "active"), roles=[UserRole(role="tenant")]))
            db.add(LandlordProperty(id=lease_id, landlord_id=1, name=f"松江寓所{lease_id}", address=address, city=city))
            db.flush()
            db.add(LandlordRoom(id=lease_id, property_id=lease_id, number="101"))
            db.add(LandlordTenant(id=lease_id, landlord_id=1, name="王小明", phone="0912000000",
                                  deleted_at=overrides.pop("deleted_at", None)))
            db.flush()
            values = {
                "id": lease_id, "tenant_id": lease_id, "tenant_user_id": lease_id + 1,
                "property_id": lease_id, "room_id": lease_id,
                "start_date": NOW.date() - DAY, "end_date": NOW.date() + 100 * DAY,
                "monthly_rent": 15000, "deposit_amount": 30000, "payment_day": 5, "status": "active",
            }
            values.update(overrides)
            db.add(LandlordLease(**values))
            db.commit()

    add_lease(1)
    yield factory, add_lease
    engine.dispose()


def dispatch(workspace, water_fetcher=None, now=NOW):
    return outage_reminders.dispatch_due(now, workspace[0], water_fetcher)


def test_power_within_24_hours_notifies_each_tenant_once(workspace, monkeypatch):
    factory, add_lease = workspace
    add_lease(2, address="台北市中山區松江路８８號")
    record = power_record(scope="臺北市中山區松江路" + "全段、" * 100)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([record], {}))
    assert dispatch(workspace) == {"power": 2, "water": 0}
    assert dispatch(workspace) == {"power": 0, "water": 0}
    with factory() as db:
        messages = db.query(InboxMessage).order_by(InboxMessage.user_id).all()
        assert [message.user_id for message in messages] == [2, 3]
        for index, message in enumerate(messages, 1):
            assert message.title == "明天 09:00–12:00 計畫停電"
            assert f"松江寓所{index} 101" in message.body
            assert "更換變壓器" in message.body
            assert "…" in message.body and record["scope"] not in message.body
            assert all(hint in message.body for hint in ("手機", "冰箱", "門禁"))
            assert message.source_label == "停電通知"
            assert message.audience_role == "tenant"
            assert message.category == "系統"
            assert message.created_by == "system"
            assert message.action_url == "/app/outage"
            assert message.action_label == "查看停水停電"
            assert json.loads(message.channels) == ["inapp", "push"]
            assert message.push_state == "pending"
            assert message.email_state is None
        activities = db.query(LandlordTenantActivity).all()
        assert len(activities) == 2
        assert all(activity.detail == "系統提醒租客：計畫停電 07/21 09:00" for activity in activities)


@pytest.mark.parametrize("start", [NOW + timedelta(hours=24, seconds=1), NOW, NOW - timedelta(hours=1),
                                    None, "時間待定"])
def test_power_outside_window_or_invalid_start_is_skipped(workspace, monkeypatch, start):
    record = power_record(start=start.isoformat() if isinstance(start, datetime) else start)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([record], {}))
    assert dispatch(workspace) == {"power": 0, "water": 0}
    with workspace[0]() as db:
        assert db.query(InboxMessage).count() == db.query(LandlordTenantActivity).count() == 0


def test_power_exactly_24_hours_and_second_occurrence_are_separate(workspace, monkeypatch):
    record = power_record(
        start=(NOW + timedelta(hours=1)).isoformat(), end=(NOW + timedelta(hours=2)).isoformat(),
        secondStart=(NOW + DAY).isoformat(), secondEnd=(NOW + DAY + timedelta(hours=1)).isoformat(),
    )
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([record], {}))
    assert dispatch(workspace) == {"power": 2, "water": 0}
    assert dispatch(workspace) == {"power": 0, "water": 0}
    with workspace[0]() as db:
        assert {message.title for message in db.query(InboxMessage)} == {
            "今天 11:00–12:00 計畫停電", "明天 10:00–11:00 計畫停電",
        }
        assert len({activity.kind for activity in db.query(LandlordTenantActivity)}) == 2


def test_second_occurrence_survives_old_first_start_filter(workspace, monkeypatch):
    record = power_record(start=(NOW - DAY).isoformat(), secondStart=(NOW + timedelta(hours=1)).isoformat())
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([record], {}))
    assert outage._find_power_matches(ADDRESS, now=NOW) == []
    assert dispatch(workspace) == {"power": 1, "water": 0}


@pytest.mark.parametrize("overrides", [
    {"tenant_user_id": None}, {"moved_out_at": NOW.date()}, {"moved_out_at": NOW.date() + DAY},
    {"user_status": "suspended"}, {"deleted_at": NOW},
    {"start_date": NOW.date() + DAY}, {"end_date": NOW.date() - DAY},
    {"address": "　 "}, {"address": None},
])
def test_ineligible_lease_is_not_notified(workspace, monkeypatch, overrides):
    factory, add_lease = workspace
    with factory() as db:
        db.get(LandlordLease, 1).tenant_user_id = None
        db.commit()
    add_lease(2, **overrides)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([power_record()], {}))
    fetch = Mock(return_value=water_case())
    assert dispatch(workspace, fetch) == {"power": 0, "water": 0}
    fetch.assert_not_called()
    with factory() as db:
        assert db.query(InboxMessage).count() == db.query(LandlordTenantActivity).count() == 0


def test_water_scheduled_notifies_once_with_content_and_push(workspace):
    fetch = Mock(return_value=water_case())
    assert dispatch(workspace, fetch) == {"power": 0, "water": 1}
    assert dispatch(workspace, fetch) == {"power": 0, "water": 0}
    with workspace[0]() as db:
        message = db.query(InboxMessage).one()
        assert message.title == "你的住處有停水公告（今天 09:00–12:00）"
        assert all(value in message.body for value in ("松江寓所1 101", "搶修破裂水管", "09:00–12:00", "儲水", "抽水馬達"))
        assert message.source_label == "停水通知"
        assert message.audience_role == "tenant"
        assert message.category == "系統"
        assert message.created_by == "system"
        assert message.action_url == "/app/outage"
        assert message.action_label == "查看停水停電"
        assert json.loads(message.channels) == ["inapp", "push"]
        assert message.email_state is None
        assert db.query(LandlordTenantActivity).count() == 1


@pytest.mark.parametrize("case", [None, {"status": "resolved", "id": "water-normal"},
                                 {"status": "normal"}, water_case(endTime="2026/07/20 09:59"),
                                 water_case(endTime="2026-07-20T01:59:00Z")])
def test_water_resolved_missing_or_ended_is_skipped(workspace, case):
    assert dispatch(workspace, lambda address: case) == {"power": 0, "water": 0}
    with workspace[0]() as db:
        assert db.query(InboxMessage).count() == db.query(LandlordTenantActivity).count() == 0


@pytest.mark.parametrize("times", [
    {"startTime": "2026-07-25T09:00:00+08:00", "endTime": "2026-07-25T12:00:00+08:00"},
    {"startTime": "待公告", "endTime": "待公告"},
    {"startTime": "", "endTime": ""},
])
def test_water_not_limited_to_power_window_and_tolerates_missing_times(workspace, times):
    assert dispatch(workspace, lambda address: water_case(**times)) == {"power": 0, "water": 1}


def test_normalized_address_is_queried_once_for_both_sources(workspace, monkeypatch):
    workspace[1](2, address="台北市中山區松江路８８號", city="臺北市")
    power_lookup = Mock(return_value=[])
    monkeypatch.setattr(outage, "_find_power_matches", power_lookup)
    water_lookup = Mock(return_value=water_case())
    assert dispatch(workspace, water_lookup) == {"power": 0, "water": 2}
    water_lookup.assert_called_once_with(QUERY_ADDRESS)
    power_lookup.assert_called_once_with(QUERY_ADDRESS, now=NOW, include_past=True)


def test_async_water_fetcher_and_utc_now_use_taiwan_date(workspace):
    async def fetch(address):
        return water_case()

    utc_now = NOW.replace(hour=0, minute=30).astimezone(timezone.utc)
    assert dispatch(workspace, fetch, now=utc_now) == {"power": 0, "water": 1}
    with workspace[0]() as db:
        assert db.query(InboxMessage).one().title == "你的住處有停水公告（今天 09:00–12:00）"


def test_long_ids_and_duplicate_records_keep_stable_dedup(workspace, monkeypatch):
    record = power_record(id="power-" + "a" * 200)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([record, record], {}))
    fetch = lambda address: water_case(id="water-" + "b" * 200)
    assert dispatch(workspace, fetch) == {"power": 1, "water": 1}
    assert dispatch(workspace, fetch) == {"power": 0, "water": 0}
    with workspace[0]() as db:
        activities = db.query(LandlordTenantActivity).all()
        assert len(activities) == 2
        assert all(len(activity.kind) <= 50 for activity in activities)
        assert len({activity.kind for activity in activities}) == 2


def test_failing_group_rolls_back_notifications_and_continues(workspace, monkeypatch, caplog):
    factory, add_lease = workspace
    add_lease(2, address="中山區松江路90號")
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([power_record()], {}))
    delivered = []
    monkeypatch.setattr(user_notify, "start_push_delivery", lambda ids: delivered.extend(ids))
    real_notify = outage_reminders.notify_user

    def notify(db, user, **kwargs):
        message = real_notify(db, user, **kwargs)
        if user.id == 2 and kwargs["source_label"] == "停水通知":
            raise RuntimeError("模擬單一地址失敗")
        return message

    monkeypatch.setattr(outage_reminders, "notify_user", notify)
    assert dispatch(workspace, lambda address: water_case()) == {"power": 1, "water": 1}
    assert "停水停電通知失敗" in caplog.text
    with factory() as db:
        messages = db.query(InboxMessage).all()
        assert len(messages) == 2
        assert {message.user_id for message in messages} == {3}
        assert set(delivered) == {message.id for message in messages}
        assert {activity.tenant_id for activity in db.query(LandlordTenantActivity)} == {2}
    monkeypatch.setattr(outage_reminders, "notify_user", real_notify)
    assert dispatch(workspace, lambda address: water_case()) == {"power": 1, "water": 1}


def test_water_fetch_exception_does_not_stop_next_address(workspace, caplog):
    workspace[1](2, address="中山區松江路90號")

    def fetch(address):
        if address == QUERY_ADDRESS:
            raise RuntimeError("模擬查詢失敗")
        return water_case()

    assert dispatch(workspace, fetch) == {"power": 0, "water": 1}
    assert "停水停電通知失敗" in caplog.text


@pytest.mark.parametrize("result", ["scheduled", "empty", "malformed", "failure"])
def test_notices_preserves_water_event_response(monkeypatch, result):
    case = water_case(no="公告123", note="請儲水")

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            if result == "failure":
                raise RuntimeError("模擬台水 API 逾時")
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            data = {"scheduled": [case], "empty": [], "malformed": ["無效公告"]}[result]
            return Mock(status_code=200, json=lambda: data)

    # 這裡走真實查詢函式的解析流程，只替換 HTTP 傳輸，確保 API 格式與排程共用原始公告。
    monkeypatch.setattr(outage.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(outage, "_load_power_data", lambda: ([], {}))
    app = FastAPI()
    app.include_router(outage.router)
    with TestClient(app) as client:
        response = client.get("/api/outage/notices", params={"address": ADDRESS})
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"status", "address", "updatedAt", "events"}
    assert payload["status"] == "success"
    assert payload["address"] == ADDRESS
    assert [item["utilityType"] for item in payload["events"]] == ["power", "water"]
    water = payload["events"][1]
    assert set(water) == {
        "id", "utilityType", "status", "statusLabel", "title", "dateLabel", "timeRange",
        "workLabel", "workContent", "referenceLabel", "referenceValue", "sourceName",
        "sourceUpdatedAt", "officialUrl", "hint",
    }
    if result != "scheduled":
        assert water["id"] == "water-normal"
        assert water["status"] == "resolved"
        assert water["timeRange"] == "全日正常供水"
    else:
        assert water["id"] == "water-water-case-1"
        assert water["status"] == "scheduled"
        assert water["statusLabel"] == "緊急停水"
        assert water["timeRange"] == "2026/07/20 09:00 - 2026/07/20 12:00"
        assert water["workContent"] == "搶修破裂水管"
        assert water["referenceValue"] == "公告123"
        assert water["hint"] == "請儲水"
