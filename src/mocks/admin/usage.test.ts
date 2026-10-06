import { describe, expect, it } from 'vitest'
import { seedAccountUsage } from './usage'
import { seedAdminUsers } from './users'
import { seedSubscriptions } from './subscription'
import { getPlanLimits, userPlan } from '@/src/utils/admin-plans'
import { accountUsageLimits } from '@/src/utils/admin-usage'

const users = seedAdminUsers()
const subscriptions = seedSubscriptions(users)
const now = new Date()
const usage = seedAccountUsage(users, subscriptions, now)

describe('展示帳號用量', () => {
  it('同 ID 決定同用量，重算或改順序不變，管理員與真實 ID 不在資料裡', () => {
    expect(seedAccountUsage(users, subscriptions, now)).toEqual(usage)
    expect(seedAccountUsage([...users].reverse(), subscriptions, now)).toEqual(usage)
    expect(Object.keys(usage)).toHaveLength(users.filter((user) => user.role !== 'admin').length)
    expect(usage['u-admin-1']).toBeUndefined()
    expect(usage['real-1']).toBeUndefined()
  })
  it('房東涵蓋未滿、剛好滿、物件超出與房間超出', () => {
    const results = users.filter((user) => user.role === 'landlord').map((user) =>
      accountUsageLimits(userPlan(user, subscriptions.find((item) => item.userId === user.id) ?? null, now), usage[user.id]),
    ).filter((item) => item?.role === 'landlord')
    expect(results.some((item) => item.properties.used < item.properties.limit && item.rooms.used < item.rooms.limit && !item.overLimit)).toBe(true)
    expect(results.some((item) => item.properties.used === item.properties.limit && item.rooms.used === item.rooms.limit && item.seats.used === item.seats.limit && !item.overLimit)).toBe(true)
    expect(results.some((item) => item.properties.overLimit)).toBe(true)
    expect(results.some((item) => item.rooms.overLimit)).toBe(true)
  })
  it('租客涵蓋未滿、剛好滿、兩個空間、人數超出、只加入與無空間', () => {
    const results = users.filter((user) => user.role === 'user').map((user) => ({
      usage: usage[user.id].tenant!,
      limits: accountUsageLimits(userPlan(user, subscriptions.find((item) => item.userId === user.id) ?? null, now), usage[user.id]),
    }))
    expect(results.some(({ limits }) => limits?.role === 'tenant' && limits.ownedSpaces.some((space) => space.used < space.limit) && !limits.overLimit)).toBe(true)
    expect(results.some(({ limits }) => limits?.role === 'tenant' && limits.ownedSpaces.some((space) => space.used === space.limit) && !limits.overLimit)).toBe(true)
    expect(results.some(({ limits }) => limits?.role === 'tenant' && limits.sharedSpaces.used === 2 && limits.overLimit)).toBe(true)
    expect(results.some(({ limits }) => limits?.role === 'tenant' && limits.ownedSpaces.some((space) => space.overLimit))).toBe(true)
    expect(results.some(({ usage, limits }) => usage.ownedSpaces.length === 0 && usage.joinedSpaces.length > 0 && !limits?.overLimit)).toBe(true)
    expect(results.some(({ usage }) => usage.ownedSpaces.length === 0 && usage.joinedSpaces.length === 0)).toBe(true)
    for (const { usage: tenant } of results) {
      for (const joined of tenant.joinedSpaces) {
        const owned = results.flatMap(({ usage }) => usage.ownedSpaces).find((space) => space.id === joined.id)
        expect(owned).toEqual(joined)
        expect(users.some((user) => user.role === 'user' && (user.nickname ?? user.email) === joined.ownerName)).toBe(true)
      }
    }
  })
  it('展示試用帳號依 Plus 上限生成', () => {
    const user = users.find((item) => item.id === 'u-tenant-2')!
    const subscription = subscriptions.find((item) => item.userId === user.id)!
    const trial = { ...subscription, planKey: 'free' as const, active: true, trialEndsAt: '2026-10-08T00:00:00.000Z' }
    const seeded = seedAccountUsage(users, [trial], new Date('2026-10-06T00:00:00.000Z'))
    expect(seeded[user.id].tenant!.ownedSpaces[0].memberCount).toBe(getPlanLimits('tenant', 'plus').sharedMembers.limit)
  })
})
