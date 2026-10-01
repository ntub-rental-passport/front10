export type RepairPhotoPurpose = 'initial' | 'supplement' | 'unresolved' | 'completion' | 'receipt' | 'quote'

export function validateRepairUpload(file: { type: string; size: number }, purpose: RepairPhotoPurpose): string {
  const pdfAllowed = purpose === 'receipt' || purpose === 'quote'
  if (file.type === 'application/pdf' && pdfAllowed) return file.size <= 10 * 1024 * 1024 ? '' : 'PDF 不可超過 10 MB。'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return pdfAllowed ? '請選擇 JPG、PNG、WebP 或 PDF。' : '請選擇 JPG、PNG 或 WebP 圖片。'
  return file.size <= 5 * 1024 * 1024 ? '' : '圖片不可超過 5 MB。'
}

/** 備份不解析 JSON：即使舊資料損壞也保留原文，備份失敗絕不刪除。 */
export function archiveLegacyRepairStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, key: string): void {
  const raw = storage.getItem(key)
  if (raw === null) return
  const archiveKey = `${key}:archive`
  const existing = storage.getItem(archiveKey)
  if (existing === null) storage.setItem(archiveKey, raw)
  else if (existing !== raw) storage.setItem(`${archiveKey}:${Date.now()}`, raw)
  else storage.setItem(archiveKey, existing)
  storage.removeItem(key)
}

export function archiveLegacyRepairs(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void { archiveLegacyRepairStorage(storage, 'rentmate-repair-tickets-v1') }
