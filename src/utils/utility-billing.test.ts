import { describe, expect, it } from 'vitest'
import { cleanUtilityEntry, utilityPreview } from './utility-billing'

describe('utility billing preview', () => {
  it('calculates meter, shared and master bills', () => {
    expect(utilityPreview({ method: 'meter', previous: 100, current: 220, rate: 5 }).amount).toBe(600)
    expect(utilityPreview({ method: 'shared', total: 900, share: 15, shares: 45 }).amount).toBe(300)
    expect(utilityPreview({ method: 'master', previous: 100, current: 220, total: 1500, main_usage: 300, sub_usage: 240, share: 1, shares: 2 }).amount).toBe(750)
    expect(utilityPreview({ method: 'amount', amount: '520.5' }).amount).toBe(521)
  })
  it('preserves unknown versus zero and rejects incomplete or inconsistent inputs', () => {
    expect(utilityPreview({ method: 'pending' }).amount).toBeNull()
    expect(utilityPreview({ method: 'included' }).amount).toBe(0)
    expect(utilityPreview({ method: 'amount', amount: '' }).error).toBeTruthy()
    expect(utilityPreview({ method: 'meter', previous: 220, current: 100, rate: 5 }).error).toBeTruthy()
    expect(utilityPreview({ method: 'meter', previous: 220, current: 220, rate: 5 }).error).toBeTruthy()
    expect(utilityPreview({ method: 'amount', payer: 'tenant_direct' }).amount).toBe(0)
    expect(utilityPreview({ method: 'shared', total: 900, share: 1, shares: 0 }).error).toBeTruthy()
  })
  it('drops previous mode fields when switching methods', () => {
    expect(cleanUtilityEntry({ method: 'included', amount: 520 })).toEqual({ method: 'included' })
  })
})
