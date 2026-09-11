import { describe, expect, it } from 'vitest'

import {
  backendMonitor,
  classifyResponseTime,
  dbPoolMonitor,
  errorRateMonitor,
  formatResponseTime,
  pendingMonitor,
  type DbPoolSnapshot,
  type RequestSnapshot,
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

describe('dbPoolMonitor', () => {
  const pool = (over: Partial<DbPoolSnapshot> = {}): DbPoolSnapshot => ({
    configured: true,
    size: 10,
    maxOverflow: 20,
    capacity: 30,
    inUse: 3,
    idle: 2,
    overflowInUse: 0,
    utilization: 0.1,
    ...over,
  })

  it('讀取失敗算 down，不是「尚未接上」', () => {
    const reading = dbPoolMonitor(null)
    expect(reading.state).toBe('down')
    expect(reading.connected).toBe(true)
  })

  it('後端沒設定資料庫時是 unavailable，那不是故障', () => {
    expect(dbPoolMonitor({ configured: false }).state).toBe('unavailable')
  })

  it('使用率低時正常，並顯示「使用中 / 總量」', () => {
    const reading = dbPoolMonitor(pool())
    expect(reading.state).toBe('ok')
    expect(reading.value).toBe('3 / 30')
  })

  it('使用率跨過門檻會升級為 degraded 與 down', () => {
    expect(dbPoolMonitor(pool({ utilization: 0.8 })).state).toBe('degraded')
    expect(dbPoolMonitor(pool({ utilization: 0.95 })).state).toBe('down')
  })
})

describe('errorRateMonitor', () => {
  const req = (over: Partial<RequestSnapshot> = {}): RequestSnapshot => ({
    windowMinutes: 60,
    total: 1000,
    clientErrors: 0,
    serverErrors: 0,
    errorRate: 0,
    serverErrorRate: 0,
    ...over,
  })

  it('讀取失敗算 down', () => {
    expect(errorRateMonitor(null).state).toBe('down')
  })

  it('沒有流量時顯示「無流量」而不是 0%', () => {
    const reading = errorRateMonitor(req({ total: 0 }))
    expect(reading.state).toBe('ok')
    expect(reading.value).toBe('—')
    expect(reading.detail).toContain('無流量')
  })

  it('大量 4xx 不會被判定成故障——那是防護生效，不是系統有病', () => {
    const scanned = req({ clientErrors: 900, errorRate: 0.9, serverErrorRate: 0 })
    expect(errorRateMonitor(scanned).state).toBe('ok')
    expect(errorRateMonitor(scanned).detail).toContain('4xx 900 筆')
  })

  it('5xx 跨過門檻才升級狀態', () => {
    expect(errorRateMonitor(req({ serverErrors: 50, serverErrorRate: 0.05 })).state).toBe('degraded')
    expect(errorRateMonitor(req({ serverErrors: 200, serverErrorRate: 0.2 })).state).toBe('down')
  })
})
