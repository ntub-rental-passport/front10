import { describe, expect, it } from 'vitest'
import { PLAN_FEATURES, PLAN_FEATURE_KEYS } from './admin-entitlements'

describe('停機公告功能識別', () => {
  it('保留原有六個 key、順序與標籤', () => {
    expect(PLAN_FEATURE_KEYS).toEqual([
      'contract-analysis',
      'handover',
      'subsidy',
      'garbage',
      'outage',
      'notes',
    ])
    expect(PLAN_FEATURES).toEqual({
      'contract-analysis': { label: '契約分析' },
      handover: { label: '點交存證' },
      subsidy: { label: '租金補貼' },
      garbage: { label: '垃圾車查詢' },
      outage: { label: '停水停電通知' },
      notes: { label: '記事與室友協作' },
    })
  })
})
