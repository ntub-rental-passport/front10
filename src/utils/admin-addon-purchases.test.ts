import { describe, expect, it } from 'vitest'
import type {
  ContractCheckPack,
  LandlordSubscription,
  TenantSubscription,
} from '@/src/mocks/admin/subscription'
import { monthlyCheckPackPurchases } from './admin-addon-purchases'

const now = new Date(2026, 9, 20, 12)

function pack(
  quantity: number,
  createdAt: Date,
  source: ContractCheckPack['source'] = 'purchase',
): ContractCheckPack {
  return { id: 'pack', quantity, createdAt: createdAt.toISOString(), source, usedAt: [] }
}

function tenant(checkPacks: ContractCheckPack[]): TenantSubscription {
  return {
    id: 'tenant',
    userId: 'tenant',
    role: 'tenant',
    planKey: 'free',
    billingCycle: null,
    startedAt: new Date(2025, 0, 1).toISOString(),
    expiresAt: new Date(2026, 10, 1).toISOString(),
    active: true,
    trialEndsAt: null,
    aiUsed: 0,
    aiUsageMonth: '2026-10',
    freeAiUsed: 0,
    storageUsedMb: 0,
    checkPacks,
  }
}

describe('monthlyCheckPackPurchases', () => {
  it('固定回傳近 12 個月，首月和一月標年份，其餘只標月份', () => {
    const months = monthlyCheckPackPurchases([], now)
    expect(months).toHaveLength(12)
    expect(months.map((month) => month.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    expect(months.map((month) => month.label)).toEqual([
      '2025年11月',
      '12月',
      '2026年1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
    ])
    expect(months.every((month) => month.packs === 0)).toBe(true)
    expect(monthlyCheckPackPurchases([], new Date(2026, 11, 31))[0].label).toBe('2026年1月')
  })

  it('按購買包數加總多筆及多位租客，不計管理員贈送，也不受目前方案狀態影響', () => {
    const subscriptions = [
      tenant([pack(2, now), pack(3, now), pack(20, now, 'admin')]),
      { ...tenant([pack(4, now), pack(6, new Date(2026, 8, 15))]), active: false },
    ]
    const before = structuredClone(subscriptions)
    const months = monthlyCheckPackPurchases(subscriptions, now)
    expect(months.slice(-2).map((month) => month.packs)).toEqual([6, 9])
    expect(months.slice(0, -2).every((month) => month.packs === 0)).toBe(true)
    expect(subscriptions).toEqual(before)
  })

  it('包含窗口起點及 now 當下，排除窗口外、未來與房東', () => {
    const firstMonth = new Date(2025, 10, 1)
    const landlord: LandlordSubscription = {
      id: 'landlord',
      userId: 'landlord',
      role: 'landlord',
      planKey: 'plus',
      billingCycle: 'monthly',
      startedAt: firstMonth.toISOString(),
      expiresAt: now.toISOString(),
      active: true,
      trialEndsAt: null,
    }
    const months = monthlyCheckPackPurchases(
      [
        landlord,
        tenant([
          pack(2, firstMonth),
          pack(50, new Date(firstMonth.getTime() - 1)),
          pack(3, now),
          pack(60, new Date(now.getTime() + 1)),
          pack(70, new Date(2026, 10, 1)),
        ]),
      ],
      now,
    )
    expect(months[0].packs).toBe(2)
    expect(months.at(-1)!.packs).toBe(3)
    expect(months.reduce((sum, month) => sum + month.packs, 0)).toBe(5)
    expect(monthlyCheckPackPurchases([landlord], now).every((month) => month.packs === 0)).toBe(
      true,
    )
  })

  it('ISO 時間轉為本地日曆月，月底與月初分別歸帳', () => {
    const monthStart = new Date(2026, 9, 1)
    const months = monthlyCheckPackPurchases(
      [tenant([pack(2, new Date(monthStart.getTime() - 1)), pack(3, monthStart)])],
      now,
    )
    expect(months.slice(-2)).toEqual([
      { month: '2026-09', label: '9月', packs: 2 },
      { month: '2026-10', label: '10月', packs: 3 },
    ])
  })
})
