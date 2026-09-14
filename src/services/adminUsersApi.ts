import { getAuthSession } from '@/src/composables/useAuth'

/** 後端 /api/admin/users 的一列。刻意不含密碼雜湊與第三方識別碼。 */
export interface AdminAccount {
  id: number
  email: string
  displayName: string | null
  avatarUrl: string | null
  roles: string[]
  status: 'active' | 'suspended'
  emailVerified: boolean
  hasPassword: boolean
  providers: string[]
  createdAt: string | null
  lastLoginAt: string | null
}

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

function authHeaders(): Record<string, string> | null {
  const token = getAuthSession()?.accessToken
  return token ? { Authorization: `Bearer ${token}` } : null
}

/** 讀取真實帳號清單。讀不到回 null，由呼叫端決定畫面怎麼呈現，不編假資料。 */
export async function fetchAdminAccounts(signal?: AbortSignal): Promise<AdminAccount[] | null> {
  const headers = authHeaders()
  if (!headers) return null

  try {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      headers,
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    return (await response.json()) as AdminAccount[]
  } catch {
    return null
  }
}

/**
 * 停用或啟用帳號。
 *
 * 成功回傳更新後的該筆資料；失敗丟出帶後端訊息的 Error ——
 * 後端的拒絕理由（不能停用自己、這是最後一位管理員）必須讓操作者看到，
 * 靜靜失敗會讓人以為停用成功了。
 */
export async function updateAccountStatus(
  id: number,
  status: 'active' | 'suspended',
): Promise<AdminAccount> {
  const headers = authHeaders()
  if (!headers) throw new Error('尚未登入或登入已過期，請重新登入。')

  const response = await fetch(`${API_BASE_URL}/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const body = (await response.json().catch(() => null)) as
    | (AdminAccount & { detail?: string })
    | null
  if (!response.ok) {
    throw new Error(body?.detail || '操作失敗，請稍後再試。')
  }
  if (!body) throw new Error('後端沒有回傳資料。')
  return body
}
