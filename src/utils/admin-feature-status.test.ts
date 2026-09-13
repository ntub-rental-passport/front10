import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PUBLIC_NOTE,
  closedFeatureKeys,
  isEtaPassed,
  isFeatureClosed,
  outageDurationLabel,
  outageOf,
  publicEtaAt,
  publicNoteOf,
  type FeatureOutage,
} from './admin-feature-status'
import { PLAN_FEATURE_KEYS } from './admin-entitlements'

const now = new Date('2026-08-16T12:00:00.000Z')

function outage(over: Partial<FeatureOutage> = {}): FeatureOutage {
  return {
    featureKey: 'contract-analysis',
    internalReason: 'API 金鑰過期',
    publicNote: '',
    closedAt: '2026-08-16T10:00:00.000Z',
    etaAt: null,
    ...over,
  }
}

describe('沒有任何 outage 時', () => {
  it('outageOf 回傳 null', () => {
    expect(outageOf([], 'contract-analysis')).toBeNull()
  })

  it('isFeatureClosed 回傳 false', () => {
    expect(isFeatureClosed([], 'contract-analysis')).toBe(false)
  })

  it('closedFeatureKeys 回傳空陣列', () => {
    expect(closedFeatureKeys([])).toEqual([])
  })
})

describe('outageOf / isFeatureClosed', () => {
  it('找得到對應功能的 outage', () => {
    const target = outage({ featureKey: 'handover' })
    const outages = [outage({ featureKey: 'garbage' }), target]
    expect(outageOf(outages, 'handover')).toEqual(target)
    expect(isFeatureClosed(outages, 'handover')).toBe(true)
  })

  it('沒有對應功能的 outage 時回傳 null / false', () => {
    const outages = [outage({ featureKey: 'garbage' })]
    expect(outageOf(outages, 'handover')).toBeNull()
    expect(isFeatureClosed(outages, 'handover')).toBe(false)
  })
})

describe('publicNoteOf 留白時退回制式文案', () => {
  it('空字串', () => {
    expect(publicNoteOf(outage({ publicNote: '' }))).toBe(DEFAULT_PUBLIC_NOTE)
  })

  it('只有空白字元', () => {
    expect(publicNoteOf(outage({ publicNote: '   ' }))).toBe(DEFAULT_PUBLIC_NOTE)
  })

  it('有填寫時原樣顯示（去除頭尾空白）', () => {
    expect(publicNoteOf(outage({ publicNote: '  維護中，預計中午恢復  ' }))).toBe('維護中，預計中午恢復')
  })
})

describe('isEtaPassed', () => {
  it('沒填 eta 回 false', () => {
    expect(isEtaPassed(outage({ etaAt: null }), now)).toBe(false)
  })

  it('eta 在未來回 false', () => {
    expect(isEtaPassed(outage({ etaAt: '2026-08-16T13:00:00.000Z' }), now)).toBe(false)
  })

  it('eta 已過回 true', () => {
    expect(isEtaPassed(outage({ etaAt: '2026-08-16T11:00:00.000Z' }), now)).toBe(true)
  })

  it('eta 剛好等於現在也算已過', () => {
    expect(isEtaPassed(outage({ etaAt: now.toISOString() }), now)).toBe(true)
  })
})

describe('publicEtaAt', () => {
  it('沒填 eta 回 null', () => {
    expect(publicEtaAt(outage({ etaAt: null }), now)).toBeNull()
  })

  it('未來的 eta 照樣顯示', () => {
    const etaAt = '2026-08-16T13:00:00.000Z'
    expect(publicEtaAt(outage({ etaAt }), now)).toBe(etaAt)
  })

  it('已過期的 eta 一律回 null，不繼續顯示過去的承諾', () => {
    expect(publicEtaAt(outage({ etaAt: '2026-08-16T11:00:00.000Z' }), now)).toBeNull()
  })
})

describe('outageDurationLabel', () => {
  it('不含「已關閉」之類的前綴，前綴由呼叫端自己加', () => {
    const closedAt = new Date(now.getTime() - 90 * 60 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).not.toContain('已關閉')
  })

  it('未滿 1 分鐘顯示「不到 1 分鐘」', () => {
    const closedAt = new Date(now.getTime() - 30 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('不到 1 分鐘')
  })

  it('剛好 1 分鐘就報實際分鐘數', () => {
    const closedAt = new Date(now.getTime() - 60 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('1 分')
  })

  it('未滿 1 小時只顯示分鐘', () => {
    const closedAt = new Date(now.getTime() - 45 * 60 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('45 分')
  })

  it('剛好 1 小時進入小時級距', () => {
    const closedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('1 小時 0 分')
  })

  it('超過 1 小時顯示「N 小時 M 分」', () => {
    const closedAt = new Date(now.getTime() - (3 * 60 * 60 * 1000 + 20 * 60 * 1000)).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('3 小時 20 分')
  })

  it('剛好 24 小時進入天級距', () => {
    const closedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('1 天 0 小時')
  })

  it('超過 24 小時顯示「N 天 M 小時」', () => {
    const closedAt = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000)).toISOString()
    expect(outageDurationLabel(outage({ closedAt }), now)).toBe('2 天 5 小時')
  })
})

describe('closedFeatureKeys 的順序穩定', () => {
  it('依 PLAN_FEATURE_KEYS 的順序回傳，不管 outages 陣列本身的順序', () => {
    const outages = [
      outage({ featureKey: 'notes' }),
      outage({ featureKey: 'contract-analysis' }),
      outage({ featureKey: 'garbage' }),
    ]
    expect(closedFeatureKeys(outages)).toEqual(
      PLAN_FEATURE_KEYS.filter((key) => ['notes', 'contract-analysis', 'garbage'].includes(key)),
    )
  })

  it('沒有關閉的功能不會出現', () => {
    const outages = [outage({ featureKey: 'subsidy' })]
    expect(closedFeatureKeys(outages)).toEqual(['subsidy'])
  })
})
