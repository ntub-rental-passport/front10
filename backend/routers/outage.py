"""停水、停電查詢。

## 兩邊的資料來源不一樣

* 停水：即時打台水 API（web.water.gov.tw），拿到當下的公告。
* 停電：讀本地 JSON（public/data/taipower-outage.json），
  由 scripts/fetch_taipower_outage.py 每天下載一次。

停電為什麼不即時查台電：
台電的地址查詢頁（ndft112.aspx）有 Session 綁定的圖形驗證碼，
那是對方刻意設置的防自動化措施，繞過既不合規也不穩定。
政府資料開放平臺 dataset 26144「台灣電力公司計畫性工作停電資料」
是台電對外提供的官方管道，欄位完整、每日更新、有明確授權。

## 地址比對怎麼做

台電的「停電範圍」是人寫的自然語言：
    臺北市大安區和平東路二段１１５巷全巷、１１７號～１３５號
所以不能字串相等比對。這裡用三層漸進：
    第一層 縣市：不合直接淘汰
    第二層 行政區：同上
    第三層 路名：抽出「○○路 / 街 / 大道」比對，命中才算數
巷弄號樓刻意不比對——台電常寫「部分用戶」「全巷」，硬比到門牌
只會製造大量假陰性，使用者該收到通知卻沒收到，比多收一則還糟。
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/api/outage", tags=["Outage"])
logger = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parents[2]
POWER_DATA_PATH = ROOT / "public/data/taipower-outage.json"
POWER_SOURCE_PATH = ROOT / "public/data/taipower-outage-source.json"

WATER_API_URL = "https://web.water.gov.tw/wateroffapi/f/case/search"

# ---------- 停水（即時查台水） ---------------------------------------

async def fetch_real_water_outage(address: str):
    """向台水 API 發送真實查詢。"""
    now = datetime.now()
    start_date = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    end_date = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    payload = {
        "mode": 2,
        "startDate": start_date,
        "endDate": end_date,
        "address": address.strip(),
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://web.water.gov.tw/wateroffmap/map/search",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
    }

    try:
        # verify=False 略過政府網站的 GCA 憑證驗證
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.post(WATER_API_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    case = data[0]
                    s_time = case.get("startTime", "")
                    e_time = case.get("endTime", "")
                    time_range = f"{s_time} - {e_time}" if s_time and e_time else "依公告排程"

                    return {
                        "id": f"water-{case.get('id', 'case')}",
                        "utilityType": "water",
                        "status": "scheduled",
                        "statusLabel": "緊急停水" if case.get("type") == 1 else "計畫停水",
                        "title": "台灣自來水公司停水公告",
                        "dateLabel": f"{now.strftime('%m月%d日')} 施工維修",
                        "timeRange": time_range,
                        "workLabel": "停水原因",
                        "workContent": case.get("waterOffReason") or "自來水管線施工維修",
                        "referenceLabel": "公告編號",
                        "referenceValue": case.get("no") or "無編號",
                        "sourceName": "台灣自來水公司",
                        "sourceUpdatedAt": "剛剛更新",
                        "officialUrl": "https://web.water.gov.tw/wateroffmap/map",
                        "hint": case.get("note", "停水前請關閉抽水馬達，預先儲水備用。"),
                    }
    except Exception as e:
        logger.warning("[Water API Error] 連線失敗: %s", e)

    # 查無停水事件或連線逾時，回傳供水正常
    return {
        "id": "water-normal",
        "utilityType": "water",
        "status": "resolved",
        "statusLabel": "供水正常",
        "title": "台灣自來水公司",
        "dateLabel": "目前該地址無停水公告",
        "timeRange": "全日正常供水",
        "workLabel": "供水狀態",
        "workContent": "轄區供水管網正常運作",
        "referenceLabel": "查詢狀態",
        "referenceValue": "STATUS-OK",
        "sourceName": "台灣自來水公司",
        "sourceUpdatedAt": "剛剛更新",
        "officialUrl": "https://web.water.gov.tw/wateroffmap/map",
        "hint": "若遇水壓偏低，可先檢查進水閥門或洽 1910 水公司專線。",
    }


# ---------- 停電（讀本地 JSON + 地址比對） ----------------------------

_power_cache = {"mtime": None, "records": [], "source": {}}

CITY_PATTERN = re.compile(r"^(.{2,3}?[市縣])")
DISTRICT_PATTERN = re.compile(r"([\u4e00-\u9fa5]{1,4}[區鄉鎮市])")
# 路名不可含縣市區鄉字，否則會把「大安區和平東路」整串吃進來
ROAD_PATTERN = re.compile(r"([^\d市縣區鄉鎮村里段號樓之巷弄]{1,6}(?:大道|路|街))")

FULL_TO_HALF = str.maketrans("０１２３４５６７８９－～　", "0123456789-~ ")


def _normalize(text: str) -> str:
    """全形轉半形、臺→台、去空白。兩邊都跑過同一套才比得準。"""
    if not text:
        return ""
    return text.translate(FULL_TO_HALF).replace("臺", "台").replace(" ", "").strip()


def _load_power_data():
    """讀本地資料，用 mtime 判斷要不要重讀，避免每次請求都解析整包 JSON。"""
    if not POWER_DATA_PATH.exists():
        return [], {}

    mtime = POWER_DATA_PATH.stat().st_mtime
    if _power_cache["mtime"] != mtime:
        raw = json.loads(POWER_DATA_PATH.read_text(encoding="utf-8"))
        for record in raw:
            record["_scope"] = _normalize(record.get("scope"))
        _power_cache["records"] = raw
        _power_cache["mtime"] = mtime
        _power_cache["source"] = (
            json.loads(POWER_SOURCE_PATH.read_text(encoding="utf-8"))
            if POWER_SOURCE_PATH.exists() else {}
        )
        logger.info("載入台電停電資料 %d 筆", len(raw))

    return _power_cache["records"], _power_cache["source"]


def _address_parts(address: str):
    """把地址拆成 (縣市, 行政區, 路名集合)。"""
    text = _normalize(address)
    city_match = CITY_PATTERN.search(text)
    city = city_match.group(1) if city_match else ""
    rest = text[len(city):] if city else text
    district_match = DISTRICT_PATTERN.search(rest)
    district = district_match.group(1) if district_match else ""
    tail = rest[len(district):] if district else rest
    roads = set(ROAD_PATTERN.findall(tail))
    return city, district, roads


def _find_power_matches(address: str, now=None):
    """回傳命中的停電記錄，只含尚未結束的，依開始時間排序。"""
    records, _ = _load_power_data()
    if not records:
        return []

    city, district, roads = _address_parts(address)
    if not city and not roads:
        return []

    now = now or datetime.now(TZ)
    matches = []

    for record in records:
        scope = record["_scope"]

        if city and city not in scope:
            continue
        if district and district not in scope:
            continue
        # 有抽到路名就必須命中其中一條，避免整個行政區的公告全都算數
        if roads and not any(road in scope for road in roads):
            continue

        start = record.get("start")
        if start:
            try:
                if datetime.fromisoformat(start) < now - timedelta(hours=6):
                    continue  # 已經結束太久的略過
            except ValueError:
                pass
        matches.append(record)

    matches.sort(key=lambda r: r.get("start") or "9999")
    return matches


def build_power_event(address: str, now=None):
    """組出前端 UtilityEvent 需要的欄位（與 useOutageData.ts 的型別一致）。"""
    now = now or datetime.now(TZ)
    records, source = _load_power_data()
    fetched = source.get("fetchedAt")
    if fetched:
        try:
            updated_label = datetime.fromisoformat(fetched).strftime("%m/%d %H:%M 更新")
        except ValueError:
            updated_label = "已更新"
    else:
        updated_label = "尚未同步"

    base = {
        "utilityType": "power",
        "title": "台電計畫性停電公告",
        "sourceName": "台灣電力公司（政府資料開放平臺）",
        "sourceUpdatedAt": updated_label,
        "officialUrl": "https://data.gov.tw/dataset/26144",
    }

    # 資料還沒同步過：誠實說不知道，不要假裝「供電正常」
    if not records:
        return {**base,
                "id": "power-unavailable",
                "status": "resolved",
                "statusLabel": "資料同步中",
                "dateLabel": "尚未取得台電公告資料",
                "timeRange": "請稍後再試",
                "workLabel": "狀態",
                "workContent": "停電公告資料尚未同步，暫時無法判斷該地址狀態",
                "referenceLabel": "查詢狀態",
                "referenceValue": "NO_DATA",
                "hint": "如需立即確認，可撥台電客服 1911。"}

    matches = _find_power_matches(address, now=now)

    if not matches:
        return {**base,
                "id": "power-normal",
                "status": "resolved",
                "statusLabel": "無停電排程",
                "dateLabel": "目前查無該地址的工作停電公告",
                "timeRange": "全日正常供電",
                "workLabel": "供電狀態",
                "workContent": "未來排程中沒有涵蓋此地址的計畫性停電",
                "referenceLabel": "查詢狀態",
                "referenceValue": "NORMAL",
                "hint": "突發事故停電不在計畫性公告內，可撥 1911 或查看台電停電地圖。"}

    event = matches[0]
    start_raw, end_raw = event.get("start"), event.get("end")

    if start_raw and end_raw:
        start = datetime.fromisoformat(start_raw)
        end = datetime.fromisoformat(end_raw)
        date_label = f"{start.strftime('%m月%d日')} 計畫工程"
        time_range = f"{start.strftime('%H:%M')} - {end.strftime('%H:%M')}"
        upcoming = end >= now
    else:
        date_label = "依台電公告排程"
        time_range = "時間請見台電公告"
        upcoming = True

    return {**base,
            "id": f"power-{event.get('id', 'case')}",
            "status": "scheduled" if upcoming else "resolved",
            "statusLabel": "工作停電" if upcoming else "已復電",
            "dateLabel": date_label,
            "timeRange": time_range,
            "workLabel": "工作內容",
            "workContent": event.get("work") or "配電線路維護工程",
            "referenceLabel": "請求號數",
            "referenceValue": event.get("requestNo") or "無編號",
            "hint": f"停電範圍：{event.get('scope', '')[:60]}"
                    f"　停電前請將手機充飽，並留意大樓門禁與冷藏設備。"}


# ---------- Route ----------------------------------------------------

@router.get("/notices")
async def get_outage_notices(address: Optional[str] = "台北市大安區和平東路二段"):
    target_address = address.strip() if address else "台北市大安區和平東路二段"
    now_str = datetime.now().strftime("%m/%d %H:%M")

    water_event = await fetch_real_water_outage(target_address)
    power_event = build_power_event(target_address)

    return {
        "status": "success",
        "address": target_address,
        "updatedAt": f"今天 {now_str}",
        "events": [power_event, water_event],
    }