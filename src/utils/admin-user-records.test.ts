import { describe, expect, it } from 'vitest'

import { demoHandoverViews, realDepositView, type RealDepositRecord } from './admin-user-records'
import type { HandoverRecord } from '@/src/mocks/admin/handover'

function deposit(overrides: Partial<RealDepositRecord> = {}): RealDepositRecord {
  return {
    id: 'lease-1',
    side: 'tenant',
    address: '臺北市測試路 1 號（房號 301）',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyRent: 12000,
    landlordDeclared: 24000,
    tenantDeclared: 24000,
    landlordId: 3,
    tenantId: 7,
    ...overrides,
  }
}

describe('realDepositView', () => {
  it('金額一樣是相符', () => {
    const view = realDepositView(deposit())
    expect(view.match).toBe('matched')
    expect(view.gap).toBe(0)
    expect(view.side).toBe('tenant')
    expect([view.landlordUserId, view.tenantUserId]).toEqual(['real-3', 'real-7'])
  })

  it('金額不同是不符，並算出差額', () => {
    const view = realDepositView(deposit({ tenantDeclared: 20000 }))
    expect(view.match).toBe('mismatched')
    expect(view.gap).toBe(4000)
  })

  it('對不到租客合約是「租客未聲明」，不算不符', () => {
    const view = realDepositView(deposit({ tenantDeclared: null, tenantId: null }))
    expect(view.match).toBe('pending')
    expect(view.gap).toBe(0)
    expect(view.tenantUserId).toBe('')
  })
})

describe('demoHandoverViews', () => {
  const record = (id: string, landlordUserId: string, tenantUserId: string): HandoverRecord => ({
    id,
    address: '地址',
    landlordUserId,
    tenantUserId,
    updatedAt: '2026-09-01T02:00:00.000Z',
    items: [],
  })

  it('依這個人是租客還是房東分邊，無關的不列', () => {
    const views = demoHandoverViews(
      [
        record('hr-1', 'u-landlord', 'u-me'),
        record('hr-2', 'u-me', 'u-other'),
        record('hr-3', 'u-x', 'u-y'),
      ],
      'u-me',
    )
    expect(views.map((view) => [view.id, view.side])).toEqual([
      ['hr-1-tenant', 'tenant'],
      ['hr-2-landlord', 'landlord'],
    ])
  })
})
