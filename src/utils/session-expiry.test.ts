import { describe, expect, it } from 'vitest'
import { isSessionExpired, type AuthSession } from '@/src/composables/useAuth'

const MINUTE = 60_000
const NOW = 1_800_000_000_000

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    email: 'user@rentmate.tw',
    isAuthenticated: true,
    role: 'tenant',
    emailVerified: true,
    nickname: '小艾',
    issuedAt: NOW,
    ...overrides,
  }
}

describe('isSessionExpired', () => {
  it('未登入視為未過期（交由 requiresAuth 處理）', () => {
    expect(isSessionExpired(null, 120, NOW)).toBe(false)
  })

  it('剛登入時未過期', () => {
    expect(isSessionExpired(session(), 120, NOW)).toBe(false)
  })

  it('尚在有效時間內未過期', () => {
    expect(isSessionExpired(session(), 120, NOW + 119 * MINUTE)).toBe(false)
  })

  it('剛好到期時未過期（採用嚴格大於）', () => {
    expect(isSessionExpired(session(), 120, NOW + 120 * MINUTE)).toBe(false)
  })

  it('超過有效時間即過期', () => {
    expect(isSessionExpired(session(), 120, NOW + 121 * MINUTE)).toBe(true)
  })

  it('舊 session 沒有 issuedAt 時視為不過期，改版不會把所有人踢出去', () => {
    expect(isSessionExpired(session({ issuedAt: undefined }), 120, NOW + 999 * MINUTE)).toBe(false)
  })

  it('逾時設定無效時不過期，避免壞掉的設定把全站鎖住', () => {
    expect(isSessionExpired(session(), Number.NaN, NOW + 999 * MINUTE)).toBe(false)
    expect(isSessionExpired(session(), 0, NOW + 999 * MINUTE)).toBe(false)
    expect(isSessionExpired(session(), -1, NOW + 999 * MINUTE)).toBe(false)
  })
})
