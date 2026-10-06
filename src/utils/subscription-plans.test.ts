import { describe, expect, it } from 'vitest'
import {
  planFeatures,
  planLimits,
  subscriptionPlans,
  tenantCheckPack,
  type PlanQuota,
} from './subscription-plans'

describe('數字上限與說明型權益表一致', () => {
  for (const [index, plan] of subscriptionPlans.landlord.entries()) {
    it(plan.name, () => {
      const limits = planLimits.landlord[plan.key]
      for (const quota of Object.values(limits) as PlanQuota[]) {
        expect(
          planFeatures.landlord.find((feature) => feature.label === quota.label)?.values[index],
        ).toBe(`${quota.limit} ${quota.unit}`)
      }
      expect(plan.scale).toBe(
        `${limits.properties.limit} 個物件 / ${limits.rooms.limit} 間房 / ${limits.managers.limit} 席`,
      )
    })
  }
  for (const [index, plan] of subscriptionPlans.tenant.entries()) {
    it(plan.name, () => {
      const limits = planLimits.tenant[plan.key]
      const text = (label: string) =>
        planFeatures.tenant.find((feature) => feature.label === label)?.values[index]
      const analysis = `${limits.analysis.period === 'verified-once' ? '驗證帳號贈送' : '每月'} ${limits.analysis.limit} 次`
      expect(text(limits.analysis.label)).toBe(analysis)
      expect(text('室友共享上限')).toBe(
        `${limits.sharedSpaces.limit} 空間／共 ${limits.sharedMembers.limit} 人`,
      )
      expect(text(limits.storage.label)).toBe(
        limits.storage.limit < 1024
          ? `${limits.storage.limit} MB`
          : `${limits.storage.limit / 1024} GB`,
      )
      expect(plan.scale).toBe(`${analysis} AI 契約分析`)
    })
  }
  it('每個額度都有中文標籤與單位', () => {
    for (const role of Object.values(planLimits)) {
      for (const limits of Object.values(role)) {
        for (const quota of Object.values(limits) as PlanQuota[]) {
          expect(quota.label).toMatch(/[\u4e00-\u9fff]/)
          expect(quota.unit).not.toBe('')
          expect(quota.limit).toBeGreaterThan(0)
        }
      }
    }
  })
  it('檢查包每包 39 元，含一次分析及該次匯出且不續訂', () => {
    expect(tenantCheckPack).toMatchObject({
      price: 39,
      analyses: 1,
      includesReportExport: true,
      recurring: false,
    })
  })
})
