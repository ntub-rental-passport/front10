/**
 * 報修照片：送出前留在記憶體，送出後存在伺服器。
 *
 * 原本照片存在瀏覽器的 IndexedDB，只有報修的那台裝置看得到 ——
 * 房東端永遠只看到檔名。現在照片隨報修動作一起上傳到伺服器
 * （與點交存證同一套做法），雙方都能看到同一張照片。
 */
import { getAuthSession } from '@/src/composables/useAuth'

export interface RepairPhotoRef {
  id: string
  name: string
  type: string
  size: number
  stage?: string
}

/** 還沒送出的照片：已轉成可上傳的 data URL。 */
export interface PendingRepairPhoto extends RepairPhotoRef {
  dataUrl: string
  previewUrl: string
}

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/** 上傳前在瀏覽器縮圖：原圖動輒 5MB，壓成 1600px JPEG 通常只剩幾百 KB。 */
const MAX_EDGE = 1600

const pending = new Map<string, PendingRepairPhoto>()
const remoteUrls = new Map<string, string>()

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 圖片一律在瀏覽器轉成 JPEG 再上傳。
 *
 * 伺服器用 Pillow 處理圖片，它讀不了 iPhone 的 HEIC。先在瀏覽器解碼
 * 再輸出 JPEG，Safari 拍的 HEIC 也能用；其他瀏覽器解不開 HEIC 時，
 * 在這裡就明確告訴使用者，而不是上傳後才被伺服器拒絕。
 */
async function toJpegDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('decode'))
      element.src = objectUrl
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.88)
  } catch {
    throw new Error(`${file.name} 無法在這個瀏覽器讀取。HEIC 請改用 Safari，或先轉成 JPG／PNG。`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** 選取檔案後呼叫：轉好格式留在記憶體，等報修送出時一起上傳。 */
export async function saveRepairPhoto(file: File): Promise<PendingRepairPhoto> {
  const isPdf = file.type === 'application/pdf'
  const dataUrl = isPdf ? await readAsDataUrl(file) : await toJpegDataUrl(file)
  const photo: PendingRepairPhoto = {
    id: `local-${crypto.randomUUID()}`,
    name: file.name,
    type: isPdf ? 'application/pdf' : 'image/jpeg',
    size: file.size,
    dataUrl,
    previewUrl: isPdf ? '' : dataUrl,
  }
  pending.set(photo.id, photo)
  return photo
}

export function removeRepairPhoto(id: string): Promise<void> {
  pending.delete(id)
  return Promise.resolve()
}

/** 送出時把待上傳的照片轉成 API 要的格式。 */
export function uploadPayload(photos: RepairPhotoRef[]): Array<{ name: string; data: string }> {
  return photos.flatMap((photo) => {
    const local = pending.get(photo.id)
    return local ? [{ name: local.name, data: local.dataUrl }] : []
  })
}

/** 送出成功後清掉記憶體裡的待上傳照片。 */
export function forgetPending(photos: RepairPhotoRef[]): void {
  photos.forEach((photo) => pending.delete(photo.id))
}

/**
 * 取得照片網址。
 *
 * 還沒送出的直接用本地預覽；已送出的向後端讀取。後端要驗證身分，
 * 而 <img src> 帶不了 Authorization 標頭，所以先 fetch 成 blob 再給網址。
 */
export async function getRepairPhotoUrl(id: string, ticketId?: string): Promise<string> {
  const local = pending.get(id)
  if (local) return local.previewUrl
  if (!ticketId) return ''

  const key = `${ticketId}/${id}`
  const cached = remoteUrls.get(key)
  if (cached) return cached

  const token = getAuthSession()?.accessToken
  if (!token) return ''
  try {
    const response = await fetch(`${API_BASE}/repairs/${ticketId}/photos/${id}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return ''
    const url = URL.createObjectURL(await response.blob())
    remoteUrls.set(key, url)
    return url
  } catch {
    return ''
  }
}
