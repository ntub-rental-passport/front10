"""後台監控：定期檢查各服務，並把「壞掉的時候」記下來（SQLite）。

## 為什麼要後端自己檢查

原本所有的健康檢查都是**監控頁開著時由前端每 30 秒打一次**。沒人開那一頁，
就沒有任何東西在看。半夜三點桌機睡著、OCR 服務掛掉，隔天早上什麼痕跡都
沒有 —— 而最需要知道的事件，偏偏都發生在沒人盯著的時候。

跟排程通知同一個道理（見 scheduled_notification_service.py）：要「沒人在場
也照樣做」，就只能是後端。這裡由 main.py 的背景迴圈每 60 秒跑一次檢查，
狀態一有變化就寫進事件紀錄。

## 記什麼、不記什麼

- 記：狀態轉換（哪個服務、何時壞、為什麼、何時恢復、停了多久）、後端自己
  停機的區間、排程通知寄送失敗或錯過、後端回應 5xx 的請求。
- **不記錯誤堆疊與原始例外訊息**：它們常帶著資料庫主機名稱、檔案路徑、
  甚至連線字串，放到網頁上等於把內部構造攤開。事件只講「什麼、何時、
  多久、大概為什麼」；細節看後端的 log 檔，堆疊本來就寫在那裡。
- 不記每一次「正常」的檢查 —— 只記轉換，否則紀錄會被「一切正常」淹沒。

## 多個 worker

uvicorn 開多個 worker 時，每個 worker 都會跑自己的檢查。狀態轉換與心跳都用
BEGIN IMMEDIATE 包起來做比對後寫入：同一次停機只會有一個 worker 記到，
不會被記成兩筆。
"""
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]

#: 事件保留天數。回答得了「上週三晚上是不是掛過」，資料量也有上限。
RETENTION_DAYS = 30

#: 兩次心跳間隔超過這個秒數，就視為後端有一段時間沒在運作。
#: 背景迴圈每 20 秒跳一次，重新部署通常幾秒內就回來 —— 兩分鐘的門檻
#: 不會把正常的重啟記成停機。
DOWNTIME_THRESHOLD_SECONDS = 120.0

#: 探測逾時。檢查是在背景跑的，但太長會讓一輪檢查拖很久。
PROBE_TIMEOUT_SECONDS = 3.0

SERVICE_LABELS = {
    'backend': '後端',
    'database': '資料庫',
    'llm-desktop': 'AI 模型（桌機）',
    'ocr': 'OCR 服務',
    'scheduled-notification': '排程通知',
}


def monitor_db() -> Path:
    """⚠️ 一定要在呼叫時才讀環境變數（理由同 garbage_service.reminder_db）。"""
    return Path(os.getenv('MONITOR_DB') or (_REPO_ROOT / 'backend/monitoring.db'))


def _iso(ts: float | None) -> str | None:
    """帶時區的 ISO 字串。沒帶時區的話瀏覽器會當本地時間，UTC+8 會差 8 小時。"""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


@contextmanager
def _open():
    path = monitor_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None：自己控制交易，寫入一律用 BEGIN IMMEDIATE 先拿寫鎖，
    # 「讀舊狀態 → 比對 → 寫新狀態」才會是一個不可分割的動作。
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('''CREATE TABLE IF NOT EXISTS monitor_state (
        service TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        since REAL NOT NULL,
        detail TEXT,
        checked_at REAL NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS monitor_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at REAL NOT NULL,
        service TEXT NOT NULL,
        kind TEXT NOT NULL,
        detail TEXT,
        duration REAL)''')
    db.execute('CREATE INDEX IF NOT EXISTS monitor_events_at ON monitor_events(at)')
    db.execute('''CREATE TABLE IF NOT EXISTS monitor_meta (
        key TEXT PRIMARY KEY,
        value REAL NOT NULL)''')
    try:
        yield db
    finally:
        db.close()


@contextmanager
def _write():
    with _open() as db:
        db.execute('BEGIN IMMEDIATE')
        try:
            yield db
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK')
            raise


def _insert_event(db, at: float, service: str, kind: str, detail: str | None, duration: float | None) -> None:
    db.execute(
        'INSERT INTO monitor_events (at, service, kind, detail, duration) VALUES (?, ?, ?, ?, ?)',
        (at, service, kind, detail, duration),
    )


# ---------------------------------------------------------------
# 狀態轉換
# ---------------------------------------------------------------

