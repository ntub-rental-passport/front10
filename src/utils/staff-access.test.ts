import { describe, expect, it } from 'vitest'
import { resolveStaffAccess, staffAccessMessages } from './staff-access'
import type { AdminUser } from '@/src/mocks/admin/users'

function make(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    email: 'admin@rentmate.tw',
    nickname: '系統管理員',
    role: 'admin',
    adminRole: 'super',
    status: 'active',
    emailVerified: true,
    registeredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveStaffAccess', () => {
  it('啟用中的管理員帳號可以通過', () => {
    const result = resolveStaffAccess([make()], 'admin@rentmate.tw')
    expect(result.reason).toBeNull()
    expect(result.user?.adminRole).toBe('super')
  })

  it('大小寫與前後空白不影響比對', () => {
    const result = resolveStaffAccess([make()], '  ADMIN@RentMate.TW  ')
    expect(result.reason).toBeNull()
    expect(result.user?.email).toBe('admin@rentmate.tw')
  })

  it('名冊裡查無此信箱', () => {
    expect(resolveStaffAccess([make()], 'nobody@example.com')).toEqual({
      user: null,
      reason: 'not-found',
    })
  })

  it('租客或房東帳號不能從內部入口登入', () => {
    const tenant = make({ email: 'amy@example.com', role: 'user', adminRole: null })
    expect(resolveStaffAccess([tenant], 'amy@example.com')).toEqual({
      user: null,
      reason: 'not-staff',
    })
  })

  it('停用中的管理員帳號被擋下', () => {
    const suspended = make({ status: 'suspended' })
    expect(resolveStaffAccess([suspended], 'admin@rentmate.tw')).toEqual({
      user: null,
      reason: 'disabled',
    })
  })

  it('查無帳號與非內部帳號對外是同一句話，避免登入頁變成帳號探測器', () => {
    expect(staffAccessMessages['not-found']).toBe(staffAccessMessages['not-staff'])
  })

  it('空名冊不會炸', () => {
    expect(resolveStaffAccess([], 'admin@rentmate.tw')).toEqual({ user: null, reason: 'not-found' })
  })
})
