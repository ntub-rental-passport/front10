import { onScopeDispose, ref } from 'vue'
import {
  LLM_OLLAMA_SERVICE,
  OCR_SERVICE,
  RAG_SERVICE,
  backupMonitor,
  backendMonitor,
  databaseMonitor,
  errorRateMonitor,
  parseIsoTime,
  serviceMonitor,
  type DbPoolSnapshot,
  type MonitorReading,
  type RequestSnapshot,
  type ServiceState,
} from '@/src/utils/admin-monitoring'
import type {
  ConfigItem,
  MonitorEvent,
  MonitorSummary,
  QueuesSnapshot,
} from '@/src/utils/admin-monitoring-report'
import { fetchAdminMetrics, fetchMonitorEvents } from '@/src/services/adminMetricsApi'
import { adminSettings } from './useAdminSettings'

/**
 * 健康檢查打後端的 `/api/health` 端點。
 *
 * 為何不打後端根路徑（先前的做法）：根路徑不在 `/api` 之下，
 * 開發時 Vite proxy 轉不過去、正式環境 Nginx 也只代理 `/api/`，
 * 因此舊版只能自行推導後端 origin —— 但正式環境的 `VITE_API_BASE_URL`
 * 是相對路徑 `/api`，去掉 `/api` 後為空字串，於是退回預設值
 * `http://127.0.0.1:8000/`，那是**使用者自己電腦的 localhost**，
 * 永遠連不到伺服器，導致正式環境的監控恆顯示「無回應」。
 * 開發環境因為值是完整網址而正常，故此問題極難察覺。
 *
 * 改打 `/api/health` 後，開發走 Vite proxy、正式走 Nginx，
 * 兩邊都是同源相對路徑，毋須知道後端實際位址，也不涉及 CORS。
 * 仍保留 VITE_API_HEALTH_URL 供特殊部署情境覆寫。
 */
function resolveHealthUrl(): string {
  const override = import.meta.env.VITE_API_HEALTH_URL
  if (override) return override

  const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
  return `${base}/health`
}

const HEALTH_URL = resolveHealthUrl()

const POLL_INTERVAL_MS = 30_000
// 系統設定的 responseOkMs／responseDegradedMs 依此門檻分級回應時間；
// 超過這個逾時就直接判定失敗、量不到數字，因此那兩個門檻設超過 5000 沒有意義。
const TIMEOUT_MS = 5_000

/**
 * 後端健康度量測。
 *
 * 兩個來源：
 *   1. `/api/health` —— 不需登入，量後端是否回應與往返時間
 *   2. `/api/admin/metrics` —— 僅限管理員，取連線池與錯誤率，以及後端背景迴圈
 *      記下的服務狀態、佇列、設定（前端只讀，不會叫後端當場去探測外部服務）
 *
 * 為何分成兩支而不是合併：健康檢查必須在登入之前就能用
 * （後端掛掉時反而會因為登入不了而看不到監控結果），
 * 而營運數據會洩漏「現在正是攻擊的好時機」，必須鎖起來。
 */
export function useSystemHealth(options: { withEvents?: boolean } = {}) {
  const responseMs = ref<number | null>(null)
  const checkedAt = ref<string | null>(null)
  const checking = ref(false)
  // null 代表這一輪讀取失敗（後端掛了、權限不足），與「還沒讀過」不同
  const dbPool = ref<DbPoolSnapshot | null>(null)
  const requests = ref<RequestSnapshot | null>(null)
  /** 第一輪 metrics 回來了沒。沒回來之前畫面要說「量測中」，不是「讀不到」 */
  const metricsLoaded = ref(false)
  const metricsAvailable = ref(false)
  const services = ref<ServiceState[] | null>(null)
  const queues = ref<QueuesSnapshot | null>(null)
  const config = ref<ConfigItem[] | null>(null)
  const summary = ref<MonitorSummary | null>(null)
  /** 只有監控頁要（withEvents）。總覽頁也用這個 composable，沒必要每 30 秒多抓 200 筆 */
  const events = ref<MonitorEvent[] | null>(null)
  /**
   * 伺服器時間 − 瀏覽器時間。「已斷線 N 分鐘」「資料過期」都拿伺服器時間算，
   * 管理員的電腦時鐘不準也不會誤判。
   */
  const clockOffsetMs = ref(0)

  async function check(): Promise<void> {
    checking.value = true
    const started = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      })
      // 有回應才算量到，5xx 代表活著但有問題 —— 仍記時間，狀態由回應時間分級
      responseMs.value = response.ok ? performance.now() - started : null
    } catch {
      responseMs.value = null
    } finally {
      clearTimeout(timer)
      checkedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
    }

    // 自己的逾時控制器：健康檢查的 timer 在上面的 finally 已經清掉，
    // 沿用它的 signal 等於這支請求完全沒有逾時保護，後端卡住就會一直懸著。
    const metricsController = new AbortController()
    const metricsTimer = setTimeout(() => metricsController.abort(), TIMEOUT_MS)
    try {
      const metrics = await fetchAdminMetrics(metricsController.signal)
      metricsAvailable.value = metrics !== null
      dbPool.value = metrics?.dbPool ?? null
      requests.value = metrics?.requests ?? null
      services.value = metrics?.services ?? null
      queues.value = metrics?.queues ?? null
      config.value = metrics?.config ?? null
      summary.value = metrics?.summary ?? null

      const serverTime = parseIsoTime(metrics?.summary?.serverTime)
      if (serverTime !== null) clockOffsetMs.value = serverTime - Date.now()

      if (options.withEvents) {
        events.value = metrics ? await fetchMonitorEvents(metricsController.signal) : null
      }
    } finally {
      clearTimeout(metricsTimer)
      metricsLoaded.value = true
      // 放在最後：按鈕的「量測中」要涵蓋整輪，不是只有第一支請求
      checking.value = false
    }
  }

  /** 以伺服器時鐘為準的「現在」，見 clockOffsetMs */
  function serverNow(): Date {
    return new Date(Date.now() + clockOffsetMs.value)
  }

  void check()
  const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS)
  onScopeDispose(() => window.clearInterval(timer))

  /** 已接上的監控項：後端、資料庫、背景工作、外部服務與每日備份 */
  function liveMonitors(): MonitorReading[] {
    const now = serverNow()
    return [
      backendMonitor(
        responseMs.value,
        checkedAt.value,
        adminSettings.value.responseOkMs,
        adminSettings.value.responseDegradedMs,
      ),
      databaseMonitor(dbPool.value, services.value, now),
      errorRateMonitor(requests.value),
      serviceMonitor(services.value, LLM_OLLAMA_SERVICE, now),
      serviceMonitor(services.value, RAG_SERVICE, now),
      serviceMonitor(services.value, OCR_SERVICE, now),
      backupMonitor(services.value, now),
    ]
  }

  /**
   * 尚未接上的監控項。
   *
   * 目前是空的 —— 連線池與錯誤率已於 2026-09-08 接上 `/api/admin/metrics`。
   * 保留這個函式而不刪除，是因為畫面會呼叫它；日後要加新的監控項時，
   * 可以先在這裡放 `pendingMonitor` 佔位，形狀一致，接上時畫面不用動。
   */
  function pendingMonitors(): MonitorReading[] {
    return []
  }

  return {
    responseMs,
    checkedAt,
    checking,
    dbPool,
    requests,
    metricsLoaded,
    metricsAvailable,
    services,
    queues,
    config,
    summary,
    events,
    check,
    serverNow,
    liveMonitors,
    pendingMonitors,
  }
}
