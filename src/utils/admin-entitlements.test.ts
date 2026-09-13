import { describe, expect, it } from 'vitest'

import {
  PLAN_FEATURE_KEYS,
  TRIAL_PLAN_ID,
  effectivePlanId,
  featureVerdict,
  impactedUserCount,
  isInTrial,
  isMetered,
  limitImpacts,
  newlyImpacted,
  remainingQuota,
  type PlanFeatureKey,
  type PlanFeatureRule,
  type PlanFeatures,
} from './admin-entitlements'

const on = (limit: number | null = null): PlanFeatureRule => ({ enabled: true, limit })
const off: PlanFeatureRule = { enabled: false, limit: null }

function features(over: Partial<PlanFeatures> = {}): PlanFeatures {
  const base = Object.fromEntries(PLAN_FEATURE_KEYS.map((key) => [key, on()])) as PlanFeatures
  return { ...base, ...over }
}

describe('isMetered', () => {
  it('三個吃額度的功能有單位', () => {
    expect(isMetered('contract-analysis')).toBe(true)
    expect(isMetered('handover')).toBe(true)
    expect(isMetered('subsidy')).toBe(true)
  })

  it('資訊查詢類只有開關，沒有額度', () => {
    expect(isMetered('garbage')).toBe(false)
    expect(isMetered('outage')).toBe(false)
    expect(isMetered('notes')).toBe(false)
  })
})

describe('featureVerdict', () => {
  it('功能關閉時是 disabled，與用完了要分得出來', () => {
    expect(featureVerdict(off, 0)).toBe('disabled')
    expect(featureVerdict(off, 0)).not.toBe('exhausted')
  })

  it('沒有這個功能的規則時視為關閉', () => {
    expect(featureVerdict(undefined, 0)).toBe('disabled')
  })

  it('無上限一律放行', () => {
    expect(featureVerdict(on(null), 9999)).toBe('allowed')
  })

  it('用量小於上限放行，達到上限即用盡', () => {
    expect(featureVerdict(on(3), 2)).toBe('allowed')
    expect(featureVerdict(on(3), 3)).toBe('exhausted')
    expect(featureVerdict(on(3), 4)).toBe('exhausted')
  })

  it('單次加購疊加在方案上限之上', () => {
    expect(featureVerdict(on(3), 3)).toBe('exhausted')
    expect(featureVerdict(on(3), 3, 2)).toBe('allowed')
    expect(featureVerdict(on(3), 5, 2)).toBe('exhausted')
  })
})

describe('remainingQuota', () => {
  it('無上限或功能關閉時沒有「剩幾次」可言', () => {
    expect(remainingQuota(on(null), 5)).toBeNull()
    expect(remainingQuota(off, 0)).toBeNull()
  })

  it('回傳剩餘次數，含單次加購', () => {
    expect(remainingQuota(on(20), 12)).toBe(8)
    expect(remainingQuota(on(20), 12, 5)).toBe(13)
  })

  it('超額時回傳 0 而不是負數', () => {
    expect(remainingQuota(on(3), 10)).toBe(0)
  })
})

describe('試用', () => {
  const now = new Date('2026-08-15T00:00:00.000Z')

  it('未設定試用日期就不在試用中', () => {
    expect(isInTrial(null, now)).toBe(false)
  })

  it('到期前在試用中，到期後不是', () => {
    expect(isInTrial('2026-08-20T00:00:00.000Z', now)).toBe(true)
    expect(isInTrial('2026-08-10T00:00:00.000Z', now)).toBe(false)
  })

  it('試用期間一律套用試用方案，不管名下掛哪個', () => {
    expect(effectivePlanId('free', '2026-08-20T00:00:00.000Z', now)).toBe(TRIAL_PLAN_ID)
  })

  it('試用到期自動落回原方案，不需要額外的降級動作', () => {
    expect(effectivePlanId('free', '2026-08-10T00:00:00.000Z', now)).toBe('free')
    expect(effectivePlanId('pro', null, now)).toBe('pro')
  })
})

