import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, nextTick, ref, type Ref, type SetupContext } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { ContractReviewFilter } from '@/src/utils/contract-review-filter'

const mocks = vi.hoisted(() => ({
  mobile: false,
  save: vi.fn(() => true),
  finalize: vi.fn(),
  crop: vi.fn(),
}))
vi.mock('@vueuse/core', () => ({ useMediaQuery: () => ref(mocks.mobile) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/src/services/contractApi', () => ({ finalizeContract: mocks.finalize }))
vi.mock('@/src/utils/contract-field-evidence', async importOriginal => ({
  ...await importOriginal<typeof import('@/src/utils/contract-field-evidence')>(),
  createContractFieldCropUrl: mocks.crop,
}))
vi.mock('@/src/utils/contract-ocr', async importOriginal => ({
  ...await importOriginal<typeof import('@/src/utils/contract-ocr')>(),
  loadContractOcrResult: () => ({
    text: '本契約於民國115年9月16日經承租人攜回審閱5日。',
    pageTexts: ['本契約於民國115年9月16日經承租人攜回審閱5日。'],
    fieldReviews: {
      review_date: { value: '民國 115 年 9 月 16 日', sourceValue: '民國115年9月16日', confidence: 'high', reviewState: 'unreviewed' },
      review_days: { value: '5 日', sourceValue: '5日', confidence: 'medium', reviewState: 'unreviewed' },
    },
  }),
  saveContractOcrResult: mocks.save,
}))
import Editor from './editor.vue'

interface Field {
  id: string
  confidence: 'high' | 'medium' | 'low'
  value: string
  editing: boolean
  editStartValue: string
  reviewState: string
  validationError: string
}
interface EditorState {
  isMobile: Ref<boolean>
  fields: Ref<Field[]>
  filteredFields: Ref<Field[]>
  mobileBatchConfirmableFields: Ref<Field[]>
  fieldFilters: Ref<Array<{ id: ContractReviewFilter; count: number }>>
  fieldGroupNav: Ref<HTMLElement | null>
  fieldSections: Ref<Array<{ fields: Field[] }>>
  activeFieldFilter: Ref<ContractReviewFilter>
  canStartAnalysis: Ref<boolean>
  finalizeChoice: Ref<'final' | 'draft' | null>
  finalizeDialog: Ref<Pick<HTMLDialogElement, 'showModal'>>
  evidenceDialog: Ref<Pick<HTMLDialogElement, 'showModal' | 'close'>>
  fieldEvidenceUrls: Ref<Record<string, string | null>>
  enlargedEvidence: Ref<{ url: string; label: string } | null>
  selectFieldGroup: (id: string) => void
  startFieldEdit: (field: Field) => void
  updateMobileField: (field: Field, value: string) => void
  confirmMobileField: (field: Field) => void
  confirmMobileHighConfidence: () => void
  confirmFieldEdit: (field: Field) => void
  cancelFieldEdit: (field: Field) => void
  verifyField: (field: Field) => void
  resetFieldReview: (field: Field) => void
  selectFieldFilter: (filter: ContractReviewFilter) => void
  documentReader: Ref<Pick<HTMLDialogElement, 'showModal' | 'close'>>
  openDocumentReader: () => void
  expandedEvidenceId: Ref<string | null>
  toggleFieldEvidence: (field: Field) => void
  scrollActiveFieldGroupIntoView: () => Promise<void>
  completeReviewAndAnalyze: () => void
  loadFieldEvidence: (field: Field) => Promise<void>
  enlargeFieldEvidence: (field: Field) => Promise<void>
}

async function render(prepare?: (state: EditorState) => void) {
  let state!: EditorState
  const component = {
    ...Editor,
    setup(props: Record<string, unknown>, context: SetupContext) {
      state = (Editor.setup as (props: Record<string, unknown>, context: SetupContext) => EditorState)(props, context)
      prepare?.(state)
      return state
    },
  }
  const context: { teleports?: Record<string, string> } = {}
  const html = await renderToString(createSSRApp(component), context)
  return { state, html, teleports: context.teleports }
}

beforeEach(() => {
  mocks.mobile = false
  vi.clearAllMocks()
  mocks.crop.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('契約欄位手機校對', () => {
  it('桌面維持全部篩選，手機預設待確認且優先顯示建議確認', async () => {
    const desktop = await render()
    expect(desktop.state.activeFieldFilter.value).toBe('all')
    expect(desktop.html).toContain('本類全部')
    expect(desktop.html).not.toContain('mobile-field-row')
    expect(desktop.html).not.toContain('mobile-document-dialog')
    mocks.mobile = true
    const { state, html } = await render()
    expect(state.activeFieldFilter.value).toBe('pending')
    expect(state.filteredFields.value.map(field => field.id)).toEqual(['review_days', 'review_date'])
    expect(html).toContain('已校對 0 / 2')
    expect(html).toContain('aria-label="查看審閱日數原文"')
    expect(html).toContain('aria-label="審閱日數正確"')
    expect(html).toContain('mobile-status-dot--pending')
    expect(html).not.toContain('修改後確認')
    expect(html).not.toContain('class="mobile-field-input"')
    expect(html).not.toContain('class="field-group-nav"')
    expect(html).not.toContain('本類全部')
    expect(html).not.toContain('高信心待確認')
    expect(html).not.toContain('建議確認</span>')
    expect(html.match(/class="field-filter-bar"/g)).toHaveLength(1)
    expect(state.fieldFilters.value.map(filter => filter.id)).toEqual(['pending', 'low', 'reviewed'])
    expect(html).toContain('黃＝待確認')
    expect(html).toContain('綠＝已確認')
    expect(html).toContain('灰＝缺少')
    expect(html).not.toContain('data-field-id="landlord_review_signature"')
  })

  it('一鍵確認只涵蓋目前手機清單中的高信心欄位', async () => {
    mocks.mobile = true
    const { state, html } = await render()
    expect(state.mobileBatchConfirmableFields.value.map(field => field.id)).toContain('review_date')
    expect(state.mobileBatchConfirmableFields.value.some(field => field.id === 'start_date')).toBe(false)
    expect(html).toContain('一鍵確認')

    state.selectFieldGroup('term')
    expect(state.mobileBatchConfirmableFields.value.some(field => field.id === 'review_date')).toBe(false)
    expect(state.mobileBatchConfirmableFields.value.every(field => ['start_date', 'end_date'].includes(field.id))).toBe(true)

    state.selectFieldFilter('low')
    expect(state.mobileBatchConfirmableFields.value).toHaveLength(0)
    state.selectFieldFilter('reviewed')
    expect(state.mobileBatchConfirmableFields.value).toHaveLength(0)

    state.selectFieldFilter('pending')
    const eligibleIds = state.mobileBatchConfirmableFields.value.map(field => field.id)
    const editedField = state.fields.value.find(field => field.id === 'end_date')!
    state.startFieldEdit(editedField)
    state.confirmMobileHighConfidence()
    for (const field of state.fields.value) {
      expect(field.reviewState === 'verified').toBe(eligibleIds.includes(field.id))
    }
    expect(editedField.editing).toBe(false)

    const empty = await render(state => {
      for (const field of state.fields.value) state.verifyField(field)
    })
    expect(empty.state.mobileBatchConfirmableFields.value).toHaveLength(0)
    expect(empty.html).not.toContain('mobile-batch-confirm')
  })

  it('切換寬度保留各自篩選，切換手機群組回到本類全部', async () => {
    const { state } = await render()
    state.activeFieldFilter.value = 'medium'
    state.isMobile.value = true
    expect(state.activeFieldFilter.value).toBe('pending')
    state.activeFieldFilter.value = 'low'
    state.isMobile.value = false
    expect(state.activeFieldFilter.value).toBe('medium')
    state.isMobile.value = true
    expect(state.activeFieldFilter.value).toBe('low')
    state.selectFieldGroup('scope')
    expect(state.activeFieldFilter.value).toBe('all')
    expect(state.fieldSections.value).toHaveLength(1)
  })

  it('手機預設跨分類待確認，卡片標示分類、數量涵蓋所有分類，點分類後只顯示本類', async () => {
    mocks.mobile = true
    const { state, html } = await render(state => {
      const field = state.fields.value.find(field => field.id === 'start_date')!
      field.value = '民國 115 年 10 月 1 日'
      field.confidence = 'low'
    })
    expect(state.filteredFields.value.map(field => field.id)).toEqual(['review_days', 'start_date', 'review_date'])
    expect(state.fieldFilters.value.find(filter => filter.id === 'pending')?.count).toBe(3)
    expect(html).toMatch(/class="mobile-field-category"[^>]*>契約審閱期・審閱日數<span/)
    expect(html).toMatch(/class="mobile-field-category"[^>]*>租賃期間・租期起始<span/)
    expect(html).not.toContain('class="active-field-group-heading"')
    state.selectFieldGroup('term')
    expect(state.activeFieldFilter.value).toBe('all')
    expect(state.filteredFields.value.map(field => field.id)).toContain('end_date')
    expect(state.filteredFields.value.map(field => field.id)).not.toContain('review_days')
    state.activeFieldFilter.value = 'pending'
    expect(state.filteredFields.value.map(field => field.id)).toEqual(['review_days', 'start_date', 'review_date'])
  })

  it('即使作用中分類不適用，待確認仍列出其他分類；全部確認後顯示完成提示', async () => {
    mocks.mobile = true
    const pending = await render(state => {
      state.selectFieldGroup('authorization')
      state.activeFieldFilter.value = 'pending'
    })
    expect(pending.state.filteredFields.value.map(field => field.id)).toEqual(['review_days', 'review_date'])
    expect(pending.html).not.toContain('本契約未適用代理或轉租')
    const completed = await render(state => {
      state.selectFieldGroup('authorization')
      state.activeFieldFilter.value = 'pending'
      for (const field of state.filteredFields.value) state.confirmMobileField(field)
    })
    expect(completed.html).toContain('都確認完了，可以開始分析')
    expect(completed.html).not.toContain('目前沒有符合此狀態的欄位')
    expect(completed.state.fieldFilters.value.find(filter => filter.id === 'pending')?.count).toBe(0)
  })

  it('正確按鈕確認欄位，改回待確認後重新進入待確認清單', async () => {
    mocks.mobile = true
    const { state, html } = await render(state => {
      state.verifyField(state.fields.value.find(field => field.id === 'review_days')!)
      state.selectFieldFilter('reviewed')
    })
    const field = state.fields.value.find(field => field.id === 'review_days')!
    expect(field.reviewState).toBe('verified')
    expect(html).toContain('aria-label="審閱日數改回待確認"')
    expect(html).toContain('mobile-status-dot--reviewed')
    state.resetFieldReview(field)
    expect(field.reviewState).toBe('unreviewed')
    expect(state.filteredFields.value).not.toContain(field)
    state.selectFieldFilter('pending')
    expect(state.filteredFields.value).toContain(field)
  })

  it('點值後聚焦輸入，取消還原原值與校對狀態；開啟另一欄也取消未儲存修改', async () => {
    mocks.mobile = true
    const { state } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    const other = state.fields.value.find(field => field.id === 'review_date')!
    const input = { focus: vi.fn() }
    const querySelector = vi.fn(() => input)
    vi.stubGlobal('document', { querySelector })
    state.startFieldEdit(field)
    await nextTick()
    expect(querySelector).toHaveBeenCalledWith('[data-field-id="review_days"] .mobile-field-input')
    expect(input.focus).toHaveBeenCalledOnce()
    state.updateMobileField(field, '6 日')
    state.cancelFieldEdit(field)
    expect(field.value).toBe('5 日')
    expect(field.reviewState).toBe('unreviewed')
    expect(field.editing).toBe(false)
    state.startFieldEdit(field)
    state.updateMobileField(field, '7 日')
    state.startFieldEdit(other)
    expect(field.value).toBe('5 日')
    expect(field.editing).toBe(false)
    expect(other.editing).toBe(true)
    expect(state.fields.value.filter(field => field.editing)).toHaveLength(1)
  })

  it('儲存並確認會驗證文字、儲存修改並退出編輯；未修改時也可確認', async () => {
    mocks.mobile = true
    const { state, html } = await render(state => {
      state.startFieldEdit(state.fields.value.find(field => field.id === 'review_days')!)
    })
    expect(html).toContain('取消')
    expect(html).toContain('儲存並確認')
    expect(html).not.toContain('aria-label="審閱日數正確"')
    const field = state.fields.value.find(field => field.id === 'review_days')!
    state.updateMobileField(field, '錯誤')
    state.confirmFieldEdit(field)
    expect(field.validationError).toContain('審閱日數')
    expect(field.editing).toBe(true)
    state.updateMobileField(field, '6 日')
    state.confirmFieldEdit(field)
    expect(field.reviewState).toBe('edited')
    expect(field.editing).toBe(false)
    expect(state.filteredFields.value).not.toContain(field)
    const other = state.fields.value.find(field => field.id === 'review_date')!
    state.startFieldEdit(other)
    state.confirmFieldEdit(other)
    expect(other.reviewState).toBe('verified')
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it('選項欄位只在編輯時顯示選單，取消還原，儲存後成為已修正', async () => {
    mocks.mobile = true
    const { state, html } = await render(state => {
      state.selectFieldGroup('scope')
      const field = state.fields.value.find(field => field.id === 'rental_scope')!
      field.value = '全部'
      state.startFieldEdit(field)
    })
    expect(html).toMatch(/<select[^>]*class="mobile-field-input"/)
    const field = state.fields.value.find(field => field.id === 'rental_scope')!
    state.updateMobileField(field, '部分')
    state.cancelFieldEdit(field)
    expect(field.value).toBe('全部')
    state.startFieldEdit(field)
    state.updateMobileField(field, '部分')
    state.confirmFieldEdit(field)
    expect(field.reviewState).toBe('edited')
    expect(field.editing).toBe(false)
  })

  it('已確認欄位取消編輯保留已確認狀態，切換篩選會取消未儲存修改', async () => {
    mocks.mobile = true
    const { state } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    state.verifyField(field)
    state.selectFieldFilter('reviewed')
    state.startFieldEdit(field)
    state.updateMobileField(field, '6 日')
    state.selectFieldFilter('pending')
    expect(field.value).toBe('5 日')
    expect(field.editing).toBe(false)
    expect(field.reviewState).toBe('verified')
  })

  it('手機作用中分類超出捲動列時自動水平捲入，桌面不捲動', async () => {
    const { state } = await render()
    const chip = { getBoundingClientRect: () => ({ left: 400, right: 520 }) }
    const nav = {
      querySelector: vi.fn(() => chip),
      getBoundingClientRect: () => ({ left: 20, right: 350 }),
      scrollBy: vi.fn(),
    }
    state.fieldGroupNav.value = nav as unknown as HTMLElement
    await state.scrollActiveFieldGroupIntoView()
    expect(nav.scrollBy).not.toHaveBeenCalled()
    state.isMobile.value = true
    await state.scrollActiveFieldGroupIntoView()
    expect(nav.scrollBy).toHaveBeenCalledWith({ left: 170, behavior: 'auto' })
    chip.getBoundingClientRect = () => ({ left: -100, right: 20 })
    await state.scrollActiveFieldGroupIntoView()
    expect(nav.scrollBy).toHaveBeenCalledWith({ left: -120, behavior: 'auto' })
  })

  it('清空輸入不移除卡片，格式錯誤保留驗證，修正確認後退出待確認清單', async () => {
    mocks.mobile = true
    const { state } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    state.updateMobileField(field, '')
    expect(state.filteredFields.value).toContain(field)
    state.updateMobileField(field, '錯誤')
    state.confirmMobileField(field)
    expect(field.validationError).toContain('審閱日數')
    expect(field.reviewState).toBe('unreviewed')
    state.updateMobileField(field, '6 日')
    state.confirmMobileField(field)
    expect(field.reviewState).toBe('edited')
    expect(field.editing).toBe(false)
    expect(state.filteredFields.value).not.toContain(field)
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it('缺少資料預設不顯示輸入，但保留填寫入口', async () => {
    mocks.mobile = true
    const { html } = await render(state => { state.activeFieldFilter.value = 'low' })
    expect(html).toContain('合約沒寫，分析時會提醒')
    expect(html).toContain('補填')
    expect(html).not.toContain('mobile-field-confirm')
    expect(html).not.toContain('class="mobile-field-input"')
  })

  it.each([
    ['pending', '都確認完了，可以開始分析'],
    ['low', '沒有缺少的欄位'],
    ['reviewed', '還沒有處理過的欄位'],
  ] as const)('手機 %s 空清單顯示對應提示', async (filter, message) => {
    mocks.mobile = true
    const { html } = await render(state => {
      state.selectFieldFilter(filter)
      if (filter === 'pending') state.fields.value.forEach(field => { field.reviewState = 'verified' })
      if (filter === 'low') state.fields.value.forEach(field => { field.value = '已有值' })
    })
    expect(html).toContain(message)
    expect(html).not.toContain('目前沒有符合此狀態的欄位')
  })

  it('手機只有一份閱讀器且在對話框內，按全文入口才開啟', async () => {
    const desktop = await render()
    const showModal = vi.fn()
    desktop.state.documentReader.value = { showModal, close: vi.fn() }
    desktop.state.openDocumentReader()
    expect(showModal).not.toHaveBeenCalled()
    mocks.mobile = true
    const { state, html } = await render()
    expect(html.match(/contract-document-card/g)).toHaveLength(1)
    expect(html).toMatch(/<dialog class="mobile-document-dialog"[^>]*>/)
    expect(html).toContain('看合約全文')
    expect(html).toContain('aria-label="關閉合約全文"')
    state.documentReader.value = { showModal, close: vi.fn() }
    state.openDocumentReader()
    expect(showModal).toHaveBeenCalledOnce()
  })

  it('手機操作列移至 body，保留儲存與開始分析兩個操作', async () => {
    mocks.mobile = true
    const { html, teleports } = await render()
    expect(html).not.toContain('class="mobile-review-actions"')
    const bar = teleports?.body ?? ''
    expect(bar).toContain('class="mobile-review-actions"')
    expect(bar.match(/<button /g)).toHaveLength(2)
    expect(bar).toContain('儲存')
    expect(bar).not.toContain('確認儲存')
    expect(bar).toContain('完成校對，開始分析')
  })

  it('完成校對才開啟確認面板，仍無預選且不自動寫入資料庫', async () => {
    mocks.mobile = true
    const { state } = await render()
    const showModal = vi.fn()
    state.finalizeDialog.value = { showModal }
    state.completeReviewAndAnalyze()
    expect(showModal).not.toHaveBeenCalled()
    for (const field of state.filteredFields.value) state.confirmMobileField(field)
    expect(state.canStartAnalysis.value).toBe(true)
    state.finalizeChoice.value = 'draft'
    state.completeReviewAndAnalyze()
    expect(showModal).toHaveBeenCalledOnce()
    expect(state.finalizeChoice.value).toBeNull()
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it('原文圖片按需載入並快取，點圖才開啟全螢幕面板', async () => {
    mocks.mobile = true
    mocks.crop.mockResolvedValue('blob:crop')
    const { state } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    const showModal = vi.fn()
    state.evidenceDialog.value = { showModal, close: vi.fn() }
    expect(mocks.crop).not.toHaveBeenCalled()
    await state.loadFieldEvidence(field)
    await state.loadFieldEvidence(field)
    expect(mocks.crop).toHaveBeenCalledOnce()
    expect(state.fieldEvidenceUrls.value[field.id]).toBe('blob:crop')
    expect(showModal).not.toHaveBeenCalled()
    await state.enlargeFieldEvidence(field)
    expect(state.enlargedEvidence.value?.url).toBe('blob:crop')
    expect(showModal).toHaveBeenCalledOnce()
  })

  it('原圖讀取失敗時保留 OCR 原文，不開啟空白圖片面板', async () => {
    mocks.mobile = true
    mocks.crop.mockRejectedValue(new Error('原圖無法解碼'))
    const { state, html } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    const showModal = vi.fn()
    state.evidenceDialog.value = { showModal, close: vi.fn() }
    await state.loadFieldEvidence(field)
    expect(state.fieldEvidenceUrls.value[field.id]).toBeNull()
    state.toggleFieldEvidence(field)
    expect(state.expandedEvidenceId.value).toBe(field.id)
    state.toggleFieldEvidence(field)
    expect(state.expandedEvidenceId.value).toBeNull()
    const expanded = await render(state => { state.expandedEvidenceId.value = 'review_days' })
    expect(expanded.html).toMatch(/class="field-evidence-text"[^>]*>5日<\/p>/)
    expect(html).toContain('aria-expanded="false"')
    await state.enlargeFieldEvidence(field)
    expect(showModal).not.toHaveBeenCalled()
  })
})