def record_check(service: str, ok: bool, detail: str | None = None, now: float | None = None) -> str | None:
    """記下一次檢查結果。狀態有變化時寫一筆事件，回傳事件種類，沒變化回傳 None。

    第一次看到這個服務：正常就只記狀態不記事件；一開始就是壞的，記一筆 down ——
    後端剛啟動就發現 OCR 不在，那是值得知道的事。
    """
    ts = time.time() if now is None else now
    status = 'up' if ok else 'down'
    with _write() as db:
        row = db.execute(
            'SELECT status, since FROM monitor_state WHERE service = ?', (service,)
        ).fetchone()
        if row is None:
            db.execute(
                'INSERT INTO monitor_state (service, status, since, detail, checked_at) VALUES (?, ?, ?, ?, ?)',
                (service, status, ts, detail, ts),
            )
            if status == 'down':
                _insert_event(db, ts, service, 'down', detail, None)
                return 'down'
            return None

        if row['status'] == status:
            # 還是壞的時候，原因可能換了（從「連線逾時」變成「HTTP 502」）—— 更新成最新的
            db.execute(
                'UPDATE monitor_state SET checked_at = ?, detail = ? WHERE service = ?',
                (ts, detail, service),
            )
            return None

        db.execute(
            'UPDATE monitor_state SET status = ?, since = ?, detail = ?, checked_at = ? WHERE service = ?',
            (status, ts, detail, ts, service),
        )
        if status == 'down':
            _insert_event(db, ts, service, 'down', detail, None)
            return 'down'
        # 恢復事件帶上這次壞了多久 —— 那是回頭看紀錄時最想知道的數字
        _insert_event(db, ts, service, 'recovered', None, ts - row['since'])
        return 'recovered'


def record_event(service: str, kind: str, detail: str | None = None, now: float | None = None) -> None:
    """記一筆個別的失敗事件（排程通知失敗、5xx 請求…）。"""
    ts = time.time() if now is None else now
    with _write() as db:
        _insert_event(db, ts, service, kind, detail, None)


# ---------------------------------------------------------------
# 心跳：後端自己停機的那一段
# ---------------------------------------------------------------

def heartbeat(now: float | None = None) -> float | None:
    """跳一次心跳。距離上一次超過門檻，就補記一筆「後端未運作」，回傳那段秒數。

    後端掛掉的當下什麼都記不了，只能事後補：下一次心跳（重新啟動之後，或
    電腦從睡眠醒來之後）發現上一次心跳是很久以前，那中間就是沒在運作的時間。
    同一個函式同時處理「當機後重啟」與「整台機器睡著又醒來」兩種情況。

    這個區間的起點是「最後一次確認還活著」，實際停機時間只會更短、不會更長 ——
    寧可說保守一點，也不要把沒發生的停機算進去。
    """
    ts = time.time() if now is None else now
    with _write() as db:
        row = db.execute("SELECT value FROM monitor_meta WHERE key = 'heartbeat'").fetchone()
        db.execute(
            "INSERT INTO monitor_meta (key, value) VALUES ('heartbeat', ?) "
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            (ts,),
        )
        if row is None:
            return None
        gap = ts - row['value']
        if gap <= DOWNTIME_THRESHOLD_SECONDS:
            return None
        _insert_event(db, row['value'], 'backend', 'backend-downtime', None, gap)
        return gap


def last_heartbeat() -> float | None:
    with _open() as db:
        row = db.execute("SELECT value FROM monitor_meta WHERE key = 'heartbeat'").fetchone()
    return row['value'] if row else None


# ---------------------------------------------------------------
# 查詢
# ---------------------------------------------------------------

def prune(now: float | None = None, days: int = RETENTION_DAYS) -> int:
    ts = time.time() if now is None else now
    with _write() as db:
        return db.execute('DELETE FROM monitor_events WHERE at < ?', (ts - days * 86400,)).rowcount


