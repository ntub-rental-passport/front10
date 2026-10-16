"""AI 用量：Google Vision 頁數與依功能分類的 NVIDIA API 呼叫次數。

## 怎麼記

Vision 是在 Node 的 OCR 服務裡呼叫的（server/index.js）。它每次拿到 Vision 的回應
就記下頁數，彙總後帶著服務憑證回報到 POST /api/internal/ai-usage（routers/ai_usage_api.py）。
這裡依台灣時間的日期累加：一天一個供應商、功能一列。
NVIDIA 每次 HTTP 請求都記錄，包含重試；2xx 後的解析失敗仍已消耗額度。
Ollama 與 embeddings 不計入用量。

## 額度警戒

回報進來時順便算本月用量佔系統設定裡的額度多少，到預警或告急門檻就通知管理員
（admin_notifications.py）。每個門檻每月只通知一次；直接跳過預警到告急的，只發告急。
依消耗速度推算「幾天後用完」的規則只在畫面上算，不另外發告警。

## 存哪裡

專案的資料庫（daily_usage、usage_meta 兩張表）。2026-10-01 從 SQLite 搬進來。
"""

from db.sqlstore import open_store as _open

import time
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=8))
PROVIDERS = {
    'vision': {'label': 'Google Cloud Vision', 'unit': 'page'},
    'nvidia': {'label': 'NVIDIA', 'unit': 'call'},
}
FEATURES = {'contract-analysis': '合約分析', 'law-chat': 'Law Chat', 'inspection': '點交比對'}
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
        db.upsert('daily_usage', {'date': _local(ts).strftime('%Y-%m-%d'), 'provider': provider, 'feature': ''},
                  {'units': units, 'calls': calls}, add=True)
    _check_quota(provider, ts)


def record_call(provider: str, feature: str, *, ok: bool, prompt_tokens: int = 0,
                completion_tokens: int = 0, now: float | None = None) -> None:
    """記錄不能影響 AI 結果；資料庫或額度通知故障時只留下警告。"""
    try:
        ts = time.time() if now is None else now
        with _open() as db:
            db.upsert('daily_usage', {
                'date': _local(ts).strftime('%Y-%m-%d'), 'provider': provider, 'feature': feature,
            }, {'units': 1, 'calls': 1, 'failed': int(not ok),
                'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens}, add=True)
        _check_quota(provider, ts)
    except Exception:
        logger.warning('AI 用量記錄失敗（%s／%s）', provider, feature, exc_info=True)


def record_response(provider: str, feature: str, response) -> None:
    """以 HTTP 回應判定成功，避免後續 JSON／模型驗證影響請求計數。"""
    usage = {}
    if response is not None:
        try:
            data = response.json()
            usage = (data.get('usage') or {}) if isinstance(data, dict) else {}
            if not isinstance(usage, dict):
                usage = {}
        except (ValueError, TypeError):
            pass  # 回應無法解析也已消耗一次請求，token 沒有資料就記 0
    record_call(provider, feature, ok=response is not None and response.is_success,
                prompt_tokens=usage.get('prompt_tokens') or 0,
                completion_tokens=usage.get('completion_tokens') or 0)


def daily(days: int = 60, now: float | None = None) -> list[dict]:
    """最近 days 天（含今天）的每日用量，舊到新。"""
    ts = time.time() if now is None else now
    cutoff = (_local(ts) - timedelta(days=days - 1)).strftime('%Y-%m-%d')
    with _open() as db:
        rows = db.execute(
            'SELECT date, provider, feature, units, calls, failed, prompt_tokens, completion_tokens '
            'FROM daily_usage WHERE date >= ? ORDER BY date, provider, feature',
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
    quota_keys = {'vision': 'platformVisionPageQuota', 'nvidia': 'platformNvidiaCallQuota'}
    if provider not in quota_keys:
        return
    from admin import admin_notifications, site_settings

    settings = site_settings.get_settings()
    quota = settings[quota_keys[provider]]
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
    label, unit = ('Google Vision', '頁') if provider == 'vision' else ('NVIDIA', '次')
    admin_notifications.record_alert(
        f'{label} 本月額度已用 {percent}%',
        f'本月已用 {used:,} {unit}，額度 {quota:,} {unit}，已超過{word}門檻（{threshold}%）。'
        '額度與門檻可以在系統設定調整。',
        action_url='/admin/monitoring#ai-usage',
        action_label='查看 AI 用量',
    )
