import { describe, expect, it } from 'vitest'

import {
  backendMonitor,
  classifyResponseTime,
  formatResponseTime,
  pendingMonitor,
} from './admin-monitoring'

// 測試固定沿用種子預設值，不直接依賴 mocks/admin/settings —— 純邏輯檔的測試不該跟 collection 耦合
const OK_MS = 300
const DEGRADED_MS = 1000

describe('classifyResponseTime', () => {
  it('快於門檻算正常', () => {
    expect(classifyResponseTime(0, OK_MS, DEGRADED_MS)).toBe('ok')
    expect(classifyResponseTime(OK_MS - 1, OK_MS, DEGRADED_MS)).toBe('ok')
  })

  it('介於兩個門檻之間算緩慢', () => {
    expect(classifyResponseTime(OK_MS, OK_MS, DEGRADED_MS)).toBe('degraded')
    expect(classifyResponseTime(DEGRADED_MS - 1, OK_MS, DEGRADED_MS)).toBe('degraded')
  })

  it('超過上限算無回應', () => {
    expect(classifyResponseTime(DEGRADED_MS, OK_MS, DEGRADED_MS)).toBe('down')
    expect(classifyResponseTime(5000, OK_MS, DEGRADED_MS)).toBe('down')
  })

  it('量測失敗算無回應，而不是尚未接上', () => {
    // 這兩者語意不同：量不到是故障，尚未接上是還沒實作
    expect(classifyResponseTime(null, OK_MS, DEGRADED_MS)).toBe('down')
    expect(classifyResponseTime(null, OK_MS, DEGRADED_MS)).not.toBe('unavailable')
  })

  it('門檻可調整：正常門檻拉高後，原本算緩慢的回應改判為正常', () => {
    expect(classifyResponseTime(500, 600, 1000)).toBe('ok')
  })
})

describe('formatResponseTime', () => {
  it('四捨五入到整數毫秒', () => {
    expect(formatResponseTime(12.4)).toBe('12 ms')
    expect(formatResponseTime(12.6)).toBe('13 ms')
  })

  it('量測失敗顯示破折號而非 0', () => {
    expect(formatResponseTime(null)).toBe('—')
  })
})

describe('backendMonitor', () => {
  it('量到時給值並標記為已接上', () => {
    const reading = backendMonitor(120, '10:00', OK_MS, DEGRADED_MS)
    expect(reading.state).toBe('ok')
    expect(reading.value).toBe('120 ms')
    expect(reading.connected).toBe(true)
    expect(reading.detail).toContain('10:00')
  })

  it('連不上時說明要檢查後端，而不是留白', () => {
    const reading = backendMonitor(null, null, OK_MS, DEGRADED_MS)
    expect(reading.state).toBe('down')
    expect(reading.value).toBe('—')
    expect(reading.detail).toContain('後端')
  })
})

describe('pendingMonitor', () => {
  it('未接上的項目沒有值，且明確標記 connected 為 false', () => {
    const reading = pendingMonitor('db', '資料庫連線池', '連線數與等待數', '待後端提供端點')
    expect(reading.state).toBe('unavailable')
    expect(reading.value).toBeNull()
    expect(reading.connected).toBe(false)
  })
})
