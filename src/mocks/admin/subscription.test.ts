import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedAdminUsers } from './users'
import { seedSubscriptions, type Subscription } from './subscription'
import { discardLegacy } from '@/src/utils/admin-collection-migrate'
import { isSubscriptionExpiring } from '@/src/utils/admin-user-directory'
import { effectivePlanKey, isInTrial, tenantAiUsage } from '@/src/utils/admin-plans'

const now = new Date(2026, 9, 6, 12)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

describe('seedSubscriptions', () => {
  it('固定循環涵蓋兩角色三方案、兩種計費週期、到期與試用情境', () => {
    const users = seedAdminUsers()
    const subscriptions = seedSubscriptions(users)
    expect(subscriptions).toEqual(seedSubscriptions(users))
    expect(subscriptions).toHaveLength(users.filter((user) => user.role !== 'admin').length)
    for (const subscription of subscriptions) {
      expect(users.find((user) => user.id === subscription.userId)?.role).toBe(
        subscription.role === 'tenant' ? 'user' : 'landlord',
      )
      if (subscription.planKey === 'free') expect(subscription.billingCycle).toBeNull()
      if (subscription.role === 'landlord') {
        expect(subscription).not.toHaveProperty('aiUsed')
        expect(subscription).not.toHaveProperty('checkPacks')
      }
      if (subscription.active) {
        const days = (new Date(subscription.expiresAt).getTime() - now.getTime()) / 86_400_000
        expect(days).toBeGreaterThan(0)
        expect(days).toBeLessThanOrEqual(subscription.billingCycle === 'yearly' ? 366 : 31)
      }
      if (subscription.trialEndsAt) {
        expect(new Date(subscription.trialEndsAt).getTime() - now.getTime()).toBeLessThanOrEqual(
          14 * 86_400_000,
        )
      }
    }
    for (const role of ['landlord', 'tenant'] as const) {
      const group = subscriptions.filter((sub) => sub.role === role)
      expect(new Set(group.map((sub) => effectivePlanKey(sub, now)))).toEqual(
        new Set(['free', 'plus', 'pro']),
      )
      expect(
        new Set(
          group
            .filter((sub) => sub.active && sub.planKey !== 'free')
            .map((sub) => sub.billingCycle),
        ),
      ).toEqual(new Set(['monthly', 'yearly']))
      expect(group.some((sub) => isSubscriptionExpiring(sub, 14, now))).toBe(true)
      expect(group.some((sub) => isInTrial(sub.trialEndsAt, now))).toBe(true)
    }
    const tenants = subscriptions.filter((sub) => sub.role === 'tenant')
    expect(
      tenants.some(
        (sub) =>
          sub.active &&
          tenantAiUsage(sub, users.find((user) => user.id === sub.userId)!.emailVerified, now)
            .exhausted,
      ),
    ).toBe(true)
    expect(new Set(tenants.flatMap((sub) => sub.checkPacks.map((pack) => pack.source)))).toEqual(
      new Set(['purchase', 'admin']),
    )
  })

  it('丟棄沒有角色欄位的舊訂閱，保留新格式', () => {
    const migrate = discardLegacy(seedSubscriptions, 'role')
    const current = seedSubscriptions()
    expect(migrate(current)).toBe(current)
    const old = [{ id: 'old', userId: 'old-user', extraCredits: {} }] as unknown as Subscription[]
    expect(migrate(old)).toEqual(current)
  })
})
