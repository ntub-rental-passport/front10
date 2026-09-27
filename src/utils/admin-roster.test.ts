import { describe, expect, it } from 'vitest'

import type { AdminAccount } from '@/src/services/adminUsersApi'
import { ADMIN_DORMANT_DAYS, adminRoster } from './admin-roster'
import { NO_LOGIN_RECORD } from './admin-user-list'

const NOW = new Date(2026, 8, 27, 12, 0)
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function account(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 1,
    email: 'admin@rentmate.tw',
    displayName: '系統管理員',
    avatarUrl: null,
    roles: ['admin'],
    status: 'active',
    emailVerified: true,
    hasPassword: true,
    providers: ['password'],
    createdAt: null,
    lastLoginAt: daysAgo(1),
    ...overrides,
  }
}

describe('adminRoster', () => {
  it('只列有管理員身分的帳號', () => {
    const roster = adminRoster([account(), account({ id: 2, roles: ['tenant'] })], NOW)
    expect(roster.map((row) => row.id)).toEqual([1])
  })

  it('太久沒登入的標 warn：沒人在用的高權限帳號最該移除', () => {
    const [row] = adminRoster([account({ lastLoginAt: daysAgo(ADMIN_DORMANT_DAYS + 1) })], NOW)
    expect(row?.flag).toEqual({ tone: 'warn', label: '超過 90 天沒登入' })
  })

  it('沒有登入紀錄不標警示 —— 登入時間是 9/9 才開始記的', () => {
    const [row] = adminRoster([account({ lastLoginAt: null })], NOW)
    expect(row?.flag).toBeNull()
    expect(row?.lastLoginLabel).toBe(NO_LOGIN_RECORD)
  })

  it('停用的排在最後、標 idle；其餘依最近登入排序', () => {
    const roster = adminRoster(
      [
        account({ id: 1, lastLoginAt: daysAgo(10) }),
        account({ id: 2, status: 'suspended', lastLoginAt: daysAgo(0) }),
        account({ id: 3, lastLoginAt: daysAgo(1) }),
      ],
      NOW,
    )
    expect(roster.map((row) => row.id)).toEqual([3, 1, 2])
    expect(roster[2]?.flag).toEqual({ tone: 'idle', label: '已停用' })
  })

  it('沒有暱稱就用信箱當名字', () => {
    expect(adminRoster([account({ displayName: ' ' })], NOW)[0]?.name).toBe('admin@rentmate.tw')
  })
})
