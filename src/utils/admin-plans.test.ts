import { describe, expect, it } from 'vitest'
import type { LandlordSubscription, TenantSubscription } from '@/src/mocks/admin/subscription'
import {
  TRIAL_DAYS,
  billingLabel,
  checkPackSummary,
  consumeTenantAnalysis,
  effectivePlanKey,
  getPlan,
  getPlanLimits,
  hasActivePaidPlan,
  isInTrial,
  tenantAiUsage,
  usageMonth,
  userPlan,
} from './admin-plans'
import { planLimits, subscriptionPlans } from './subscription-plans'

const now = new Date(2026, 7, 15, 12)
const future = new Date(2026, 7, 20).toISOString()
const past = new Date(2026, 7, 10).toISOString()
const nextMonth = new Date(2026, 8, 1)

function tenant(over: Partial<TenantSubscription> = {}): TenantSubscription {
  return {
    id: 's',
    userId: 'u',
    role: 'tenant',
    planKey: 'free',
    billingCycle: null,
    active: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: future,
    trialEndsAt: null,
    aiUsed: 0,
    aiUsageMonth: usageMonth(now),
    freeAiUsed: 0,
    storageUsedMb: 0,
    checkPacks: [],
    ...over,
  }
}
function landlord(over: Partial<LandlordSubscription> = {}): LandlordSubscription {
  return {
    id: 'l',
    userId: 'l',
    role: 'landlord',
    planKey: 'free',
    billingCycle: null,
    active: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: future,
    trialEndsAt: null,
    ...over,
  }
}
const pack = {
  id: 'p',
  source: 'purchase' as const,
  quantity: 2,
  createdAt: past,
  usedAt: [] as string[],
}

describe('方案查詢與歸屬', () => {
  for (const role of ['tenant', 'landlord'] as const) {
    for (const plan of subscriptionPlans[role]) {
      it(`${role} ${plan.key} 使用目錄原始資料`, () => {
        expect(getPlan(role, plan.key)).toBe(plan)
        expect(getPlanLimits(role, plan.key)).toBe(planLimits[role][plan.key])
      })
    }
  }
  it('沒有紀錄、已停用、明確選 Free 都是自己角色的 Free', () => {
    for (const role of ['user', 'landlord'] as const) {
      const sub = role === 'user' ? tenant() : landlord()
      expect(userPlan({ role }, null, now)?.key).toBe('free')
      expect(userPlan({ role }, sub, now)?.key).toBe('free')
      expect(
        userPlan({ role }, { ...sub, planKey: 'pro', active: false, trialEndsAt: future }, now)
          ?.key,
      ).toBe('free')
    }
  })
  it('管理員沒有方案，跨角色紀錄不能套用', () => {
    expect(userPlan({ role: 'admin' }, tenant({ planKey: 'pro' }), now)).toBeNull()
    expect(userPlan({ role: 'landlord' }, tenant({ planKey: 'pro' }), now)?.name).toBe(
      'Free 基礎管理',
    )
    expect(userPlan({ role: 'user' }, landlord({ planKey: 'pro' }), now)?.name).toBe(
      'Free 租屋入門',
    )
  })
  it('未來扣款日不是付費方案失效條件，生命週期仍以 active 為準', () => {
    expect(effectivePlanKey(tenant({ planKey: 'pro', expiresAt: past }), now)).toBe('pro')
    expect(hasActivePaidPlan(tenant({ planKey: 'pro', expiresAt: past }))).toBe(true)
  })
})

describe('試用', () => {
  it('期限為 14 天，未設定或無效日期不在試用中', () => {
    expect(TRIAL_DAYS).toBe(14)
    expect(isInTrial(null, now)).toBe(false)
    expect(isInTrial('invalid', now)).toBe(false)
  })
  it('到期前生效，恰好到期即結束', () => {
    expect(isInTrial(future, now)).toBe(true)
    expect(isInTrial(now.toISOString(), now)).toBe(false)
    expect(isInTrial(past, now)).toBe(false)
  })
  it('兩角色各用自己的 Plus，試用不受原方案影響', () => {
    expect(userPlan({ role: 'user' }, tenant({ trialEndsAt: future }), now)?.name).toBe(
      'Plus 安心租住',
    )
    expect(
      userPlan({ role: 'landlord' }, landlord({ planKey: 'pro', trialEndsAt: future }), now)?.name,
    ).toBe('Plus 進階管理')
  })
  it('到期回原方案，停用立即回 Free', () => {
    expect(effectivePlanKey(tenant({ trialEndsAt: past }), now)).toBe('free')
    expect(effectivePlanKey(landlord({ planKey: 'pro', trialEndsAt: past }), now)).toBe('pro')
    expect(effectivePlanKey(tenant({ active: false, trialEndsAt: future }), now)).toBe('free')
  })
})

