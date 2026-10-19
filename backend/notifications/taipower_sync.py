"""同步台電計畫性工作停電開放資料，供 VM 背景排程與開發機手動下載共用。

資料來源：政府資料開放平臺 dataset 26144，提供機關為台灣電力股份有限公司。
更新頻率每日，授權為政府資料開放授權條款第 1 版。
台電查詢頁有 Session 綁定的圖形驗證碼，因此使用官方開放資料下載管道。
"""

import csv
import io
import json
import logging
import os
import re
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

TZ = timezone(timedelta(hours=8))

# 政府資料開放平臺的資料集詮釋資料 API，用它動態取得實際下載網址，
# 比硬寫死一條 URL 穩：台電換檔名時不用改程式。
DATASET_ID = '26144'
METADATA_API = f'https://data.gov.tw/api/v2/rest/dataset/{DATASET_ID}'

# 官方公告的主要欄位：營業區處、請求號數、工作概述、
# 第一次停電時間、第二次停電時間、停電範圍、查詢電話(1911)
FIELD_ALIASES = {
    'office': ['營業區處', '區處', '營業處'],
    'request_no': ['請求號數', '請求號碼', '停電請求號數'],
    'work': ['工作概述', '工作內容', '停電原因'],
    'first_time': ['第一次停電時間', '第1次停電時間', '停電時間'],
    'second_time': ['第二次停電時間', '第2次停電時間'],
    'scope': ['停電範圍', '停電地區', '範圍'],
}

logger = logging.getLogger(__name__)
_last_failure_at = None


def _pick_column(headers, aliases):
    """從實際的 CSV 標頭找出對應欄位，容忍空白與全形括號差異。"""
    cleaned = {re.sub(r'[\s　()（）]', '', h or ''): h for h in headers}
    for alias in aliases:
        key = re.sub(r'[\s　()（）]', '', alias)
        for norm, original in cleaned.items():
            if norm.startswith(key):
                return original
    return None


def _parse_side(chunk, fallback_date=None):
    """把 '2026/09/30 21:00' 或 '1140318 1300' 或 '13:00' 解析成 datetime。

    fallback_date 讓右半段可以省略日期（例如 '1140318 1300~1630' 的 '1630'），
    這種情況右半段沒有日期，就沿用左半段的。
    """
    nums = re.findall(r'\d+', chunk)
    if not nums:
        return None

    # 情況 A：純時間（沒日期），需要 fallback_date
    if fallback_date and len(nums) <= 2 and all(len(n) <= 4 for n in nums):
        year, month, day = fallback_date.year, fallback_date.month, fallback_date.day
        time_nums = nums
    # 情況 B：民國年連寫 1140318
    elif len(nums[0]) == 7:
        year, month, day = int(nums[0][:3]) + 1911, int(nums[0][3:5]), int(nums[0][5:7])
        time_nums = nums[1:]
    # 情況 C：西元年連寫 20260930
    elif len(nums[0]) == 8:
        year, month, day = int(nums[0][:4]), int(nums[0][4:6]), int(nums[0][6:8])
        time_nums = nums[1:]
    # 情況 D：年月日分寫 114/03/18 或 2026/09/30
    elif len(nums) >= 3:
        year, month, day = int(nums[0]), int(nums[1]), int(nums[2])
        if year < 1911:
            year += 1911
        time_nums = nums[3:]
    else:
        return None

    # 解析時分：可能是 13 00（分寫）或 1300（連寫）或只有 13（整點）
    if not time_nums:
        hour, minute = 0, 0
    elif len(time_nums) >= 2 and len(time_nums[0]) <= 2:
        hour, minute = int(time_nums[0]), int(time_nums[1])
    elif len(time_nums[0]) == 4:
        hour, minute = int(time_nums[0][:2]), int(time_nums[0][2:])
    else:
        hour, minute = int(time_nums[0]), 0

    try:
        return datetime(year, month, day, hour, minute, tzinfo=TZ)
    except ValueError:
        return None


def _parse_time_range(raw):
    """把台電的停電時間字串拆成 (開始, 結束) 的 ISO 字串。

    先用 ~ 或 - 把字串切成兩半，各自獨立解析。這樣同時支援：
        1140318 1300~1630                    （民國年連寫 + 純時間）
        114/03/18 13:00-16:30                （民國年分寫）
        2026/09/30 21:00~2026/10/01 00:00    （西元年跨日）
        2026/09/30 21:00~1140319 0200        （混合寫法）
    """
    if not raw or not raw.strip():
        return None, None
    # 台電對「這欄沒資料」的寫法：多半是「無」，偶爾出現 N/A、-、無資料
    if raw.strip() in ('無', '無資料', 'N/A', 'n/a', '-', '－', '—'):
        return None, None

    text = raw.strip().replace('～', '~').replace('－', '-')
    # 台電日期一律用 / 分隔，所以 - 一定是起訖分隔符，不會誤切日期
    if '~' in text:
        left, right = text.split('~', 1)
    elif '-' in text:
        left, right = text.split('-', 1)
    else:
        logger.warning('無法解析停電時間（找不到起訖分隔符）：%r', raw)
        return None, None

    start = _parse_side(left)
    if start is None:
        logger.warning('無法解析停電時間（起始）：%r', raw)
        return None, None
    end = _parse_side(right, fallback_date=start)
    if end is None:
        logger.warning('無法解析停電時間（結束）：%r', raw)
        return None, None
    if end < start:  # 純時間跨日
        end += timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _read_table(blob, name):
    """從 ZIP 內的單一檔案讀出 list[dict]，同時容忍 CSV 與 JSON。"""
    lower = name.lower()
    if lower.endswith('.json'):
        data = json.loads(blob.decode('utf-8-sig'))
        return data if isinstance(data, list) else data.get('result', [])
    if lower.endswith('.csv'):
        for encoding in ('utf-8-sig', 'big5', 'cp950'):
            try:
                text = blob.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError(f'{name} 的編碼無法辨識')
        return list(csv.DictReader(io.StringIO(text)))
    return []