describe('limitImpacts', () => {
  const plans: Record<string, PlanFeatures> = {
    free: features({ 'contract-analysis': on(3), handover: on(1) }),
    pro: features({ 'contract-analysis': on(null) }),
  }

  it('沒有人超額時回傳空陣列', () => {
    const impacts = limitImpacts(
      [{ userId: 'a', planId: 'free', used: { 'contract-analysis': 2 } }],
      plans,
    )
    expect(impacts).toEqual([])
  })

  it('用量超過上限才算超額，剛好等於上限不算', () => {
    const atLimit = limitImpacts(
      [{ userId: 'a', planId: 'free', used: { 'contract-analysis': 3 } }],
      plans,
    )
    expect(atLimit).toEqual([])

    const over = limitImpacts(
      [{ userId: 'a', planId: 'free', used: { 'contract-analysis': 5 } }],
      plans,
    )
    expect(over).toEqual([
      { userId: 'a', featureKey: 'contract-analysis', used: 5, limit: 3 },
    ])
  })

  it('單次加購讓人不算超額', () => {
    const impacts = limitImpacts(
      [
        {
          userId: 'a',
          planId: 'free',
          used: { 'contract-analysis': 5 },
          extraCredits: { 'contract-analysis': 3 },
        },
      ],
      plans,
    )
    expect(impacts).toEqual([])
  })

  it('無上限的功能永遠不會超額', () => {
    expect(
      limitImpacts([{ userId: 'a', planId: 'pro', used: { 'contract-analysis': 9999 } }], plans),
    ).toEqual([])
  })

  it('關閉的功能不列入超額 —— 那是不能用，不是用超過', () => {
    const closed: Record<string, PlanFeatures> = {
      free: features({ 'contract-analysis': { enabled: false, limit: 3 } }),
    }
    expect(
      limitImpacts([{ userId: 'a', planId: 'free', used: { 'contract-analysis': 9 } }], closed),
    ).toEqual([])
  })

  it('查無方案的使用者略過，不會炸開', () => {
    expect(limitImpacts([{ userId: 'a', planId: '不存在', used: {} }], plans)).toEqual([])
  })

  it('同一人多項超額只算一個人', () => {
    const impacts = limitImpacts(
      [{ userId: 'a', planId: 'free', used: { 'contract-analysis': 9, handover: 4 } }],
      plans,
    )
    expect(impacts).toHaveLength(2)
    expect(impactedUserCount(impacts)).toBe(1)
  })

  it('多人超額分別計數', () => {
    const impacts = limitImpacts(
      [
        { userId: 'a', planId: 'free', used: { 'contract-analysis': 9 } },
        { userId: 'b', planId: 'free', used: { 'contract-analysis': 9 } },
      ],
      plans,
    )
    expect(impactedUserCount(impacts)).toBe(2)
  })
})

describe('newlyImpacted', () => {
  const impact = (userId: string, featureKey: PlanFeatureKey, used: number, limit: number) => ({
    userId,
    featureKey,
    used,
    limit,
  })

  it('本來就超額的人不算在這次調整頭上', () => {
    const before = [impact('a', 'handover', 5, 1)]
    const after = [impact('a', 'handover', 5, 1), impact('b', 'contract-analysis', 3, 1)]
    expect(newlyImpacted(before, after)).toEqual([impact('b', 'contract-analysis', 3, 1)])
  })

  it('同一人的不同功能分開判斷', () => {
    const before = [impact('a', 'handover', 5, 1)]
    const after = [impact('a', 'handover', 5, 1), impact('a', 'contract-analysis', 3, 1)]
    expect(newlyImpacted(before, after)).toHaveLength(1)
    expect(impactedUserCount(newlyImpacted(before, after))).toBe(1)
  })

  it('調整沒有讓任何人新超額時為空', () => {
    const before = [impact('a', 'handover', 5, 1)]
    expect(newlyImpacted(before, before)).toEqual([])
  })

  it('放寬上限不會產生新的超額', () => {
    expect(newlyImpacted([impact('a', 'handover', 5, 1)], [])).toEqual([])
  })
})
