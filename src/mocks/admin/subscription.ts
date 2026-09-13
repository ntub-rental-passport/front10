import { createRandom, daysAgo, daysAhead, intBetween } from './helpers'
import { TRIAL_DAYS, type PlanFeatureKey, type PlanFeatures } from '@/src/utils/admin-entitlements'
import { seedAdminUsers, type AdminUser } from './users'

export type PlanId = 'free' | 'plus' | 'pro'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  storageMb: number
  /**
   * 各功能的開關與額度。
   *
   * 契約分析的額度原本存在 aiQuota，已併進這裡 —— 一個功能只留一個上限來源，
   * 否則「這人到底能用幾次」要查兩個地方。storageMb 留著，那是資源不是功能。
   */
  features: PlanFeatures
}

export interface Subscription {
  id: string
  userId: string
  planId: PlanId
  expiresAt: string
  aiUsed: number
  storageUsedMb: number
  active: boolean
  /** 限時試用到期日；null 代表沒有試用。試用期間套用試用方案的權益。 */
  trialEndsAt: string | null
  /**
   * 單次加購的額度，疊加在方案上限之上。
   *
   * 只記權益不記金流 —— 平台沒有串金流，這裡的數字是管理員手動加的，
   * 錢怎麼進來等接上金流再說，後台不假造付款紀錄。
   */
  extraCredits: Partial<Record<PlanFeatureKey, number>>
}

/** 開關與額度寫在一起，讀起來就是一張方案對照表 */
function planFeatures(
  spec: Partial<Record<PlanFeatureKey, boolean | number | null>>,
): PlanFeatures {
  const build = (value: boolean | number | null | undefined) => {
    if (value === undefined || value === false) return { enabled: false, limit: null }
    if (value === true || value === null) return { enabled: true, limit: null }
    return { enabled: true, limit: value }
  }
  return {
    'contract-analysis': build(spec['contract-analysis']),
    handover: build(spec.handover),
    subsidy: build(spec.subsidy),
    garbage: build(spec.garbage),
    outage: build(spec.outage),
    notes: build(spec.notes),
  }
}

export function seedPlans(): SubscriptionPlan[] {
  return [
    {
      id: 'free',
      name: '免費方案',
      priceLabel: 'NT$0',
      storageMb: 200,
      features: planFeatures({ 'contract-analysis': 3, handover: 1, subsidy: 1, garbage: true }),
    },
    {
      id: 'plus',
      name: '進階方案',
      priceLabel: 'NT$99／月',
      storageMb: 2048,
      features: planFeatures({
        'contract-analysis': 20,
        handover: 5,
        subsidy: 3,
        garbage: true,
        outage: true,
        notes: true,
      }),
    },
    {
      id: 'pro',
      name: '專業方案',
      priceLabel: 'NT$299／月',
      storageMb: 10240,
      // null = 無上限
      features: planFeatures({
        'contract-analysis': null,
        handover: null,
        subsidy: null,
        garbage: true,
        outage: true,
        notes: true,
      }),
    },
  ]
}

const QUOTA: Record<PlanId, { ai: number; storage: number }> = {
  free: { ai: 3, storage: 200 },
  plus: { ai: 20, storage: 2048 },
  pro: { ai: 100, storage: 10240 },
}

/**
 * 方案與到期日用固定循環分配，不靠機率。
 *
 * 純機率會讓小樣本嚴重偏離期望值 —— 專業方案可能一筆都抽不到，
 * 到期日也很難剛好落進「即將到期」那 14 天，警示卡就永遠是 0。
 */
const PLAN_CYCLE: PlanId[] = ['free', 'plus', 'free', 'pro', 'plus', 'free', 'plus', 'free', 'pro', 'plus']

/** 每 7 筆安排 1 筆落在 14 天內到期，確保到期警示有東西可看 */
const EXPIRING_EVERY = 7

/** 每 9 筆安排 1 筆把額度用滿 */
const EXHAUSTED_EVERY = 9

/** 每 6 筆安排 1 筆仍在限時試用中 */
const TRIAL_EVERY = 6

/** 每 8 筆安排 1 筆有單次加購額度 */
const EXTRA_CREDIT_EVERY = 8

/** 管理員不訂閱；其餘使用者約八成有訂閱記錄，留下一批「尚未訂閱」供空狀態驗證 */
export function seedSubscriptions(users: AdminUser[] = seedAdminUsers()): Subscription[] {
  const random = createRandom(302558)
  const subscriptions: Subscription[] = []
  let index = 0

  for (const user of users) {
    if (user.role === 'admin') continue
    if (random() > 0.8) continue

    const planId = PLAN_CYCLE[index % PLAN_CYCLE.length]
    const quota = QUOTA[planId]

    // 停用帳號的訂閱一併失效，且到期日落在過去
    const active = user.status === 'active' && random() > 0.06
    const expiringSoon = active && index % EXPIRING_EVERY === 0
    const expiresAt = !active
      ? daysAgo(intBetween(random, 2, 60))
      : expiringSoon
        ? daysAhead(intBetween(random, 2, 13))
        : daysAhead(intBetween(random, 25, 330))

    // 每 9 筆安排 1 筆把額度用滿，其餘落在一到八成之間
    const exhausted = active && index % EXHAUSTED_EVERY === EXHAUSTED_EVERY - 1
    const usageRatio = exhausted ? 1 : 0.12 + random() * 0.68

    index += 1
    // 試用只給還在使用中的帳號，過期帳號再掛試用會自相矛盾
    const inTrial = active && index % TRIAL_EVERY === 0
    const hasExtra = index % EXTRA_CREDIT_EVERY === 0

    subscriptions.push({
      id: `sub-${index}`,
      userId: user.id,
      planId,
      expiresAt,
      trialEndsAt: inTrial ? daysAhead(intBetween(random, 1, TRIAL_DAYS)) : null,
      extraCredits: hasExtra ? { 'contract-analysis': intBetween(random, 3, 10) } : {},
      // 用 floor：免費方案額度只有 3 次，四捨五入會讓一半的人都被算成用滿
      aiUsed: Math.min(quota.ai, Math.floor(quota.ai * usageRatio)),
      storageUsedMb: Math.min(quota.storage, Math.floor(quota.storage * usageRatio)),
      active,
    })
  }

  return subscriptions
}
