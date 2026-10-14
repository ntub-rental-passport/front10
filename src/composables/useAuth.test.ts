import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishNicknameSetup, getAuthenticatedUserId, signIn, signInWithEmail } from './useAuth'

// loginWithEmail 的失敗內容要能逐案替換，才驗得出錯誤碼的對應。
const authApiState = vi.hoisted(() => ({ loginFailure: new Error('not used') }))

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
    throw authApiState.loginFailure
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

/**
 * 限流與逾時以前都掉進 service-unavailable，畫面因此說「無法連線登入服務」。
 * 被限流的人看到「服務掛了」只會一直重試，而重試正是把站台壓垮的那件事，
 * 所以這兩種狀況必須各自回自己的錯誤碼。
 */
describe('signInWithEmail error mapping', () => {
  afterEach(() => {
    authApiState.loginFailure = new Error('not used')
  })

  it('reports nginx rate limiting as its own error instead of a dead service', async () => {
    authApiState.loginFailure = new Error('伺服器忙碌中，請稍候幾秒後再試。(rate-limited)')
    expect(await signInWithEmail('student@example.com', 'pw', 'tenant')).toEqual({
      ok: false,
      error: 'rate-limited',
    })
  })

  it('separates a slow response from an unreachable backend', async () => {
    authApiState.loginFailure = new Error('帳號服務回應過慢，請稍後再試。(request-timeout)')
    expect(await signInWithEmail('student@example.com', 'pw', 'tenant')).toEqual({
      ok: false,
      error: 'request-timeout',
    })
  })

  it('still falls back to service-unavailable for unrecognised failures', async () => {
    authApiState.loginFailure = new Error('無法連線到帳號服務，請確認後端已啟動後再試。')
    expect(await signInWithEmail('student@example.com', 'pw', 'tenant')).toEqual({
      ok: false,
      error: 'service-unavailable',
    })
  })

  it('keeps password failures mapped, so lockout counting is unaffected', async () => {
    authApiState.loginFailure = new Error('invalid-password')
    expect(await signInWithEmail('student@example.com', 'pw', 'tenant')).toEqual({
      ok: false,
      error: 'invalid-password',
    })
  })
})
