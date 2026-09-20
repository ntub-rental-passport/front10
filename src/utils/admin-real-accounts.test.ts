import { describe, expect, it } from 'vitest'

import {
  realAccountStats,
  registrationSources,
  type RealAccountLike,
} from './admin-real-accounts'

const NOW = new Date('2026-09-20T12:00:00Z')

function account(overrides: Partial<RealAccountLike> = {}): RealAccountLike {
  return {
    status: 'active',
    emailVerified: true,
    hasPassword: true,
    providers: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('realAccountStats', () => {
  it('沒有帳號時每一項都是 0', () => {
    expect(realAccountStats([], NOW)).toEqual({
      total: 0, newThisWeek: 0, suspended: 0, unverified: 0,
    })
  })

  it('數得出停用與未驗證', () => {
    const stats = realAccountStats([
      account(),
      account({ status: 'suspended' }),
      account({ emailVerified: false }),
      account({ status: 'suspended', emailVerified: false }),
    ], NOW)
    expect(stats.total).toBe(4)
    expect(stats.suspended).toBe(2)
    expect(stats.unverified).toBe(2)
  })

  it('近 7 天才算新註冊', () => {
    const stats = realAccountStats([
      account({ createdAt: '2026-09-20T11:00:00Z' }),  // 1 小時前
      account({ createdAt: '2026-09-14T12:00:00Z' }),  // 剛好 6 天前
      account({ createdAt: '2026-09-12T12:00:00Z' }),  // 8 天前，不算
    ], NOW)
    expect(stats.newThisWeek).toBe(2)
  })

  it('邊界剛好 7 天算在內', () => {
    const stats = realAccountStats(
      [account({ createdAt: '2026-09-13T12:00:00Z' })], NOW)
    expect(stats.newThisWeek).toBe(1)
  })

  it('沒有或解析不了的註冊時間不算新註冊', () => {
    // 關鍵：不能當成「剛註冊」，否則沒有新使用者時這個數字會自己長大
    const stats = realAccountStats([
      account({ createdAt: null }),
      account({ createdAt: '不是日期' }),
    ], NOW)
    expect(stats.newThisWeek).toBe(0)
    expect(stats.total).toBe(2)
  })
})

describe('registrationSources', () => {
  it('分得出四種來源', () => {
    const segments = registrationSources([
      account({ providers: ['google'], hasPassword: false }),
      account({ providers: [], hasPassword: true }),
      account({ providers: ['google'], hasPassword: true }),
      account({ providers: [], hasPassword: false }),
    ])
    expect(Object.fromEntries(segments.map((s) => [s.key, s.count]))).toEqual({
      google: 1, password: 1, both: 1, none: 1,
    })
  })

  it('同時有 Google 與密碼的算「兩者皆有」，不重複計入', () => {
    // 硬塞進其中一邊會讓兩個數字都變錯
    const segments = registrationSources([
      account({ providers: ['google'], hasPassword: true }),
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0]!.key).toBe('both')
    expect(segments.reduce((sum, s) => sum + s.count, 0)).toBe(1)
  })

  it('數量為 0 的分類不出現', () => {
    const segments = registrationSources([
      account({ providers: ['google'], hasPassword: false }),
    ])
    expect(segments.map((s) => s.key)).toEqual(['google'])
  })

  it('總和永遠等於帳號數', () => {
    const accounts = [
      account({ providers: ['google'], hasPassword: false }),
      account({ providers: ['google'], hasPassword: false }),
      account({ providers: [], hasPassword: true }),
      account({ providers: ['google'], hasPassword: true }),
      account({ providers: [], hasPassword: false }),
    ]
    const total = registrationSources(accounts).reduce((sum, s) => sum + s.count, 0)
    expect(total).toBe(accounts.length)
  })

  it('沒有帳號時回空陣列', () => {
    expect(registrationSources([])).toEqual([])
  })
})
