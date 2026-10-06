import { describe, expect, it } from 'vitest'
import { accountUsageLimits } from './admin-usage'
import { userPlan } from './admin-plans'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import type { AccountUsage, SpaceUsage } from '@/src/types/admin-usage'

const space: SpaceUsage = { id: 1, name: '測試空間', ownerId: 1, ownerName: '小艾', memberCount: 3 }
const landlord: AccountUsage = { landlord: { properties: 1, rooms: 5, seats: 1 }, tenant: null }
const tenant = (ownedSpaces: SpaceUsage[], joinedSpaces: SpaceUsage[] = []): AccountUsage => ({
  landlord: null, tenant: { ownedSpaces, joinedSpaces },
})

describe('accountUsageLimits', () => {
  it('房東等於上限正常，每一項大於才算超出', () => {
    const plan = { role: 'landlord', key: 'free' } as const
    expect(accountUsageLimits(plan, landlord)).toEqual({
      role: 'landlord',
      properties: { used: 1, limit: 1, overLimit: false },
      rooms: { used: 5, limit: 5, overLimit: false },
      seats: { used: 1, limit: 1, overLimit: false },
      overLimit: false,
    })
    for (const key of ['properties', 'rooms', 'seats'] as const) {
      const result = accountUsageLimits(plan, {
        ...landlord, landlord: { ...landlord.landlord!, [key]: landlord.landlord![key] + 1 },
      })
      expect(result?.overLimit).toBe(true)
      if (result?.role !== 'landlord') throw new Error('需要房東判斷')
      expect(result[key].overLimit).toBe(true)
    }
  })
  it('租客一個空間且人數等於上限正常，人數超出才警示', () => {
    const plan = { role: 'tenant', key: 'free' } as const
    const result = accountUsageLimits(plan, tenant([space]))
    expect(result?.overLimit).toBe(false)
    if (result?.role !== 'tenant') throw new Error('需要租客判斷')
    expect(result.sharedSpaces).toEqual({ used: 1, limit: 1, overLimit: false })
    expect(result.ownedSpaces[0]).toMatchObject({ used: 3, limit: 3, overLimit: false })
    expect(accountUsageLimits(plan, tenant([{ ...space, memberCount: 4 }]))?.overLimit).toBe(true)
  })
  it('兩個自建空間算超出，即使每個人數都沒超出', () => {
    const result = accountUsageLimits({ role: 'tenant', key: 'pro' }, tenant([space, { ...space, id: 2 }]))
    expect(result?.overLimit).toBe(true)
    if (result?.role !== 'tenant') throw new Error('需要租客判斷')
    expect(result.sharedSpaces.overLimit).toBe(true)
    expect(result.ownedSpaces.every((item) => !item.overLimit)).toBe(true)
  })
  it('只加入別人空間不佔額度，即使加入多個或人數超出自己的方案', () => {
    const result = accountUsageLimits({ role: 'tenant', key: 'free' }, tenant([], [
      { ...space, memberCount: 10 }, { ...space, id: 2, memberCount: 20 },
    ]))
    expect(result).toMatchObject({ sharedSpaces: { used: 0, limit: 1, overLimit: false }, ownedSpaces: [], overLimit: false })
  })
  it.each(['landlord', 'user'] as const)('Free %s 試用 Plus 採 Plus 上限', (role) => {
    const user = seedAdminUsers().find((item) => item.role === role)!
    const subscription = seedSubscriptions([user])[0]
    subscription.trialEndsAt = '2026-10-08T00:00:00.000Z'
    const plan = userPlan(user, subscription, new Date('2026-10-06T00:00:00.000Z'))
    const usage = role === 'landlord'
      ? { landlord: { properties: 5, rooms: 30, seats: 1 }, tenant: null }
      : tenant([{ ...space, memberCount: 4 }])
    expect(plan?.key).toBe('plus')
    expect(accountUsageLimits(plan, usage)?.overLimit).toBe(false)
    expect(accountUsageLimits({ role: plan!.role, key: 'free' }, usage)?.overLimit).toBe(true)
  })
  it('管理員不適用，缺用量或缺對應角色用量都回 null', () => {
    expect(accountUsageLimits(userPlan({ role: 'admin' }, null), landlord)).toBeNull()
    expect(accountUsageLimits({ role: 'landlord', key: 'free' }, null)).toBeNull()
    expect(accountUsageLimits({ role: 'landlord', key: 'free' }, tenant([]))).toBeNull()
    expect(accountUsageLimits({ role: 'tenant', key: 'free' }, landlord)).toBeNull()
  })
})
