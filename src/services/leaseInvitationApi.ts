import { getAuthSession } from '@/src/composables/useAuth'

/** 租客端的租約邀請：預覽（不需登入）、確認加入（租客帳號）。 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')

export interface InvitationPreview {
  state: 'pending' | 'accepted' | 'revoked' | 'expired'
  landlord_name: string
  property_name: string
  room_number: string
  lease_start: string | null
  lease_end: string | null
  invited_email_masked: string | null
  expires_at: string
  email_matches?: boolean
  accepted_by_you?: boolean
  lease_id?: number
}

async function request<T>(path: string, method = 'GET', data?: unknown, auth = true): Promise<T> {
  const token = getAuthSession()?.accessToken
  const response = await fetch(`${API_BASE}/api/invitations${path}`, {
    method,
    headers: {
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }).catch(() => {
    throw new Error('無法連線到伺服器，請稍後再試。')
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof body?.detail === 'string' ? body.detail : `操作失敗（${response.status}）`)
  }
  return body as T
}

export function previewInvitation(token: string) {
  return request<InvitationPreview>(`/${encodeURIComponent(token)}`, 'GET', undefined, false)
}
export function previewInvitationAsTenant(token: string) {
  return request<InvitationPreview>(`/${encodeURIComponent(token)}/me`)
}
export function acceptInvitation(token: string) {
  return request<InvitationPreview>(`/${encodeURIComponent(token)}/accept`, 'POST')
}
export function previewInvitationCode(code: string) {
  return request<InvitationPreview>('/code-preview', 'POST', { code })
}
export function acceptInvitationCode(code: string) {
  return request<InvitationPreview>('/code-accept', 'POST', { code })
}
