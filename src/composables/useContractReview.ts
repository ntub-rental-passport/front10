import { computed, ref } from 'vue'
import { getReview, saveRecords, uploadEvidence, type Review, type ReviewFile } from '@/src/services/contractReviewApi'
import type { EvidenceAttachment } from '@/src/utils/contract-evidence'
import type { ResolutionRecord } from '@/src/utils/contract-resolution'

export const REVIEW_OFFLINE_MESSAGE = '目前無法連到伺服器，紀錄暫存在這台裝置。'

function resolutionRecords(value: unknown): ResolutionRecord[] {
  return Array.isArray(value)
    ? value.filter(record => record && typeof record.rule === 'string' && typeof record.evidence === 'string')
    : []
}

function evidenceAttachment(file: ReviewFile): EvidenceAttachment {
  return { id: String(file.id), fileId: file.id, url: file.url, name: file.name, size: file.size, type: file.contentType }
}

export function useContractReview(reviewId: string) {
  const historyKey = 'rentmate-review:' + reviewId
  const pendingKey = historyKey + ':pending-sync'
  const records = ref<ResolutionRecord[]>([])
  const files = ref<ReviewFile[]>([])
  const offline = ref(false)
  const pendingSync = ref(false)
  const syncError = ref('')
  const loading = ref(false)
  const offlineMessage = computed(() => offline.value ? REVIEW_OFFLINE_MESSAGE : '')
  const reports = computed(() => files.value.filter(file => file.kind === 'report'))
  let loadPromise: Promise<void> | undefined

  try {
    records.value = resolutionRecords(JSON.parse(localStorage.getItem(historyKey) || sessionStorage.getItem(historyKey) || '[]'))
    pendingSync.value = localStorage.getItem(pendingKey) === 'true'
  } catch { /* 瀏覽器可能不允許讀取快取。 */ }

  function cacheRecords() {
    try {
      localStorage.setItem(historyKey, JSON.stringify(records.value))
      if (pendingSync.value) localStorage.setItem(pendingKey, 'true')
      else localStorage.removeItem(pendingKey)
    } catch {
      syncError.value = '無法暫存紀錄，請確認瀏覽器允許儲存資料。'
    }
  }

  function applyReview(review: Review) {
    files.value = review.files
    records.value = resolutionRecords(review.records).map(record => {
      const evidence = review.files.filter(file => file.kind === 'evidence' && file.recordKey === record.id)
      if (!evidence.length && !record.attachments?.some(attachment => attachment.fileId !== undefined)) return record
      return {
        ...record,
        attachments: [
          ...(record.attachments || []).filter(attachment => attachment.fileId === undefined),
          ...evidence.map(evidenceAttachment),
        ],
      }
    })
  }

  async function syncRecords(): Promise<boolean> {
    pendingSync.value = true
    syncError.value = ''
    cacheRecords()
    try {
      applyReview(await saveRecords(reviewId, records.value))
      pendingSync.value = false
      offline.value = false
      cacheRecords()
      return true
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : '紀錄同步失敗，請稍後重試。'
      cacheRecords()
      return false
    }
  }

  async function fetchReview() {
    loading.value = true
    try {
      const review = await getReview(reviewId)
      offline.value = false
      if (pendingSync.value || (!review && records.value.length)) {
        // 未送出的本機紀錄先重試，避免被伺服器的舊版本覆蓋。
        if (review) files.value = review.files
        if (!await syncRecords()) offline.value = true
      } else if (review) {
        applyReview(review)
        cacheRecords()
      }
    } catch (error) {
      offline.value = true
      syncError.value = error instanceof Error ? error.message : '紀錄讀取失敗，請稍後重試。'
    } finally {
      loading.value = false
    }
  }

  function loadReview(): Promise<void> {
    if (!loadPromise) loadPromise = fetchReview()
    return loadPromise
  }

  async function saveRecord(record: ResolutionRecord, evidence: File[] = []): Promise<boolean> {
    await loadReview()
    let attachments = record.attachments || []
    if (evidence.length) {
      try {
        const uploaded = await uploadEvidence(reviewId, record.id, evidence)
        files.value.push(...uploaded)
        attachments = [...attachments, ...uploaded.map(evidenceAttachment)]
      } catch (error) {
        syncError.value = error instanceof Error ? error.message : '佐證上傳失敗，請稍後重試。'
        throw error
      }
    }
    records.value = [...records.value, { ...record, attachments }]
    return syncRecords()
  }

  return { records, files, reports, offline, offlineMessage, pendingSync, syncError, loading, loadReview, saveRecord }
}
