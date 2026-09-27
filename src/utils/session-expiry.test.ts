import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SESSION_MINUTES,
  isSessionExpired,
  tokenExpiresAt,
  type AuthSession,
} from '@/src/composables/useAuth'

const MINUTE = 60_000
const NOW = 1_800_000_000_000

/** 做一張跟後端同格式的 token：base64url(JSON).簽章（前端不驗章，簽章隨便放） */
function token(expSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ sub: 1, role: 'tenant', exp: expSeconds }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${body}.signature`
}

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

describe('tokenExpiresAt', () => {
  it('讀得出後端 token 裡的到期時間', () => {
    expect(tokenExpiresAt(token(NOW / 1000 + 3600))).toBe(NOW + 60 * MINUTE)
  })

  it('讀不懂的 token 回 null，不要猜', () => {
    expect(tokenExpiresAt('not-a-token')).toBeNull()
    expect(tokenExpiresAt(undefined)).toBeNull()
  })
})

describe('isSessionExpired', () => {
  it('未登入視為未過期（交由 requiresAuth 處理）', () => {
    expect(isSessionExpired(null, NOW)).toBe(false)
  })

  it('以後端憑證的到期時間為準，到了就過期', () => {
    const current = session({ accessToken: token(NOW / 1000 + 3600) })
    expect(isSessionExpired(current, NOW + 59 * MINUTE)).toBe(false)
    expect(isSessionExpired(current, NOW + 60 * MINUTE)).toBe(true)
  })

  it('憑證的期限比預設長時，照憑證 —— 管理員設 7 天，前端不能自己在 2 小時就登出', () => {
    const current = session({ accessToken: token(NOW / 1000 + 7 * 24 * 3600) })
    expect(isSessionExpired(current, NOW + 3 * 60 * MINUTE)).toBe(false)
  })

  it('沒有憑證（本機展示登入）退回用登入時間加預設期限', () => {
    expect(isSessionExpired(session(), NOW + FALLBACK_SESSION_MINUTES * MINUTE)).toBe(false)
    expect(isSessionExpired(session(), NOW + (FALLBACK_SESSION_MINUTES + 1) * MINUTE)).toBe(true)
  })

  it('舊 session 沒有 issuedAt 也沒有憑證，視為不過期，改版不把所有人踢出去', () => {
    expect(isSessionExpired(session({ issuedAt: undefined }), NOW + 999 * MINUTE)).toBe(false)
  })
})
