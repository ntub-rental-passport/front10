import {
  loginWithEmail,
  resendRegistration,
  startRegistration,
  verifyRegistration,
  type GoogleOAuthSession,
} from '@/src/services/authApi'

export type AuthRole = 'tenant' | 'landlord' | 'admin'

export interface AuthSession {
  email: string
  isAuthenticated: boolean
  role: AuthRole
  emailVerified: boolean
  nickname: string | null
  /** 登入時間（epoch 毫秒）。舊 session 沒有這個欄位，視為不過期。 */
  issuedAt?: number
  accessToken?: string
}

export interface PendingRegistration {
  registrationId: string
  email: string
  role: AuthRole
  expiresAt: number
  resendAvailableAt: number
  attemptsRemaining: number
  sendCount: number
}

export interface GoogleRegistrationContext {
  email: string
  name: string | null
  picture: string | null
  role: 'tenant' | 'landlord'
  registrationToken: string
}

interface UserProfile {
  email: string
  emailVerified: boolean
  nickname: string | null
  password?: string
  role?: AuthRole
}

export type EmailSignInError =
  | 'account-not-found'
  | 'invalid-password'
  | 'role-mismatch'
  | 'email-not-verified'
  | 'service-unavailable'

export type EmailSignInResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: EmailSignInError }

// v2 invalidates legacy sessions where the old `admin` role represented landlords.
const AUTH_STORAGE_KEY = 'rentmate-auth-session-v2'
const USER_STORAGE_KEY = 'rentmate-user-profiles'
const PENDING_REGISTRATION_KEY = 'rentmate-pending-registration'
const GOOGLE_REGISTRATION_KEY = 'rentmate-google-registration'

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

function createSession(
  role: AuthRole,
  profile: UserProfile,
  accessToken?: string | null,
): AuthSession {
  const session: AuthSession = {
    email: profile.email,
    isAuthenticated: true,
    role,
    emailVerified: profile.emailVerified,
    nickname: profile.nickname,
    issuedAt: Date.now(),
    accessToken: accessToken || undefined,
  }

  writeJson(AUTH_STORAGE_KEY, session)
  return session
}

export function getAuthSession(): AuthSession | null {
  return readJson<AuthSession>(AUTH_STORAGE_KEY)
}

/**
 * Session 是否已超過有效時間。
 *
 * 逾時分鐘數由呼叫端傳入而非在這裡讀 adminSettings —— useAuth 若相依後台設定，
 * 會與 useAdminAudit（它需要 getAuthSession 取得操作者）形成循環相依。
 *
 * 舊 session 沒有 issuedAt，視為不過期，避免改版後把所有人踢出去。
 */
export function isSessionExpired(
  session: AuthSession | null,
  timeoutMinutes: number,
  now: number = Date.now(),
): boolean {
  if (!session?.issuedAt) return false
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return false
  return now - session.issuedAt > timeoutMinutes * 60_000
}

export function signIn(role: AuthRole, email: string): AuthSession {
  const profile = upsertUserProfile(email, {
    emailVerified: true,
  })

  return createSession(role, profile)
}

export async function signInWithEmail(
  email: string,
  password: string,
  role: AuthRole,
): Promise<EmailSignInResult> {
  const authRole = role === 'landlord' ? 'landlord' : 'tenant'
  try {
    const result = await loginWithEmail(email.trim().toLowerCase(), password, authRole)
    const profile = upsertUserProfile(result.email, {
      emailVerified: true,
      nickname: result.displayName,
      role: result.role,
    })
    return { ok: true, session: createSession(result.role, profile, result.accessToken) }
  } catch (error) {
    const knownErrors: EmailSignInError[] = [
      'account-not-found',
      'invalid-password',
      'role-mismatch',
      'email-not-verified',
    ]
    const message = error instanceof Error ? error.message : ''
    const knownError = knownErrors.find((candidate) => message.includes(candidate))
    return { ok: false, error: knownError ?? 'service-unavailable' }
  }
}

export function registerWithGoogle(
  email: string,
  role: AuthRole = 'tenant',
  accessToken?: string | null,
): AuthSession {
  const profile = upsertUserProfile(email, {
    emailVerified: true,
    nickname: null,
  })

  return createSession(role, profile, accessToken)
}

