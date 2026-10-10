import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminSubscriptionCollection, useAdminSubscription } from './useAdminSubscription'
import { adminUsersCollection } from './useAdminUsers'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions, type Subscription } from '@/src/mocks/admin/subscription'
import { effectivePlanKey } from '@/src/utils/admin-plans'
import type { PlanRole } from '@/src/utils/subscription-plans'

const { logAction } = vi.hoisted(() => ({ logAction: vi.fn() }))
vi.mock('./useAdminAudit', () => ({ useAdminAudit: () => ({ logAction }) }))
const now = new Date(2026, 0, 31, 12)
const { changePlan, grantCheckPacks } = useAdminSubscription()

function current(role: PlanRole = 'tenant'): Subscription {
  return adminSubscriptionCollection.value.find(
    (sub) => sub.role === role && sub.planKey === 'free',
  )!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  logAction.mockClear()
  adminUsersCollection.value = seedAdminUsers()
  adminSubscriptionCollection.value = seedSubscriptions(adminUsersCollection.value)
})
afterEach(() => vi.useRealTimers())

describe('changePlan', () => {
  it('Free 升級設為月繳；舊到期日改為一個月後並夾到月底', () => {
    const sub = current('landlord')
    sub.expiresAt = new Date(2026, 0, 1).toISOString()
    changePlan(sub.id, 'landlord', 'plus')
    expect(sub).toMatchObject({
      startedAt: now.toISOString(),
      planKey: 'plus',
      billingCycle: 'monthly',
      active: true,
      trialEndsAt: null,
    })
    expect(sub.expiresAt).toBe(new Date(2026, 1, 28, 12).toISOString())
    expect(logAction).toHaveBeenLastCalledWith(
      '訂閱',
      expect.any(String),
      '方案調整為「Plus 進階管理」',
    )
  })
  it('Free 升級丟棄原本未來的到期日，從首次付款重建排程', () => {
    const sub = current()
    sub.expiresAt = new Date(2026, 11, 1).toISOString()
    changePlan(sub.id, 'tenant', 'plus')
    expect(sub.billingCycle).toBe('monthly')
    expect(sub.startedAt).toBe(now.toISOString())
    expect(sub.expiresAt).toBe(new Date(2026, 1, 28, 12).toISOString())
  })
  it('付費互換保留週期，到 Free 則清除計費週期', () => {
    const sub = current()
    sub.planKey = 'plus'
    sub.billingCycle = 'yearly'
    const expiresAt = sub.expiresAt
    const startedAt = sub.startedAt
    changePlan(sub.id, 'tenant', 'pro')
    expect(sub.startedAt).toBe(startedAt)
    expect(sub.billingCycle).toBe('yearly')
    expect(sub.expiresAt).toBe(expiresAt)
    changePlan(sub.id, 'tenant', 'plus')
    expect(sub.startedAt).toBe(startedAt)
    expect(sub.expiresAt).toBe(expiresAt)
    expect(sub.billingCycle).toBe('yearly')
    changePlan(sub.id, 'tenant', 'free')
    expect(sub.billingCycle).toBeNull()
    expect(effectivePlanKey(sub, now)).toBe('free')
  })
  it('管理員調整立即生效，結束試用；停用的舊付費記錄重新啟用按月繳', () => {
    const sub = current()
    sub.trialEndsAt = new Date(2026, 1, 5).toISOString()
    changePlan(sub.id, 'tenant', 'free')
    expect(effectivePlanKey(sub, now)).toBe('free')
    expect(sub.trialEndsAt).toBeNull()
    sub.planKey = 'pro'
    sub.active = false
    sub.billingCycle = 'yearly'
    changePlan(sub.id, 'tenant', 'pro')
    expect(sub.active).toBe(true)
    expect(sub.billingCycle).toBe('monthly')
    expect(sub.startedAt).toBe(now.toISOString())
    expect(sub.expiresAt).toBe(new Date(2026, 1, 28, 12).toISOString())
  })
  it('跨角色與管理員拒絕調整，無效 id 與不變的方案不寫稽核', () => {
    const sub = current()
    changePlan(sub.id, 'landlord', 'pro')
    expect(sub.planKey).toBe('free')
    changePlan('missing', 'tenant', 'pro')
    changePlan(sub.id, 'tenant', 'free')
    adminUsersCollection.value.find((user) => user.id === sub.userId)!.role = 'admin'
    changePlan(sub.id, 'tenant', 'pro')
    expect(sub.planKey).toBe('free')
    expect(logAction).not.toHaveBeenCalled()
  })
})

describe('grantCheckPacks', () => {
  it('新增來源 admin、時間與包數，稽核不偽造購買', () => {
    const sub = current()
    grantCheckPacks(sub.id, 3)
    if (sub.role !== 'tenant') throw new Error('需要租客測試資料')
    expect(sub.checkPacks).toEqual([
      {
        id: expect.any(String),
        source: 'admin',
        quantity: 3,
        createdAt: now.toISOString(),
        usedAt: [],
      },
    ])
    expect(logAction).toHaveBeenLastCalledWith('訂閱', expect.any(String), '補發契約檢查包 3 包')
  })
  it.each([0, -1, 1.5, NaN, Infinity])('拒絕非正整數 %s', (quantity) => {
    const sub = current()
    grantCheckPacks(sub.id, quantity)
    expect(sub.role === 'tenant' && sub.checkPacks).toEqual([])
    expect(logAction).not.toHaveBeenCalled()
  })
  it('房東與角色已異動的租客呼叫無作用', () => {
    const sub = current('landlord')
    grantCheckPacks(sub.id, 3)
    expect(sub).not.toHaveProperty('checkPacks')
    const tenant = current()
    adminUsersCollection.value.find((user) => user.id === tenant.userId)!.role = 'landlord'
    grantCheckPacks(tenant.id, 3)
    expect(logAction).not.toHaveBeenCalled()
  })
})
