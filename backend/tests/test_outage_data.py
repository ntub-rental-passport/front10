"""查詢與提醒共用的停電資料路徑及快取。"""
import json
import importlib.util
import os
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import outage


def write_data(directory, name):
    directory.mkdir(parents=True, exist_ok=True)
    data = directory / 'taipower-outage.json'
    data.write_text(json.dumps([{'id': name, 'scope': '臺北市中山區松江路全段'}]))
    (directory / 'taipower-outage-source.json').write_text(json.dumps({'name': name}))
    return data


@pytest.fixture
def paths(tmp_path, monkeypatch):
    seed = write_data(tmp_path / 'seed', 'seed')
    runtime = tmp_path / 'runtime'
    monkeypatch.setattr(outage, 'POWER_DATA_PATH', seed)
    monkeypatch.setattr(outage, 'POWER_SOURCE_PATH', seed.with_name('taipower-outage-source.json'))
    monkeypatch.setattr(outage, '_power_cache', {'path': None, 'mtime': None, 'records': [], 'source': {}})
    monkeypatch.delenv('OUTAGE_DATA_DIR', raising=False)
    return seed, runtime


def test_unconfigured_uses_seed(paths):
    write_data(paths[1], 'runtime')
    records, source = outage._load_power_data()
    assert records[0]['id'] == source['name'] == 'seed'


def test_configured_uses_runtime_data_and_source(paths, monkeypatch):
    write_data(paths[1], 'runtime')
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    records, source = outage._load_power_data()
    assert records[0]['id'] == source['name'] == 'runtime'
    assert records[0]['_scope'] == '台北市中山區松江路全段'
    assert outage._find_power_matches('台北市中山區松江路88號', include_past=True) == records


def test_missing_runtime_data_falls_back_to_seed_source(paths, monkeypatch):
    paths[1].mkdir()
    (paths[1] / 'taipower-outage-source.json').write_text('{"name":"runtime"}')
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    records, source = outage._load_power_data()
    assert records[0]['id'] == source['name'] == 'seed'


def test_missing_runtime_source_does_not_use_seed_source(paths, monkeypatch):
    write_data(paths[1], 'runtime')
    (paths[1] / 'taipower-outage-source.json').unlink()
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    records, source = outage._load_power_data()
    assert records[0]['id'] == 'runtime'
    assert source == {}


def test_cache_reloads_when_path_changes_with_identical_mtime(paths, monkeypatch):
    seed, runtime = paths
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(runtime))
    assert outage._load_power_data()[0][0]['id'] == 'seed'
    new_data = write_data(runtime, 'runtime')
    os.utime(new_data, ns=(seed.stat().st_atime_ns, seed.stat().st_mtime_ns))
    records, source = outage._load_power_data()
    assert records[0]['id'] == source['name'] == 'runtime'
    new_data.unlink()
    assert outage._load_power_data()[0][0]['id'] == 'seed'


def test_cache_reloads_when_data_changes(paths, monkeypatch):
    data = write_data(paths[1], 'runtime')
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    assert outage._load_power_data()[0][0]['id'] == 'runtime'
    mtime = data.stat().st_mtime
    write_data(paths[1], 'updated')
    os.utime(data, (mtime + 1, mtime + 1))
    records, source = outage._load_power_data()
    assert records[0]['id'] == source['name'] == 'updated'


def test_cache_refreshes_source_written_after_data(paths, monkeypatch):
    write_data(paths[1], 'runtime')
    source = paths[1] / 'taipower-outage-source.json'
    source.unlink()
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    assert outage._load_power_data()[1] == {}
    source.write_text('{"fetchedAt":"2026-10-19T10:00:00+08:00"}')
    assert outage._load_power_data()[1]['fetchedAt'] == '2026-10-19T10:00:00+08:00'


def test_container_layout_falls_back_to_mounted_seed(tmp_path, monkeypatch):
    monkeypatch.delenv('OUTAGE_DATA_DIR', raising=False)
    module_path = tmp_path / 'app/routers/outage.py'
    module_path.parent.mkdir(parents=True)
    module_path.write_text(Path(outage.__file__).read_text())
    write_data(tmp_path / 'app/public/data', 'container seed')
    spec = importlib.util.spec_from_file_location('container_outage', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module._load_power_data()[0][0]['id'] == 'container seed'


def test_notices_reads_runtime_data(paths, monkeypatch):
    write_data(paths[1], 'runtime')
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(paths[1]))
    monkeypatch.setattr(outage, 'fetch_real_water_outage', AsyncMock(return_value={'id': 'water-normal'}))
    app = FastAPI()
    app.include_router(outage.router)
    with TestClient(app) as client:
        response = client.get('/api/outage/notices', params={'address': '台北市中山區松江路88號'})
    assert response.status_code == 200
    assert response.json()['events'][0]['id'] == 'power-runtime'
