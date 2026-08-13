import { daysAgo, daysAhead } from './helpers'

export type PlanId = 'free' | 'plus' | 'pro'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  aiQuota: number
  storageMb: number
}

export interface Subscription {
  id: string
  userId: string
  planId: PlanId
  expiresAt: string
  aiUsed: number
  storageUsedMb: number
  active: boolean
}

export function seedPlans(): SubscriptionPlan[] {
  return [
    { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
    { id: 'plus', name: '進階方案', priceLabel: 'NT$99／月', aiQuota: 20, storageMb: 2048 },
    { id: 'pro', name: '專業方案', priceLabel: 'NT$299／月', aiQuota: 100, storageMb: 10240 },
  ]
}

/** u-tenant-3 刻意沒有訂閱，用來驗證詳情頁的「尚未訂閱」空狀態 */
export function seedSubscriptions(): Subscription[] {
  return [
    { id: 'sub-1', userId: 'u-tenant-1', planId: 'plus', expiresAt: daysAhead(25), aiUsed: 12, storageUsedMb: 860, active: true },
    { id: 'sub-2', userId: 'u-tenant-2', planId: 'free', expiresAt: daysAhead(365), aiUsed: 3, storageUsedMb: 150, active: true },
    { id: 'sub-3', userId: 'u-landlord-1', planId: 'pro', expiresAt: daysAhead(5), aiUsed: 64, storageUsedMb: 6300, active: true },
    { id: 'sub-4', userId: 'u-tenant-5', planId: 'plus', expiresAt: daysAhead(11), aiUsed: 19, storageUsedMb: 1900, active: true },
    { id: 'sub-5', userId: 'u-landlord-2', planId: 'plus', expiresAt: daysAhead(80), aiUsed: 5, storageUsedMb: 400, active: true },
    { id: 'sub-6', userId: 'u-tenant-4', planId: 'free', expiresAt: daysAgo(10), aiUsed: 3, storageUsedMb: 90, active: false },
  ]
}
