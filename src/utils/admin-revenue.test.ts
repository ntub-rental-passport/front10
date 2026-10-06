import { describe, expect, it } from 'vitest'
import type { LandlordSubscription, TenantSubscription } from '@/src/mocks/admin/subscription'
import { monthlyRevenue, subscriptionCharges } from './admin-revenue'

const date = (year: number, month: number, day = 10) =>
  new Date(year, month - 1, day, 12).toISOString()
const now = new Date(2026, 9, 20, 12)
function landlord(over: Partial<LandlordSubscription> = {}): LandlordSubscription {
  return {
    id: 'landlord',
    userId: 'l',
    role: 'landlord',
    planKey: 'plus',
    billingCycle: 'monthly',
    startedAt: date(2026, 7),
    expiresAt: date(2026, 11),
    active: true,
    trialEndsAt: null,
    ...over,
  }
}
function tenant(over: Partial<TenantSubscription> = {}): TenantSubscription {
  return {
    ...landlord(),
    role: 'tenant',
    aiUsed: 0,
    aiUsageMonth: '',
    freeAiUsed: 0,
    storageUsedMb: 0,
    checkPacks: [],
    ...over,
  }
}

describe('subscriptionCharges', () => {
  it('月繳每月一次，包含開始日與 now，不提前記未來扣款', () => {
    const charges = subscriptionCharges(landlord(), now)
    expect(charges).toEqual(
      [7, 8, 9, 10].map((month) => ({ at: date(2026, month), series: 'plus', amount: 199 })),
    )
    expect(subscriptionCharges(landlord(), new Date(date(2026, 10)))).toHaveLength(4)
  })
  it('startedAt 當天是首次付款，不向開始日之前補造事件', () => {
    const sub = landlord({ startedAt: date(2026, 9, 11) })
    expect(subscriptionCharges(sub, new Date(sub.startedAt))).toEqual([
      { at: date(2026, 9, 11), series: 'plus', amount: 199 },
    ])
    expect(subscriptionCharges(sub, new Date(date(2026, 9, 10)))).toEqual([])
    expect(subscriptionCharges(sub, now)).toEqual([
      { at: date(2026, 9, 11), series: 'plus', amount: 199 },
      { at: date(2026, 10, 11), series: 'plus', amount: 199 },
    ])
  })
  it.each([true, false])('expiresAt 當天不算續扣，active=%s', (active) => {
    const sub = landlord({ active, expiresAt: date(2026, 9) })
    expect(subscriptionCharges(sub, new Date(sub.expiresAt))).toEqual(
      [7, 8].map((month) => ({ at: date(2026, month), series: 'plus', amount: 199 })),
    )
  })
  it('年繳開始於一個月前，即使到期日尚遠，首次付款仍整筆計入開始月', () => {
    const sub = landlord({
      planKey: 'pro',
      billingCycle: 'yearly',
      startedAt: date(2026, 9),
      expiresAt: date(2027, 9),
    })
    expect(subscriptionCharges(sub, now)).toEqual([
      { at: date(2026, 9), series: 'pro', amount: 3990 },
    ])
    const revenue = monthlyRevenue([sub], 'landlord', now)
    expect(revenue.months.filter((month) => month.total > 0)).toEqual([
      { month: '2026-09', label: '9月', plus: 0, pro: 3990, checkPacks: 0, total: 3990 },
    ])
  })
  it('試用前的事件不算；剛好在試用結束時可以收款', () => {
    expect(subscriptionCharges(landlord({ trialEndsAt: date(2026, 9) }), now)).toEqual(
      [9, 10].map((month) => ({ at: date(2026, month), series: 'plus', amount: 199 })),
    )
    expect(subscriptionCharges(landlord({ trialEndsAt: date(2026, 11) }), now)).toEqual([])
  })
  it('停用仍保留過去扣款，不把過期訂閱向未來延伸', () => {
    expect(subscriptionCharges(landlord({ active: false, expiresAt: date(2026, 9) }), now)).toEqual(
      [7, 8].map((month) => ({ at: date(2026, month), series: 'plus', amount: 199 })),
    )
  })
  it('Free 與沒有計費週期都沒有扣款', () => {
    expect(subscriptionCharges(landlord({ planKey: 'free' }), now)).toEqual([])
    expect(subscriptionCharges(landlord({ billingCycle: null }), now)).toEqual([])
  })
  it('月底按原扣款日夾到月末，跨二月不漂移；年繳閏日夾到 2/28', () => {
    expect(
      subscriptionCharges(
        landlord({ startedAt: date(2026, 1, 31), expiresAt: date(2026, 5, 31) }),
        new Date(date(2026, 4, 30)),
      ).map((event) => new Date(event.at).getDate()),
    ).toEqual([31, 28, 31, 30])
    expect(
      subscriptionCharges(
        landlord({
          billingCycle: 'yearly',
          startedAt: date(2024, 2, 29),
          expiresAt: date(2027, 2, 28),
        }),
        new Date(date(2026, 3)),
      ).map((event) => event.at),
    ).toEqual([date(2024, 2, 29), date(2025, 2, 28), date(2026, 2, 28)])
  })
  it('無效日期不產生事件', () => {
    expect(subscriptionCharges(landlord({ startedAt: '' }), now)).toEqual([])
    expect(subscriptionCharges(landlord({ expiresAt: '' }), now)).toEqual([])
  })
})