def list_events(limit: int = 200, kinds: list[str] | None = None) -> list[dict]:
    """新到舊。`kinds` 只取某幾類 —— 稽核紀錄只要斷線類，不篩的話一陣 5xx
    就會把它們擠出 limit 之外。"""
    with _open() as db:
        if kinds:
            marks = ', '.join('?' for _ in kinds)
            rows = db.execute(
                f'SELECT * FROM monitor_events WHERE kind IN ({marks}) ORDER BY at DESC, id DESC LIMIT ?',
                (*kinds, limit),
            ).fetchall()
        else:
            rows = db.execute(
                'SELECT * FROM monitor_events ORDER BY at DESC, id DESC LIMIT ?', (limit,)
            ).fetchall()
    return [
        {
            'id': row['id'],
            'at': _iso(row['at']),
            'service': row['service'],
            'serviceLabel': SERVICE_LABELS.get(row['service'], row['service']),
            'kind': row['kind'],
            'detail': row['detail'],
            'durationSeconds': row['duration'],
        }
        for row in rows
    ]


def service_states() -> list[dict]:
    with _open() as db:
        rows = db.execute('SELECT * FROM monitor_state ORDER BY service').fetchall()
    return [
        {
            'service': row['service'],
            'label': SERVICE_LABELS.get(row['service'], row['service']),
            'status': row['status'],
            'since': _iso(row['since']),
            'detail': row['detail'],
            'checkedAt': _iso(row['checked_at']),
        }
        for row in rows
    ]


def summary(now: float | None = None) -> dict:
    ts = time.time() if now is None else now
    with _open() as db:
        down = db.execute("SELECT count(*) FROM monitor_state WHERE status = 'down'").fetchone()[0]
        recent = db.execute(
            # 恢復事件不算「一次異常」—— 它是上一次異常的結尾，算進去會變成每次壞掉都數兩次
            "SELECT count(*) FROM monitor_events WHERE at >= ? AND kind != 'recovered'",
            (ts - 86400,),
        ).fetchone()[0]
    return {
        'down': down,
        'events24h': recent,
        'lastHeartbeat': _iso(last_heartbeat()),
        # 前端判斷「心跳多久沒更新」要拿伺服器的時間比，不能拿瀏覽器的 ——
        # 管理員的筆電時鐘快個幾分鐘，正常的心跳就會被當成背景檢查停了
        'serverTime': _iso(ts),
    }


# ---------------------------------------------------------------
# 探測：只回「好／壞＋簡短原因」，原因不得包含位址、主機名稱或例外原文
# ---------------------------------------------------------------

def _describe_http_failure(error: Exception) -> str:
    import httpx

    if isinstance(error, httpx.TimeoutException):
        return '連線逾時'
    if isinstance(error, httpx.ConnectError):
        return '連不上'
    return '連線失敗'


def probe_database() -> tuple[bool, str | None] | None:
    from sqlalchemy import text

    from db.database import engine

    if engine is None:
        return None
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        return True, None
    except Exception as error:
        # 例外原文常帶主機名稱與帳號，只留類別名稱
        logger.warning('Database probe failed: %s', type(error).__name__)
        return False, '無法連線'


def probe_llm_desktop() -> tuple[bool, str | None] | None:
    """探測桌機的 Ollama（經 Cloudflare Tunnel）。沒有設定或不在嘗試順序裡就回 None。"""
    import httpx

    from ai import llm_provider

    if 'ollama' not in llm_provider.provider_order():
        return None
    base = llm_provider.ollama_base().rstrip('/')
    if not base:
        return None
    try:
        # /api/tags 只列出模型，是 Ollama 最輕的端點，不會真的載入模型
        response = httpx.get(
            f'{base}/api/tags',
            headers=llm_provider.tunnel_headers(),
            timeout=PROBE_TIMEOUT_SECONDS,
        )
    except Exception as error:
        return False, _describe_http_failure(error)
    if response.status_code != 200:
        return False, f'HTTP {response.status_code}'
    return True, None


def _ocr_health_url() -> str | None:
    explicit = os.getenv('OCR_HEALTH_URL', '').strip()
    if explicit:
        return explicit
    port = os.getenv('OCR_API_PORT', '').strip()
    return f'http://127.0.0.1:{port}/api/health' if port else None


def probe_ocr() -> tuple[bool, str | None] | None:
    """OCR 服務是另一支 Node 程式（server/index.js），它自己有 /api/health。"""
    import httpx

    url = _ocr_health_url()
    if not url:
        return None
    try:
        response = httpx.get(url, timeout=PROBE_TIMEOUT_SECONDS)
    except Exception as error:
        return False, _describe_http_failure(error)
    if response.status_code != 200:
        return False, f'HTTP {response.status_code}'
    _remember_ocr_credentials(response)
    return True, None


