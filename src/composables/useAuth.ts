import {
  fetchCurrentUser,
  loginWithEmail,
  startAdminLogin,
  verifyAdminLogin,
  logoutFromServer,
  resendRegistration,
  startRegistration,
  updateDisplayName,
  verifyRegistration,
  type GoogleOAuthSession,
} from '@/src/services/authApi'

export type AuthRole = 'tenant' | 'landlord' | 'admin'

export interface AuthSession {
  /** 後端帳號主鍵；所有租客資料授權皆以此欄位比對。 */
  userId?: string
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
  const profileKey = `${normalizedEmail}:${updates.role ?? "tenant"}`
  const currentProfile = profiles[profileKey] ?? {
    email: normalizedEmail,
    emailVerified: false,
    nickname: null,
  }

  const nextProfile: UserProfile = {
    ...currentProfile,
    ...updates,
    email: normalizedEmail,
  }

  profiles[profileKey] = nextProfile
  saveUserProfiles(profiles)
  return nextProfile
}

function createSession(
  role: AuthRole,
  profile: UserProfile,
  accessToken?: string | null,
  userId?: string | number | null,
): AuthSession {
  const session: AuthSession = {
    email: profile.email,
    userId: userId === null || userId === undefined ? `email:${profile.email}:${role}` : String(userId),
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
 * 登入憑證裡的到期時間（epoch 毫秒）。讀不出來回 null。
 *
 * 後端的 Bearer token 是 `base64url(JSON).簽章`（backend/security.py），
 * 不是三段式的 JWT。這裡只讀到期時間、不驗簽章 —— 驗章是後端的事，
 * 前端只是想知道「什麼時候該請使用者重新登入」。
 */
export function tokenExpiresAt(token: string | undefined): number | null {
  if (!token) return null
  const body = token.split('.')[0] ?? ''
  try {
    const padded = body.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(body.length / 4) * 4, '=')
    const exp: unknown = JSON.parse(atob(padded))?.exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

/** 沒有登入憑證的 session（本機的展示登入）用這個期限 */
export const FALLBACK_SESSION_MINUTES = 120

/**
 * 登入是否已過期。
 *
 * 以後端發的憑證為準：期限由後台「系統設定」的登入有效時間決定（管理員另外固定），
 * 從登入起算，重新整理不會延長（見 backend/platform_settings.py）。
 *
 * 以前前端用瀏覽器裡的設定自己算：每次重新整理就重新計時，後端的憑證卻是固定
 * 24 小時 —— 兩邊各說各的，管理員在設定頁改的值也只會改到自己那台瀏覽器。
 *
 * 沒有憑證的 session 退回用登入時間；舊 session 連 issuedAt 都沒有，視為不過期，
 * 避免改版後把所有人踢出去。
 */
export function isSessionExpired(session: AuthSession | null, now: number = Date.now()): boolean {
  if (!session) return false
  const expiresAt = tokenExpiresAt(session.accessToken)
  if (expiresAt !== null) return now >= expiresAt
  if (!session.issuedAt) return false
  return now - session.issuedAt > FALLBACK_SESSION_MINUTES * 60_000
}

export function signIn(role: AuthRole, email: string): AuthSession {
  const profile = upsertUserProfile(email, {
    role,
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
    return {
      ok: true,
      session: createSession(result.role, profile, result.accessToken, result.userId),
    }
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

/** 管理員登入第一階段的狀態，供輸入驗證碼的畫面使用。 */
export interface AdminLoginChallenge {
  challengeId: string
  email: string
  /** 驗證碼失效時間（epoch 毫秒），用於倒數。 */
  expiresAt: number
  attemptsRemaining: number
  /**
   * 本機開發時後端直接給的驗證碼（測試帳號的信箱是假的，收不到信）。
   * 有值時登入頁會自動帶入並送出，不讓人手動抄一次。
   * 正式環境永遠沒有這個值。
   */
  devCode?: string | null
}

/**
 * 管理員登入第一階段：送出帳密，成功則後端寄出驗證碼。
 *
 * 此時尚未建立任何 session —— 只有第二階段通過才會寫入登入狀態。
 * 挑戰只放在頁面記憶體、不寫 localStorage，重整即失效；
 * challengeId 若被存進瀏覽器，等於把「已通過帳密」的憑據留在磁碟上。
 */
export async function startAdminSignIn(
  email: string,
  password: string,
): Promise<AdminLoginChallenge> {
  const result = await startAdminLogin(email.trim().toLowerCase(), password)
  return {
    challengeId: result.challengeId,
    email: result.email,
    expiresAt: Date.now() + result.expiresIn * 1000,
    attemptsRemaining: result.attemptsRemaining,
    devCode: result.devCode ?? null,
  }
}

/** 管理員登入第二階段：驗證碼正確才真的建立 session。 */
export async function completeAdminSignIn(
  challengeId: string,
  code: string,
): Promise<AuthSession> {
  const result = await verifyAdminLogin(challengeId, code)
  const profile = upsertUserProfile(result.email, {
    emailVerified: true,
    nickname: result.displayName,
    role: result.role,
  })
  return createSession(result.role, profile, result.accessToken, result.userId)
}

export function registerWithGoogle(
  email: string,
  role: AuthRole = 'tenant',
  accessToken?: string | null,
  userId?: string | number | null,
  displayName: string | null = null,
): AuthSession {
  const profile = upsertUserProfile(email, {
    role,
    emailVerified: true,
    nickname: displayName,
  })

  return createSession(role, profile, accessToken, userId)
}

/**
 * 用後端的 cookie 驗證本機 session 是否還有效。
 *
 * ## 為什麼需要
 *
 * 這個網站有兩套並存的登入憑證：
 *   - localStorage 的 Bearer token —— 畫面的登入狀態、路由守衛、後台 API
 *   - HttpOnly cookie —— 合約分析、Law Chat
 *
 * 兩者可能不同步：cookie 過期或從未成功設定時，localStorage 仍在，
 * 畫面照樣顯示「已登入」，使用者一路上傳合約、等 OCR 跑完，
 * 按下分析才被踢回登入頁 —— 白做一整輪。
 *
 * 2026-09-10 正式站實測就是這個情況：/api/admin/metrics（Bearer）回 200，
 * /api/contract/analyze（cookie）回 401。
 *
 * 這裡以 cookie 為準：後端說沒登入，就清掉本機 session，
 * 讓畫面誠實反映真實狀態，把「請重新登入」提前到使用者做事之前。
 *
 * 順帶更新 Bearer token —— /me 每次都會重新簽發，讓兩套憑證同步延長。
 */
export async function syncSessionWithServer(): Promise<AuthSession | null> {
  const local = getAuthSession()
  if (!local?.isAuthenticated) return null

  const remote = await fetchCurrentUser()
  if (!remote) {
    // 後端不認這個 cookie。本機狀態已經失真，清掉比留著更好 ——
    // 留著只會讓使用者在下一個需要 cookie 的操作上白忙一場。
    signOut()
    return null
  }

  const profile = upsertUserProfile(remote.email, {
    emailVerified: true,
    nickname: remote.displayName,
    role: remote.role,
  })
  return createSession(remote.role, profile, remote.accessToken, remote.userId)
}

export function signOut(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  // HttpOnly cookie 前端刪不掉，必須請後端清除（fire-and-forget，不阻塞 UI）
  void logoutFromServer()
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
): Promise<PendingRegistration> {
  const result = await startRegistration({
    email: email.trim().toLowerCase(),
    password,
    role: role === 'landlord' ? 'landlord' : 'tenant',
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

/**
 * `role` 是註冊頁上選的身分，不一定等於 context.role —— 後者只是按 Google 之前
 * 停在哪個分頁。從登入頁的租客分頁按 Google 的人，回到註冊頁還是能改成房東。
 */
export async function startGoogleEmailRegistration(
  context: GoogleRegistrationContext,
  role: 'tenant' | 'landlord' = context.role,
): Promise<PendingRegistration> {
  const result = await startRegistration({
    role,
    googleRegistrationToken: context.registrationToken,
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
  return createSession(verified.role, profile, verified.accessToken, verified.userId)
}

/**
 * 寫入顯示名稱：先存進後端資料庫，成功了才更新本機 session。
 *
 * 順序很重要 —— 反過來的話，後端存檔失敗時本機仍顯示已設定暱稱，
 * 使用者換裝置登入就會發現名字不見了，而且沒有任何地方提示他失敗過。
 */
export async function finishNicknameSetup(nickname: string): Promise<AuthSession | null> {
  const session = getAuthSession()
  if (!session) return null

  const cleanNickname = nickname.trim()
  if (!cleanNickname) return session

  const updated = await updateDisplayName(cleanNickname)
  const profile = upsertUserProfile(updated.email, {
    role: updated.role,
    nickname: updated.displayName,
    emailVerified: true,
  })

  return createSession(updated.role, profile, updated.accessToken, updated.userId)
}

export function getAuthenticatedUserId(session: AuthSession | null = getAuthSession()): string {
  if (!session) return ''
  return session.userId || `email:${session.email.trim().toLowerCase()}:${session.role}`
}
