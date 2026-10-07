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
        : response.status >= 500
          ? '點交服務暫時無法讀取或儲存資料，請稍後重新載入。這不代表你的租約或存證不存在。'
          : `點交操作失敗（${response.status}），請稍後重試。`,
    )
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export async function downloadInspectionOriginal(itemId: string, recordId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/inspection/items/${itemId}/photos/${recordId}/original`,
    {
      credentials: 'include',
      headers: { Authorization: `Bearer ${getAuthSession()?.accessToken ?? ''}` },
    },
  )
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || '原始檔下載失敗。')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    `RM-IN-${recordId}.bin`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
