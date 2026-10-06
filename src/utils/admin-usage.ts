import type { AccountUsage, SpaceUsage } from '@/src/types/admin-usage'
import { getPlanLimits } from './admin-plans'
import type { PlanKey, PlanRole } from './subscription-plans'

export interface UsageLimit {
  used: number
  limit: number
  overLimit: boolean
}

export type AccountUsageLimits =
  | { role: 'landlord', properties: UsageLimit, rooms: UsageLimit, seats: UsageLimit, overLimit: boolean }
  | { role: 'tenant', sharedSpaces: UsageLimit, ownedSpaces: (SpaceUsage & UsageLimit)[], overLimit: boolean }

function compare(used: number, limit: number): UsageLimit {
  return { used, limit, overLimit: used > limit }
}

/** 只比較自建資源；讀不到與不適用都回 null，不能把未知當成零用量。 */
export function accountUsageLimits(
  plan: { role: PlanRole, key: PlanKey } | null,
  usage: AccountUsage | null,
): AccountUsageLimits | null {
  if (!plan || !usage) return null
  if (plan.role === 'landlord') {
    if (!usage.landlord) return null
    const limits = getPlanLimits('landlord', plan.key)
    const properties = compare(usage.landlord.properties, limits.properties.limit)
    const rooms = compare(usage.landlord.rooms, limits.rooms.limit)
    const seats = compare(usage.landlord.seats, limits.managers.limit)
    return { role: 'landlord', properties, rooms, seats, overLimit: properties.overLimit || rooms.overLimit || seats.overLimit }
  }
  if (!usage.tenant) return null
  const limits = getPlanLimits('tenant', plan.key)
  const sharedSpaces = compare(usage.tenant.ownedSpaces.length, limits.sharedSpaces.limit)
  const ownedSpaces = usage.tenant.ownedSpaces.map((space) => ({
    ...space,
    ...compare(space.memberCount, limits.sharedMembers.limit),
  }))
  return { role: 'tenant', sharedSpaces, ownedSpaces, overLimit: sharedSpaces.overLimit || ownedSpaces.some((space) => space.overLimit) }
}
