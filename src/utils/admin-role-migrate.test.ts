import { describe, expect, it } from 'vitest'
import { migrateAdminRole, migrateAdminRoleInUsers } from './admin-role-migrate'

describe('migrateAdminRole', () => {
  it('super 維持不變', () => {
    expect(migrateAdminRole('super')).toBe('super')
  })

  it('舊的 ops 與 content 都轉成 admin', () => {
    expect(migrateAdminRole('ops')).toBe('admin')
    expect(migrateAdminRole('content')).toBe('admin')
  })

  it('admin 維持不變', () => {
    expect(migrateAdminRole('admin')).toBe('admin')
  })

  it('null 與 undefined 維持為 null（非管理員帳號）', () => {
    expect(migrateAdminRole(null)).toBeNull()
    expect(migrateAdminRole(undefined)).toBeNull()
  })

  it('未知值降為 admin 而非 super', () => {
    expect(migrateAdminRole('whatever')).toBe('admin')
    expect(migrateAdminRole(123)).toBe('admin')
  })
})

describe('migrateAdminRoleInUsers', () => {
  it('轉換整份清單並保留其他欄位', () => {
    const users = [
      { id: 'a', email: 'a@x.tw', adminRole: 'super' },
      { id: 'b', email: 'b@x.tw', adminRole: 'ops' },
      { id: 'c', email: 'c@x.tw', adminRole: 'content' },
      { id: 'd', email: 'd@x.tw', adminRole: null },
    ]

    expect(migrateAdminRoleInUsers(users)).toEqual([
      { id: 'a', email: 'a@x.tw', adminRole: 'super' },
      { id: 'b', email: 'b@x.tw', adminRole: 'admin' },
      { id: 'c', email: 'c@x.tw', adminRole: 'admin' },
      { id: 'd', email: 'd@x.tw', adminRole: null },
    ])
  })

  it('不改動原陣列', () => {
    const users = [{ id: 'a', adminRole: 'ops' }]
    migrateAdminRoleInUsers(users)
    expect(users[0].adminRole).toBe('ops')
  })
})
