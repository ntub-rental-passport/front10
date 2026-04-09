export type AuthRole = 'user' | 'admin'

export interface AuthSession {
  email: string
  isAuthenticated: boolean
  role: AuthRole
}

const AUTH_STORAGE_KEY = 'rentmate-auth-session'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getAuthSession(): AuthSession | null {
  if (!canUseStorage()) return null

  const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!rawSession) return null

  try {
    return JSON.parse(rawSession) as AuthSession
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function signIn(role: AuthRole, email: string): AuthSession {
  const session: AuthSession = {
    email,
    isAuthenticated: true,
    role,
  }

  if (canUseStorage()) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  }

  return session
}

export function signOut(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function resolveRoleHome(role: AuthRole): '/app' | '/admin' {
  return role === 'admin' ? '/admin' : '/app'
}