describe('租客 AI 額度與加購包', () => {
  it('未驗證 Free 為 0，已驗證贈送一次', () => {
    expect(tenantAiUsage(tenant(), false, now)).toMatchObject({
      used: 0,
      available: 0,
      exhausted: true,
    })
    expect(tenantAiUsage(tenant(), true, now)).toMatchObject({
      used: 0,
      available: 1,
      exhausted: false,
      period: 'verified-once',
    })
  })
  it('一次性贈送使用後跨月也不會恢復', () => {
    const consumed = consumeTenantAnalysis(tenant(), true, now)!
    expect(consumed.freeAiUsed).toBe(1)
    expect(tenantAiUsage(consumed, true, nextMonth)).toMatchObject({
      used: 1,
      available: 1,
      exhausted: true,
    })
    expect(consumeTenantAnalysis(consumed, true, nextMonth)).toBeNull()
  })
  it('Plus、Pro 使用月額度，不受 email 驗證與 Free 已用贈送影響', () => {
    expect(tenantAiUsage(tenant({ planKey: 'plus', freeAiUsed: 1 }), false, now).available).toBe(2)
    expect(tenantAiUsage(tenant({ planKey: 'pro', freeAiUsed: 1 }), false, now).available).toBe(5)
    expect(tenantAiUsage(tenant({ trialEndsAt: future }), false, now).available).toBe(2)
  })
  it('先用完 Plus 的兩次，再扣加購包，且不修改輸入', () => {
    const original = tenant({ planKey: 'plus', checkPacks: [pack] })
    const first = consumeTenantAnalysis(original, true, now)!
    const second = consumeTenantAnalysis(first, true, now)!
    expect(second.aiUsed).toBe(2)
    expect(checkPackSummary(second).remaining).toBe(2)
    const third = consumeTenantAnalysis(second, true, now)!
    expect(third.aiUsed).toBe(2)
    expect(third.checkPacks[0].usedAt).toEqual([now.toISOString()])
    expect(tenantAiUsage(third, true, now)).toMatchObject({
      used: 3,
      available: 4,
      remaining: 1,
      exhausted: false,
    })
    expect(original.aiUsed).toBe(0)
    expect(original.checkPacks[0].usedAt).toEqual([])
    const fourth = consumeTenantAnalysis(third, true, now)!
    expect(tenantAiUsage(fourth, true, now).exhausted).toBe(true)
    expect(consumeTenantAnalysis(fourth, true, now)).toBeNull()
  })
  it('月額度重置且不累積，加購剩餘與歷史消耗保留', () => {
    const sub = tenant({
      planKey: 'plus',
      aiUsed: 2,
      checkPacks: [{ ...pack, usedAt: [now.toISOString()] }],
    })
    expect(tenantAiUsage(sub, true, nextMonth)).toMatchObject({
      used: 0,
      available: 3,
      remaining: 3,
    })
    const consumed = consumeTenantAnalysis(sub, true, nextMonth)!
    expect(consumed.aiUsageMonth).toBe(usageMonth(nextMonth))
    expect(consumed.aiUsed).toBe(1)
    expect(consumed.checkPacks).toEqual(sub.checkPacks)
    expect(tenantAiUsage(tenant({ planKey: 'plus', aiUsed: 0 }), true, nextMonth).available).toBe(2)
  })
  it('未驗證 Free 可以用已取得的包，購買與補發分開計數', () => {
    const sub = tenant({ checkPacks: [pack, { ...pack, id: 'a', source: 'admin', quantity: 3 }] })
    expect(checkPackSummary(sub)).toEqual({ purchased: 2, granted: 3, remaining: 5 })
    const consumed = consumeTenantAnalysis(sub, false, now)!
    expect(consumed.freeAiUsed).toBe(0)
    expect(checkPackSummary(consumed)).toEqual({ purchased: 2, granted: 3, remaining: 4 })
  })
  it('優先扣最早取得的包，不依陣列順序或來源決定', () => {
    const sub = tenant({ checkPacks: [{ ...pack, id: 'new', createdAt: now.toISOString() }, pack] })
    expect(consumeTenantAnalysis(sub, false, now)!.checkPacks[1].usedAt).toEqual([
      now.toISOString(),
    ])
  })
  it('曾超用的方案額度不扣負數，仍可用剩餘加購包', () => {
    const sub = tenant({ planKey: 'plus', aiUsed: 3, checkPacks: [pack] })
    expect(tenantAiUsage(sub, true, now).remaining).toBe(2)
    expect(checkPackSummary(consumeTenantAnalysis(sub, true, now)!).remaining).toBe(1)
    expect(tenantAiUsage({ ...sub, checkPacks: [] }, true, now).remaining).toBe(0)
  })
})

describe('計費文字', () => {
  it('年繳、月均與節省從價格計算', () => {
    expect(billingLabel(landlord({ planKey: 'plus', billingCycle: 'yearly' }))).toBe(
      '年繳 NT$1,990（月均 NT$165.83，較月繳省 NT$398）',
    )
    expect(billingLabel(landlord({ planKey: 'plus', billingCycle: 'monthly' }))).toBe('月繳 NT$199')
    expect(billingLabel(tenant({ planKey: 'pro', billingCycle: 'yearly' }))).toBe(
      '年繳 NT$990（月均 NT$82.50，較月繳省 NT$198）',
    )
  })
  it('Free、停用、沒有紀錄與 Free 試用均無扣款', () => {
    for (const sub of [
      null,
      tenant(),
      tenant({ planKey: 'pro', active: false }),
      tenant({ trialEndsAt: future }),
    ]) {
      expect(billingLabel(sub)).toBe('免費方案，無扣款')
      expect(hasActivePaidPlan(sub)).toBe(false)
    }
  })
})
