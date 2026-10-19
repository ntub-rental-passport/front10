"""台電同步用假 HTTP 回應，避免測試下載或覆寫 repo 的種子資料。"""
import importlib.util
import io
import json
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pytest

from notifications import taipower_sync

NOW = datetime(2026, 10, 19, 10, tzinfo=taipower_sync.TZ)
DOWNLOAD = 'https://outage.test/power.zip'
CSV = ('營業區處,請求號數,工作概述,第一次停電時間,第二次停電時間,停電範圍\n'
       '台北區處,123,設備維護,1151020 0900~1200,2026/10/21 23:00~0100,臺北市中山區松江路全段\n')


@pytest.fixture(autouse=True)
def isolated_sync(monkeypatch):
    monkeypatch.delenv('OUTAGE_DATA_DIR', raising=False)
    monkeypatch.setattr(taipower_sync, '_last_failure_at', None)

    def no_network(*args, **kwargs):
        raise AssertionError('測試不得建立真實 HTTP client')

    monkeypatch.setattr(taipower_sync.httpx, 'Client', no_network)


@pytest.fixture
def fake_http(monkeypatch):
    calls = []
    responses = {
        taipower_sync.METADATA_API: httpx.Response(200, json={
            'result': {'distribution': [{'resourceDownloadUrl': DOWNLOAD}]},
        }),
    }

    class FakeClient:
        def __init__(self, **kwargs):
            assert 0 < kwargs['timeout'] <= 120
            assert kwargs['follow_redirects'] is True

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url):
            calls.append(url)
            response = responses[url]
            if isinstance(response, Exception):
                raise response
            response.request = httpx.Request('GET', url)
            return response

    monkeypatch.setattr(taipower_sync.httpx, 'Client', FakeClient)
    return responses, calls


def archive_bytes():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        archive.writestr('manifest.csv', 'not,outage,data')
        archive.writestr('schema-power.json', '{not data}')
        archive.writestr('data/power.csv', CSV.encode('utf-8-sig'))
    return stream.getvalue()


def test_sync_atomically_replaces_data_then_source(tmp_path, fake_http, monkeypatch, capsys):
    responses, calls = fake_http
    responses[DOWNLOAD] = httpx.Response(200, content=archive_bytes())
    data_path = tmp_path / 'taipower-outage.json'
    source_path = tmp_path / 'taipower-outage-source.json'
    data_path.write_text('[{"id":"old"}]')
    source_path.write_text('{"fetchedAt":"old"}')
    replacements = []
    replace = taipower_sync.os.replace

    def observe_replace(temporary, destination):
        assert temporary.parent == destination.parent == tmp_path
        assert temporary != destination
        json.loads(temporary.read_text())
        assert json.loads(source_path.read_text()) == {'fetchedAt': 'old'}
        if destination == data_path:
            assert json.loads(data_path.read_text()) == [{'id': 'old'}]
        else:
            assert json.loads(data_path.read_text())[0]['id'] == '123'
        replacements.append(destination)
        replace(temporary, destination)

    monkeypatch.setattr(taipower_sync.os, 'replace', observe_replace)
    assert taipower_sync.sync(tmp_path, verbose=True) == 1
    assert calls == [taipower_sync.METADATA_API, DOWNLOAD]
    assert replacements == [data_path, source_path]
    assert set(tmp_path.iterdir()) == {data_path, source_path}
    assert json.loads(data_path.read_text()) == [{
        'id': '123', 'office': '台北區處', 'requestNo': '123', 'work': '設備維護',
        'scope': '臺北市中山區松江路全段',
        'start': '2026-10-20T09:00:00+08:00', 'end': '2026-10-20T12:00:00+08:00',
        'secondStart': '2026-10-21T23:00:00+08:00', 'secondEnd': '2026-10-22T01:00:00+08:00',
    }]
    source = json.loads(source_path.read_text())
    fetched_at = datetime.fromisoformat(source.pop('fetchedAt'))
    assert abs(datetime.now(taipower_sync.TZ) - fetched_at) < timedelta(seconds=10)
    assert source == {
        'name': '台灣電力公司計畫性工作停電資料',
        'datasetUrl': 'https://data.gov.tw/dataset/26144',
        'provider': '台灣電力股份有限公司', 'license': '政府資料開放授權條款-第1版',
        'records': 1,
    }
    report = capsys.readouterr().out
    assert 'REPORT' in report and '實際標頭' in report and str(data_path) in report


