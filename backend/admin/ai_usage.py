"""AI 用量：目前只記 OCR 服務用掉的 Google Vision 頁數（2026-09-30 起）。

原本後台的 AI 用量是瀏覽器裡的示範資料，列的是 Gemini 與 Vision；但後端早就
不用 Gemini 了（合約分析與檢索用 NVIDIA／Ollama，點交比對用 NVIDIA 的看圖模型）。
Vision 是唯一按頁計費的服務，先把它記實；NVIDIA、Ollama 之後再做（2026-09-30 決定）。

## 怎麼記

Vision 是在 Node 的 OCR 服務裡呼叫的（server/index.js）。它每次拿到 Vision 的回應
就記下頁數，彙總後帶著服務憑證回報到 POST /api/internal/ai-usage（routers/ai_usage_api.py）。
這裡依台灣時間的日期累加：一天一個供應商一列。

## 額度警戒

回報進來時順便算本月用量佔系統設定裡的額度多少，到預警或告急門檻就通知管理員
（admin_notifications.py）。每個門檻每月只通知一次；直接跳過預警到告急的，只發告急。
依消耗速度推算「幾天後用完」的規則只在畫面上算，不另外發告警。

## 存哪裡

SQLite（AI_USAGE_DB），VM 上在掛載的 data/garbage/。
"""

from db.sqlstore import open_store as _open

import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

TZ = timezone(timedelta(hours=8))
PROVIDERS = {
    'vision': {'label': 'Google Cloud Vision', 'unit': 'page'},
}
#: 一次回報的上限。一份合約幾十頁，十萬頁一定是回報端壞了
MAX_UNITS_PER_REPORT = 100_000


def _local(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, TZ)


def _count(value, name: str, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > maximum:
        raise ValueError(f'{name}必須是 0 到 {maximum:,} 之間的整數。')
    return value


def record(provider: str, units: int, calls: int, now: float | None = None) -> None:
    """累加一筆用量。不合法就丟 ValueError（回報端壞了，不能讓它把數字灌爆）。"""
    if provider not in PROVIDERS:
        raise ValueError(f'不認得的 AI 服務：{provider}')
    units = _count(units, '用量', MAX_UNITS_PER_REPORT)
    calls = _count(calls, '呼叫次數', MAX_UNITS_PER_REPORT)
    ts = time.time() if now is None else now
    with _open() as db:
        db.upsert('daily_usage', {'date': _local(ts).strftime('%Y-%m-%d'), 'provider': provider},
                  {'units': units, 'calls': calls}, add=True)
    _check_quota(provider, ts)


def daily(days: int = 60, now: float | None = None) -> list[dict]:
    """最近 days 天（含今天）的每日用量，舊到新。"""
    ts = time.time() if now is None else now
    cutoff = (_local(ts) - timedelta(days=days - 1)).strftime('%Y-%m-%d')
    with _open() as db:
        rows = db.execute(
            'SELECT date, provider, units, calls FROM daily_usage WHERE date >= ? ORDER BY date, provider',
            (cutoff,),
        ).fetchall()
    return [dict(row) for row in rows]


def month_to_date(provider: str, now: float | None = None) -> int:
    month = _local(time.time() if now is None else now).strftime('%Y-%m')
    with _open() as db:
        (total,) = db.execute(
            'SELECT COALESCE(SUM(units), 0) FROM daily_usage WHERE provider = ? AND date LIKE ?',
            (provider, f'{month}-%'),
        ).fetchone()
    return int(total)


def _check_quota(provider: str, ts: float) -> None:
    """本月用量到門檻就通知管理員，每個門檻每月一次（見模組說明）。"""
    if provider != 'vision':
        return
    from admin import admin_notifications, site_settings

    settings = site_settings.get_settings()
    quota = settings['platformVisionPageQuota']
    if quota <= 0:
        return  # 沒設額度就沒有門檻可言
    used = month_to_date(provider, ts)
    warn, critical = settings['quotaWarnPercent'], settings['quotaCriticalPercent']
    # 門檻跟畫面（src/utils/admin-ai-usage.ts 的 quotaStatus）一樣用精確比例比
    if used * 100 >= critical * quota:
        level, threshold, word = 'critical', critical, '告急'
    elif used * 100 >= warn * quota:
        level, threshold, word = 'warn', warn, '預警'
    else:
        return
    # 顯示的百分比跟畫面一樣四捨五入、最多 100%，通知跟監控頁的數字才對得起來
    percent = min(100, (used * 200 + quota) // (2 * quota))

    month = _local(ts).strftime('%Y-%m')
    with _open() as db:
        claimed = db.insert_ignore('usage_meta', {'key': f'alerted:{provider}:{month}:{level}'},
                                   {'value': str(ts)})
        if level == 'critical':
            # 直接跳到告急的，之後不再補發預警
            db.insert_ignore('usage_meta', {'key': f'alerted:{provider}:{month}:warn'}, {'value': str(ts)})
    if not claimed:
        return
    admin_notifications.record_alert(
        f'Google Vision 本月額度已用 {percent}%',
        f'本月已用 {used:,} 頁，額度 {quota:,} 頁，已超過{word}門檻（{threshold}%）。'
        '額度與門檻可以在系統設定調整。',
        action_url='/admin/monitoring#ai-usage',
        action_label='查看 AI 用量',
    )
