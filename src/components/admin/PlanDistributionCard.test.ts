import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import PlanDistributionCard from './PlanDistributionCard.vue'

const segments = [
  { planKey: 'free' as const, label: 'Free 租屋入門', value: 3, trialCount: 0 },
  { planKey: 'plus' as const, label: 'Plus 安心租住', value: 2, trialCount: 1 },
  { planKey: 'pro' as const, label: 'Pro 合租進階', value: 1, trialCount: 0 },
]

describe('PlanDistributionCard', () => {
  it('外部可控制角色，總數與試用註記從三個分段計算', async () => {
    const html = await renderToString(
      createSSRApp(PlanDistributionCard, {
        modelValue: 'tenant',
        segments,
        colors: ['#ddd', '#999', '#333'],
        activePlan: 'tenant-plus',
      }),
    )
    expect(html).toContain('全部 6 位租客')
    expect(html).toContain('其中 1 位試用中')
    expect(html.replace(/<!--.*?-->/g, '')).toMatch(/aria-pressed="true"[^>]*>租客/)
    expect(html.replace(/<!--.*?-->/g, '')).toMatch(/aria-pressed="false"[^>]*>房東/)
  })

  it('沒有試用中使用者時不顯示試用註記', async () => {
    const html = await renderToString(
      createSSRApp(PlanDistributionCard, {
        modelValue: 'landlord',
        segments: segments.map((segment) => ({ ...segment, trialCount: 0 })),
        colors: ['#ddd', '#999', '#333'],
        activePlan: 'all',
      }),
    )
    expect(html).not.toContain('其中 0 位試用中')
  })
})
