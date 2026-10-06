import { getAuthSession } from '@/src/composables/useAuth'

/**
 * 房東端共用的 API 呼叫。
 *
 * 團隊成員用自己的房東帳號登入後，可以切換到別人的工作區：選擇存在
 * sessionStorage（依帳號區分，換帳號不會沿用），每個請求帶上
 * X-Landlord-Workspace，後端依此回傳擁有者的資料並檢查權限。
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '')
const WORKSPACE_KEY = 'rentmate-landlord-workspace'
export const LANDLORD_WORKSPACE_CHANGED_EVENT = 'rentmate:landlord-workspace-changed'

function workspaceKey(): string {
  const session = getAuthSession()
  return `${WORKSPACE_KEY}:${session?.userId ?? session?.email ?? 'anonymous'}`
}

export function activeWorkspaceOwnerId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(workspaceKey())
  } catch {
    return null
  }
}

export function setActiveWorkspaceOwnerId(ownerId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const own = getAuthSession()?.userId
    if (!ownerId || ownerId === own) window.sessionStorage.removeItem(workspaceKey())
    else window.sessionStorage.setItem(workspaceKey(), ownerId)
  } catch {
    // 無痕模式等讀寫不到 sessionStorage：留在自己的工作區
  }
  window.dispatchEvent(new CustomEvent(LANDLORD_WORKSPACE_CHANGED_EVENT))
}

export function workspaceHeaders(): Record<string, string> {
  const session = getAuthSession()
  if (session?.role !== 'landlord') return {}
  const ownerId = activeWorkspaceOwnerId()
  return ownerId && ownerId !== session.userId ? { 'X-Landlord-Workspace': ownerId } : {}
}

function authHeaders(): Record<string, string> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入憑證不存在，請重新登入房東帳號。')
  return { Authorization: `Bearer ${token}`, ...workspaceHeaders() }
}

async function send(path: string, method: string, data?: unknown): Promise<Response> {
  return fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }).catch(() => {
    throw new Error('無法連線到伺服器，請確認網路或後端服務是否正常。')
  })
}

/** 呼叫 /api 底下的端點（path 不含 /api）。錯誤一律轉成帶後端訊息的 Error。 */
export async function landlordRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await send(path, method, data)
  const body = (await response.json().catch(() => null)) as (T & { detail?: unknown }) | null
  if (!response.ok) {
    const detail = body?.detail
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail) && typeof detail[0]?.msg === 'string'
        ? String(detail[0].msg).replace(/^Value error, /, '')
        : `操作失敗（${response.status}），請稍後重試。`
    throw new Error(message)
  }
  if (body === null) throw new Error('伺服器沒有回傳資料。')
  return body
}

/** 下載檔案（合約附件）：帶登入憑證取回 Blob，再交給瀏覽器開啟或存檔。 */
export async function landlordDownload(path: string, filename: string): Promise<void> {
  const response = await send(path, 'GET')
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : '下載失敗，請稍後重試。')
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('檔案讀取失敗'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}
