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
  googleRegistrationToken?: string
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

/**
 * 帳號服務的逾時上限。
 *
 * 比 garbageApi 的 15 秒寬鬆 —— 登入要在伺服器上跑一次 argon2，
 * 尖峰時本來就慢，不該在它正要回來的時候放棄。但一定要有上限：
 * 沒有逾時的 fetch 在連線卡住時既不成功也不失敗，畫面只會無限期轉圈，
 * 使用者得不到任何回饋，只能一直重按。
 */
const AUTH_TIMEOUT_MS = 20000

/**
 * 「回應過慢」和「連不上」必須分開講。
 *
 * 兩者該做的事完全不同：連不上通常是後端沒啟動（開發時最常見），
 * 逾時代表後端活著、只是來不及回應，使用者該做的是等幾秒再試。
 * 以前兩種都說「請確認後端已啟動」，在正式站上只是誤導。
 *
 * 訊息尾端帶錯誤碼，讓上層（useAuth）能分辨；直接顯示 message 的頁面
 * 也還讀得懂前半句。
 */
const TIMEOUT_MESSAGE = '帳號服務回應過慢，請稍後再試。(request-timeout)'
const OFFLINE_MESSAGE = '無法連線到帳號服務，請確認後端已啟動後再試。'

/** nginx 的 limit_req 擋下來時的訊息；註冊、登入共用，所以不寫「登入」。 */
const RATE_LIMITED_MESSAGE = '伺服器忙碌中，請稍候幾秒後再試。(rate-limited)'

async function authFetch(url: string, init: FetchInit = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(AUTH_TIMEOUT_MS)
  // 呼叫端可能已經帶了自己的 signal；直接塞 signal 會把它無聲蓋掉，
  // 所以兩個併成「任一中止就中止」。
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  try {
    return await fetch(url, { ...init, signal })
  } catch (error) {
    // 呼叫端自己取消的要原樣往上丟 —— 那不是連線出問題，是呼叫端的決定，
    // 包成「無法連線」只會讓它被當成錯誤顯示給使用者。
    if (init.signal?.aborted) throw error
    throw new Error(timeout.aborted ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE)
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
  // 429 要在讀 body 之前單獨攔下來。nginx 的限流（limit_req_status 429）回的是
  // HTML 錯誤頁，body?.detail 永遠讀不到，落到下面的通用分支就變成
  // 「驗證服務暫時無法使用」—— 上層只能判成服務中斷，於是叫被限流的人重試，
  // 而重試正是限流最怕的事。這裡丟出帶 rate-limited 的錯誤，讓上層說對話。
  if (response.status === 429) {
    throw new Error(RATE_LIMITED_MESSAGE)
  }
  const body = (await response.json().catch(() => null)) as (T & { detail?: string }) | null
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : '驗證服務暫時無法使用，請稍後再試。')
  }
  if (!body) throw new Error('驗證服務沒有回傳資料。')
  return body
}

/** 以 JWT cookie 向後端查詢目前登入者；未登入（401）回傳 null。 */
export async function fetchCurrentUser(): Promise<EmailLoginResponse | null> {
  const response = await authFetch(`${API_BASE_URL}/auth/me`, {
    credentials: 'include',
  })
  // 被限流不等於沒登入。這裡回 null 的話 syncSessionWithServer 會清掉本機 session，
  // 把「伺服器太忙」變成「被登出」—— 寧可丟錯誤讓呼叫端保留登入狀態。
  if (response.status === 429) throw new Error(RATE_LIMITED_MESSAGE)
  if (!response.ok) return null
  return await response.json().catch(() => null)
}

/** 更新顯示名稱（註冊最後一步）；暱稱寫回資料庫，換裝置登入才不會又被問一次。 */
export async function updateDisplayName(displayName: string): Promise<EmailLoginResponse> {
  const response = await authFetch(`${API_BASE_URL}/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ displayName }),
  })
  const body = (await response.json().catch(() => null)) as
    | (EmailLoginResponse & { detail?: string })
    | null
  if (!response.ok) {
    throw new Error(body?.detail || '儲存顯示名稱失敗，請稍後再試。')
  }
  if (!body) throw new Error('帳號服務沒有回傳資料。')
  return body
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
  /**
   * 開發用的驗證碼。只有在本機、且該帳號被 DEV_ADMIN_NO_2FA_EMAIL 指定時才有值。
   * 正式環境永遠是 undefined —— 驗證碼只會出現在信箱裡。
   */
  devCode?: string | null
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

export interface PasswordResetChallenge {
  challengeId: string
  expiresIn: number
  resendAvailableIn: number
  message: string
}

export function startPasswordReset(email: string): Promise<PasswordResetChallenge> {
  return postAuth('/password/reset/start', { email })
}

export function completePasswordReset(challengeId: string, code: string, newPassword: string): Promise<{ ok: boolean }> {
  return postAuth('/password/reset/complete', { challengeId, code, newPassword })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return postAuth('/password/change', { currentPassword, newPassword })
}
