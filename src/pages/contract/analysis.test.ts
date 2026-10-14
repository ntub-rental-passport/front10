import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, type Ref, type SetupContext } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { ReviewFile } from '@/src/services/contractReviewApi'
import type { EvidenceAttachment } from '@/src/utils/contract-evidence'

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(), uploadReport: vi.fn(), deleteReviewFile: vi.fn(),
  generateContractReportPdf: vi.fn(), downloadPdf: vi.fn(), loadEvidenceFile: vi.fn(),
}))
vi.mock('@/src/services/contractReviewApi', async importOriginal => ({
  ...await importOriginal<typeof import('@/src/services/contractReviewApi')>(),
  getReview: mocks.getReview, uploadReport: mocks.uploadReport, deleteReviewFile: mocks.deleteReviewFile,
}))
vi.mock('@/src/utils/contract-report', () => ({
  generateContractReportPdf: mocks.generateContractReportPdf, downloadPdf: mocks.downloadPdf,
}))
vi.mock('@/src/utils/contract-evidence', async importOriginal => ({
  ...await importOriginal<typeof import('@/src/utils/contract-evidence')>(), loadEvidenceFile: mocks.loadEvidenceFile,
}))
vi.mock('@/src/utils/contract-ocr', () => ({
  loadContractOcrResult: () => ({ reviewSessionId: '12345678-1234-1234-1234-123456789abc', fileName: '契約.pdf', text: '', pageTexts: [], fieldReviews: {} }),
  saveContractOcrResult: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import Analysis from './analysis.vue'

const id = '12345678-1234-1234-1234-123456789abc'
const report: ReviewFile = {
  id: 8, kind: 'report', recordKey: null, name: '診斷.pdf', contentType: 'application/pdf', size: 123,
  reportId: 'RM-123', createdAt: '2026-10-08T00:00:00Z', url: `/api/contract/reviews/${id}/files/8`,
}
type AnalysisState = {
  aiAnalysisState: Ref<'loading' | 'ok' | 'failed'>
  exportDialogOpen: Ref<boolean>
  exportPrivacyMode: Ref<boolean>
  exportError: Ref<string>
  exportSuccess: Ref<string>
  savedReports: Ref<ReviewFile[]>
  activeRiskTab: Ref<string>
  evidenceDownloadError: Ref<string>
  downloadEvidence: (attachment: EvidenceAttachment) => Promise<void>
  loadReview: () => Promise<void>
  exportAnalysisReport: (saveToSpace?: boolean) => Promise<void>
  deleteSavedReport: (report: ReviewFile) => Promise<void>
}
async function render(history = false) {
  let state!: AnalysisState
  const component = {
    ...Analysis,
    async setup(props: Record<string, unknown>, context: SetupContext) {
      const result = (Analysis.setup as (props: Record<string, unknown>, context: SetupContext) => AnalysisState)(props, context)
      state = result
      state.exportDialogOpen.value = true
      if (history) state.activeRiskTab.value = 'history'
      await state.loadReview()
      // 分析頁預設渲染等待畫面（aiAnalysisState 初值是 loading），報告區要等
      // 分析回來才掛上去。這幾個案例測的是報告區的行為，所以直接進入完成狀態。
      state.aiAnalysisState.value = 'ok'
      return result
    },
  }
  const html = await renderToString(createSSRApp(component))
  return { state, html }
}

beforeEach(() => {
  vi.resetAllMocks()
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('window', { confirm: vi.fn(() => true), setTimeout: vi.fn() })
  mocks.getReview.mockResolvedValue({ id, records: [], files: [report], rentalId: null, updatedAt: report.createdAt })
  mocks.generateContractReportPdf.mockResolvedValue({ bytes: new Uint8Array([1, 2]), fileName: '診斷.pdf', reportId: 'RM-123' })
  mocks.uploadReport.mockResolvedValue({ ...report, id: 9, url: `/api/contract/reviews/${id}/files/9` })
  mocks.deleteReviewFile.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('分析頁報告儲存', () => {
  it('存到我的空間固定產生隱私保護版並使用產出的檔名和編號，成功後更新清單', async () => {
    const { state, html } = await render()
    expect(html).toContain('存到我的空間')
    expect(html).toContain('請勿上傳完整租約，只收圖片。')
    await state.exportAnalysisReport(true)
    expect(mocks.generateContractReportPdf).toHaveBeenCalledWith(expect.objectContaining({ privacyMode: true }))
    expect(mocks.uploadReport).toHaveBeenCalledWith(id, new Uint8Array([1, 2]), '診斷.pdf', 'RM-123')
    expect(mocks.downloadPdf).not.toHaveBeenCalled()
    expect(state.exportSuccess.value).toBe('隱私保護版報告已存到我的空間。')
    expect(state.savedReports.value.map(file => file.id)).toEqual([8, 9])
    expect(state.exportDialogOpen.value).toBe(true)
  })

  it.each([true, false])('正常下載仍尊重 privacyMode=%s，不上傳報告', async privacyMode => {
    const { state } = await render()
    state.exportPrivacyMode.value = privacyMode
    await state.exportAnalysisReport()
    expect(mocks.generateContractReportPdf).toHaveBeenCalledWith(expect.objectContaining({ privacyMode }))
    expect(mocks.downloadPdf).toHaveBeenCalledWith(new Uint8Array([1, 2]), '診斷.pdf')
    expect(mocks.uploadReport).not.toHaveBeenCalled()
    expect(state.exportDialogOpen.value).toBe(false)
  })

  it('報告滿額時顯示伺服器訊息', async () => {
    mocks.uploadReport.mockRejectedValue(new Error('已存 10 份報告，請先刪除舊報告。'))
    const { state } = await render()
    await state.exportAnalysisReport(true)
    expect(state.exportError.value).toBe('已存 10 份報告，請先刪除舊報告。')
    expect(state.exportSuccess.value).toBe('')
    expect(state.savedReports.value).toEqual([report])
  })

  it('清單提供 cookie 下載連結，時間為臺北時間，確認後才刪除', async () => {
    const { state, html } = await render()
    expect(html).toContain('已存的報告')
    expect(html).toMatch(/上午8:00:00.*臺北時間/)
    expect(html).toContain(`href="${report.url}" download="診斷.pdf"`)
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await state.deleteSavedReport(report)
    expect(mocks.deleteReviewFile).not.toHaveBeenCalled()
    await state.deleteSavedReport(report)
    expect(window.confirm).toHaveBeenCalledWith('確定刪除「診斷.pdf」？')
    expect(mocks.deleteReviewFile).toHaveBeenCalledWith(id, 8)
    expect(state.savedReports.value).toEqual([])
  })

  it('刪除失敗保留清單並顯示伺服器訊息', async () => {
    mocks.deleteReviewFile.mockRejectedValue(new Error('找不到這筆審閱紀錄。'))
    const { state } = await render()
    await state.deleteSavedReport(report)
    expect(state.exportError.value).toBe('找不到這筆審閱紀錄。')
    expect(state.savedReports.value).toEqual([report])
  })

  it('舊附件和伺服器附件使用相同顯示方式，不額外標示舊附件', async () => {
    const legacy = { id: 'old', name: '舊佐證.pdf', size: 1024, type: 'application/pdf' }
    const evidence = { ...report, id: 7, kind: 'evidence' as const, recordKey: 'record-1', reportId: null, name: '照片.jpg', contentType: 'image/jpeg' }
    mocks.getReview.mockResolvedValue({ id, records: [{ id: 'record-1', rule: 'deposit-limit', evidence: '押金', action: 'discussed', at: report.createdAt, note: '已確認', title: '押金', attachments: [legacy] }], files: [evidence], rentalId: null, updatedAt: report.createdAt })
    const { html } = await render(true)
    expect(html).toContain('舊佐證.pdf')
    expect(html).toContain('照片.jpg')
    expect(html).toContain('佐證附件 · 2')
    expect(html).not.toContain('舊附件')
    expect(html).not.toContain('IndexedDB')
  })

  it('伺服器附件經 cookie 連結下載，不讀取 IndexedDB', async () => {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } })
    const { state } = await render()
    await state.downloadEvidence({ id: '7', fileId: 7, url: `/api/contract/reviews/${id}/files/7`, name: '照片.jpg', size: 123, type: 'image/jpeg' })
    expect(link.href).toBe(`/api/contract/reviews/${id}/files/7`)
    expect(link.download).toBe('照片.jpg')
    expect(link.click).toHaveBeenCalledOnce()
    expect(mocks.loadEvidenceFile).not.toHaveBeenCalled()
  })

  it('舊附件仍讀取 IndexedDB，讀取失敗使用原有錯誤訊息', async () => {
    mocks.loadEvidenceFile.mockRejectedValue(new Error('附件不存在'))
    const { state } = await render()
    await state.downloadEvidence({ id: 'old', name: '舊佐證.pdf', size: 123, type: 'application/pdf' })
    expect(mocks.loadEvidenceFile).toHaveBeenCalledWith('old')
    expect(state.evidenceDownloadError.value).toBe('無法讀取附件，瀏覽器中的附件可能已被清除。請重新加入檔案。')
  })
})
