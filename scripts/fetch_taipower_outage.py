"""下載台電計畫性工作停電資料，正規化成 public/data/taipower-outage.json。

資料來源：政府資料開放平臺 dataset 26144
    「台灣電力公司計畫性工作停電資料」
    提供機關：台灣電力股份有限公司
    更新頻率：每日
    授權方式：政府資料開放授權條款 第1版（可自由使用，須標示來源）

放在 scripts/ 底下，可以三種方式執行：
    1. 手動：python scripts/fetch_taipower_outage.py
    2. 排程：Windows 工作排程器 / cron，每天跑一次
    3. 程式內：from fetch_taipower_outage import sync; sync()

## 為什麼不即時打台電查詢頁

台電的地址查詢頁（ndft112.aspx）有 Session 綁定的圖形驗證碼，
那是對方刻意設置的防自動化措施，繞過它既不合規也不穩定。
開放資料是同一家機關對外提供的官方管道，欄位更完整、有明確授權，
而且不會因為對方改版就整個掛掉。

## 第一次執行要做的事

台電的 ZIP 內容格式（CSV 欄位名、日期寫法）官方文件沒有寫死，
所以這支程式會在第一次執行時把偵測到的欄位印出來。
請比對 REPORT 區塊的輸出，如果欄位對應有誤，調整 FIELD_ALIASES 即可。
"""

import csv
import io
import json
import logging
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

TZ = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/taipower-outage.json'
SOURCE_META = ROOT / 'public/data/taipower-outage-source.json'

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


def sync(verbose=True):
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
                logger.warning('%s 找不到「停電範圍」欄位，略過', name)
                continue

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

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(records, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    SOURCE_META.write_text(json.dumps({
        'name': '台灣電力公司計畫性工作停電資料',
        'datasetUrl': f'https://data.gov.tw/dataset/{DATASET_ID}',
        'provider': '台灣電力股份有限公司',
        'license': '政府資料開放授權條款-第1版',
        'fetchedAt': datetime.now(TZ).isoformat(),
        'records': len(records),
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    if verbose:
        print('=== REPORT：請確認欄位對應是否正確 ===')
        for entry in report:
            print(f"\n檔案：{entry['file']}（{entry['rows']} 筆）")
            print(f"  實際標頭：{entry['headers']}")
            for field, column in entry['mapped'].items():
                mark = '  ' if column else '❌'
                print(f"  {mark}{field:<12} -> {column}")
        print(f'\n共寫入 {len(records)} 筆到 {OUTPUT}')
        if records:
            print('第一筆範例：')
            print(json.dumps(records[0], ensure_ascii=False, indent=2))

    return len(records)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    try:
        sync()
    except Exception as error:
        print(f'同步失敗：{error}', file=sys.stderr)
        sys.exit(1)