/**
 * 系統監控的判定邏輯。純邏輯，不依賴 Vue。
 *
 * 這頁刻意分成「量得到」與「還沒接上」兩種項目：
 * 量得到的（後端存活、API 回應時間）現在就顯示真值；
 * 還沒接上的（資料庫連線池、錯誤率）顯示空狀態，**不填假數字**。
 *
 * 假的健康度數字比沒有數字更糟 —— 它永遠顯示正常，看了也不能信，
 * 等真的接上後數值對不起來，反而會懷疑是不是接錯。
 */

export type MonitorState = 'ok' | 'degraded' | 'down' | 'unavailable'

export const monitorStateLabels: Record<MonitorState, string> = {
  ok: '正常',
  degraded: '緩慢',
  down: '無回應',
  unavailable: '尚未接上',
}

/**
 * 依回應時間分級。
 *
 * `null` 代表這次量測失敗（連不上、逾時），直接算 down —— 量不到本身就是資訊，
 * 不該退化成「尚未接上」，那是給還沒實作的項目用的。
 *
 * 門檻由呼叫端傳入（來自系統設定的 responseOkMs / responseDegradedMs）——
 * 這個檔案是純邏輯，不能自己去讀設定 collection。
 */
export function classifyResponseTime(
  ms: number | null,
  okMs: number,
  degradedMs: number,
): MonitorState {
  if (ms === null) return 'down'
  if (ms < okMs) return 'ok'
  if (ms < degradedMs) return 'degraded'
  return 'down'
}

export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '—'
  return `${Math.round(ms)} ms`
}

export interface MonitorReading {
  id: string
  label: string
  description: string
  state: MonitorState
  /** 主要顯示值；尚未接上時為 null */
  value: string | null
  detail: string
  /** 後端端點是否已存在。false 時畫面顯示空狀態而非數字。 */
  connected: boolean
}

/** 尚未接上的監控項目，資料形狀先定義好，之後只要換掉來源就會亮起來 */
export function pendingMonitor(
  id: string,
  label: string,
  description: string,
  detail: string,
): MonitorReading {
  return {
    id,
    label,
    description,
    state: 'unavailable',
    value: null,
    detail,
    connected: false,
  }
}

/** 從一次量測結果組出後端服務的監控項 */
export function backendMonitor(
  responseMs: number | null,
  checkedAt: string | null,
  okMs: number,
  degradedMs: number,
): MonitorReading {
  const state = classifyResponseTime(responseMs, okMs, degradedMs)
  return {
    id: 'backend',
    label: '後端服務',
    description: 'FastAPI 是否回應，以及往返時間',
    state,
    value: formatResponseTime(responseMs),
    detail:
      responseMs === null
        ? '連線失敗，請確認後端是否啟動'
        : checkedAt
          ? `最後量測 ${checkedAt}`
          : '',
    connected: true,
  }
}

/**
 * 後端 /api/admin/metrics 的回傳形狀。
 *
 * 後端刻意只給「量得到的事實」，健不健康的判定在這裡做 ——
 * 門檻是營運政策（幾 % 算異常會隨經驗調整），寫在前端改起來不用重新部署後端。
 */
export interface DbPoolSnapshot {
  configured: boolean
  size?: number
  maxOverflow?: number
  capacity?: number
  inUse?: number
  idle?: number
  overflowInUse?: number
  utilization?: number
}

export interface RequestSnapshot {
  windowMinutes: number
  total: number
  clientErrors: number
  serverErrors: number
  errorRate: number
  serverErrorRate: number
}

/** 連線池使用率門檻：超過就代表離「連線耗盡、請求開始排隊」不遠了 */
export const POOL_OK_RATIO = 0.7
export const POOL_DEGRADED_RATIO = 0.9

/** 錯誤率門檻。用 5xx 而非全部錯誤判定 —— 見 errorRateMonitor 說明 */
export const ERROR_OK_RATIO = 0.02
export const ERROR_DEGRADED_RATIO = 0.1

/**
 * 資料庫連線池的監控項。
 *
 * `null` 代表這次讀取失敗（後端掛了、權限不足），算 down；
 * 後端有回應但沒設定資料庫，則是 unavailable —— 那不是故障，是沒接。
 */
export function dbPoolMonitor(snapshot: DbPoolSnapshot | null): MonitorReading {
  const base = {
    id: 'db-pool',
    label: '資料庫連線池',
    description: '使用中連線數與可用上限',
  }

  if (snapshot === null) {
    return { ...base, state: 'down' as const, value: null, detail: '讀取失敗，請確認後端狀態', connected: true }
  }
  if (!snapshot.configured) {
    return { ...base, state: 'unavailable' as const, value: null, detail: '後端未設定資料庫連線', connected: false }
  }

  const ratio = snapshot.utilization ?? 0
  const state = ratio < POOL_OK_RATIO ? 'ok' : ratio < POOL_DEGRADED_RATIO ? 'degraded' : 'down'

  return {
    ...base,
    state,
    value: `${snapshot.inUse ?? 0} / ${snapshot.capacity ?? 0}`,
    detail:
      `閒置 ${snapshot.idle ?? 0}、超額使用 ${snapshot.overflowInUse ?? 0}` +
      `（池 ${snapshot.size ?? 0} + 可追加 ${snapshot.maxOverflow ?? 0}）`,
    connected: true,
  }
}

/**
 * API 錯誤率的監控項。
 *
 * **以 5xx 判定狀態，不用全部錯誤。** 4xx 多半是使用者自己輸錯密碼、
 * 或掃描器在探測不存在的路徑 —— 那是防護正在生效，不是系統有病。
 * 把 4xx 算進健康度，網站被掃描時反而會顯示成故障。
 * 4xx 仍然顯示出來供參考，只是不影響判定。
 *
 * 時間窗內沒有任何請求時顯示「無流量」而非 0%：
 * 沒資料和「有流量且零錯誤」是兩件事，混在一起看不出後端其實沒人在用。
 */
export function errorRateMonitor(snapshot: RequestSnapshot | null): MonitorReading {
  const base = {
    id: 'error-rate',
    label: 'API 錯誤率',
    description: '近一小時 5xx 佔比（4xx 另計，不影響判定）',
  }

  if (snapshot === null) {
    return { ...base, state: 'down' as const, value: null, detail: '讀取失敗，請確認後端狀態', connected: true }
  }
  if (snapshot.total === 0) {
    return {
      ...base,
      state: 'ok' as const,
      value: '—',
      detail: `近 ${snapshot.windowMinutes} 分鐘無流量`,
      connected: true,
    }
  }

  const ratio = snapshot.serverErrorRate
  const state = ratio < ERROR_OK_RATIO ? 'ok' : ratio < ERROR_DEGRADED_RATIO ? 'degraded' : 'down'

  return {
    ...base,
    state,
    value: `${(ratio * 100).toFixed(1)}%`,
    detail:
      `近 ${snapshot.windowMinutes} 分鐘 ${snapshot.total} 筆請求，` +
      `5xx ${snapshot.serverErrors} 筆、4xx ${snapshot.clientErrors} 筆`,
    connected: true,
  }
}
