import { onScopeDispose, ref } from 'vue'
import {
  backendMonitor,
<<<<<<< HEAD
  dbPoolMonitor,
  errorRateMonitor,
  type DbPoolSnapshot,
  type MonitorReading,
  type RequestSnapshot,
} from '@/src/utils/admin-monitoring'
import { fetchAdminMetrics } from '@/src/services/adminMetricsApi'
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
=======
  pendingMonitor,
  type MonitorReading,
} from '@/src/utils/admin-monitoring'

/**
 * 健康檢查打的是**後端自己的根路徑**，不是前端的。
 *
 * 不能走 Vite 的 `/api` proxy：那個 proxy 會把 `/api/x` 原樣轉給 `:8000/api/x`，
 * 而後端的根路徑在 `:8000/`，經由 proxy 到不了；`/api/` 本身在後端是 404。
 * 早期版本因此量到的是 Vite 開發伺服器，等於在說謊。
 *
 * 後端的 CORS 已允許前端來源，所以瀏覽器可以直接打它的 origin。
 * 部署時用 VITE_API_HEALTH_URL 覆蓋。
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
 */
function resolveHealthUrl(): string {
  const override = import.meta.env.VITE_API_HEALTH_URL
  if (override) return override

<<<<<<< HEAD
  const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
  return `${base}/health`
=======
  // VITE_API_BASE_URL 是後端的 API 前綴（例如 http://localhost:8000/api）。
  // 去掉尾端的 /api 就是後端根路徑；若它是相對路徑（proxy 模式）則退回本機預設。
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '')

  return `${base || 'http://127.0.0.1:8000'}/`
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
}

const HEALTH_URL = resolveHealthUrl()

const POLL_INTERVAL_MS = 30_000
<<<<<<< HEAD
// 系統設定的 responseOkMs／responseDegradedMs 依此門檻分級回應時間；
// 超過這個逾時就直接判定失敗、量不到數字，因此那兩個門檻設超過 5000 沒有意義。
=======
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
const TIMEOUT_MS = 5_000

/**
 * 後端健康度量測。
 *
<<<<<<< HEAD
 * 兩個來源：
 *   1. `/api/health` —— 不需登入，量後端是否回應與往返時間
 *   2. `/api/admin/metrics` —— 僅限管理員，取連線池與錯誤率
 *
 * 為何分成兩支而不是合併：健康檢查必須在登入之前就能用
 * （後端掛掉時反而會因為登入不了而看不到監控結果），
 * 而營運數據會洩漏「現在正是攻擊的好時機」，必須鎖起來。
=======
 * 只量前端自己就能量的東西 —— 後端是否回應、往返時間。
 * 資料庫連線池與錯誤率需要後端提供 metrics 端點，端點還沒有之前，
 * 這裡回傳 `pendingMonitor` 讓畫面顯示空狀態，而不是編一個數字出來。
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
 */
export function useSystemHealth() {
  const responseMs = ref<number | null>(null)
  const checkedAt = ref<string | null>(null)
  const checking = ref(false)
<<<<<<< HEAD
  // null 代表這一輪讀取失敗（後端掛了、權限不足），與「還沒讀過」不同
  const dbPool = ref<DbPoolSnapshot | null>(null)
  const requests = ref<RequestSnapshot | null>(null)
=======
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9

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
      checking.value = false
    }
<<<<<<< HEAD

    // 自己的逾時控制器：健康檢查的 timer 在上面的 finally 已經清掉，
    // 沿用它的 signal 等於這支請求完全沒有逾時保護，後端卡住就會一直懸著。
    const metricsController = new AbortController()
    const metricsTimer = setTimeout(() => metricsController.abort(), TIMEOUT_MS)
    try {
      const metrics = await fetchAdminMetrics(metricsController.signal)
      dbPool.value = metrics?.dbPool ?? null
      requests.value = metrics?.requests ?? null
    } finally {
      clearTimeout(metricsTimer)
    }
=======
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  }

  void check()
  const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS)
  onScopeDispose(() => window.clearInterval(timer))

  /** 已接上的監控項 */
  function liveMonitors(): MonitorReading[] {
<<<<<<< HEAD
    return [
      backendMonitor(
        responseMs.value,
        checkedAt.value,
        adminSettings.value.responseOkMs,
        adminSettings.value.responseDegradedMs,
      ),
      dbPoolMonitor(dbPool.value),
      errorRateMonitor(requests.value),
    ]
=======
    return [backendMonitor(responseMs.value, checkedAt.value)]
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  }

  /**
   * 尚未接上的監控項。
   *
<<<<<<< HEAD
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
    check,
    liveMonitors,
    pendingMonitors,
  }
=======
   * 後端補上 metrics 端點後，把這裡換成真正的讀取即可 —— 畫面不用動，
   * 因為它讀的是同一個 MonitorReading 形狀。
   */
  function pendingMonitors(): MonitorReading[] {
    return [
      pendingMonitor(
        'db-pool',
        '資料庫連線池',
        '使用中連線數、等待數與逾時次數',
        '待後端提供 metrics 端點後自動顯示',
      ),
      pendingMonitor(
        'error-rate',
        'API 錯誤率',
        '近一小時 5xx 與 4xx 佔比',
        '待後端提供 metrics 端點後自動顯示',
      ),
    ]
  }

  return { responseMs, checkedAt, checking, check, liveMonitors, pendingMonitors }
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
}
