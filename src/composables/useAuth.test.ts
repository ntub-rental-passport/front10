import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishNicknameSetup, getAuthenticatedUserId, signIn } from './useAuth'

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

  it('keeps nicknames and fallback account identifiers separate', () => {
    const tenant = signIn('tenant', 'shared@example.com')
    finishNicknameSetup('Tenant name')
    const landlord = signIn('landlord', 'shared@example.com')
    expect(landlord.nickname).toBeNull()
    finishNicknameSetup('Landlord name')
    expect(signIn('tenant', 'shared@example.com').nickname).toBe('Tenant name')
    expect(signIn('landlord', 'shared@example.com').nickname).toBe('Landlord name')
    expect(getAuthenticatedUserId(tenant)).not.toBe(getAuthenticatedUserId(landlord))
  })
})
