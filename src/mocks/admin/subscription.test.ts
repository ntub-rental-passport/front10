import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedAdminUsers } from './users'
import { seedSubscriptions, type Subscription } from './subscription'
import { discardLegacy } from '@/src/utils/admin-collection-migrate'
import { isSubscriptionExpiring } from '@/src/utils/admin-user-directory'
import { billingDate, effectivePlanKey, isInTrial, tenantAiUsage } from '@/src/utils/admin-plans'

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

  it('付費開始日分散在 1～18 個月前，各角色年繳月份有變化', () => {
    const subscriptions = seedSubscriptions()
    for (const subscription of subscriptions.filter((sub) => sub.planKey !== 'free')) {
      const start = new Date(subscription.startedAt)
      const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
      expect(months).toBeGreaterThanOrEqual(1)
      expect(months).toBeLessThanOrEqual(18)
    }
    for (const role of ['landlord', 'tenant'] as const) {
      const annualMonths = subscriptions.filter((sub) => sub.role === role && sub.billingCycle === 'yearly')
        .map((sub) => new Date(sub.expiresAt).getMonth())
      expect(new Set(annualMonths).size).toBeGreaterThan(1)
    }
  })

  it.each([
    now,
    new Date(2026, 0, 31, 12),
    new Date(2026, 1, 28, 12),
    new Date(2024, 1, 29, 12),
  ])('付費起訖同在排程上，生效者取首個未來續扣、停用者取過去取消邊界：%s', (at) => {
    vi.setSystemTime(at)
    const subscriptions = seedSubscriptions()
    const paid = subscriptions.filter((sub) => sub.billingCycle !== null)
    for (const subscription of paid) {
      const start = new Date(subscription.startedAt)
      const end = new Date(subscription.expiresAt)
      const step = subscription.billingCycle === 'yearly' ? 12 : 1
      const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
      expect(months).toBeGreaterThanOrEqual(step)
      expect(months % step).toBe(0)
      const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
      expect(end.getDate()).toBe(Math.min(start.getDate(), lastDay))
      expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()])
        .toEqual([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()])
      const dates = Array.from({ length: months / step }, (_, period) =>
        billingDate(start, subscription.billingCycle!, period),
      )
      expect(dates[0].toISOString()).toBe(subscription.startedAt)
      expect(dates.every((date) => date < end && date <= at)).toBe(true)
      expect(billingDate(start, subscription.billingCycle!, dates.length)).toEqual(end)
      if (subscription.active) {
        expect(end.getTime()).toBeGreaterThan(at.getTime())
        expect(dates.at(-1)!.getTime()).toBeLessThanOrEqual(at.getTime())
      } else {
        expect(end.getTime()).toBeLessThanOrEqual(at.getTime())
      }
    }
    for (const role of ['landlord', 'tenant'] as const) {
      expect(paid.some((sub) => sub.role === role && isSubscriptionExpiring(sub, 14, at))).toBe(true)
    }
  })

  it('丟棄缺少 startedAt 的舊角色方案資料，保留新格式', () => {
    const migrate = discardLegacy(seedSubscriptions, 'startedAt')
    const current = seedSubscriptions()
    expect(migrate(current)).toBe(current)
    const old = current.map(({ startedAt: _startedAt, ...subscription }) => subscription) as Subscription[]
    expect(migrate(old)).toEqual(current)
  })

  it('丟棄沒有角色欄位的舊訂閱，保留新格式', () => {
    const migrate = discardLegacy(seedSubscriptions, 'role')
    const current = seedSubscriptions()
    expect(migrate(current)).toBe(current)
    const old = [{ id: 'old', userId: 'old-user', extraCredits: {} }] as unknown as Subscription[]
    expect(migrate(old)).toEqual(current)
  })
})
