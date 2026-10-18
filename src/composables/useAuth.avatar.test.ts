import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeEmailVerification,
  finishNicknameSetup,
  getAuthSession,
  registerWithGoogle,
  signInWithEmail,
  syncSessionWithServer,
} from './useAuth'

const response = vi.hoisted(() => ({
  userId: 42,
  email: 'tenant@example.com',
  role: 'tenant',
  displayName: '小明',
  avatarUrl: 'https://example.com/avatar.png' as string | null,
  accessToken: 'test-token',
}))

vi.mock('@/src/services/authApi', () => ({
  loginWithEmail: async () => ({ ...response }),
  fetchCurrentUser: async () => ({ ...response }),
  updateDisplayName: async () => ({ ...response }),
  verifyRegistration: async () => ({ ...response }),
}))

beforeEach(() => {
  response.avatarUrl = 'https://example.com/avatar.png'
  const data = new Map<string, string>()
  vi.stubGlobal('window', {
    sessionStorage: { removeItem: vi.fn() },
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('登入狀態的帳號頭像', () => {
  it('Email 登入保存 API 的 avatarUrl 與顯示名稱', async () => {
    const result = await signInWithEmail(response.email, 'password', 'tenant')
    expect(result.ok).toBe(true)
    expect(getAuthSession()).toMatchObject({ picture: response.avatarUrl, nickname: '小明' })
  })

  it('Google 登入保存 picture，舊版呼叫可不提供圖片', () => {
    registerWithGoogle(response.email, 'tenant', 'token', 42, '小明', response.avatarUrl)
    expect(getAuthSession()?.picture).toBe(response.avatarUrl)
    registerWithGoogle(response.email)
    expect(getAuthSession()?.picture).toBeNull()
  })

  it('重新同步與更新暱稱時保留最新圖片，也接受移除圖片', async () => {
    registerWithGoogle(response.email)
    expect((await syncSessionWithServer())?.picture).toBe(response.avatarUrl)
    expect((await finishNicknameSetup('小明'))?.picture).toBe(response.avatarUrl)
    response.avatarUrl = null
    await syncSessionWithServer()
    expect(getAuthSession()?.picture).toBeNull()
  })

  it('註冊驗證成功後保存帳號圖片', async () => {
    window.localStorage.setItem('rentmate-pending-registration', JSON.stringify({ registrationId: 'registration' }))
    expect((await completeEmailVerification('123456'))?.picture).toBe(response.avatarUrl)
    expect(getAuthSession()?.picture).toBe(response.avatarUrl)
  })
})
