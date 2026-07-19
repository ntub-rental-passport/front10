export type AuthRole = 'tenant' | 'landlord' | 'admin' | 'reviewer'

export interface AuthSession {
  email: string
  isAuthenticated: boolean
  role: AuthRole
  emailVerified: boolean
  nickname: string | null
}

export interface PendingRegistration {
  email: string
  password: string
  verificationCode: string
  role: AuthRole
}

interface UserProfile {
  email: string
  emailVerified: boolean
  nickname: string | null
  password?: string
  role?: AuthRole
}

export type EmailSignInError = 'account-not-found' | 'invalid-password' | 'role-mismatch' | 'email-not-verified'

export type EmailSignInResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: EmailSignInError }

// v2 invalidates legacy sessions where the old `admin` role represented landlords.
const AUTH_STORAGE_KEY = 'rentmate-auth-session-v2'
const USER_STORAGE_KEY = 'rentmate-user-profiles'
const PENDING_REGISTRATION_KEY = 'rentmate-pending-registration'
const DEMO_VERIFICATION_CODE = '123456'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function getUserProfiles(): Record<string, UserProfile> {
  return readJson<Record<string, UserProfile>>(USER_STORAGE_KEY) ?? {}
}

function saveUserProfiles(profiles: Record<string, UserProfile>): void {
  writeJson(USER_STORAGE_KEY, profiles)
}

function upsertUserProfile(email: string, updates: Partial<UserProfile>): UserProfile {
  const profiles = getUserProfiles()
  const normalizedEmail = email.trim().toLowerCase()
  const currentProfile = profiles[normalizedEmail] ?? {
    email: normalizedEmail,
    emailVerified: false,
    nickname: null,
  }

  const nextProfile: UserProfile = {
    ...currentProfile,
    ...updates,
    email: normalizedEmail,
  }

  profiles[normalizedEmail] = nextProfile
  saveUserProfiles(profiles)
  return nextProfile
}

function createSession(role: AuthRole, profile: UserProfile): AuthSession {
  const session: AuthSession = {
    email: profile.email,
    isAuthenticated: true,
    role,
    emailVerified: profile.emailVerified,
    nickname: profile.nickname,
  }

  writeJson(AUTH_STORAGE_KEY, session)
  return session
}

export function getAuthSession(): AuthSession | null {
  return readJson<AuthSession>(AUTH_STORAGE_KEY)
}

export function signIn(role: AuthRole, email: string): AuthSession {
  const profile = upsertUserProfile(email, {
    emailVerified: true,
  })

  return createSession(role, profile)
}

export function signInWithEmail(email: string, password: string, role: AuthRole): EmailSignInResult {
  const normalizedEmail = email.trim().toLowerCase()
  const profile = getUserProfiles()[normalizedEmail]

  if (!profile || !profile.password) return { ok: false, error: 'account-not-found' }
  if (!profile.emailVerified) return { ok: false, error: 'email-not-verified' }
  if (profile.role && profile.role !== role) return { ok: false, error: 'role-mismatch' }
  if (profile.password !== password) return { ok: false, error: 'invalid-password' }

  return { ok: true, session: createSession(role, profile) }
}

export function registerWithGoogle(email: string, role: AuthRole = 'tenant'): AuthSession {
  const profile = upsertUserProfile(email, {
    emailVerified: true,
    nickname: null,
  })

  return createSession(role, profile)
}

export function signOut(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function resolveRoleHome(role: AuthRole): '/app' | '/landlord' | '/admin' | '/reviewer' {
  const roleHomes: Record<AuthRole, '/app' | '/landlord' | '/admin' | '/reviewer'> = {
    tenant: '/app',
    landlord: '/landlord',
    admin: '/admin',
    reviewer: '/reviewer',
  }

  return roleHomes[role]
}

export function needsNicknameSetup(session: AuthSession | null): boolean {
  return Boolean(session?.isAuthenticated && session.role === 'tenant' && !session.nickname)
}

export function startEmailRegistration(
  email: string,
  password: string,
  role: AuthRole = 'tenant',
): PendingRegistration {
  const pendingRegistration: PendingRegistration = {
    email: email.trim().toLowerCase(),
    password,
    verificationCode: DEMO_VERIFICATION_CODE,
    role,
  }

  writeJson(PENDING_REGISTRATION_KEY, pendingRegistration)
  return pendingRegistration
}

export function getPendingRegistration(): PendingRegistration | null {
  return readJson<PendingRegistration>(PENDING_REGISTRATION_KEY)
}

export function clearPendingRegistration(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(PENDING_REGISTRATION_KEY)
}

export function completeEmailVerification(code: string): AuthSession | null {
  const pendingRegistration = getPendingRegistration()
  if (!pendingRegistration) return null

  if (code.trim() !== pendingRegistration.verificationCode) {
    return null
  }

  const profile = upsertUserProfile(pendingRegistration.email, {
    emailVerified: true,
    nickname: null,
    password: pendingRegistration.password,
    role: pendingRegistration.role ?? 'tenant',
  })

  clearPendingRegistration()
  return createSession(pendingRegistration.role ?? 'tenant', profile)
}

export function finishNicknameSetup(nickname: string): AuthSession | null {
  const session = getAuthSession()
  if (!session) return null

  const cleanNickname = nickname.trim()
  const profile = upsertUserProfile(session.email, {
    nickname: cleanNickname || null,
    emailVerified: session.emailVerified,
  })

  return createSession(session.role, profile)
}

export function getVerificationHint(): string {
  return DEMO_VERIFICATION_CODE
}
