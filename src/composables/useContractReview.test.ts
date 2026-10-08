import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Review, ReviewFile } from '@/src/services/contractReviewApi'
import type { ResolutionRecord } from '@/src/utils/contract-resolution'

const api = vi.hoisted(() => ({ getReview: vi.fn(), saveRecords: vi.fn(), uploadEvidence: vi.fn() }))
vi.mock('@/src/services/contractReviewApi', () => api)
import { REVIEW_OFFLINE_MESSAGE, useContractReview } from './useContractReview'

const id = '12345678-1234-1234-1234-123456789abc'
const key = 'rentmate-review:' + id
const pendingKey = key + ':pending-sync'
const record = (id = 'record-1'): ResolutionRecord => ({
  id, rule: 'deposit-limit', title: '押金', action: 'discussed', note: '已確認', at: '2026-10-08T00:00:00Z', evidence: '押金三個月',
})
const evidence: ReviewFile = {
  id: 7, kind: 'evidence', recordKey: 'record-1', name: '照片.jpg', contentType: 'image/jpeg',
  size: 123, reportId: null, createdAt: '2026-10-08T00:00:00Z', url: `/api/contract/reviews/${id}/files/7`,
}
const review = (records: ResolutionRecord[] = [], files: ReviewFile[] = []): Review => ({
  id, records, files, rentalId: null, updatedAt: '2026-10-08T00:00:00Z',
})

function storage() {
  const data = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('localStorage', storage())
  vi.stubGlobal('sessionStorage', storage())
  api.getReview.mockResolvedValue(null)
  api.saveRecords.mockImplementation(async (_id, records) => review(records))
  api.uploadEvidence.mockResolvedValue([evidence])
})
afterEach(() => vi.unstubAllGlobals())

