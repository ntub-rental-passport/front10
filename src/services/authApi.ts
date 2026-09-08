export interface VerifiedGoogleAccount {
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
  subject: string
}

export interface GoogleOAuthSession extends VerifiedGoogleAccount {
  userId: number | null
  flowVersion: 2
  role: 'tenant' | 'landlord'
  redirectPath: string | null
  registrationRequired: boolean
  registrationToken: string | null
  accessToken: string | null
}

export interface PendingRegistrationResponse {
  registrationId: string
  email: string
  expiresIn: number
  resendAvailableIn: number
  attemptsRemaining: number
  sendCount: number
}

export interface VerifiedRegistrationResponse {
  userId: number
  email: string
  role: 'tenant' | 'landlord'
  displayName: string | null
  avatarUrl: string | null
  accessToken: string
}

export interface EmailLoginResponse {
  userId: number
  email: string
  // admin 由 /auth/admin/verify 回傳；一般登入端點不會給這個值
  role: 'tenant' | 'landlord' | 'admin'
  displayName: string | null
  avatarUrl: string | null
  accessToken: string
}

export interface StartRegistrationPayload {
  email?: string
  password?: string
  role: 'tenant' | 'landlord'
  inviteCode?: string
  googleRegistrationToken?: string
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

async function authFetch(url: string, init: FetchInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new Error('無法連線到帳號服務，請確認後端已啟動後再試。')
  }
}

export function getGoogleLoginUrl(role: string, redirectPath: string): string {
  const params = new URLSearchParams({
    role,
    redirect: redirectPath,
  })
  return `${API_BASE_URL}/auth/google/start?${params.toString()}`
}

export async function exchangeGoogleTicket(ticket: string): Promise<GoogleOAuthSession> {
  const response = await authFetch(`${API_BASE_URL}/auth/google/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // credentials: 'include'：開發模式下 API 是跨網域（5173 → 8000），
    // 不加這個瀏覽器會忽略後端回傳的 Set-Cookie，JWT cookie 存不進去
    credentials: 'include',
    body: JSON.stringify({ ticket }),
  })

  const body = (await response.json().catch(() => null)) as
    | (GoogleOAuthSession & { detail?: string })
    | null

  if (!response.ok) {
    throw new Error(body?.detail || 'Google 登入驗證失敗，請重新登入。')
  }
  if (!body?.email || !body.emailVerified) {
    throw new Error('Google 未回傳已驗證的電子郵件。')
  }
  if (body.flowVersion !== 2 || typeof body.registrationRequired !== 'boolean') {
    throw new Error('後端仍在執行舊版 Google 登入流程，請重新啟動後端後再試。')
  }
  if (body.registrationRequired && !body.registrationToken) {
    throw new Error('後端未提供 Google 註冊票證，請重新使用 Google 登入。')
  }

  return body
}

async function postAuth<T>(path: string, payload: unknown): Promise<T> {
  const response = await authFetch(`${API_BASE_URL}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const body = (await response.json().catch(() => null)) as (T & { detail?: string }) | null
  if (!response.ok) {
    throw new Error(body?.detail || '驗證服務暫時無法使用，請稍後再試。')
  }
  if (!body) throw new Error('驗證服務沒有回傳資料。')
  return body
}

/** 以 JWT cookie 向後端查詢目前登入者；未登入（401）回傳 null。 */
export async function fetchCurrentUser(): Promise<EmailLoginResponse | null> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    credentials: 'include',
  })
  if (!response.ok) return null
  return await response.json().catch(() => null)
}

/** 登出：請後端清除 HttpOnly JWT cookie（前端讀不到、也刪不掉這個 cookie）。 */
export async function logoutFromServer(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    // 後端暫時連不上時仍讓前端完成登出流程；cookie 會在 24 小時後自然過期
  }
}

export function startRegistration(
  payload: StartRegistrationPayload,
): Promise<PendingRegistrationResponse> {
  return postAuth('/registration/start', payload)
}

export function resendRegistration(registrationId: string): Promise<PendingRegistrationResponse> {
  return postAuth('/registration/resend', { registrationId })
}

export function verifyRegistration(
  registrationId: string,
  code: string,
): Promise<VerifiedRegistrationResponse> {
  return postAuth('/registration/verify', { registrationId, code })
}

/** 管理員登入第一階段的回應：只有挑戰識別碼，還不是登入憑證。 */
export interface AdminLoginChallengeResponse {
  challengeId: string
  email: string
  expiresIn: number
  attemptsRemaining: number
}

/**
 * 管理員登入第一階段：驗證帳密，成功則寄出驗證碼。
 *
 * 這裡刻意「不」回傳任何登入憑證 —— 只有通過第二階段的信箱驗證碼
 * 才算真的登入，帳密外洩本身不足以進入後台。
 */
export function startAdminLogin(
  email: string,
  password: string,
): Promise<AdminLoginChallengeResponse> {
  return postAuth('/admin/login', { email, password })
}

/** 管理員登入第二階段：驗證碼正確才拿到憑證。 */
export function verifyAdminLogin(
  challengeId: string,
  code: string,
): Promise<EmailLoginResponse> {
  return postAuth('/admin/verify', { challengeId, code })
}

export function loginWithEmail(
  email: string,
  password: string,
  role: 'tenant' | 'landlord',
): Promise<EmailLoginResponse> {
  return postAuth('/login', { email, password, role })
}