describe('monthlyRevenue', () => {
  it('年繳整筆記入扣款月，不攤提；房東只有 Plus、Pro 系列', () => {
    const revenue = monthlyRevenue(
      [
        landlord({
          planKey: 'pro',
          billingCycle: 'yearly',
          startedAt: date(2025, 3),
          expiresAt: date(2027, 3),
        }),
      ],
      'landlord',
      now,
    )
    expect(revenue.series.map((series) => series.key)).toEqual(['plus', 'pro'])
    expect(revenue.months.filter((month) => month.total > 0)).toEqual([
      { month: '2026-03', label: '3月', plus: 0, pro: 3990, checkPacks: 0, total: 3990 },
    ])
    expect(revenue.currentMonthTotal).toBe(0)
  })
  it('補發不算收入、購買算 39×數量（即使已用完或 Free），未來購買不提前算', () => {
    const revenue = monthlyRevenue(
      [
        tenant({
          planKey: 'free',
          billingCycle: null,
          checkPacks: [
            {
              id: 'purchase',
              source: 'purchase',
              quantity: 3,
              createdAt: date(2026, 10),
              usedAt: [date(2026, 10), date(2026, 10), date(2026, 10)],
            },
            { id: 'admin', source: 'admin', quantity: 5, createdAt: date(2026, 10), usedAt: [] },
            { id: 'old', source: 'purchase', quantity: 99, createdAt: date(2025, 10), usedAt: [] },
            {
              id: 'future',
              source: 'purchase',
              quantity: 1,
              createdAt: date(2026, 10, 25),
              usedAt: [],
            },
          ],
        }),
      ],
      'tenant',
      now,
    )
    expect(revenue.series.map((series) => series.key)).toEqual(['plus', 'pro', 'checkPacks'])
    expect(revenue.currentMonthTotal).toBe(117)
    expect(revenue.months.at(-1)?.checkPacks).toBe(117)
  })
  it('固定 12 個本地日曆月，排除視窗外收入，跨年加年份', () => {
    const revenue = monthlyRevenue(
      [landlord({ startedAt: date(2024, 1) }), tenant({ planKey: 'pro' })],
      'landlord',
      now,
    )
    expect(revenue.months).toHaveLength(12)
    expect(revenue.months[0]).toMatchObject({ month: '2025-11', label: '2025年11月', total: 199 })
    expect(revenue.months[2].label).toBe('2026年1月')
    expect(revenue.months.at(-1)).toMatchObject({ month: '2026-10', total: 199 })
    expect(revenue.months.reduce((sum, month) => sum + month.total, 0)).toBe(199 * 12)
    expect(revenue.currentMonthTotal).toBe(199)
    const old = landlord({
      billingCycle: 'yearly',
      startedAt: date(2024, 10),
      expiresAt: date(2025, 10),
    })
    expect(monthlyRevenue([old], 'landlord', now).months.every((month) => month.total === 0)).toBe(
      true,
    )
  })
  it('月份依本地日期，不以 ISO 字串月份歸帳', () => {
    const localBoundary = new Date(2026, 9, 1, 0, 0, 1).toISOString()
    const revenue = monthlyRevenue(
      [
        tenant({
          planKey: 'free',
          checkPacks: [
            {
              id: 'boundary',
              source: 'purchase',
              quantity: 1,
              createdAt: localBoundary,
              usedAt: [],
            },
          ],
        }),
      ],
      'tenant',
      now,
    )
    expect(revenue.months.at(-1)?.checkPacks).toBe(39)
    expect(revenue.months.at(-2)?.checkPacks).toBe(0)
  })
  it('每個角色依自己的價目表計算，沒有訂閱仍產生零月份與本月合計', () => {
    expect(monthlyRevenue([tenant(), landlord()], 'tenant', now).currentMonthTotal).toBe(49)
    expect(
      monthlyRevenue(
        [
          tenant({
            planKey: 'pro',
            billingCycle: 'yearly',
            startedAt: date(2025, 10),
            expiresAt: date(2027, 10),
          }),
        ],
        'tenant',
        now,
      ).currentMonthTotal,
    ).toBe(990)
    expect(monthlyRevenue([], 'landlord', now).currentMonthTotal).toBe(0)
  })
})
