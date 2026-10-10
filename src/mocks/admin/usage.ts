import type { AdminUser } from './users'
import type { Subscription } from './subscription'
import type { AccountUsage, SpaceUsage } from '@/src/types/admin-usage'
import { getPlanLimits, userPlan } from '@/src/utils/admin-plans'

function idNumber(id: string): number {
  return Array.from(id).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0)
}

function tenantScenario(id: string): number {
  const core = ['u-tenant-1', 'u-tenant-2', 'u-tenant-3', 'u-tenant-4', 'u-tenant-5']
  const index = core.indexOf(id)
  return index >= 0 ? index : idNumber(id) % 6
}

/** 固定 ID 決定情境；用初始化時的生效方案產生一次，後台改方案不會改掉資源計數。 */
export function seedAccountUsage(
  users: AdminUser[],
  subscriptions: Subscription[],
  now: Date,
): Record<string, AccountUsage> {
  const result: Record<string, AccountUsage> = {}
  for (const user of users) {
    const subscription = subscriptions.find((item) => item.userId === user.id) ?? null
    const plan = userPlan(user, subscription, now)
    if (!plan) continue
    if (plan.role === 'landlord') {
      const limits = getPlanLimits('landlord', plan.key)
      const scenario = user.id === 'u-landlord-1' ? 1 : user.id === 'u-landlord-2' ? 2 : idNumber(user.id) % 4
      result[user.id] = {
        landlord: {
          properties: limits.properties.limit + (scenario === 2 ? 1 : scenario === 0 ? -1 : 0),
          rooms: limits.rooms.limit + (scenario === 3 ? 1 : scenario === 0 ? -1 : 0),
          seats: scenario === 1 ? limits.managers.limit : 1,
        },
        tenant: null,
      }
      continue
    }
    const limits = getPlanLimits('tenant', plan.key)
    const scenario = tenantScenario(user.id)
    const space = (owner: AdminUser, index: number, memberCount: number): SpaceUsage => ({
      id: idNumber(owner.id) * 10 + index,
      name: `${owner.nickname ?? owner.email}的共享空間${index === 1 ? '' : ` ${index}`}`,
      ownerId: idNumber(owner.id),
      ownerName: owner.nickname ?? owner.email,
      memberCount,
    })
    const ownedSpaces = scenario >= 4 ? [] : [space(user, 1,
      scenario === 3 ? limits.sharedMembers.limit + 1 : scenario === 1 ? limits.sharedMembers.limit : 2,
    )]
    if (scenario === 2) ownedSpaces.push(space(user, 2, 2))
    // 指向真的有自建空間的展示租客，加入者與擁有者才會看到一致的人數。
    const owner = users.filter((item) => item.role === 'user' && item.id !== user.id && tenantScenario(item.id) < 4)
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    const ownerPlan = owner ? userPlan(owner, subscriptions.find((item) => item.userId === owner.id) ?? null, now) : null
    const ownerLimit = ownerPlan ? getPlanLimits('tenant', ownerPlan.key).sharedMembers.limit : 0
    const ownerScenario = owner ? tenantScenario(owner.id) : 0
    const joinedSpaces = scenario === 4 && owner
      ? [space(owner, 1, ownerScenario === 3 ? ownerLimit + 1 : ownerScenario === 1 ? ownerLimit : 2)]
      : []
    result[user.id] = { landlord: null, tenant: { ownedSpaces, joinedSpaces } }
  }
  return result
}
