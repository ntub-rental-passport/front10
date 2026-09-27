import { describe, expect, it } from 'vitest'

import { seedAuditEvents, type AuditEvent } from '@/src/mocks/admin-seed'
import type { ServerAuditEvent } from '@/src/services/adminAuditApi'
import type { MonitorEvent } from './admin-monitoring-report'
import {
  actorLabel,
  emptyAuditFilter,
  filterAuditRows,
  fromLocalEvent,
  fromMonitorEvent,
  fromServerEvent,
  isAuditFilterActive,
  latestSuspension,
  mergeAuditRows,
  suspensionNote,
  type AuditRow,
} from './admin-audit-sources'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString()

function server(overrides: Partial<ServerAuditEvent> = {}): ServerAuditEvent {
  return {
    id: 1,
    at: at(27, 16, 2),
    actor: 'admin@rentmate.tw',
    action: '使用者管理',
    target: 'tenant@example.com',
    detail: '停用帳號',
    subject: 'user:12',
    ip: null,
    ...overrides,
  }
}

function monitor(overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  return {
    id: 7,
    at: at(27, 13, 15),
    service: 'ocr',
    serviceLabel: 'OCR 服務',
    kind: 'down',
    detail: '連線逾時',
    durationSeconds: null,
    ...overrides,
  }
}

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'x',
    at: at(27, 12),
    actor: 'admin@rentmate.tw',
    action: '內容管理',
    target: '常見問題',
    detail: '更新條目',
    source: 'local',
    ...overrides,
  }
}

describe('來源', () => {
  it('後端紀錄的 IP 併進詳情，用 IP 也搜得到', () => {
    const converted = fromServerEvent(server({ action: '登入', detail: '管理員登入', ip: '203.0.113.7' }))
    expect(converted.detail).toBe('管理員登入（IP 203.0.113.7）')
    expect(converted.source).toBe('server')
  })

  it('種子資料標成展示資料，logAction 寫的是本機', () => {
    const [seed] = seedAuditEvents()
    expect(fromLocalEvent(seed!).source).toBe('demo')
    const logged: AuditEvent = { ...seed!, id: 'ev-mg3k2p-a1b2' }
    expect(fromLocalEvent(logged).source).toBe('local')
  })

  it('操作者 system 顯示成「系統」', () => {
    expect(actorLabel('system')).toBe('系統')
    expect(actorLabel('admin@rentmate.tw')).toBe('admin@rentmate.tw')
  })
})

describe('fromMonitorEvent', () => {
  it('斷線與恢復各自一列，恢復那列寫出斷了多久', () => {
    expect(fromMonitorEvent(monitor())).toMatchObject({
      actor: 'system',
      action: '服務狀態',
      target: 'OCR 服務',
      detail: '斷線：連線逾時',
    })
    expect(fromMonitorEvent(monitor({ kind: 'recovered', detail: null, durationSeconds: 1500 }))?.detail).toBe(
      '恢復，斷線 25 分鐘',
    )
  })

  it('後端停機的恢復時間由時長推出', () => {
    const converted = fromMonitorEvent(
      monitor({ kind: 'backend-downtime', service: 'backend', serviceLabel: '後端', detail: null, at: at(26, 16, 40), durationSeconds: 8 * 3600 }),
    )
    expect(converted?.target).toBe('後端')
    expect(converted?.detail).toBe('停機約 8 小時，9/27 00:40 恢復（重新部署、當機或主機休眠）')
  })

  it('5xx 與通知失敗不收：前者是雜訊，後者由後端操作紀錄記', () => {
    expect(fromMonitorEvent(monitor({ kind: 'server-error' }))).toBeNull()
    expect(fromMonitorEvent(monitor({ kind: 'notification-failed' }))).toBeNull()
    expect(fromMonitorEvent(monitor({ kind: 'notification-missed' }))).toBeNull()
  })
})

describe('mergeAuditRows', () => {
  it('三個來源依時間新到舊排在一起', () => {
    const merged = mergeAuditRows(
      [row({ id: 'a', at: at(27, 9) })],
      [row({ id: 'b', at: at(27, 11) })],
      [row({ id: 'c', at: at(27, 10) })],
    )
    expect(merged.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('filterAuditRows', () => {
  const rows = [
    row({ id: 'sys', actor: 'system', action: '服務狀態', target: 'OCR 服務', detail: '斷線：連不上', at: at(27, 13) }),
    row({ id: 'old', at: at(20, 9) }),
    // 後端的時間格式：+00:00 結尾、帶微秒 —— 跟瀏覽器的 Z 結尾混在一起也要比得對
    row({ id: 'server', at: '2026-09-25T02:00:00.123456+00:00' }),
  ]

  it('搜「系統」找得到操作者是 system 的列', () => {
    expect(filterAuditRows(rows, { ...emptyAuditFilter(), keyword: '系統' }).map((r) => r.id)).toEqual(['sys'])
  })

  it('依動作類型篩', () => {
    expect(filterAuditRows(rows, { ...emptyAuditFilter(), action: '服務狀態' }).map((r) => r.id)).toEqual(['sys'])
  })

  it('日期區間用數值比，兩種時間格式都對', () => {
    const filtered = filterAuditRows(rows, { ...emptyAuditFilter(), fromDate: '2026-09-25', toDate: '2026-09-26' })
    expect(filtered.map((r) => r.id)).toEqual(['server'])
  })

  it('有沒有在篩選', () => {
    expect(isAuditFilterActive(emptyAuditFilter())).toBe(false)
    expect(isAuditFilterActive({ ...emptyAuditFilter(), keyword: '  ' })).toBe(false)
    expect(isAuditFilterActive({ ...emptyAuditFilter(), toDate: '2026-09-27' })).toBe(true)
  })
})

describe('latestSuspension', () => {
  it('最近一次狀態變更是停用才回傳，原因與操作者都在', () => {
    const entries = [
      server({ at: at(20, 9), detail: '停用帳號：舊的原因' }),
      server({ at: at(21, 9), detail: '啟用帳號' }),
      server({ at: at(27, 16, 2), detail: '停用帳號：多次發布不當內容' }),
    ]
    const latest = latestSuspension(entries)
    expect(latest?.detail).toBe('停用帳號：多次發布不當內容')
    expect(suspensionNote(latest!)).toBe('停用帳號：多次發布不當內容（admin@rentmate.tw，9/27 16:02）')
  })

  it('已經被啟用的人不再掛著舊的停用原因', () => {
    const entries = [server({ at: at(20, 9), detail: '停用帳號：舊的原因' }), server({ at: at(21, 9), detail: '啟用帳號' })]
    expect(latestSuspension(entries)).toBeNull()
  })

  it('其他類的紀錄（登入、通知）不算狀態變更', () => {
    const entries = [
      server({ at: at(20, 9), detail: '停用帳號' }),
      server({ at: at(27, 9), action: '登入', detail: '管理員登入' }),
    ]
    expect(latestSuspension(entries)?.detail).toBe('停用帳號')
  })
})
