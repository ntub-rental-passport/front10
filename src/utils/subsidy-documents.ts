import type { SubsidyDocType, SubsidyFile } from '@/src/services/subsidyFileApi'

export const subsidyDocTypes: { value: SubsidyDocType; label: string }[] = [
  { value: 'application_form', label: '申請書' },
  { value: 'identity', label: '身分證明' },
  { value: 'household', label: '戶籍資料' },
  { value: 'lease_copy', label: '租約影本' },
  { value: 'bankbook', label: '存摺封面' },
  { value: 'other', label: '其他' },
]

export function groupByDocType(files: SubsidyFile[]) {
  return subsidyDocTypes
    .map((type) => ({ ...type, files: files.filter((file) => file.docType === type.value) }))
    .filter((group) => group.files.length > 0)
}

export function formatExpiry(expiresAt: string): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(expiresAt))
  return `將於 ${date} 自動刪除`
}

export function validateSubsidyFile(file: Pick<File, 'size' | 'name'>): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return '只收 PDF、JPG、PNG 檔案。'
  if (file.size > 10 * 1024 * 1024) return '檔案不得超過 10 MB。'
  if (new TextEncoder().encode(file.name).length > 483) return '檔名過長，請縮短後再上傳。'
  return null
}
