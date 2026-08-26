import { describe, expect, it } from 'vitest'

import {
  adminQueueReason,
  canTransition,
  elapsedDays,
  isInAdminQueue,
  isStatusDrivenQueueReason,
  maintenanceStatusLabels,
  maintenanceTransitions,
  migrateMaintenanceQueueFlags,
  type AdminQueueTicket,
  type MaintenanceStatus,
} from './admin-maintenance'

describe('canTransition', () => {
  it('允許轉換表內的狀態變更', () => {
    expect(canTransition('submitted', 'notified')).toBe(true)
    expect(canTransition('notified', 'in_progress')).toBe(true)
    expect(canTransition('completed', 'closed')).toBe(true)
  })

  it('拒絕轉換表外的狀態變更', () => {
    expect(canTransition('submitted', 'completed')).toBe(false)
    expect(canTransition('closed', 'in_progress')).toBe(false)
  })

  it('終態沒有任何後續狀態', () => {
    expect(maintenanceTransitions.closed).toEqual([])
  })

  it('每個狀態都有標籤與轉換表項目', () => {
    const statuses = Object.keys(maintenanceStatusLabels) as MaintenanceStatus[]
    for (const status of statuses) {
      expect(maintenanceTransitions[status]).toBeDefined()
    }
  })
})

describe('elapsedDays', () => {
  it('計算整日數差', () => {
    const now = new Date('2026-08-10T09:00:00')
    expect(elapsedDays('2026-08-01T23:00:00', now)).toBe(9)
    expect(elapsedDays('2026-08-10T01:00:00', now)).toBe(0)
  })

  it('未來的時間回傳負數', () => {
    const now = new Date('2026-08-10T09:00:00')
    expect(elapsedDays('2026-08-12T09:00:00', now)).toBe(-2)
  })

  it('無效日期回傳 0', () => {
    expect(elapsedDays('not-a-date')).toBe(0)
  })
})

function ticketOf(overrides: Partial<AdminQueueTicket>): AdminQueueTicket {
  return {
    status: 'notified',
    interventionRequested: false,
    manuallyQueued: false,
    ...overrides,
  }
}

describe('isInAdminQueue', () => {
  it('爭議中的工單在佇列內', () => {
    expect(isInAdminQueue(ticketOf({ status: 'disputed' }))).toBe(true)
  })

  it('使用者要求介入的工單在佇列內', () => {
    expect(isInAdminQueue(ticketOf({ interventionRequested: true }))).toBe(true)
  })

  it('管理員手動加入的工單在佇列內', () => {
    expect(isInAdminQueue(ticketOf({ manuallyQueued: true }))).toBe(true)
  })

  it('三個條件都不成立時不在佇列內', () => {
    expect(isInAdminQueue(ticketOf({}))).toBe(false)
  })

  it('disputed 解除後若其他兩個條件也不成立，自動離開佇列', () => {
    const ticket = ticketOf({ status: 'disputed' })
    const resolved: AdminQueueTicket = { ...ticket, status: 'in_progress' }
    expect(isInAdminQueue(resolved)).toBe(false)
  })
})

describe('adminQueueReason', () => {
  it('三種原因都不成立時回傳 null', () => {
    expect(adminQueueReason(ticketOf({}))).toBeNull()
  })

  it('只有爭議中成立時回傳 disputed', () => {
    expect(adminQueueReason(ticketOf({ status: 'disputed' }))).toBe('disputed')
  })

  it('只有使用者要求介入成立時回傳 intervention_requested', () => {
    expect(adminQueueReason(ticketOf({ interventionRequested: true }))).toBe(
      'intervention_requested',
    )
  })

  it('只有手動加入成立時回傳 manually_queued', () => {
    expect(adminQueueReason(ticketOf({ manuallyQueued: true }))).toBe('manually_queued')
  })

  it('多個原因同時成立時，爭議中優先於使用者要求，使用者要求優先於手動加入', () => {
    expect(
      adminQueueReason(
        ticketOf({ status: 'disputed', interventionRequested: true, manuallyQueued: true }),
      ),
    ).toBe('disputed')
    expect(
      adminQueueReason(ticketOf({ interventionRequested: true, manuallyQueued: true })),
    ).toBe('intervention_requested')
  })
})

describe('migrateMaintenanceQueueFlags', () => {
  it('缺少佇列旗標的舊資料補上 false', () => {
    const raw = [{ id: 'mt-1' }] as unknown as { interventionRequested?: boolean; manuallyQueued?: boolean }[]
    const migrated = migrateMaintenanceQueueFlags(raw)
    expect(migrated[0].interventionRequested).toBe(false)
    expect(migrated[0].manuallyQueued).toBe(false)
  })

  it('已有旗標的資料維持原值', () => {
    const raw = [{ interventionRequested: true, manuallyQueued: false }]
    const migrated = migrateMaintenanceQueueFlags(raw)
    expect(migrated[0].interventionRequested).toBe(true)
    expect(migrated[0].manuallyQueued).toBe(false)
  })
})

describe('逾期未回應也要進待處理佇列', () => {
  const base = { interventionRequested: false, manuallyQueued: false }

  it('逾期未回應自動進入佇列', () => {
    expect(isInAdminQueue({ ...base, status: 'overdue' })).toBe(true)
  })

  it('逾期的進入原因就是逾期', () => {
    expect(adminQueueReason({ ...base, status: 'overdue' })).toBe('overdue')
  })

  it('同時逾期又被手動加入時，顯示逾期', () => {
    expect(adminQueueReason({ ...base, status: 'overdue', manuallyQueued: true })).toBe('overdue')
  })

  it('爭議中的優先序仍高於逾期', () => {
    expect(adminQueueReason({ ...base, status: 'disputed' })).toBe('disputed')
  })

  it('逾期被推進後自動離開佇列', () => {
    expect(isInAdminQueue({ ...base, status: 'in_progress' })).toBe(false)
  })

  it('爭議與逾期屬於狀態驅動，移出待處理對它們無效', () => {
    expect(isStatusDrivenQueueReason('disputed')).toBe(true)
    expect(isStatusDrivenQueueReason('overdue')).toBe(true)
    expect(isStatusDrivenQueueReason('manually_queued')).toBe(false)
    expect(isStatusDrivenQueueReason('intervention_requested')).toBe(false)
    expect(isStatusDrivenQueueReason(null)).toBe(false)
  })
})
