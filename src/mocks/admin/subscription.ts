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
  userEmail: string
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

export function seedSubscriptions(): Subscription[] {
  return [
    { id: 'sub-1', userEmail: 'amy.wang@example.com', planId: 'plus', expiresAt: daysAhead(25), aiUsed: 12, storageUsedMb: 860, active: true },
    { id: 'sub-2', userEmail: 'ben.liu@example.com', planId: 'free', expiresAt: daysAhead(365), aiUsed: 3, storageUsedMb: 150, active: true },
    { id: 'sub-3', userEmail: 'chen.landlord@example.com', planId: 'pro', expiresAt: daysAhead(5), aiUsed: 64, storageUsedMb: 6300, active: true },
    { id: 'sub-4', userEmail: 'elaine.ho@example.com', planId: 'plus', expiresAt: daysAhead(11), aiUsed: 19, storageUsedMb: 1900, active: true },
    { id: 'sub-5', userEmail: 'lin.house@example.com', planId: 'plus', expiresAt: daysAhead(80), aiUsed: 5, storageUsedMb: 400, active: true },
    { id: 'sub-6', userEmail: 'derek.wu@example.com', planId: 'free', expiresAt: daysAgo(10), aiUsed: 3, storageUsedMb: 90, active: false },
  ]
}
