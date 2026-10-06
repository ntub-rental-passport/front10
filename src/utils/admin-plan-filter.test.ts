import { describe, expect, it } from 'vitest'
import { planFilterQuery } from './admin-plan-filter'

describe('planFilterQuery', () => {
  it.each([
    ['landlord', 'free', 'landlord', 'landlord-free'],
    ['landlord', 'plus', 'landlord', 'landlord-plus'],
    ['landlord', 'pro', 'landlord', 'landlord-pro'],
    ['tenant', 'free', 'user', 'tenant-free'],
    ['tenant', 'plus', 'user', 'tenant-plus'],
    ['tenant', 'pro', 'user', 'tenant-pro'],
  ] as const)('%s 的 %s 導向對應的角色與方案 query', (role, planKey, filterRole, plan) => {
    expect(planFilterQuery(role, planKey)).toEqual({ role: filterRole, plan })
  })
})
