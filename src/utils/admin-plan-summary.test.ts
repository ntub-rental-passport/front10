import { describe, expect, it } from 'vitest'

import { seedPlans } from '@/src/mocks/admin/subscription'
import { planInclusions } from './admin-plan-summary'

const plan = (id: string) => seedPlans().find((item) => item.id === id)!

describe('planInclusions', () => {
  it('免費方案：有額度的寫上限，沒包含的直接說', () => {
    const rows = planInclusions(plan('free').features)
    expect(rows.find((row) => row.key === 'contract-analysis')?.text).toBe('3 次／月')
    expect(rows.find((row) => row.key === 'outage')).toMatchObject({ included: false, text: '不包含' })
    expect(rows.find((row) => row.key === 'garbage')).toMatchObject({ included: true, text: '包含' })
  })

  it('專業方案是無上限', () => {
    expect(planInclusions(plan('pro').features).find((row) => row.key === 'handover')?.text).toBe('無上限')
  })

  it('有記錄的用量與加購額度附在後面', () => {
    const rows = planInclusions(plan('plus').features, {
      used: { 'contract-analysis': 5 },
      extraCredits: { 'contract-analysis': 3 },
    })
    expect(rows.find((row) => row.key === 'contract-analysis')?.text).toBe('20 次／月（已用 5，加購 +3）')
  })

  it('六項功能都會列出，順序固定', () => {
    expect(planInclusions(plan('free').features)).toHaveLength(6)
  })
})