def _resolve_download_urls():
    """向開放平臺問出這個資料集目前的檔案下載網址。"""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        resp = client.get(METADATA_API)
        resp.raise_for_status()
        payload = resp.json()

    result = payload.get('result', payload)
    urls = []
    for item in result.get('distribution', []) or []:
        url = item.get('resourceDownloadUrl') or item.get('downloadUrl')
        if url:
            urls.append(url)
    if not urls:
        raise RuntimeError(
            '開放平臺沒有回傳下載網址，請手動到 '
            f'https://data.gov.tw/dataset/{DATASET_ID} 確認資料集是否仍在架上'
        )
    return urls


def needs_sync(now=None) -> bool:
    """以落地的成功時間判斷，避免容器重啟就重複下載。"""
    output_dir = os.getenv('OUTAGE_DATA_DIR')
    if not output_dir:
        return False
    now = now or datetime.now(TZ)
    if _last_failure_at is not None and now - _last_failure_at < timedelta(hours=1):
        return False
    try:
        source = json.loads((Path(output_dir) / 'taipower-outage-source.json').read_text(encoding='utf-8'))
        fetched_at = datetime.fromisoformat(source.get('fetchedAt'))
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=TZ)
    except (OSError, ValueError, TypeError, AttributeError):
        # 缺少或損毀的成功紀錄不能阻止首次同步；失敗則由冷卻時間限制重試。
        return True
    return now - fetched_at > timedelta(hours=24)


def record_failure(now=None):
    global _last_failure_at
    _last_failure_at = now or datetime.now(TZ)


def _atomic_write(path: Path, content: str):
    # 暫存檔與目的檔在同一掛載，os.replace 才能讓讀者一次看到完整 JSON。
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=f'.{path.name}.', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        # NamedTemporaryFile 建出來是 0600；容器以 root 寫入，VM 上的 rentmate 使用者要能直接 cat 檢查。
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def sync(output_dir: Path, verbose=False) -> int:
    """下載、正規化、寫檔。回傳寫入的筆數。"""
    records = []
    report = []

    for url in _resolve_download_urls():
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            blob = resp.content

        files = {}
        if blob[:2] == b'PK':  # ZIP
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    files[info.filename] = archive.read(info)
        else:
            files[url.rsplit('/', 1)[-1]] = blob

        for name, content in files.items():
            base = name.rsplit('/', 1)[-1].lower()
            # 台電 ZIP 附了 manifest 和每個檔的 schema 描述，不是資料本身，靜默略過
            if base == 'manifest.csv' or base.startswith('schema-'):
                continue

            rows = _read_table(content, name)
            if not rows:
                continue

            headers = list(rows[0].keys())
            columns = {
                field: _pick_column(headers, aliases)
                for field, aliases in FIELD_ALIASES.items()
            }
            report.append({'file': name, 'headers': headers,
                           'mapped': columns, 'rows': len(rows)})

            if not columns['scope']:
                raise ValueError(f'{name} 找不到「停電範圍」欄位，保留既有檔案')

            for index, row in enumerate(rows):
                def value(field):
                    column = columns[field]
                    return (row.get(column) or '').strip() if column else ''

                scope = value('scope')
                if not scope:
                    continue

                start, end = _parse_time_range(value('first_time'))
                start2, end2 = _parse_time_range(value('second_time'))

                records.append({
                    'id': value('request_no') or f'{name}-{index}',
                    'office': value('office'),
                    'requestNo': value('request_no'),
                    'work': value('work'),
                    'scope': scope,
                    'start': start,
                    'end': end,
                    'secondStart': start2,
                    'secondEnd': end2,
                })

    if not records:
        raise ValueError('台電停電資料至少須有一筆，保留既有檔案')

    data = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    source = json.dumps({
        'name': '台灣電力公司計畫性工作停電資料',
        'datasetUrl': f'https://data.gov.tw/dataset/{DATASET_ID}',
        'provider': '台灣電力股份有限公司',
        'license': '政府資料開放授權條款-第1版',
        'fetchedAt': datetime.now(TZ).isoformat(),
        'records': len(records),
    }, ensure_ascii=False, indent=2)
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / 'taipower-outage.json'
    # source 的 fetchedAt 是排程的成功依據，必須等資料檔替換成功後才更新。
    _atomic_write(output, data)
    _atomic_write(output_dir / 'taipower-outage-source.json', source)

    if verbose:
        print('=== REPORT：請確認欄位對應是否正確 ===')
        for entry in report:
            print(f"\n檔案：{entry['file']}（{entry['rows']} 筆）")
            print(f"  實際標頭：{entry['headers']}")
            for field, column in entry['mapped'].items():
                mark = '  ' if column else '❌'
                print(f"  {mark}{field:<12} -> {column}")
        print(f'\n共寫入 {len(records)} 筆到 {output}')
        if records:
            print('第一筆範例：')
            print(json.dumps(records[0], ensure_ascii=False, indent=2))

    return len(records)

