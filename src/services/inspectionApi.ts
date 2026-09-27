import { getAuthSession } from '@/src/composables/useAuth'

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function inspectionRequest<T>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('請先登入後再使用點交功能。')
  const response = await fetch(`${API_BASE}/inspection${path}`, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `點交操作失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
