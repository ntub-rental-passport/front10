import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishNicknameSetup, getAuthenticatedUserId, signIn } from './useAuth'

// 暱稱現在寫進後端資料庫；這裡只驗本機 session 的分身處理，
// 所以用目前 session 的身分回一個成功的回應即可。
vi.mock('@/src/services/authApi', () => ({
  updateDisplayName: async (displayName: string) => {
    const raw = window.localStorage.getItem('rentmate-auth-session-v2')
    const session = raw ? JSON.parse(raw) : {}
    return {
      userId: session.userId,
      email: session.email,
      role: session.role,
      displayName,
      avatarUrl: null,
      accessToken: 'test-token',
    }
  },
  fetchCurrentUser: async () => null,
  loginWithEmail: async () => {
    throw new Error('not used')
  },
  logoutFromServer: async () => undefined,
  resendRegistration: async () => {
    throw new Error('not used')
  },
  startAdminLogin: async () => {
    throw new Error('not used')
  },
  startRegistration: async () => {
    throw new Error('not used')
  },
  verifyAdminLogin: async () => {
    throw new Error('not used')
  },
  verifyRegistration: async () => {
    throw new Error('not used')
  },
}))

describe('same email with separate roles', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps nicknames and fallback account identifiers separate', async () => {
    const tenant = signIn('tenant', 'shared@example.com')
    await finishNicknameSetup('Tenant name')
    const landlord = signIn('landlord', 'shared@example.com')
    expect(landlord.nickname).toBeNull()
    await finishNicknameSetup('Landlord name')
    expect(signIn('tenant', 'shared@example.com').nickname).toBe('Tenant name')
    expect(signIn('landlord', 'shared@example.com').nickname).toBe('Landlord name')
    expect(getAuthenticatedUserId(tenant)).not.toBe(getAuthenticatedUserId(landlord))
  })
})
