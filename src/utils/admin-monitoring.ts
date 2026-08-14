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

/** 回應時間的分級門檻（毫秒） */
export const RESPONSE_OK_MS = 300
export const RESPONSE_DEGRADED_MS = 1000

/**
 * 依回應時間分級。
 *
 * `null` 代表這次量測失敗（連不上、逾時），直接算 down —— 量不到本身就是資訊，
 * 不該退化成「尚未接上」，那是給還沒實作的項目用的。
 */
export function classifyResponseTime(ms: number | null): MonitorState {
  if (ms === null) return 'down'
  if (ms < RESPONSE_OK_MS) return 'ok'
  if (ms < RESPONSE_DEGRADED_MS) return 'degraded'
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
export function backendMonitor(responseMs: number | null, checkedAt: string | null): MonitorReading {
  const state = classifyResponseTime(responseMs)
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
