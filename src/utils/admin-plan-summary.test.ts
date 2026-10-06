import { describe, expect, it } from 'vitest'
import { planFeatures, subscriptionPlans } from './subscription-plans'
import { planInclusions } from './admin-plan-summary'

describe('planInclusions', () => {
  for (const role of ['landlord', 'tenant'] as const) {
    for (const [index, plan] of subscriptionPlans[role].entries()) {
      it(`${plan.name} 使用前台完整權益、順序與規劃標記`, () => {
        const groups = planInclusions(role, plan.key)
        expect(groups.map((group) => group.group)).toEqual([
          ...new Set(planFeatures[role].map((item) => item.group)),
        ])
        expect(groups.flatMap((group) => group.items)).toEqual(
          planFeatures[role].map((feature) => ({
            label: feature.label,
            text: feature.values[index],
            planned: !!feature.planned,
          })),
        )
      })
    }
  }

  it('只列方案上限，沒有逐人用量或加購混入方案權益', () => {
    const items = planInclusions('tenant', 'plus').flatMap((group) => group.items)
    expect(items.find((item) => item.label === 'AI 契約分析')?.text).toBe('每月 2 次')
    expect(items.find((item) => item.label === '附件總容量')).toMatchObject({
      text: '1 GB',
      planned: true,
    })
  })
})
