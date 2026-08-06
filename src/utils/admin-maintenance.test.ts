import { describe, expect, it } from 'vitest'

import {
  canTransition,
  elapsedDays,
  maintenanceStatusLabels,
  maintenanceTransitions,
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