#: OCR 服務最近一次回報的 Vision 憑證狀態（1／0），存在 monitor_meta
_OCR_CREDENTIALS_KEY = 'ocr-vision-credentials'


def _remember_ocr_credentials(response) -> None:
    """記下 OCR 服務自己回報的 Vision 憑證狀態，給「外部服務設定」用。

    Vision 憑證是 OCR 服務在用。正式環境金鑰只掛進 OCR 的容器，後端自己去看
    檔案在不在，永遠會說「未設定」—— 所以以 OCR 服務的回報為準。
    """
    try:
        configured = response.json().get('credentialsConfigured')
    except Exception:
        return
    if not isinstance(configured, bool):
        return
    with _write() as db:
        db.execute(
            'INSERT INTO monitor_meta (key, value) VALUES (?, ?) '
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            (_OCR_CREDENTIALS_KEY, 1 if configured else 0),
        )


def _vision_configured() -> bool:
    """OCR 回報過就以它為準；從沒回報過（開發時沒開 OCR）才看後端這邊的檔案 ——
    開發機上兩邊是同一台，這個退路在那裡是準的。"""
    with _open() as db:
        row = db.execute('SELECT value FROM monitor_meta WHERE key = ?', (_OCR_CREDENTIALS_KEY,)).fetchone()
    if row is not None:
        return bool(row['value'])

    path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '').strip()
    if not path:
        return False
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = _REPO_ROOT / candidate
    return candidate.is_file()


PROBES = {
    'database': probe_database,
    'llm-desktop': probe_llm_desktop,
    'ocr': probe_ocr,
}


def run_checks(now: float | None = None) -> None:
    """跑一輪檢查。單一探測出錯不會影響其他探測。"""
    for service, probe in PROBES.items():
        try:
            result = probe()
        except Exception:
            logger.exception('Monitor probe %s crashed', service)
            result = (False, '檢查程式出錯')
        if result is None:
            continue  # 沒有設定這個服務，不記「壞掉」—— 它本來就不存在
        ok, detail = result
        kind = record_check(service, ok, detail, now)
        if kind:
            _alert_transition(service, kind, detail)


def _alert_transition(service: str, kind: str, detail: str | None) -> None:
    """服務斷線與恢復各通知管理員一次（admin_notifications.py）。還是壞的時候不會再通知。"""
    from admin import admin_notifications

    label = SERVICE_LABELS.get(service, service)
    if kind == 'down':
        reason = f'{detail}。' if detail else '檢查沒有回應。'
        body = f'{reason}後端每 60 秒會再檢查一次，恢復時會再通知。'
        admin_notifications.record_alert(f'{label}連不上', body, action_url='/admin/monitoring', action_label='查看監控')
        return
    latest = next((e for e in list_events(limit=5, kinds=['recovered']) if e.get('service') == service), None)
    duration = latest.get('durationSeconds') if latest else None
    if duration is None:
        body = '服務已經恢復正常。'
    else:
        from admin.site_settings import duration_label

        body = f'服務已經恢復正常，這次中斷了 {duration_label(duration)}。'
    admin_notifications.record_alert(f'{label}已恢復', body, action_url='/admin/monitoring', action_label='查看監控')


# ---------------------------------------------------------------
# 背景工作佇列（唯讀）
# ---------------------------------------------------------------

WEEK = 7 * 86400
#: 送出中超過這麼久還沒結束，多半是寄送過程被中斷了
STUCK_AFTER_SECONDS = 300
#: 派送迴圈每 20 秒跑一次。到期超過這麼久還是「待送」，代表迴圈沒在處理 ——
#: 它們在迴圈停掉的期間不會被標成錯過，只會一直待送下去，所以要另外數。
OVERDUE_AFTER_SECONDS = 120


def queue_status(now: float | None = None) -> dict:
    ts = time.time() if now is None else now
    return {
        'scheduledNotifications': _scheduled_queue(ts),
        'garbageReminders': _garbage_queue(ts),
    }


