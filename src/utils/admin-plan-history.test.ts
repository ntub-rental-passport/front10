import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedAdminUsers, type AdminUser } from '@/src/mocks/admin/users'
import { seedSubscriptions, type LandlordSubscription } from '@/src/mocks/admin/subscription'
import { joinUserDirectory, planDistribution } from './admin-user-directory'
import { monthlyPlanCounts } from './admin-plan-history'
import { monthlyCheckPackPurchases } from './admin-addon-purchases'
import { lastTwelveMonths } from './admin-chart-months'
import { TRIAL_DAYS } from './admin-plans'

const now = new Date(2026, 9, 20, 12)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

function row(
  subscription: Partial<LandlordSubscription> | null = null,
  user: Partial<AdminUser> = {},
) {
  const member = {
    ...seedAdminUsers().find((item) => item.role === 'landlord')!,
    registeredAt: new Date(2025, 0, 1).toISOString(),
    ...user,
  }
  const sub: LandlordSubscription | null = subscription && {
    id: 'test',
    userId: member.id,
    role: 'landlord',
    planKey: 'pro',
    active: true,
    billingCycle: 'monthly',
    startedAt: new Date(2026, 5, 15).toISOString(),
    expiresAt: new Date(2026, 8, 15).toISOString(),
    trialEndsAt: null,
    ...subscription,
  }
  return joinUserDirectory(
    { users: [member], subscriptions: sub ? [sub] : [], tickets: [], deposits: [] },
    14,
    now,
  )[0]!
}