describe('審閱紀錄同步', () => {
  it('載入以伺服器為準，使用伺服器紀錄與檔案並更新快取', async () => {
    localStorage.setItem(key, JSON.stringify([record('local')]))
    const report = { ...evidence, id: 8, kind: 'report' as const, recordKey: null, reportId: 'RM-123' }
    api.getReview.mockResolvedValue(review([record()], [evidence, report]))
    const state = useContractReview(id)
    await state.loadReview()
    expect(state.records.value).toEqual([{ ...record(), attachments: [{
      id: '7', fileId: 7, url: evidence.url, name: evidence.name, size: evidence.size, type: evidence.contentType,
    }] }])
    expect(state.files.value).toEqual([evidence, report])
    expect(state.reports.value).toEqual([report])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(state.records.value)
    expect(api.saveRecords).not.toHaveBeenCalled()
    expect(state.offline.value).toBe(false)
  })

  it('伺服器回 404 時一次上傳本機舊紀錄，再載入不重複遷移', async () => {
    const local = [record()]
    localStorage.setItem(key, JSON.stringify(local))
    const state = useContractReview(id)
    await state.loadReview()
    await state.loadReview()
    expect(api.getReview).toHaveBeenCalledTimes(1)
    expect(api.saveRecords).toHaveBeenCalledExactlyOnceWith(id, local)
    expect(state.records.value).toEqual(local)
    expect(state.pendingSync.value).toBe(false)
    api.getReview.mockResolvedValue(review(local))
    await useContractReview(id).loadReview()
    expect(api.saveRecords).toHaveBeenCalledTimes(1)
  })

  it('也保留 sessionStorage 的舊紀錄遷移，沒有舊紀錄時不建立空審閱', async () => {
    const empty = useContractReview(id)
    await empty.loadReview()
    expect(api.saveRecords).not.toHaveBeenCalled()
    sessionStorage.setItem(key, JSON.stringify([record()]))
    const state = useContractReview(id)
    await state.loadReview()
    expect(api.saveRecords).toHaveBeenCalledWith(id, [record()])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([record()])
  })

  it.each(['無法連線', '請先登入', '服務暫時無法使用'])('載入失敗（%s）保留本機紀錄並顯示離線訊息', async message => {
    localStorage.setItem(key, JSON.stringify([record()]))
    api.getReview.mockRejectedValue(new Error(message))
    const state = useContractReview(id)
    await state.loadReview()
    expect(state.records.value).toEqual([record()])
    expect(state.offline.value).toBe(true)
    expect(state.offlineMessage.value).toBe(REVIEW_OFFLINE_MESSAGE)
    expect(state.syncError.value).toBe(message)
    expect(api.saveRecords).not.toHaveBeenCalled()
  })

  it('先上傳佐證，再送出含 fileId 的紀錄，不寫入 IndexedDB', async () => {
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })
    api.saveRecords.mockImplementation(async (_id, records) => review(records, [evidence]))
    const state = useContractReview(id)
    await state.loadReview()
    const image = new File(['photo'], '照片.png', { type: 'image/png' })
    await expect(state.saveRecord(record(), [image])).resolves.toBe(true)
    const expected = { ...record(), attachments: [{
      id: '7', fileId: 7, url: evidence.url, name: evidence.name, size: evidence.size, type: 'image/jpeg',
    }] }
    expect(api.uploadEvidence).toHaveBeenCalledWith(id, 'record-1', [image])
    expect(api.saveRecords).toHaveBeenCalledWith(id, [expected])
    expect(api.uploadEvidence.mock.invocationCallOrder[0]).toBeLessThan(api.saveRecords.mock.invocationCallOrder[0])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([expected])
    expect(open).not.toHaveBeenCalled()
  })

  it('儲存失敗保留本機與待同步狀態，下次儲存連同舊紀錄重試', async () => {
    const state = useContractReview(id)
    await state.loadReview()
    api.saveRecords.mockRejectedValueOnce(new Error('處理紀錄過多或過大。'))
    await expect(state.saveRecord(record())).resolves.toBe(false)
    const first = { ...record(), attachments: [] }
    expect(state.records.value).toEqual([first])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([first])
    expect(localStorage.getItem(pendingKey)).toBe('true')
    expect(state.pendingSync.value).toBe(true)
    expect(state.syncError.value).toBe('處理紀錄過多或過大。')
    await expect(state.saveRecord(record('record-2'))).resolves.toBe(true)
    expect(api.saveRecords).toHaveBeenLastCalledWith(id, [first, { ...record('record-2'), attachments: [] }])
    expect(state.pendingSync.value).toBe(false)
    expect(state.syncError.value).toBe('')
    expect(localStorage.getItem(pendingKey)).toBeNull()
    expect(api.uploadEvidence).not.toHaveBeenCalled()
  })

  it('重新載入時重試待同步紀錄，不被伺服器舊版蓋掉也不重複上傳佐證', async () => {
    const state = useContractReview(id)
    await state.loadReview()
    api.saveRecords.mockRejectedValueOnce(new Error('暫時無法儲存'))
    await state.saveRecord(record(), [new File(['photo'], '照片.jpg')])
    const pending = JSON.parse(localStorage.getItem(key)!)
    api.getReview.mockResolvedValue(review([], [evidence]))
    api.saveRecords.mockImplementation(async (_id, records) => review(records, [evidence]))
    const reloaded = useContractReview(id)
    await reloaded.loadReview()
    expect(api.saveRecords).toHaveBeenLastCalledWith(id, pending)
    expect(reloaded.records.value).toEqual(pending)
    expect(reloaded.pendingSync.value).toBe(false)
    expect(api.uploadEvidence).toHaveBeenCalledTimes(1)
  })

  it('遷移失敗仍保留本機資料並在重新載入時重試', async () => {
    localStorage.setItem(key, JSON.stringify([record()]))
    api.saveRecords.mockRejectedValueOnce(new Error('暫時無法儲存'))
    const state = useContractReview(id)
    await state.loadReview()
    expect(state.pendingSync.value).toBe(true)
    expect(state.records.value).toEqual([record()])
    expect(state.syncError.value).toBe('暫時無法儲存')
    expect(state.offline.value).toBe(true)
    const reloaded = useContractReview(id)
    await reloaded.loadReview()
    expect(api.saveRecords).toHaveBeenCalledTimes(2)
    expect(reloaded.pendingSync.value).toBe(false)
  })

  it('舊附件在遷移、載入、後續儲存時都保持原樣', async () => {
    const legacy = { id: 'old-id', name: '舊契約.pdf', size: 234, type: 'application/pdf' }
    const old = { ...record('old-record'), attachments: [legacy] }
    localStorage.setItem(key, JSON.stringify([old]))
    const state = useContractReview(id)
    await state.loadReview()
    expect(state.records.value[0].attachments).toEqual([legacy])
    api.getReview.mockResolvedValue(review([old]))
    const reloaded = useContractReview(id)
    await reloaded.loadReview()
    await reloaded.saveRecord(record('new-record'))
    expect(reloaded.records.value[0]).toEqual(old)
    expect(api.saveRecords).toHaveBeenLastCalledWith(id, [old, { ...record('new-record'), attachments: [] }])
    expect(api.uploadEvidence).not.toHaveBeenCalled()
  })

  it('佐證上傳失敗不送出紀錄並保留錯誤供重試', async () => {
    api.uploadEvidence.mockRejectedValue(new Error('佐證只收 JPG、PNG、WebP 圖片。'))
    const state = useContractReview(id)
    await expect(state.saveRecord(record(), [new File(['bad'], '照片.jpg')])).rejects.toThrow('佐證只收 JPG、PNG、WebP 圖片。')
    expect(state.records.value).toEqual([])
    expect(state.pendingSync.value).toBe(false)
    expect(state.syncError.value).toBe('佐證只收 JPG、PNG、WebP 圖片。')
    expect(api.saveRecords).not.toHaveBeenCalled()
  })

  it('首次載入尚未結束時儲存會等候，避免覆蓋伺服器紀錄', async () => {
    let resolve!: (value: Review) => void
    api.getReview.mockReturnValue(new Promise<Review>(done => { resolve = done }))
    const state = useContractReview(id)
    const loading = state.loadReview()
    const saving = state.saveRecord(record('new-record'))
    expect(state.loading.value).toBe(true)
    expect(api.saveRecords).not.toHaveBeenCalled()
    resolve(review([record('server-record')]))
    await loading
    await saving
    expect(api.saveRecords).toHaveBeenCalledWith(id, [record('server-record'), { ...record('new-record'), attachments: [] }])
  })
})