def _scheduled_queue(ts: float) -> dict:
    from notifications import scheduled_notification_service as scheduled

    with scheduled.connect() as db:
        count = lambda sql, *args: db.execute(sql, args).fetchone()[0]  # noqa: E731
        pending = count("SELECT count(*) FROM scheduled_notifications WHERE status = 'pending'")
        overdue = count(
            "SELECT count(*) FROM scheduled_notifications WHERE status = 'pending' AND due < ?",
            ts - OVERDUE_AFTER_SECONDS,
        )
        stuck = count(
            "SELECT count(*) FROM scheduled_notifications WHERE status = 'sending' AND due < ?",
            ts - STUCK_AFTER_SECONDS,
        )
        failed = count(
            "SELECT count(*) FROM scheduled_notifications WHERE status = 'failed' AND due >= ?", ts - WEEK
        )
        missed = count(
            "SELECT count(*) FROM scheduled_notifications WHERE status = 'missed' AND due >= ?", ts - WEEK
        )
        last_issue = db.execute(
            "SELECT max(due) FROM scheduled_notifications WHERE status IN ('failed', 'missed')"
        ).fetchone()[0]
        next_due = db.execute(
            "SELECT min(due) FROM scheduled_notifications WHERE status = 'pending'"
        ).fetchone()[0]
    return {
        'pending': pending, 'overdue': overdue, 'stuck': stuck,
        'failed7d': failed, 'missed7d': missed,
        'lastIssueAt': _iso(last_issue), 'nextDue': _iso(next_due),
    }


def _garbage_queue(ts: float) -> dict:
    from notifications import garbage_service

    with garbage_service.connect() as db:
        count = lambda sql, *args: db.execute(sql, args).fetchone()[0]  # noqa: E731
        either = lambda status: f"(email_status = '{status}' OR push_status = '{status}')"  # noqa: E731
        pending = count(f"SELECT count(*) FROM garbage_reminders WHERE active = 1 AND {either('pending')}")
        overdue = count(
            f"SELECT count(*) FROM garbage_reminders WHERE active = 1 AND {either('pending')} AND due < ?",
            ts - OVERDUE_AFTER_SECONDS,
        )
        stuck = count(f"SELECT count(*) FROM garbage_reminders WHERE {either('sending')} AND due < ?", ts - STUCK_AFTER_SECONDS)
        failed = count(f"SELECT count(*) FROM garbage_reminders WHERE {either('failed')} AND due >= ?", ts - WEEK)
        missed = count(f"SELECT count(*) FROM garbage_reminders WHERE {either('missed')} AND due >= ?", ts - WEEK)
        last_issue = db.execute(
            f"SELECT max(due) FROM garbage_reminders WHERE {either('failed')} OR {either('missed')}"
        ).fetchone()[0]
        next_due = db.execute(
            f"SELECT min(due) FROM garbage_reminders WHERE active = 1 AND {either('pending')} AND due > ?", (ts,)
        ).fetchone()[0]
    return {
        'pending': pending, 'overdue': overdue, 'stuck': stuck,
        'failed7d': failed, 'missed7d': missed,
        'lastIssueAt': _iso(last_issue), 'nextDue': _iso(next_due),
    }


# ---------------------------------------------------------------
# 外部服務設定：只回「有沒有設定」，絕不回傳值
# ---------------------------------------------------------------

def config_status() -> list[dict]:
    from notifications import garbage_service
    from ai import llm_provider

    return [
        {
            'key': 'smtp',
            'label': 'Email（SMTP）',
            'ok': bool(os.getenv('SMTP_USERNAME') and os.getenv('SMTP_APP_PASSWORD')),
            'hint': '排程通知、註冊驗證信都靠它寄出。',
        },
        {
            'key': 'push',
            'label': '瀏覽器推播（VAPID）',
            'ok': bool(garbage_service.capabilities()['push']),
            'hint': '垃圾車提醒的推播需要。沒設定時只能選 Email 提醒。',
        },
        {
            'key': 'llm-desktop',
            'label': 'AI 模型（桌機）位址',
            'ok': 'ollama' in llm_provider.configured_providers(),
            'hint': 'LLM_TUNNEL_URL 或 OLLAMA_URL。合約分析與法規對話的主要模型。',
        },
        {
            'key': 'nvidia',
            'label': 'AI 模型（NVIDIA 備援）金鑰',
            'ok': 'nvidia' in llm_provider.configured_providers(),
            'hint': '桌機連不上時的備援。沒設定的話，桌機一睡分析就會失敗。',
        },
        {
            'key': 'vision',
            'label': 'Google Vision 憑證',
            'ok': _vision_configured(),
            'hint': 'OCR 服務用來辨識合約文字。以 OCR 服務的回報為準：金鑰檔要真的在，不只是有設變數。',
        },
    ]