export function signOut(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function resolveRoleHome(role: AuthRole): '/app' | '/landlord' | '/admin' {
  const roleHomes: Record<AuthRole, '/app' | '/landlord' | '/admin'> = {
    tenant: '/app',
    landlord: '/landlord',
    admin: '/admin',
  }

  return roleHomes[role]
}

export function needsNicknameSetup(session: AuthSession | null): boolean {
  return Boolean(session?.isAuthenticated && session.role === 'tenant' && !session.nickname)
}

export function getPendingRegistration(): PendingRegistration | null {
  return readJson<PendingRegistration>(PENDING_REGISTRATION_KEY)
}

export function clearPendingRegistration(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(PENDING_REGISTRATION_KEY)
}

export async function startEmailRegistration(
  email: string,
  password: string,
  role: AuthRole = 'tenant',
  inviteCode = '',
): Promise<PendingRegistration> {
  const result = await startRegistration({
    email: email.trim().toLowerCase(),
    password,
    role: role === 'landlord' ? 'landlord' : 'tenant',
    inviteCode: inviteCode.trim() || undefined,
  })
  const pending: PendingRegistration = {
    registrationId: result.registrationId,
    email: result.email,
    role,
    expiresAt: Date.now() + result.expiresIn * 1000,
    resendAvailableAt: Date.now() + result.resendAvailableIn * 1000,
    attemptsRemaining: result.attemptsRemaining,
    sendCount: result.sendCount,
  }
  writeJson(PENDING_REGISTRATION_KEY, pending)
  return pending
}

export function saveGoogleRegistrationContext(account: GoogleOAuthSession): void {
  if (!account.registrationToken || !canUseStorage()) return
  const context: GoogleRegistrationContext = {
    email: account.email,
    name: account.name,
    picture: account.picture,
    role: account.role,
    registrationToken: account.registrationToken,
  }
  window.sessionStorage.setItem(GOOGLE_REGISTRATION_KEY, JSON.stringify(context))
}

export function getGoogleRegistrationContext(): GoogleRegistrationContext | null {
  if (!canUseStorage()) return null
  const raw = window.sessionStorage.getItem(GOOGLE_REGISTRATION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GoogleRegistrationContext
  } catch {
    window.sessionStorage.removeItem(GOOGLE_REGISTRATION_KEY)
    return null
  }
}

export function clearGoogleRegistrationContext(): void {
  if (!canUseStorage()) return
  window.sessionStorage.removeItem(GOOGLE_REGISTRATION_KEY)
}

export async function startGoogleEmailRegistration(
  context: GoogleRegistrationContext,
  inviteCode = '',
): Promise<PendingRegistration> {
  const result = await startRegistration({
    role: context.role,
    inviteCode: inviteCode.trim() || undefined,
    googleRegistrationToken: context.registrationToken,
  })
  const pending: PendingRegistration = {
    registrationId: result.registrationId,
    email: result.email,
    role: context.role,
    expiresAt: Date.now() + result.expiresIn * 1000,
    resendAvailableAt: Date.now() + result.resendAvailableIn * 1000,
    attemptsRemaining: result.attemptsRemaining,
    sendCount: result.sendCount,
  }
  writeJson(PENDING_REGISTRATION_KEY, pending)
  return pending
}

export async function resendEmailVerification(): Promise<PendingRegistration | null> {
  const pendingRegistration = getPendingRegistration()
  if (!pendingRegistration) return null

  const result = await resendRegistration(pendingRegistration.registrationId)
  const nextPending: PendingRegistration = {
    ...pendingRegistration,
    expiresAt: Date.now() + result.expiresIn * 1000,
    resendAvailableAt: Date.now() + result.resendAvailableIn * 1000,
    attemptsRemaining: result.attemptsRemaining,
    sendCount: result.sendCount,
  }
  writeJson(PENDING_REGISTRATION_KEY, nextPending)
  return nextPending
}

export async function completeEmailVerification(code: string): Promise<AuthSession | null> {
  const pendingRegistration = getPendingRegistration()
  if (!pendingRegistration) return null

  const verified = await verifyRegistration(pendingRegistration.registrationId, code.trim())

  const profile = upsertUserProfile(verified.email, {
    emailVerified: true,
    nickname: verified.displayName,
    role: verified.role,
  })

  clearPendingRegistration()
  clearGoogleRegistrationContext()
  return createSession(verified.role, profile, verified.accessToken)
}

export function finishNicknameSetup(nickname: string): AuthSession | null {
  const session = getAuthSession()
  if (!session) return null

  const cleanNickname = nickname.trim()
  const profile = upsertUserProfile(session.email, {
    nickname: cleanNickname || null,
    emailVerified: session.emailVerified,
  })

  return createSession(session.role, profile, session.accessToken)
}