describe('monthlyPlanCounts', () => {
  it.each(['landlord', 'tenant'] as const)('%s 種子資料的本月人數等於目前方案分布', (role) => {
    const users = seedAdminUsers()
    const rows = joinUserDirectory(
      { users, subscriptions: seedSubscriptions(users), tickets: [], deposits: [] },
      14,
      now,
    )
    const before = structuredClone(rows)
    const months = monthlyPlanCounts(rows, role, now)
    expect(months).toHaveLength(12)
    expect(months.map(({ month, label }) => ({ month, label }))).toEqual(
      monthlyCheckPackPurchases([], now).map(({ month, label }) => ({ month, label })),
    )
    for (const segment of planDistribution(rows, role, now)) {
      expect(months.at(-1)!.counts[segment.planKey]).toBe(segment.value)
    }
    expect(rows).toEqual(before)
  })

  it('註冊月份才開始計數，本月只計 now 前已註冊的使用者', () => {
    const months = monthlyPlanCounts(
      [
        row(null, { registeredAt: new Date(2026, 5, 15).toISOString() }),
        row(null, { registeredAt: new Date(now.getTime() + 1).toISOString() }),
      ],
      'landlord',
      now,
    )
    expect(months.slice(0, 7).every(({ counts }) => counts.free === 0)).toBe(true)
    expect(months.slice(7).every(({ counts }) => counts.free === 1)).toBe(true)
  })

  it('付費開始前為 Free，active 訂閱不受過去到期日影響', () => {
    const months = monthlyPlanCounts([row({})], 'landlord', now)
    expect(months.slice(0, 7).every(({ counts }) => counts.free === 1)).toBe(true)
    expect(months.slice(7).every(({ counts }) => counts.pro === 1)).toBe(true)
  })

  it('已取消付費訂閱在到期前仍計付費，到期後為 Free', () => {
    const months = monthlyPlanCounts([row({ active: false })], 'landlord', now)
    expect(months.slice(7, 10).every(({ counts }) => counts.pro === 1)).toBe(true)
    expect(months.slice(10).every(({ counts }) => counts.free === 1)).toBe(true)
  })

  it.each(['free', 'pro'] as const)(
    '%s 只在十四天試用窗口內為 Plus，窗口外依原方案計數',
    (planKey) => {
      const months = monthlyPlanCounts(
        [row({ planKey, trialEndsAt: new Date(2026, 7, 1).toISOString() })],
        'landlord',
        now,
      )
      expect(months.slice(0, 7).every(({ counts }) => counts.free === 1)).toBe(true)
      expect(months[7]!.counts).toEqual({
        free: planKey === 'free' ? 1 : 0,
        plus: 0,
        pro: planKey === 'pro' ? 1 : 0,
      })
      expect(months[8]!.counts).toEqual({ free: 0, plus: 1, pro: 0 })
      expect(
        months.slice(9).every(({ counts }) => counts[planKey] === 1 && counts.plus === 0),
      ).toBe(true)
    },
  )

  it('試用含開始時間、不含結束時間，窗口內優先於付費開始日', () => {
    const trialEndsAt = new Date(2026, 9, 27, 12)
    const trialStart = new Date(trialEndsAt.getTime() - TRIAL_DAYS * 24 * 60 * 60 * 1000)
    const member = row({
      startedAt: new Date(2026, 10, 1).toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
    })
    for (const [snapshot, planKey] of [
      [new Date(trialStart.getTime() - 1), 'free'],
      [trialStart, 'plus'],
      [now, 'plus'],
      [trialEndsAt, 'free'],
    ] as const) {
      expect(monthlyPlanCounts([member], 'landlord', snapshot).at(-1)!.counts[planKey]).toBe(1)
    }
    expect(
      monthlyPlanCounts([member], 'landlord', now)
        .slice(0, -1)
        .every(({ counts }) => counts.plus === 0),
    ).toBe(true)
    for (const segment of planDistribution([member], 'landlord', now)) {
      expect(monthlyPlanCounts([member], 'landlord', now).at(-1)!.counts[segment.planKey]).toBe(
        segment.value,
      )
    }
  })

  it('已到期的訂閱即使在試用窗口內仍為 Free', () => {
    expect(
      monthlyPlanCounts(
        [row({ active: false, trialEndsAt: new Date(2026, 10, 1).toISOString() })],
        'landlord',
        now,
      ).at(-1)!.counts.free,
    ).toBe(1)
  })

  it('月底最後一毫秒含註冊及開始日，到期和試用結束日不含邊界', () => {
    const end = new Date(2026, 8, 1).getTime() - 1
    const atEnd = new Date(end).toISOString()
    const months = monthlyPlanCounts(
      [
        row({ startedAt: atEnd }, { registeredAt: atEnd }),
        row({ active: false, expiresAt: atEnd }),
        row({ trialEndsAt: atEnd }),
        row(null, { registeredAt: new Date(end + 1).toISOString() }),
      ],
      'landlord',
      now,
    )
    expect(months[9]!.counts).toEqual({ free: 1, plus: 0, pro: 2 })
  })

  it('忽略管理員及其他角色，訂閱角色不符時為 Free', () => {
    const mismatch = row({})
    mismatch.subscription = seedSubscriptions().find((sub) => sub.role === 'tenant')!
    const rows = [row({}, { role: 'admin' }), row(null, { role: 'user' }), mismatch]
    expect(monthlyPlanCounts(rows, 'landlord', now).at(-1)!.counts).toEqual({
      free: 1,
      plus: 0,
      pro: 0,
    })
    expect(monthlyPlanCounts(rows, 'tenant', now).at(-1)!.counts).toEqual({
      free: 1,
      plus: 0,
      pro: 0,
    })
  })

  it('空資料仍回傳十二個零計數，月份邊界使用本地日曆並支援閏年', () => {
    expect(
      monthlyPlanCounts([], 'landlord', now).every(({ counts }) =>
        Object.values(counts).every((value) => value === 0),
      ),
    ).toBe(true)
    const february = lastTwelveMonths(new Date(2024, 2, 10)).find(
      ({ month }) => month === '2024-02',
    )!
    expect(february.start).toEqual(new Date(2024, 1, 1))
    expect(february.end).toEqual(new Date(2024, 2, 1))
    expect(new Date(february.end.getTime() - 1).getDate()).toBe(29)
  })
})
