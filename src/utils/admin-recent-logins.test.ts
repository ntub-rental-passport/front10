import { describe, expect, it } from 'vitest'

import { recentLogins, type RecentLoginLike } from './admin-recent-logins'

function account(overrides: Partial<RecentLoginLike> = {}): RecentLoginLike {
  return {
    id: 1,
    email: 'user@example.com',
    displayName: null,
    lastLoginAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('recentLogins', () => {
  it('沒有帳號時回空陣列', () => {
    expect(recentLogins([])).toEqual([])
  })

  it('依 lastLoginAt 由新到舊排序', () => {
    const result = recentLogins([
      account({ id: 1, lastLoginAt: '2026-09-01T00:00:00Z' }),
      account({ id: 2, lastLoginAt: '2026-09-10T00:00:00Z' }),
      account({ id: 3, lastLoginAt: '2026-09-05T00:00:00Z' }),
    ])
    expect(result.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('從未登入過（lastLoginAt 為 null）的帳號不列入', () => {
    const result = recentLogins([
      account({ id: 1, lastLoginAt: null }),
      account({ id: 2, lastLoginAt: '2026-09-01T00:00:00Z' }),
    ])
    expect(result.map((r) => r.id)).toEqual([2])
  })

  it('無法解析的登入時間也不列入，不會讓 NaN 混進排序', () => {
    const result = recentLogins([
      account({ id: 1, lastLoginAt: '不是日期' }),
      account({ id: 2, lastLoginAt: '2026-09-01T00:00:00Z' }),
    ])
    expect(result.map((r) => r.id)).toEqual([2])
  })

  it('預設只取前 5 筆', () => {
    const accounts = Array.from({ length: 8 }, (_, i) =>
      account({ id: i, lastLoginAt: `2026-09-0${i + 1}T00:00:00Z` }),
    )
    expect(recentLogins(accounts)).toHaveLength(5)
  })

  it('limit 可以自訂', () => {
    const accounts = Array.from({ length: 8 }, (_, i) =>
      account({ id: i, lastLoginAt: `2026-09-0${i + 1}T00:00:00Z` }),
    )
    expect(recentLogins(accounts, 2)).toHaveLength(2)
  })

  it('有暱稱時 name 用暱稱，initial 取暱稱首字（不強制大寫）', () => {
    const [entry] = recentLogins([account({ displayName: 'alice' })])
    expect(entry?.name).toBe('alice')
    expect(entry?.initial).toBe('a')
  })

  it('沒有暱稱時 name 退回 email，initial 取 email 首字並強制大寫', () => {
    const [entry] = recentLogins([account({ displayName: null, email: 'bob@example.com' })])
    expect(entry?.name).toBe('bob@example.com')
    expect(entry?.initial).toBe('B')
  })

  it('暱稱是空字串時視同沒有暱稱，退回 email', () => {
    const [entry] = recentLogins([account({ displayName: '   ', email: 'carol@example.com' })])
    expect(entry?.name).toBe('carol@example.com')
    expect(entry?.initial).toBe('C')
  })

  it('保留原始 lastLoginAt 字串，不做格式轉換（格式化交給呼叫端）', () => {
    const [entry] = recentLogins([account({ lastLoginAt: '2026-09-01T03:04:05Z' })])
    expect(entry?.lastLoginAt).toBe('2026-09-01T03:04:05Z')
  })
})
