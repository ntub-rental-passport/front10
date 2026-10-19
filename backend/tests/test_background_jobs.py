import asyncio
import importlib
import logging
from datetime import datetime
from unittest.mock import patch

import pytest

from db import database


@pytest.fixture
def main_module(monkeypatch):
    # main 匯入時會檢查資料庫結構；這裡只測啟動開關，不能連到開發機的共用資料庫。
    monkeypatch.setenv('JWT_SECRET', 'test-background-jobs-secret-not-for-production')
    with patch.object(database, 'engine', None):
        return importlib.import_module('main')


@pytest.mark.parametrize(('value', 'expected'), [
    (None, False),
    ('', False),
    ('false', False),
    ('0', False),
    ('true', True),
    ('1', True),
    ('yes', True),
    ('True', True),
    ('YeS', True),
    ('FALSE', False),
    (' true ', True),
    ('on', False),
])
def test_background_jobs_enabled(main_module, monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv('BACKGROUND_JOBS_ENABLED', raising=False)
    else:
        monkeypatch.setenv('BACKGROUND_JOBS_ENABLED', value)

    assert main_module.background_jobs_enabled() is expected


@pytest.mark.parametrize(('value', 'enabled'), [(None, False), ('false', False), ('true', True)])
@pytest.mark.parametrize('startup_error', [False, True])
def test_lifespan_controls_and_cancels_background_tasks(
    main_module, monkeypatch, caplog, value, enabled, startup_error,
):
    if value is None:
        monkeypatch.delenv('BACKGROUND_JOBS_ENABLED', raising=False)
    else:
        monkeypatch.setenv('BACKGROUND_JOBS_ENABLED', value)
    caplog.set_level(logging.INFO, logger='main')
    names = []
    tasks = []

    def create_task(coroutine):
        # 關閉 coroutine、用 Future 驗證取消：不能真的啟動排程寄信、探測或寫資料庫。
        names.append(coroutine.cr_code.co_name)
        coroutine.close()
        task = asyncio.get_running_loop().create_future()
        tasks.append(task)
        return task

    async def run_lifespan():
        with patch.object(main_module.asyncio, 'create_task', side_effect=create_task) as spawn:
            async with main_module.lifespan(main_module.app):
                assert spawn.call_count == (2 if enabled else 0)
                assert names == (['reminders_loop', 'monitor_loop'] if enabled else [])
                assert all(not task.done() for task in tasks)
                if startup_error:
                    raise RuntimeError('lifespan body failed')

    if startup_error:
        with pytest.raises(RuntimeError, match='lifespan body failed'):
            asyncio.run(run_lifespan())
    else:
        asyncio.run(run_lifespan())

    assert all(task.cancelled() for task in tasks)
    messages = [record.getMessage() for record in caplog.records if record.name == 'main']
    assert len(messages) == 1
    assert ('背景排程已啟用' if enabled else '背景排程未啟用') in messages[0]
    assert 'BACKGROUND_JOBS_ENABLED' in messages[0]


@pytest.mark.parametrize('sync_fails', [False, True])
def test_outage_sync_does_not_block_dispatch_or_overlap(
    main_module, monkeypatch, tmp_path, caplog, sync_fails,
):
    monkeypatch.setenv('BACKGROUND_JOBS_ENABLED', 'true')
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(tmp_path))
    monkeypatch.setattr(main_module.taipower_sync, '_last_failure_at', None)
    caplog.set_level(logging.WARNING, logger='main')
    calls = []
    sync_calls = []
    original_create_task = asyncio.create_task

    async def run():
        started = asyncio.Event()
        release = asyncio.Event()
        settled = asyncio.Event()
        ticks = asyncio.Queue()
        proceed = asyncio.Queue()

        async def to_thread(function, *args):
            if function is main_module.taipower_sync.sync:
                sync_calls.append(args)
                started.set()
                await release.wait()
                settled.set()
                if sync_fails:
                    raise RuntimeError('fake download failed')
                (tmp_path / 'taipower-outage-source.json').write_text(
                    '{"fetchedAt":"' + datetime.now(main_module.taipower_sync.TZ).isoformat() + '"}',
                )
                return 1
            # 所有通知與資料庫工作都替換，只驗證排程能在下載尚未完成時繼續派送。
            calls.append(function)

        async def sleep(seconds):
            assert seconds == 20
            ticks.put_nowait(None)
            await proceed.get()

        def create_task(coroutine):
            if coroutine.cr_code.co_name == 'monitor_loop':
                coroutine.close()
                return asyncio.get_running_loop().create_future()
            return original_create_task(coroutine)

        monkeypatch.setattr(main_module.asyncio, 'to_thread', to_thread)
        monkeypatch.setattr(main_module.asyncio, 'sleep', sleep)
        monkeypatch.setattr(main_module.asyncio, 'create_task', create_task)
        async with main_module.lifespan(main_module.app):
            await asyncio.wait_for(ticks.get(), timeout=1)
            await asyncio.wait_for(started.wait(), timeout=1)
            proceed.put_nowait(None)
            await asyncio.wait_for(ticks.get(), timeout=1)
            assert sync_calls == [(tmp_path,)]
            assert calls.count(main_module.dispatch_due) == 2
            assert calls.count(main_module.dispatch_scheduled_notifications) == 2
            assert main_module.outage_reminders.dispatch_due in calls
            release.set()
            await asyncio.wait_for(settled.wait(), timeout=1)
            proceed.put_nowait(None)
            await asyncio.wait_for(ticks.get(), timeout=1)
            assert len(sync_calls) == 1
            assert calls.count(main_module.dispatch_due) == 3
            assert not main_module.taipower_sync.needs_sync()

    asyncio.run(run())
    assert ('台電停電資料同步失敗' in caplog.text) is sync_fails
