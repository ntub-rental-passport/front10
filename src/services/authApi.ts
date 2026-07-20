export interface VerifiedGoogleAccount {
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
  subject: string
}

export interface GoogleOAuthSession extends VerifiedGoogleAccount {
  flowVersion: 2
  role: 'tenant' | 'landlord'
  redirectPath: string | null
  registrationRequired: boolean
  registrationToken: string | null
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
  email: string
  role: 'tenant' | 'landlord'
  displayName: string | null
  avatarUrl: string | null
}

export interface StartRegistrationPayload {
  email?: string
  password?: string
  role: 'tenant' | 'landlord'
  inviteCode?: string
  googleRegistrationToken?: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export function getGoogleLoginUrl(role: string, redirectPath: string): string {
  const params = new URLSearchParams({
    role,
    redirect: redirectPath,
  })
  return `${API_BASE_URL}/auth/google/start?${params.toString()}`
}

export async function exchangeGoogleTicket(ticket: string): Promise<GoogleOAuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/google/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ticket }),
  })

  const body = await response.json().catch(() => null) as
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
  const response = await fetch(`${API_BASE_URL}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null) as (T & { detail?: string }) | null
  if (!response.ok) {
    throw new Error(body?.detail || '驗證服務暫時無法使用，請稍後再試。')
  }
  if (!body) throw new Error('驗證服務沒有回傳資料。')
  return body
}

export function startRegistration(payload: StartRegistrationPayload): Promise<PendingRegistrationResponse> {
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
