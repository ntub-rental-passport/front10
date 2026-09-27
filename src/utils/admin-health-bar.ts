/**
 * 後台總覽「系統健康條」。純邏輯，不依賴 Vue。
 *
 * 門檻判斷全部沿用既有的 admin-monitoring.ts（dbPoolMonitor／errorRateMonitor／
 * pendingMonitor），這裡只多做一件事：把 MonitorReading 轉成 StatusDot 看得懂的
 * tone，並決定圓點旁邊要顯示的文字。
 *
 * ⚠️ 讀不到（down）或尚未接上（unavailable）一律顯示「無法取得」，絕對不顯示假的
 * 綠燈——一個永遠正常的健康指示器比沒有指示器更危險。tone 仍區分 danger／idle：
 * danger 是「量過但失敗」，idle 是「這項還沒接後端」，顏色不同但文字故意一樣誠實。
 *
 * 第三項原本是「LLM Provider」的佔位（當時後端沒有這項檢查）。2026-09 後端的
 * 背景迴圈開始每 60 秒探測桌機的 AI 模型，這裡改接真實狀態，判定與系統監控頁
 * 共用 serviceMonitor —— 兩頁不會一邊說在線、一邊說連不上。
 */

import {
  LLM_DESKTOP_SERVICE,
  MONITOR_STATE_TONE,
  databaseMonitor,
  errorRateMonitor,
  serviceMonitor,
  type DbPoolSnapshot,
  type MonitorReading,
  type RequestSnapshot,
  type ServiceState,
} from './admin-monitoring'
import type { StatusDotTone } from '@/src/components/admin/status-dot'

export interface HealthBarItem {
  id: string
  name: string
  tone: StatusDotTone
  statusText: string
}

/** 讀不到數字時的文字。「未設定」「資料過期」比一律「無法取得」更說得出原因 */
function statusTextOf(reading: MonitorReading): string {
  if (reading.connected && reading.value !== null) return reading.value
  return reading.stateLabel ?? '無法取得'
}

function toHealthBarItem(reading: MonitorReading): HealthBarItem {
  return {
    id: reading.id,
    name: reading.label,
    tone: MONITOR_STATE_TONE[reading.state],
    statusText: statusTextOf(reading),
  }
}

/**
 * `services` 是 null 代表讀不到後端的監控數據；`now` 應該是伺服器時間
 * （useSystemHealth 的 serverNow），用來判斷探測結果是不是過期了。
 */
export function buildHealthBarItems(
  dbPool: DbPoolSnapshot | null,
  requests: RequestSnapshot | null,
  services: ServiceState[] | null = null,
  now: Date = new Date(),
): HealthBarItem[] {
  return [
    databaseMonitor(dbPool, services, now),
    errorRateMonitor(requests),
    serviceMonitor(services, LLM_DESKTOP_SERVICE, now),
  ].map(toHealthBarItem)
}
