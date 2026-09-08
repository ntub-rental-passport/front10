import { onScopeDispose, ref } from 'vue'
import {
  backendMonitor,
  pendingMonitor,
  type MonitorReading,
} from '@/src/utils/admin-monitoring'
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
 * 只量前端自己就能量的東西 —— 後端是否回應、往返時間。
 * 資料庫連線池與錯誤率需要後端提供 metrics 端點，端點還沒有之前，
 * 這裡回傳 `pendingMonitor` 讓畫面顯示空狀態，而不是編一個數字出來。
 */
export function useSystemHealth() {
  const responseMs = ref<number | null>(null)
  const checkedAt = ref<string | null>(null)
  const checking = ref(false)

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
  }

  void check()
  const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS)
  onScopeDispose(() => window.clearInterval(timer))

  /** 已接上的監控項 */
  function liveMonitors(): MonitorReading[] {
    return [
      backendMonitor(
        responseMs.value,
        checkedAt.value,
        adminSettings.value.responseOkMs,
        adminSettings.value.responseDegradedMs,
      ),
    ]
  }

  /**
   * 尚未接上的監控項。
   *
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
}
