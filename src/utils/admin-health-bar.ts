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
 * LLM provider 目前沒有對應的後端端點（/api/admin/metrics 只回 dbPool 與
 * requests），用 pendingMonitor 佔位——形狀跟其他兩項一致，之後後端補上端點時
 * 只要換掉這裡的資料來源，畫面不用動。
 */

import {
  dbPoolMonitor,
  errorRateMonitor,
  pendingMonitor,
  type DbPoolSnapshot,
  type MonitorReading,
  type MonitorState,
  type RequestSnapshot,
} from './admin-monitoring'
import type { StatusDotTone } from '@/src/components/admin/status-dot'

export interface HealthBarItem {
  id: string
  name: string
  tone: StatusDotTone
  statusText: string
}

const TONE_BY_STATE: Record<MonitorState, StatusDotTone> = {
  ok: 'ok',
  degraded: 'warn',
  down: 'danger',
  unavailable: 'idle',
}

function statusTextOf(reading: MonitorReading): string {
  if (reading.connected && reading.value !== null) return reading.value
  return '無法取得'
}

function toHealthBarItem(reading: MonitorReading): HealthBarItem {
  return {
    id: reading.id,
    name: reading.label,
    tone: TONE_BY_STATE[reading.state],
    statusText: statusTextOf(reading),
  }
}

export function buildHealthBarItems(
  dbPool: DbPoolSnapshot | null,
  requests: RequestSnapshot | null,
): HealthBarItem[] {
  return [
    dbPoolMonitor(dbPool),
    errorRateMonitor(requests),
    pendingMonitor(
      'llm-provider',
      'LLM Provider',
      'AI 生成服務目前是否可用',
      '後端尚未提供 LLM provider 的健康檢查端點',
    ),
  ].map(toHealthBarItem)
}
