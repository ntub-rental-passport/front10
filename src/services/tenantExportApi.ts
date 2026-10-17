const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function downloadTenantExport(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : '資料匯出失敗，請稍後重試。')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const filename = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  link.download = filename ? decodeURIComponent(filename) : fallbackName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function downloadAccountData(): Promise<void> {
  return downloadTenantExport('/account/export', 'RentMate-個人資料.zip')
}
