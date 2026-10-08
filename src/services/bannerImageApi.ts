/**
 * 輪播圖片的上傳、清單與刪除（backend/routers/content_api.py，見 admin/banner_images.py）。
 * 圖片存在 VM 的硬碟上；只有未被輪播使用的上傳圖片可以刪除。
 */
import { getAuthSession } from '@/src/composables/useAuth'

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const API_BASE_URL = import.meta.env.DEV ? '/api' : CONFIGURED_API_BASE_URL

export interface BannerImage {
  name: string
  /** 站內網址，直接填進輪播的「圖片網址」 */
  url: string
  size: number
  /** epoch 秒 */
  uploadedAt: number
  usedBy: { id: string; title: string }[]
  deletable: boolean
  width?: number
  height?: number
}

export interface BannerImageLibrary {
  items: BannerImage[]
  count: number
  limit: number
}

function authHeader(): Record<string, string> {
  const token = getAuthSession()?.accessToken
  if (!token) throw new Error('登入狀態已失效，請重新登入後再試。')
  return { Authorization: `Bearer ${token}` }
}

/** 後端的拒絕理由是寫給管理員看的中文（檔案太大、不是圖片…），要原樣顯示 */
async function failureOf(response: Response): Promise<Error> {
  let detail: string
  try {
    detail = ((await response.json()) as { detail?: string }).detail ?? ''
  } catch {
    detail = ''
  }
  if (response.status === 401 || response.status === 403) {
    return new Error('沒有權限或登入已失效，請重新登入。')
  }
  return new Error(detail || `操作失敗（HTTP ${response.status}）。`)
}

export async function uploadBannerImage(file: File): Promise<BannerImage> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(`${API_BASE_URL}/admin/banner-images`, {
    method: 'POST',
    headers: authHeader(),
    body,
  })
  if (!response.ok) throw await failureOf(response)
  return (await response.json()) as BannerImage
}

/** 讀不到回 null：畫面要分得出「讀不到」和「還沒傳過圖」 */
export async function fetchBannerImages(): Promise<BannerImageLibrary | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/banner-images`, {
      headers: authHeader(),
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as BannerImageLibrary
  } catch {
    return null
  }
}

export async function deleteBannerImage(name: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/admin/banner-images/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeader(),
  })
  if (!response.ok) throw await failureOf(response)
}
