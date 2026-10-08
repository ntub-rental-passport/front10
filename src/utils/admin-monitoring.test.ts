import { describe, expect, it } from 'vitest'

import {
  RAG_SERVICE,
  SERVICE_STALE_MS,
  backendMonitor,
  classifyResponseTime,
  databaseMonitor,
  dbPoolMonitor,
  errorRateMonitor,
  formatDuration,
  formatPairedTime,
  formatResponseTime,
  formatShortDateTime,
  formatTimeAgo,
  pendingMonitor,
  serviceMonitor,
  type DbPoolSnapshot,
  type RequestSnapshot,
  type ServiceState,
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

describe('後端回傳壞掉的數字時', () => {
  // 這兩個案例不是假想的：後端是獨立的服務，改個欄位名就會長這樣。
  // 三元運算的門檻判斷跟 NaN 比都是 false，會一路掉到最後一個分支
  // 靜靜變成 down —— 一個假的紅燈，比沒有燈更糟。

  it('錯誤率不是數字時回 unavailable，不是 down', () => {
    const reading = errorRateMonitor({
      windowMinutes: 60,
      total: 600,
      clientErrors: 4,
      serverErrors: 30,
      errorRate: 0.05,
      serverErrorRate: undefined as unknown as number,
    })
    expect(reading.state).toBe('unavailable')
    expect(reading.value).toBeNull()
  })

  it('錯誤率壞掉時不會印出 NaN%', () => {
    const reading = errorRateMonitor({
      windowMinutes: 60,
      total: 600,
      clientErrors: 4,
      serverErrors: 30,
      errorRate: 0.05,
      serverErrorRate: Number.NaN,
    })
    expect(reading.value ?? '').not.toContain('NaN')
  })

  it('連線池使用率不是數字時回 unavailable', () => {
    const reading = dbPoolMonitor({
      configured: true,
      capacity: 30,
      inUse: 24,
      utilization: Number.NaN,
    })
    expect(reading.state).toBe('unavailable')
  })

  it('utilization 沒給仍然當 0（舊版後端是合理的）', () => {
    // 「沒有這個欄位」跟「這個欄位是垃圾」要分開處理
    const reading = dbPoolMonitor({ configured: true, capacity: 30, inUse: 0 })
    expect(reading.state).toBe('ok')
  })
})

/* -------------------- 後端探測的服務 -------------------- */

// 用本地時間建構，測試不管在哪個時區跑都一樣
const NOW = new Date(2026, 8, 27, 12, 0)
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

function probe(overrides: Partial<ServiceState> = {}): ServiceState {
  return {
    service: 'rag',
    label: '檢索備援（RAG）',
    status: 'up',
    since: minutesAgo(3 * 24 * 60),
    detail: null,
    checkedAt: minutesAgo(1),
    ...overrides,
  }
}

describe('formatDuration', () => {
  it('只留兩個單位，整數時省略零頭', () => {
    expect(formatDuration(20)).toBe('不到 1 分鐘')
    expect(formatDuration(5 * 60)).toBe('5 分鐘')
    expect(formatDuration(2 * 3600)).toBe('2 小時')
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 小時 5 分')
    expect(formatDuration(3 * 86400 + 4 * 3600 + 59)).toBe('3 天 4 小時')
    expect(formatDuration(2 * 86400)).toBe('2 天')
  })

  it('負數（時鐘不同步）當成零，不要印出「-3 分鐘」', () => {
    expect(formatDuration(-180)).toBe('不到 1 分鐘')
  })
})

describe('formatShortDateTime／formatPairedTime', () => {
  it('短格式不帶年份，時與分補零', () => {
    expect(formatShortDateTime(new Date(2026, 8, 7, 9, 5).toISOString())).toBe('9/7 09:05')
  })

  it('跟 anchor 同一天只寫時分，跨日才帶日期', () => {
    const start = new Date(2026, 8, 26, 23, 10).toISOString()
    expect(formatPairedTime(start, new Date(2026, 8, 26, 23, 40).toISOString())).toBe('23:40')
    expect(formatPairedTime(start, new Date(2026, 8, 27, 7, 12).toISOString())).toBe('9/27 07:12')
  })

  it('讀不懂的時間顯示破折號，不顯示 NaN', () => {
    expect(formatShortDateTime('not-a-date')).toBe('—')
  })
})

describe('formatTimeAgo', () => {
  it('一分鐘內是剛剛，之後沿用 formatDuration', () => {
    expect(formatTimeAgo(minutesAgo(0.3), NOW)).toBe('剛剛')
    expect(formatTimeAgo(minutesAgo(3), NOW)).toBe('3 分鐘前')
    expect(formatTimeAgo(minutesAgo(125), NOW)).toBe('2 小時 5 分前')
  })

  it('未來的時間當成剛剛，沒有值就是破折號', () => {
    expect(formatTimeAgo(minutesAgo(-2), NOW)).toBe('剛剛')
    expect(formatTimeAgo(null, NOW)).toBe('—')
  })
})

describe('serviceMonitor', () => {
  it('在線：寫「自某時起正常」，不宣稱「連續在線」', () => {
    const reading = serviceMonitor([probe()], RAG_SERVICE, NOW)
    expect(reading.state).toBe('ok')
    expect(reading.value).toBe('在線')
    expect(reading.detail).toBe(`自 ${formatShortDateTime(minutesAgo(3 * 24 * 60))} 起正常`)
    expect(reading.detail).not.toContain('連續')
  })

  it('斷線：大字是原因，下面寫從什麼時候開始、已經多久', () => {
    const reading = serviceMonitor(
      [probe({ status: 'down', detail: '連線逾時', since: minutesAgo(42) })],
      RAG_SERVICE,
      NOW,
    )
    expect(reading.state).toBe('down')
    expect(reading.value).toBe('連線逾時')
    expect(reading.detail).toContain('已 42 分鐘')
  })

  it('後端沒探測（沒設定位址）是「未設定」，不是掛了', () => {
    const reading = serviceMonitor([], RAG_SERVICE, NOW)
    expect(reading.state).toBe('unavailable')
    expect(reading.stateLabel).toBe('未設定')
    expect(reading.detail).toContain('LOCAL_EMBEDDING_URL')
  })

  it('讀不到監控數據時是「無法取得」', () => {
    const reading = serviceMonitor(null, RAG_SERVICE, NOW)
    expect(reading.state).toBe('unavailable')
    expect(reading.stateLabel).toBe('無法取得')
  })

  it('檢查時間太舊就是資料過期', () => {
    const staleMinutes = SERVICE_STALE_MS / 60_000 + 1
    const reading = serviceMonitor([probe({ checkedAt: minutesAgo(staleMinutes) })], RAG_SERVICE, NOW)
    expect(reading.state).toBe('unavailable')
    expect(reading.stateLabel).toBe('資料過期')
    expect(reading.value).toBeNull()
  })

  it('斷線但資料過期時不報紅', () => {
    const reading = serviceMonitor(
      [probe({ status: 'down', detail: '連不上', checkedAt: minutesAgo(60) })],
      RAG_SERVICE,
      NOW,
    )
    expect(reading.state).toBe('unavailable')
  })
})

describe('databaseMonitor', () => {
  const pool: DbPoolSnapshot = { configured: true, capacity: 15, inUse: 0, idle: 5, utilization: 0 }

  it('探測正常時照連線池的判定', () => {
    const reading = databaseMonitor(pool, [probe({ service: 'database' })], NOW)
    expect(reading.state).toBe('ok')
    expect(reading.value).toBe('0 / 15')
    expect(reading.label).toBe('資料庫')
  })

  it('連線池一片綠但探測連不上：以探測為準', () => {
    const reading = databaseMonitor(
      pool,
      [probe({ service: 'database', status: 'down', detail: '連線逾時', since: minutesAgo(5) })],
      NOW,
    )
    expect(reading.state).toBe('down')
    expect(reading.value).toBe('連線逾時')
  })

  it('沒有探測資料時退回只看連線池', () => {
    expect(databaseMonitor(pool, null, NOW).state).toBe('ok')
  })
})
