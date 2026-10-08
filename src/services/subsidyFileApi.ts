import { getAuthSession } from '@/src/composables/useAuth'

export type SubsidyDocType =
  | 'application_form'
  | 'identity'
  | 'household'
  | 'lease_copy'
  | 'bankbook'
  | 'other'

export interface SubsidyFile {
  id: number
  docType: SubsidyDocType
  name: string
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png'
  size: number
  rentalId: number | null
  createdAt: string
  expiresAt: string
  url: string
}

export interface SubsidyFileList {
  files: SubsidyFile[]
  count: number
  limit: number
}

const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(
  path = '',
  init: { method?: string; body?: FormData } = {},
): Promise<Response> {
  const token = getAuthSession()?.accessToken
  if (!token) {
    throw Object.assign(new Error('登入租客帳號後，可以在這裡保存補助文件。'), { status: 401 })
  }
  const response = await fetch(`${API_BASE}/subsidy/files${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw Object.assign(
      new Error(
        typeof body?.detail === 'string' ? body.detail : '無法讀取或儲存文件，請稍後再試。',
      ),
      { status: response.status },
    )
  }
  return response
}

export async function listSubsidyFiles(): Promise<SubsidyFileList> {
  return (await request()).json()
}

export async function uploadSubsidyFile(
  file: File,
  docType: SubsidyDocType,
  rentalId?: number,
): Promise<SubsidyFile> {
  const body = new FormData()
  body.append('doc_type', docType)
  body.append('file', file)
  if (rentalId !== undefined) body.append('rental_id', String(rentalId))
  return (await request('', { method: 'POST', body })).json()
}

export async function fetchSubsidyFileBlob(file: SubsidyFile): Promise<Blob> {
  return (await request(`/${file.id}`)).blob()
}

export async function deleteSubsidyFile(id: number): Promise<void> {
  await request(`/${id}`, { method: 'DELETE' })
}