@pytest.mark.parametrize('failure', ['empty', 'download', 'metadata', 'json', 'zip', 'columns'])
def test_sync_failure_preserves_existing_files(tmp_path, fake_http, failure):
    responses, _ = fake_http
    files = [tmp_path / 'taipower-outage.json', tmp_path / 'taipower-outage-source.json']
    for path in files:
        path.write_bytes(b'previous contents')
    before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in files]
    # 先解析一份有效檔案，後面的例外也不能讓部分結果覆寫舊資料。
    responses[DOWNLOAD] = httpx.Response(200, content=archive_bytes())
    second_url = 'https://outage.test/second.json'
    responses[taipower_sync.METADATA_API] = httpx.Response(200, json={
        'distribution': [{'downloadUrl': DOWNLOAD}, {'downloadUrl': second_url}],
    })
    responses[second_url] = httpx.Response(200, content=b'{invalid')
    if failure == 'empty':
        responses[DOWNLOAD] = httpx.Response(200, content=b'')
        responses[second_url] = httpx.Response(200, json=[])
    elif failure == 'download':
        responses[second_url] = httpx.ReadTimeout('test timeout')
    elif failure == 'metadata':
        responses[taipower_sync.METADATA_API] = httpx.Response(503)
    elif failure == 'zip':
        responses[second_url] = httpx.Response(200, content=b'PK broken archive')
    elif failure == 'columns':
        responses[second_url] = httpx.Response(200, json=[{'unexpected': 'value'}])

    with pytest.raises((ValueError, RuntimeError, httpx.HTTPError, zipfile.BadZipFile)):
        taipower_sync.sync(tmp_path)
    assert [(path.read_bytes(), path.stat().st_mtime_ns) for path in files] == before
    assert set(tmp_path.iterdir()) == set(files)


def test_sync_cleans_temporary_file_if_replace_fails(tmp_path, fake_http, monkeypatch):
    fake_http[0][DOWNLOAD] = httpx.Response(200, content=archive_bytes())
    data_path = tmp_path / 'taipower-outage.json'
    data_path.write_bytes(b'old')

    def fail_replace(*args):
        raise OSError('test write failure')

    monkeypatch.setattr(taipower_sync.os, 'replace', fail_replace)
    with pytest.raises(OSError):
        taipower_sync.sync(tmp_path)
    assert data_path.read_bytes() == b'old'
    assert list(tmp_path.iterdir()) == [data_path]


@pytest.mark.parametrize(('source', 'expected'), [
    (None, True), ({}, True), ({'fetchedAt': None}, True), ({'fetchedAt': 'invalid'}, True),
    ({'fetchedAt': (NOW - timedelta(hours=25)).isoformat()}, True),
    ({'fetchedAt': (NOW - timedelta(hours=24)).isoformat()}, False),
    ({'fetchedAt': (NOW - timedelta(hours=23)).isoformat()}, False),
    ({'fetchedAt': '2026-10-19T01:00:00Z'}, False),
    ({'fetchedAt': '2026-10-19T09:00:00'}, False),
])
def test_needs_sync_uses_persisted_fetched_at(tmp_path, monkeypatch, source, expected):
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(tmp_path))
    if source is not None:
        (tmp_path / 'taipower-outage-source.json').write_text(json.dumps(source))
    assert taipower_sync.needs_sync(NOW) is expected


def test_needs_sync_recovers_from_corrupt_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(tmp_path))
    (tmp_path / 'taipower-outage-source.json').write_text('{broken')
    assert taipower_sync.needs_sync(NOW)


def test_needs_sync_waits_one_hour_after_failure(tmp_path, monkeypatch):
    monkeypatch.setenv('OUTAGE_DATA_DIR', str(tmp_path))
    taipower_sync.record_failure(NOW)
    assert not taipower_sync.needs_sync(NOW + timedelta(minutes=59, seconds=59))
    assert taipower_sync.needs_sync(NOW + timedelta(hours=1))


@pytest.mark.parametrize('value', [None, ''])
def test_needs_sync_disabled_without_output_dir(monkeypatch, value):
    if value is not None:
        monkeypatch.setenv('OUTAGE_DATA_DIR', value)
    assert not taipower_sync.needs_sync(NOW)


def test_manual_script_delegates_and_keeps_default_report(tmp_path, monkeypatch, capsys):
    script = Path(__file__).resolve().parents[2] / 'scripts/fetch_taipower_outage.py'
    spec = importlib.util.spec_from_file_location('fetch_taipower_outage', script)
    wrapper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(wrapper)
    monkeypatch.setattr(wrapper, 'ROOT', tmp_path)

    def fake_sync(output_dir, verbose=False):
        assert output_dir == tmp_path / 'public/data'
        assert verbose is True
        print('REPORT')
        return 7

    monkeypatch.setattr(wrapper, '_sync', fake_sync)
    assert wrapper.sync() == 7
    assert capsys.readouterr().out == 'REPORT\n'
