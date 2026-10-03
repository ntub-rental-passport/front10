import { describe, expect, it } from 'vitest'
import {
  annualSavings,
  billingAmount,
  monthlyEquivalent,
  planFeatures,
  quotaPercent,
  subscriptionPlans,
} from '@/src/utils/subscription-plans'

describe('business plan subscription catalog', () => {
  it.each([
    ['landlord', 199, 1990, 399, 3990, '165.83', '332.50'],
    ['tenant', 49, 490, 99, 990, '40.83', '82.50'],
  ] as const)(
    'uses exact tax-inclusive prices for %s, without rounding the annual charge',
    (role, plusMonthly, plusAnnual, proMonthly, proAnnual, plusAverage, proAverage) => {
      const [free, plus, pro] = subscriptionPlans[role]
      expect(billingAmount(free!, 'yearly')).toBe(0)
      expect(billingAmount(plus!, 'monthly')).toBe(plusMonthly)
      expect(billingAmount(plus!, 'yearly')).toBe(plusAnnual)
      expect(billingAmount(pro!, 'monthly')).toBe(proMonthly)
      expect(billingAmount(pro!, 'yearly')).toBe(proAnnual)
      expect(monthlyEquivalent(plus!)).toBe(plusAverage)
      expect(monthlyEquivalent(pro!)).toBe(proAverage)
      expect(annualSavings(plus!)).toBe(plusMonthly * 2)
      expect(annualSavings(pro!)).toBe(proMonthly * 2)
    },
  )
  it('keeps the property, room, team and AI limits from the report', () => {
    const landlord = planFeatures.landlord
    expect(landlord.find((row) => row.label === '管理物件')?.values).toEqual(['1 個', '5 個', '20 個'])
    expect(landlord.find((row) => row.label === '管理房間')?.values).toEqual(['5 間', '30 間', '100 間'])
    expect(landlord.find((row) => row.label === '管理者席次（含擁有者）')?.values).toEqual([
      '1 席',
      '1 席',
      '3 席',
    ])
    expect(planFeatures.tenant.find((row) => row.label === 'AI 契約分析')?.values).toEqual([
      '驗證帳號贈送 1 次',
      '每月 2 次',
      '每月 5 次',
    ])
  })
  it('does not turn unknown usage into zero and caps overflowing progress bars', () => {
    expect(quotaPercent(null, 5)).toBeNull()
    expect(quotaPercent(0, 5)).toBe(0)
    expect(quotaPercent(2, 5)).toBe(40)
    expect(quotaPercent(8, 5)).toBe(100)
  })
})
