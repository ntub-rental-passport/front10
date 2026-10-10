const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export type ReviewFile = {
  id: number
  kind: 'evidence' | 'report'
  recordKey: string | null
  name: string
  contentType: string
  size: number
  reportId: string | null
  createdAt: string
  url: string
}

export type Review = {
  id: string
  records: unknown[]
  rentalId: number | null
  files: ReviewFile[]
  updatedAt: string
}

async function reviewRequest<T>(path: string, options: NonNullable<Parameters<typeof fetch>[1]> = {}, allowMissing = false): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/contract/reviews/${path}`, {
    ...options,
    credentials: 'include',
  })
  if (allowMissing && response.status === 404) return null as T
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string'
      ? body.detail
      : `審閱紀錄請求失敗（${response.status}），請稍後重試。`)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export function getReview(id: string): Promise<Review | null> {
  return reviewRequest(encodeURIComponent(id), {}, true)
}

export function saveRecords(id: string, records: unknown[]): Promise<Review> {
  return reviewRequest(encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  })
}

export async function uploadEvidence(id: string, recordKey: string, files: File[]): Promise<ReviewFile[]> {
  const body = new FormData()
  body.append('record_key', recordKey)
  for (const file of files) body.append('files', file)
  const result = await reviewRequest<{ files: ReviewFile[] }>(`${encodeURIComponent(id)}/evidence`, { method: 'POST', body })
  return result.files
}

export function uploadReport(id: string, pdf: Uint8Array | Blob, fileName: string, reportId: string): Promise<ReviewFile> {
  const body = new FormData()
  body.append('file', pdf instanceof Blob ? pdf : new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), fileName)
  body.append('report_id', reportId)
  return reviewRequest(`${encodeURIComponent(id)}/reports`, { method: 'POST', body })
}

export async function deleteReviewFile(id: string, fileId: number): Promise<void> {
  await reviewRequest(`${encodeURIComponent(id)}/files/${fileId}`, { method: 'DELETE' })
}

export function reviewFileUrl(file: Pick<ReviewFile, 'url'>): string {
  return `${API_BASE_URL}${file.url.replace(/^\/api(?=\/)/, '')}`
}
