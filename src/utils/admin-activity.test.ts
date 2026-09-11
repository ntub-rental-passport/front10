import { describe, expect, it } from 'vitest'
import {
  activeWindowDays,
  countActiveUsers,
  isActiveSince,
  migrateLastLoginAt,
} from './admin-activity'

const now = new Date('2026-08-18T12:00:00.000Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

describe('isActiveSince', () => {
  it('窗期內登入過算活躍', () => {
    expect(isActiveSince({ lastLoginAt: daysAgo(3) }, 7, now)).toBe(true)
  })

  it('超過窗期不算', () => {
    expect(isActiveSince({ lastLoginAt: daysAgo(10) }, 7, now)).toBe(false)
  })

  it('從未登入過不算', () => {
    expect(isActiveSince({ lastLoginAt: null }, 7, now)).toBe(false)
  })

  it('壞掉的時間字串不算，也不會拋錯', () => {
    expect(isActiveSince({ lastLoginAt: '不是日期' }, 7, now)).toBe(false)
  })

  it('未來時間視為活躍，時鐘偏移不該讓人憑空消失', () => {
    expect(isActiveSince({ lastLoginAt: daysAgo(-1) }, 7, now)).toBe(true)
  })

  it('預設窗期是 7 天', () => {
    expect(activeWindowDays).toBe(7)
    expect(isActiveSince({ lastLoginAt: daysAgo(6) }, undefined, now)).toBe(true)
    expect(isActiveSince({ lastLoginAt: daysAgo(8) }, undefined, now)).toBe(false)
  })
})

describe('countActiveUsers', () => {
  it('只數窗期內登入過的人', () => {
    const users = [
      { lastLoginAt: daysAgo(1) },
      { lastLoginAt: daysAgo(6) },
      { lastLoginAt: daysAgo(30) },
      { lastLoginAt: null },
    ]
    expect(countActiveUsers(users, 7, now)).toBe(2)
  })

  it('空清單是 0', () => {
    expect(countActiveUsers([], 7, now)).toBe(0)
  })
})

describe('migrateLastLoginAt', () => {
  it('舊資料補 null 而不是假裝剛登入', () => {
    const migrated = migrateLastLoginAt([{ email: 'a@example.com' } as { email: string; lastLoginAt?: string | null }])
    expect(migrated[0].lastLoginAt).toBeNull()
  })

  it('已有值不覆蓋，null 也視為已有值', () => {
    const stamp = daysAgo(2)
    expect(migrateLastLoginAt([{ lastLoginAt: stamp }])[0].lastLoginAt).toBe(stamp)
    expect(migrateLastLoginAt([{ lastLoginAt: null }])[0].lastLoginAt).toBeNull()
  })
})
