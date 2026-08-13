import { describe, expect, it } from 'vitest'

import { discardLegacy } from './admin-collection-migrate'

interface Row {
  id: string
  tenantUserId: string
}

const seed = (): Row[] => [{ id: 'seeded', tenantUserId: 'u-1' }]

describe('discardLegacy', () => {
  const migrate = discardLegacy<Row>(seed, 'tenantUserId')

  it('新格式原封不動保留', () => {
    const stored = [{ id: 'a', tenantUserId: 'u-9' }]
    expect(migrate(stored)).toBe(stored)
  })

  it('缺少標記欄位時整批重 seed', () => {
    const legacy = [{ id: 'a' }] as unknown as Row[]
    expect(migrate(legacy)).toEqual(seed())
  })

  it('只要有一筆是舊格式就整批重 seed，不做逐筆混用', () => {
    const mixed = [{ id: 'a', tenantUserId: 'u-9' }, { id: 'b' }] as unknown as Row[]
    expect(migrate(mixed)).toEqual(seed())
  })

  it('空陣列視為有效，不觸發重 seed', () => {
    const empty: Row[] = []
    expect(migrate(empty)).toBe(empty)
  })

  it('存進去的不是陣列時重 seed', () => {
    expect(migrate({ broken: true } as unknown as Row[])).toEqual(seed())
  })

  it('陣列裡有 null 時重 seed，不會炸開', () => {
    const withNull = [null] as unknown as Row[]
    expect(migrate(withNull)).toEqual(seed())
  })
})
