import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref, type Ref, type SetupContext } from 'vue'
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
  reviewState: string
  validationError: string
}
interface EditorState {
  isMobile: Ref<boolean>
  fields: Ref<Field[]>
  filteredFields: Ref<Field[]>
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
  confirmMobileFieldEdit: (field: Field) => void
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
  const html = await renderToString(createSSRApp(component))
  return { state, html }
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
    expect(desktop.html).not.toContain('待確認優先')
    mocks.mobile = true
    const { state, html } = await render()
    expect(state.activeFieldFilter.value).toBe('pending')
    expect(state.filteredFields.value.map(field => field.id)).toEqual(['review_days', 'review_date'])
    expect(html).toContain('已校對 0 / 2')
    expect(html).toContain('第 1 頁・看原文')
    expect(html).toContain('修改後確認')
    expect(html).not.toContain('data-field-id="landlord_review_signature"')
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
    expect(html).toMatch(/class="mobile-field-category"[^>]*>契約審閱期<\/span>/)
    expect(html).toMatch(/class="mobile-field-category"[^>]*>租賃期間<\/span>/)
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

  it('未修改時修改後確認只聚焦並選取該卡片輸入，改回原值亦不確認，正確才完成校對', async () => {
    mocks.mobile = true
    const { state } = await render()
    const field = state.fields.value.find(field => field.id === 'review_days')!
    const input = { focus: vi.fn(), select: vi.fn() }
    const querySelector = vi.fn(() => input)
    vi.stubGlobal('document', { querySelector })
    state.confirmMobileFieldEdit(field)
    expect(querySelector).toHaveBeenCalledWith('[data-field-id="review_days"] .mobile-field-input')
    expect(input.focus).toHaveBeenCalledOnce()
    expect(input.select).toHaveBeenCalledOnce()
    expect(field.reviewState).toBe('unreviewed')
    expect(field.editing).toBe(false)
    state.updateMobileField(field, '6 日')
    state.updateMobileField(field, '5 日')
    state.confirmMobileFieldEdit(field)
    expect(input.focus).toHaveBeenCalledTimes(2)
    expect(field.reviewState).toBe('unreviewed')
    state.confirmMobileField(field)
    expect(field.reviewState).toBe('verified')
  })

  it('選項欄位未修改時只聚焦，已修改時修改後確認會儲存且正確維持停用', async () => {
    mocks.mobile = true
    const choice = await render(state => {
      const field = state.fields.value.find(field => field.id === 'rental_scope')!
      field.value = '全部'
    })
    const select = { focus: vi.fn() }
    vi.stubGlobal('document', { querySelector: () => select })
    const field = choice.state.fields.value.find(field => field.id === 'rental_scope')!
    choice.state.confirmMobileFieldEdit(field)
    expect(select.focus).toHaveBeenCalledOnce()
    expect(field.reviewState).toBe('unreviewed')
    const edited = await render(state => {
      state.updateMobileField(state.fields.value.find(field => field.id === 'review_days')!, '6 日')
    })
    expect(edited.html.replace(/<!--.*?-->/g, '')).toMatch(/<button[^>]* disabled[^>]*>正確<\/button>/)
    const days = edited.state.fields.value.find(field => field.id === 'review_days')!
    edited.state.confirmMobileFieldEdit(days)
    expect(days.reviewState).toBe('edited')
    expect(edited.state.filteredFields.value).not.toContain(days)
    expect(select.focus).toHaveBeenCalledOnce()
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
    expect(html).toContain('風險分析會提醒此欄位缺少資料')
    expect(html).toContain('填寫')
    expect(html).not.toContain('class="mobile-field-input"')
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
    expect(html).toContain('5日')
    await state.enlargeFieldEvidence(field)
    expect(showModal).not.toHaveBeenCalled()
  })
})
