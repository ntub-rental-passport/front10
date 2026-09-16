export type EvidenceAttachment = { id: string; name: string; size: number; type: string }

export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'
export const MAX_EVIDENCE_FILES = 5
export const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024

export function validateEvidenceFiles(existing: Pick<File, 'size'>[], incoming: Pick<File, 'name' | 'size'>[]) {
  if (existing.length + incoming.length > MAX_EVIDENCE_FILES) return '每筆紀錄最多可加入 5 個附件。'
  if (incoming.some(file => !/\.(jpe?g|png|webp|gif|pdf|docx?|xlsx?|txt|csv)$/i.test(file.name))) {
    return '請選擇 JPG、PNG、WebP、GIF、PDF、Word、Excel、TXT 或 CSV 檔案。'
  }
  if (incoming.some(file => !file.size)) return '無法加入空白檔案，請重新選擇。'
  if ([...existing, ...incoming].some(file => file.size > MAX_EVIDENCE_SIZE)) return '每個附件不得超過 10 MB。'
  if ([...existing, ...incoming].reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) {
    return '每筆紀錄的附件總大小不得超過 25 MB。'
  }
  return ''
}

export function formatEvidenceSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function openEvidenceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rentmate-contract-evidence', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('附件儲存空間目前無法開啟'))
    request.onsuccess = () => resolve(request.result)
  })
}

// Store binary files outside sessionStorage to avoid its small text-only quota.
export async function saveEvidenceFiles(files: { id: string; file: File }[]) {
  if (!files.length) return
  const db = await openEvidenceDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
      for (const { id, file } of files) tx.objectStore('files').put(file, id)
    })
  } finally { db.close() }
}

export async function removeEvidenceFiles(ids: string[]) {
  if (!ids.length) return
  const db = await openEvidenceDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
      for (const id of ids) tx.objectStore('files').delete(id)
    })
  } finally { db.close() }
}

export async function loadEvidenceFile(id: string): Promise<Blob> {
  const db = await openEvidenceDatabase()
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(id)
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error('附件不存在'))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}
