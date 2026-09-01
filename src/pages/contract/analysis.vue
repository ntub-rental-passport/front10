<script setup lang="ts">
import { onMounted } from 'vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { loadContractOcrResult, type ContractFieldReview } from '@/src/utils/contract-ocr'
import { downloadPdf, generateContractReportPdf } from '@/src/utils/contract-report'
import {
  CONTRACT_FIELD_DEFINITIONS,
  CONTRACT_FIELD_GROUPS,
  detectContractConditions,
} from '@/shared/contract-field-schema.js'
import { Button } from '@/components/ui/button/index'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  FileDown,
  FileSearch,
  FileText,
  MessageSquareText,
  Search,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-vue-next'

type Severity = 'high' | 'medium' | 'low'
type RiskSource = 'field' | 'rag' | 'ai'
type RiskTab = 'field' | 'rag' | 'ai'

type RiskItem = {
  id: string
  title: string
  severity: Severity
  source: RiskSource
  sourceLabel: string
  groupId: string | null
  groupLabel: string
  fieldIds: string[]
  pageIndex: number | null
  focusText: string
  clause: string
  description: string
  advice: string
  legalBasis?: string[]
  details?: RiskDetail[]
}

type RiskDetail = {
  label: string
  pageIndex: number | null
  focusText: string
}

type LocatedClause = {
  pageIndex: number
  focusText: string
  text: string
}

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  text: string
  sources?: string[]
}

type PaginationItem = {
  key: string
  pageIndex: number | null
  label: string
}

type SearchMatch = {
  pageIndex: number
  start: number
  end: number
}

const legalSourceScopes = [
  {
    id: 'civil-lease',
    title: '民法・租賃',
    range: '第 421 條至第 463-1 條',
    description: '租賃成立、修繕、稅捐、返還與終止',
    href: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000001',
  },
  {
    id: 'civil-contract',
    title: '民法・契約效力',
    range: '第 245-1 條至第 270 條',
    description: '締約責任、履行抗辯與契約效力',
    href: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000001',
  },
  {
    id: 'consumer-contract',
    title: '消保法・定型化契約',
    range: '第 11 條至第 17-1 條',
    description: '審閱期、解釋原則與不公平條款',
    href: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050001',
  },
  {
    id: 'rental-housing',
    title: '住宅租賃專法與契約規範',
    range: '租賃住宅條例＋應記載／不得記載事項',
    description: '住宅租賃關係、租賃服務業與強制規範',
    href: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0130038',
  },
] as const

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useAnimatedNumber(source: () => number) {
  const display = ref(0)
  let frame = 0
  watch(
    source,
    (target) => {
      cancelAnimationFrame(frame)
      if (prefersReducedMotion) {
        display.value = target
        return
      }
      const start = display.value
      const delta = target - start
      const startTime = performance.now()
      const duration = 640
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        display.value = Math.round(start + delta * eased)
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return display
}

const router = useRouter()
const ocrResult = loadContractOcrResult()
const pages = ref<string[]>(
  ocrResult?.pageTexts.length
    ? [...ocrResult.pageTexts]
    : ocrResult?.text
      ? [ocrResult.text]
      : ['目前沒有可分析的契約文字，請先回上一頁重新上傳檔案。'],
)
const currentPageIndex = ref(0)
const searchQuery = ref('')
const activeSearchMatchIndex = ref(-1)
const riskFocusText = ref('')
const activeRiskTab = ref<RiskTab>('field')
const activeRiskId = ref<string | null>(null)
const chatInput = ref('')
const nextMessageId = ref(3)
const chatOpen = ref(false)
const chatPanelRef = ref<HTMLElement | null>(null)
const chatPosition = reactive({ x: 24, y: 72 })
const chatDragOffset = reactive({ x: 0, y: 0 })
const chatDragging = ref(false)
const exportDialogOpen = ref(false)
const exportPrivacyMode = ref(true)
const exportingReport = ref(false)
const exportError = ref('')
let chatHasBeenPositioned = false

const pageCount = computed(() => pages.value.length)
const currentPageText = computed(() => pages.value[currentPageIndex.value] ?? '')
const currentPageNumber = computed(() => currentPageIndex.value + 1)

const paginationItems = computed<PaginationItem[]>(() => {
  const total = pageCount.value
  const current = currentPageIndex.value
  const pageItem = (pageIndex: number): PaginationItem => ({
    key: `page-${pageIndex}`,
    pageIndex,
    label: String(pageIndex + 1),
  })
  const ellipsisItem = (position: 'start' | 'end'): PaginationItem => ({
    key: `ellipsis-${position}`,
    pageIndex: null,
    label: '…',
  })

  if (total <= 5) return Array.from({ length: total }, (_, index) => pageItem(index))
  if (current <= 2) {
    return [pageItem(0), pageItem(1), pageItem(2), ellipsisItem('end'), pageItem(total - 1)]
  }
  if (current >= total - 3) {
    return [
      pageItem(0),
      ellipsisItem('start'),
      pageItem(total - 3),
      pageItem(total - 2),
      pageItem(total - 1),
    ]
  }
  return [
    pageItem(0),
    ellipsisItem('start'),
    pageItem(current),
    ellipsisItem('end'),
    pageItem(total - 1),
  ]
})

const searchMatches = computed<SearchMatch[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return []

  const matches: SearchMatch[] = []
  pages.value.forEach((pageText, pageIndex) => {
    const normalizedText = pageText.toLocaleLowerCase()
    let start = 0
    while ((start = normalizedText.indexOf(query, start)) >= 0) {
      matches.push({ pageIndex, start, end: start + query.length })
      start += Math.max(query.length, 1)
    }
  })
  return matches
})

const searchResultPosition = computed(() =>
  searchMatches.value.length && activeSearchMatchIndex.value >= 0
    ? activeSearchMatchIndex.value + 1
    : 0,
)

const highlightedSegments = computed(() => {
  const text = currentPageText.value
  const ranges: Array<{ start: number; end: number; type: 'search' | 'active' | 'risk' }> = []
  const activeMatch = searchMatches.value[activeSearchMatchIndex.value]

  searchMatches.value
    .filter((match) => match.pageIndex === currentPageIndex.value)
    .forEach((match) => {
      ranges.push({
        start: match.start,
        end: match.end,
        type:
          activeMatch?.pageIndex === match.pageIndex && activeMatch.start === match.start
            ? 'active'
            : 'search',
      })
    })

  const focusText = riskFocusText.value.trim()
  if (focusText) {
    const start = text.indexOf(focusText)
    if (start >= 0) ranges.push({ start, end: start + focusText.length, type: 'risk' })
  }

  const boundaries = new Set([0, text.length])
  ranges.forEach((range) => {
    boundaries.add(range.start)
    boundaries.add(range.end)
  })
  const points = [...boundaries].sort((a, b) => a - b)

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1] ?? text.length
    const coveringRanges = ranges.filter((range) => range.start <= start && range.end >= end)
    const type = coveringRanges.some((range) => range.type === 'risk')
      ? 'risk'
      : coveringRanges.some((range) => range.type === 'active')
        ? 'active'
        : coveringRanges.some((range) => range.type === 'search')
          ? 'search'
          : null
    return { text: text.slice(start, end), type }
  })
})

function parseAmount(value: string | undefined): number {
  return Number(String(value ?? '').replace(/[^0-9]/g, '')) || 0
}

function reviewValue(fieldId: string): string {
  return ocrResult?.fieldReviews?.[fieldId]?.value?.trim() ?? ''
}

function firstLocatedReview(fieldIds: string[]): ContractFieldReview | null {
  for (const fieldId of fieldIds) {
    const review = ocrResult?.fieldReviews?.[fieldId]
    if (review?.sourcePageIndex !== null && review?.sourcePageIndex !== undefined) return review
  }
  return null
}

function findPageByKeyword(keyword: string): number | null {
  const index = pages.value.findIndex((page) => page.includes(keyword))
  return index >= 0 ? index : null
}

const groupPageKeywords: Record<string, string[]> = {
  review: ['契約審閱', '審閱'],
  parties: ['立約雙方', '出租人'],
  agency: ['代理人', '轉租'],
  property: ['租賃住宅標示', '租賃住宅地址', '租賃標的'],
  scope: ['租賃範圍'],
  term: ['租賃期間'],
  rent: ['租金約定', '租金'],
  deposit: ['押金約定', '押金'],
  fees: ['相關費用', '水費', '電費'],
  clauses: ['遺留物', '管轄法院'],
}

function findGroupPage(groupId: string): { pageIndex: number | null; focusText: string } {
  for (const keyword of groupPageKeywords[groupId] ?? []) {
    const pageIndex = findPageByKeyword(keyword)
    if (pageIndex !== null) return { pageIndex, focusText: keyword }
  }
  return { pageIndex: null, focusText: '' }
}

function findClause(pattern: RegExp, focusText: string): LocatedClause | null {
  for (let pageIndex = 0; pageIndex < pages.value.length; pageIndex += 1) {
    const compactText = (pages.value[pageIndex] ?? '').replace(/\s+/g, ' ').trim()
    const match = compactText.match(pattern)
    if (!match?.[0]) continue
    return {
      pageIndex,
      focusText: compactText.includes(focusText) ? focusText : match[0].slice(0, 12),
      text: match[0].trim(),
    }
  }
  return null
}

function buildRisks(): RiskItem[] {
  const result: RiskItem[] = []
  const conditions = detectContractConditions(ocrResult?.text ?? '') as Record<string, boolean>
  const missingByGroup = new Map<string, Array<{ id: string; label: string }>>()

  // 1. 檢查缺少欄位
  CONTRACT_FIELD_DEFINITIONS.forEach((definition) => {
    const required =
      definition.requirement === 'required' ||
      (definition.requirement === 'conditional' &&
        Boolean(definition.condition && conditions[definition.condition]))
    if (!required) return

    const value = reviewValue(definition.id)
    if (value && value !== '尚未辨識') return
    const groupFields = missingByGroup.get(definition.groupId) ?? []
    groupFields.push({ id: definition.id, label: definition.label })
    missingByGroup.set(definition.groupId, groupFields)
  })

  missingByGroup.forEach((missingFields, groupId) => {
    const group = CONTRACT_FIELD_GROUPS.find((item) => item.id === groupId)
    const groupLocation = findGroupPage(groupId)
    const details = missingFields.map((field) => {
      const review = ocrResult?.fieldReviews?.[field.id]
      return {
        label: field.label,
        pageIndex: review?.sourcePageIndex ?? groupLocation.pageIndex,
        focusText: review?.sourceValue || groupLocation.focusText,
      }
    })
    result.push({
      id: `missing-${groupId}`,
      title: `${group?.title ?? '契約資料'}缺少 ${missingFields.length} 項`,
      severity: 'high',
      source: 'field',
      sourceLabel: '關鍵欄位檢核',
      groupId,
      groupLabel: group?.title ?? '契約資料',
      fieldIds: missingFields.map((field) => field.id),
      pageIndex: details.find((detail) => detail.pageIndex !== null)?.pageIndex ?? null,
      focusText: details.find((detail) => detail.focusText)?.focusText ?? '',
      clause: `未確認欄位：${missingFields.map((field) => field.label).join('、')}`,
      description: '契約缺少必要資訊，可能使租賃範圍、費用或權利義務難以認定。',
      advice: `請房東協助確認並補充：${missingFields.map((field) => field.label).join('、')}。`,
      details,
    })
  })

  // 2. 檢查押金上限
  const rent = parseAmount(reviewValue('rent'))
  const deposit = parseAmount(reviewValue('deposit'))
  const depositMonths = parseAmount(reviewValue('deposit_months'))
  if (depositMonths > 2 || (rent > 0 && deposit > rent * 2)) {
    const review = firstLocatedReview(['deposit_months', 'deposit'])
    result.push({
      id: 'deposit-limit',
      title: '押金約定可能超過法定上限',
      severity: 'high',
      source: 'field',
      sourceLabel: '關鍵欄位檢核',
      groupId: 'deposit',
      groupLabel: '押金約定',
      fieldIds: ['deposit_months', 'deposit'],
      pageIndex: review?.sourcePageIndex ?? findPageByKeyword('押金'),
      focusText: review?.sourceValue || '押金',
      clause: `押金月數：${reviewValue('deposit_months') || '未載明'}；押金金額：${reviewValue('deposit') || '未載明'}`,
      description: '押金月數或金額可能超過兩個月租金，建議核對租金與押金計算方式。',
      advice: '建議請房東將押金調整為不超過兩個月租金，並在契約中載明返還條件與期限。',
    })
  }

  return result
}


const risks = ref<RiskItem[]>(buildRisks())
if (!risks.value.some((risk) => risk.source === 'field')) activeRiskTab.value = 'rag'
const filteredRisks = computed(() => risks.value.filter((risk) => risk.source === activeRiskTab.value))
const highRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'high').length)
const mediumRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'medium').length)
const lowRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'low').length)
const displayTotalRisk = useAnimatedNumber(() => risks.value.length)
const displayHighRisk = useAnimatedNumber(() => highRiskCount.value)
const displayMediumRisk = useAnimatedNumber(() => mediumRiskCount.value)
const displayLowRisk = useAnimatedNumber(() => lowRiskCount.value)
const riskTabs = computed(() => [
  { id: 'field' as const, label: '關鍵欄位檢查', count: risks.value.filter((risk) => risk.source === 'field').length },
  { id: 'rag' as const, label: 'RAG 風險分析', count: risks.value.filter((risk) => risk.source === 'rag').length },
  { id: 'ai' as const, label: 'AI 綜合建議', count: risks.value.filter((risk) => risk.source === 'ai').length },
])
async function loadBackendRagAndAiAnalysis() {
  if (!ocrResult?.text) return

  try {
    const response = await fetch('http://localhost:8000/api/contract/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ocr_text: ocrResult.text,
        page_texts: ocrResult.pageTexts ?? [ocrResult.text],
        field_reviews: ocrResult.fieldReviews ?? {}
      })
    })

    if (!response.ok) return
    const data = await response.json()

    // 取得後端真正的 RAG 與 AI 風險，並與本機 field 風險疊加
    const localFieldRisks = buildRisks()
    risks.value = [...localFieldRisks, ...(data.rag_risks || []), ...(data.ai_risks || [])]
  } catch (error) {
    console.error('後端 API 呼叫失敗，維持本機檢核結果:', error)
  }
}

const chatMessages = ref<ChatMessage[]>([
  {
    id: 1,
    role: 'assistant',
    text: '你好，我是 RentMate Law Chat。你可以點選風險項目，或直接詢問如何與房東溝通。此頁目前為前端互動示意。',
  },
  {
    id: 2,
    role: 'assistant',
    text: '我會把回答分成「風險重點、建議做法、可直接使用的溝通文字」，並附上對應的契約欄位或法規來源。',
    sources: ['住宅租賃契約規範', '契約 OCR 關鍵欄位'],
  },
])

const promptSuggestions = [
  '如何請房東補齊缺少資料？',
  '押金超過兩個月怎麼談？',
  '幫我整理成 LINE 訊息',
]

function goToPage(pageIndex: number): void {
  if (pageIndex < 0 || pageIndex >= pageCount.value) return
  currentPageIndex.value = pageIndex
}

async function scrollToReaderHighlight(): Promise<void> {
  await nextTick()
  document.querySelector<HTMLElement>('.analysis-reader-highlight--active')?.scrollIntoView({
    block: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function moveToSearchResult(direction: 1 | -1): void {
  if (!searchMatches.value.length) return
  activeSearchMatchIndex.value =
    (activeSearchMatchIndex.value + direction + searchMatches.value.length) %
    searchMatches.value.length
  const match = searchMatches.value[activeSearchMatchIndex.value]
  if (!match) return
  riskFocusText.value = ''
  goToPage(match.pageIndex)
  void scrollToReaderHighlight()
}

function clearSearch(): void {
  searchQuery.value = ''
  activeSearchMatchIndex.value = -1
}

function focusRisk(risk: RiskItem): void {
  activeRiskId.value = risk.id
  riskFocusText.value = risk.focusText
  if (risk.pageIndex !== null) goToPage(risk.pageIndex)
  void scrollToReaderHighlight()
}

function toggleRiskDetails(risk: RiskItem): void {
  if (activeRiskId.value === risk.id) {
    activeRiskId.value = null
    riskFocusText.value = ''
    return
  }
  focusRisk(risk)
}

function focusRiskDetail(detail: RiskDetail): void {
  if (detail.pageIndex === null) return
  riskFocusText.value = detail.focusText
  goToPage(detail.pageIndex)
  void scrollToReaderHighlight()
}

function openFieldEditor(risk: RiskItem): void {
  router.push({
    path: '/app/contract/editor',
    query: {
      group: risk.groupId ?? undefined,
      field: risk.fieldIds[0] ?? undefined,
    },
  })
}

function startNegotiation(risk: RiskItem): void {
  focusRisk(risk)
  chatOpen.value = true
  chatMessages.value.push({
    id: nextMessageId.value++,
    role: 'assistant',
    text: `已帶入「${risk.title}」的契約脈絡。${risk.advice}\n\n你希望我整理成溫和、正式，還是強調法律依據的版本？`,
    sources: [risk.sourceLabel, risk.groupLabel, ...(risk.legalBasis ?? [])],
  })
  void nextTick(() => {
    positionChatWindow()
    const messages = chatPanelRef.value?.querySelector<HTMLElement>('.chat-messages')
    messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' })
  })
}

function clampChatPosition(x: number, y: number): { x: number; y: number } {
  const panelWidth = chatPanelRef.value?.offsetWidth ?? Math.min(680, window.innerWidth - 24)
  const panelHeight = chatPanelRef.value?.offsetHeight ?? Math.min(620, window.innerHeight - 24)
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - panelWidth - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - panelHeight - 8)),
  }
}

function positionChatWindow(): void {
  if (!chatOpen.value) return
  const preferred = chatHasBeenPositioned
    ? clampChatPosition(chatPosition.x, chatPosition.y)
    : clampChatPosition(window.innerWidth - (chatPanelRef.value?.offsetWidth ?? 680) - 24, 72)
  chatPosition.x = preferred.x
  chatPosition.y = preferred.y
  chatHasBeenPositioned = true
}

function moveChatWindow(event: PointerEvent): void {
  const next = clampChatPosition(
    event.clientX - chatDragOffset.x,
    event.clientY - chatDragOffset.y,
  )
  chatPosition.x = next.x
  chatPosition.y = next.y
}

function endChatDrag(): void {
  chatDragging.value = false
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
  document.removeEventListener('pointermove', moveChatWindow)
  document.removeEventListener('pointerup', endChatDrag)
}

function beginChatDrag(event: PointerEvent): void {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
  event.preventDefault()
  chatDragging.value = true
  chatDragOffset.x = event.clientX - chatPosition.x
  chatDragOffset.y = event.clientY - chatPosition.y
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
  document.addEventListener('pointermove', moveChatWindow)
  document.addEventListener('pointerup', endChatDrag, { once: true })
}

onBeforeUnmount(() => {
  endChatDrag()
})

onMounted(() => {
  void loadBackendRagAndAiAnalysis()
})

onBeforeUnmount(() => {
  endChatDrag()
})
async function fetchAiChatResponse(
  userMessage: string,
  activeRisk: RiskItem | undefined
): Promise<void> {
  try {
    const response = await fetch('http://localhost:8000/api/contract/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        contract_text: ocrResult?.text ?? '',
        active_risk: activeRisk ?? null,
      }),
    })

    if (!response.ok) throw new Error('API 響應失敗')

    const data = await response.json()
    chatMessages.value.push({
      id: nextMessageId.value++,
      role: 'assistant',
      text: data.reply,
      sources: data.sources ?? ['租賃專法與實務判決'],
    })
  } catch (error) {
    console.error('LLM 對話請求失敗:', error)
    chatMessages.value.push({
      id: nextMessageId.value++,
      role: 'assistant',
      text: '抱歉，無法連線至 AI 服務，請確認後端 API 是否已啟動。',
    })
  }
}
async function sendChat(message = chatInput.value): Promise<void> {
  const content = message.trim()
  if (!content) return

  // 顯示使用者發送的訊息
  chatMessages.value.push({ id: nextMessageId.value++, role: 'user', text: content })
  chatInput.value = ''

  const activeRisk = risks.value.find((risk) => risk.id === activeRiskId.value)

  // 呼叫後端 API 取得真實 LLM 回覆
  await fetchAiChatResponse(content, activeRisk)
}

function copyMessage(message: ChatMessage): void {
  void navigator.clipboard.writeText(message.text)
}

function openExportDialog(): void {
  exportError.value = ''
  exportDialogOpen.value = true
}

async function exportAnalysisReport(): Promise<void> {
  if (exportingReport.value) return
  exportingReport.value = true
  exportError.value = ''

  try {
    const fieldValues = Object.fromEntries(
      Object.entries(ocrResult?.fieldReviews ?? {}).map(([fieldId, review]) => [
        fieldId,
        review.value,
      ]),
    )
    const report = await generateContractReportPdf({
      fileName: ocrResult?.fileName || '租屋契約.pdf',
      risks: risks.value,
      fieldValues,
      privacyMode: exportPrivacyMode.value,
    })
    downloadPdf(report.bytes, report.fileName)
    exportDialogOpen.value = false
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '報告產生失敗，請稍後再試。'
  } finally {
    exportingReport.value = false
  }
}
</script>

<template>
  <main class="contract-analysis-page">
    <header class="analysis-page-header">
      <div>
        <button type="button" class="analysis-back-link" @click="router.push('/app/contract/editor')">
          <ArrowLeft :size="15" /> 返回契約校對
        </button>
        <div class="analysis-title-row">
          <span class="analysis-ai-mark">AI</span>
          <div>
            <span class="analysis-eyebrow">CONTRACT REVIEW · 01</span>
            <h1>契約 AI 診斷分析</h1>
            <p>把複雜條文整理成可採取行動的重點，先看風險，再回到原文確認。</p>
          </div>
        </div>
      </div>
      <div class="analysis-header-actions">
        <Button class="analysis-export-button" @click="openExportDialog">
          <FileDown :size="17" /> 匯出診斷報告
        </Button>
        <Button variant="outline" @click="router.push('/app/contract')">
          重新上傳
        </Button>
      </div>
    </header>

    <div
      v-if="exportDialogOpen"
      class="analysis-export-backdrop"
      role="presentation"
      @click.self="exportDialogOpen = false"
    >
      <section
        class="analysis-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        <button
          type="button"
          class="analysis-export-close"
          aria-label="關閉匯出視窗"
          @click="exportDialogOpen = false"
        >
          <X :size="19" />
        </button>
        <span class="analysis-section-index">EXPORT REPORT</span>
        <h2 id="export-dialog-title">匯出契約 AI 診斷分析報告書</h2>
        <p>每頁都會加入 RentMate 浮水印、產出日期、報告編號與頁碼。</p>

        <label class="analysis-export-option" :class="{ 'is-selected': exportPrivacyMode }">
          <input v-model="exportPrivacyMode" type="radio" :value="true" />
          <span>
            <strong>隱私保護版（建議）</strong>
            <small>遮蔽已辨識的姓名、身分證、電話、Email、地址與銀行帳號，適合分享。</small>
          </span>
        </label>
        <label class="analysis-export-option" :class="{ 'is-selected': !exportPrivacyMode }">
          <input v-model="exportPrivacyMode" type="radio" :value="false" />
          <span>
            <strong>完整資料版</strong>
            <small>保留診斷內容中的原始資料，僅建議本人保存，分享前請再次確認。</small>
          </span>
        </label>

        <div class="analysis-export-notice">
          <ShieldCheck :size="18" />
          <span>PDF 會以點陣頁面輸出，不附個資對照表；去識別化仍可能遺漏，分享前請人工快速檢查。</span>
        </div>
        <p v-if="exportError" class="analysis-export-error" role="alert">{{ exportError }}</p>
        <div class="analysis-export-actions">
          <Button variant="outline" :disabled="exportingReport" @click="exportDialogOpen = false">
            取消
          </Button>
          <Button :disabled="exportingReport" @click="exportAnalysisReport">
            <FileDown :size="17" />
            {{ exportingReport ? '正在產生 PDF…' : '下載 PDF 報告' }}
          </Button>
        </div>
      </section>
    </div>

    <section class="analysis-overview" aria-label="AI 診斷結果總覽">
      <div class="analysis-overview-heading">
        <div class="analysis-overview-copy">
          <span class="analysis-section-index">DIAGNOSIS · 02</span>
          <div class="analysis-total-risk">
            <strong>{{ displayTotalRisk }}</strong>
            <span>項內容<br />需要留意</span>
          </div>
          <p v-if="highRiskCount">優先確認 {{ highRiskCount }} 項高風險，再依序檢視其他提醒。</p>
          <p v-else>目前沒有高風險項目，可依序確認其餘提醒。</p>
        </div>
        <span class="analysis-status-pill"><CheckCircle2 :size="15" /> 分析完成</span>
      </div>
      <div class="analysis-stats">
        <div class="is-high"><span>HIGH · 高風險</span><strong>{{ displayHighRisk }}</strong><small>建議優先處理</small></div>
        <div class="is-medium"><span>MED · 中風險</span><strong>{{ displayMediumRisk }}</strong><small>簽約前再確認</small></div>
        <div class="is-low"><span>LOW · 低風險</span><strong>{{ displayLowRisk }}</strong><small>閱讀時留意</small></div>
      </div>
    </section>

    <section class="legal-scope-panel" aria-labelledby="legal-scope-title">
      <div class="legal-scope-heading">
        <div>
          <span class="analysis-section-index">LEGAL BASIS · 03</span>
          <strong id="legal-scope-title"><Scale :size="16" /> 本次分析參照法規</strong>
          <span>只列出與這份契約相關的依據。</span>
        </div>
        <span class="legal-scope-relation">住宅租賃依租賃住宅條例第 5 條視為具消費關係</span>
      </div>
      <div class="legal-scope-grid">
        <a
          v-for="source in legalSourceScopes"
          :key="source.id"
          :href="source.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>
            <strong>{{ source.title }}</strong>
            <small>{{ source.range }}</small>
          </span>
          <span>{{ source.description }}</span>
          <ExternalLink :size="13" aria-hidden="true" />
        </a>
      </div>
    </section>

    <div class="analysis-workspace">
      <section class="analysis-reader-card" aria-labelledby="analysis-reader-title">
        <div class="analysis-panel-heading">
          <div>
            <span class="analysis-section-index">DOCUMENT · 04</span>
            <h2 id="analysis-reader-title"><FileText :size="19" /> 契約 PDF 閱讀器</h2>
            <p>搜尋全文，或從右側風險直接定位原文。</p>
          </div>
        </div>

        <div class="analysis-reader-toolbar">
          <div class="analysis-file-info">
            <strong>{{ ocrResult?.fileName || 'OCR 契約文件' }}</strong>
            <span>第 {{ currentPageNumber }} 頁，共 {{ pageCount }} 頁</span>
          </div>

          <div class="analysis-search" :class="{ 'has-query': searchQuery.trim() }" role="search">
            <Search :size="15" aria-hidden="true" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜尋契約文字"
              aria-label="搜尋契約全文"
              @keydown.enter.prevent="moveToSearchResult($event.shiftKey ? -1 : 1)"
              @keydown.esc="clearSearch"
            />
            <span v-if="searchQuery.trim()">{{ searchResultPosition }}/{{ searchMatches.length }}</span>
            <button v-if="searchQuery" type="button" aria-label="清除搜尋" @click="clearSearch">
              <X :size="14" />
            </button>
          </div>

          <nav class="analysis-pagination" aria-label="契約頁面切換">
            <button
              type="button"
              class="analysis-page-arrow"
              :disabled="currentPageIndex === 0"
              aria-label="上一頁"
              @click="goToPage(currentPageIndex - 1)"
            >
              <ChevronLeft :size="17" />
            </button>
            <template v-for="item in paginationItems" :key="item.key">
              <span v-if="item.pageIndex === null" class="analysis-page-ellipsis">{{ item.label }}</span>
              <button
                v-else
                type="button"
                class="analysis-page-number"
                :class="{ 'is-active': item.pageIndex === currentPageIndex }"
                :aria-current="item.pageIndex === currentPageIndex ? 'page' : undefined"
                @click="goToPage(item.pageIndex)"
              >
                {{ item.label }}
              </button>
            </template>
            <button
              type="button"
              class="analysis-page-arrow"
              :disabled="currentPageIndex === pageCount - 1"
              aria-label="下一頁"
              @click="goToPage(currentPageIndex + 1)"
            >
              <ChevronRight :size="17" />
            </button>
          </nav>
        </div>

        <div class="analysis-reader-canvas">
          <article class="analysis-pdf-page" :aria-label="`契約第 ${currentPageNumber} 頁`">
            <span class="analysis-page-marker">{{ currentPageNumber }}</span>
            <div class="analysis-page-text">
              <template v-for="(segment, index) in highlightedSegments" :key="index">
                <mark
                  v-if="segment.type"
                  class="analysis-reader-highlight"
                  :class="[
                    `analysis-reader-highlight--${segment.type}`,
                    { 'analysis-reader-highlight--active': segment.type === 'active' || segment.type === 'risk' },
                  ]"
                >{{ segment.text }}</mark>
                <span v-else>{{ segment.text }}</span>
              </template>
            </div>
          </article>
        </div>
      </section>

      <div class="analysis-right-column">
        <section class="risk-panel" aria-labelledby="risk-panel-title">
          <div class="analysis-panel-heading risk-panel-heading">
            <div>
              <span class="analysis-section-index">RISK MAP · 05</span>
              <h2 id="risk-panel-title"><AlertTriangle :size="19" /> 偵測到的風險項次</h2>
              <p>先看摘要，展開後再定位條文或詢問 AI。</p>
            </div>
          </div>

          <div class="risk-tabs" role="tablist" aria-label="風險來源分類">
            <button
              v-for="tab in riskTabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="activeRiskTab === tab.id"
              :class="{ 'is-active': activeRiskTab === tab.id }"
              @click="activeRiskTab = tab.id"
            >
              {{ tab.label }} <span>{{ tab.count }}</span>
            </button>
          </div>

          <div class="risk-list">
            <article
              v-for="risk in filteredRisks"
              :key="risk.id"
              class="risk-card"
              :class="[`is-${risk.severity}`, { 'is-active': activeRiskId === risk.id }]"
            >
              <div class="risk-card-main">
                <span class="risk-icon">
                  <CircleAlert v-if="risk.severity === 'high'" :size="17" />
                  <Database v-else-if="risk.source === 'rag'" :size="17" />
                  <Sparkles v-else :size="17" />
                </span>
                <span class="risk-card-copy">
                  <span class="risk-card-title-row">
                    <strong>{{ risk.title }}</strong>
                    <span class="risk-severity">{{ risk.severity === 'high' ? '高風險' : risk.severity === 'medium' ? '中風險' : '低風險' }}</span>
                  </span>
                  <span class="risk-meta">
                    <span>{{ risk.sourceLabel }}</span>
                    <span>{{ risk.groupLabel }}</span>
                    <button
                      v-if="risk.pageIndex !== null && !risk.details?.length"
                      type="button"
                      class="risk-page-button"
                      :aria-label="`前往第 ${risk.pageIndex + 1} 頁查看 ${risk.title}`"
                      @click="focusRisk(risk)"
                    >
                      <FileSearch :size="12" /> 第 {{ risk.pageIndex + 1 }} 頁
                    </button>
                  </span>
                  <ul v-if="risk.details?.length && activeRiskId === risk.id" class="risk-detail-list">
                    <li v-for="detail in risk.details" :key="detail.label">
                      <span>{{ detail.label }}</span>
                      <button
                        v-if="detail.pageIndex !== null"
                        type="button"
                        class="risk-page-button"
                        :aria-label="`前往第 ${detail.pageIndex + 1} 頁查看 ${detail.label}`"
                        @click="focusRiskDetail(detail)"
                      >
                        <FileSearch :size="12" /> 第 {{ detail.pageIndex + 1 }} 頁
                      </button>
                      <small v-else>未定位</small>
                    </li>
                  </ul>
                  <span v-else class="risk-clause">{{ risk.clause }}</span>
                  <span v-show="activeRiskId === risk.id" class="risk-description">{{ risk.description }}</span>
                  <span v-if="risk.legalBasis?.length && activeRiskId === risk.id" class="risk-legal-basis">
                    <span v-for="basis in risk.legalBasis" :key="basis">{{ basis }}</span>
                  </span>
                </span>
              </div>
              <div class="risk-actions">
                <button
                  type="button"
                  class="risk-summary-button"
                  :aria-expanded="activeRiskId === risk.id"
                  @click="toggleRiskDetails(risk)"
                >
                  {{ activeRiskId === risk.id ? '收合摘要' : '查看摘要' }}
                  <ChevronRight :size="14" aria-hidden="true" />
                </button>
                <button
                  v-if="risk.source === 'field' && risk.groupId"
                  type="button"
                  class="risk-link-button"
                  @click="openFieldEditor(risk)"
                >
                  <ExternalLink :size="14" /> 修改欄位
                </button>
                <button type="button" class="risk-chat-button" @click="startNegotiation(risk)">
                  <MessageSquareText :size="14" /> 詢問法律
                </button>
              </div>
            </article>

            <div v-if="!filteredRisks.length" class="risk-empty-state">
              <CheckCircle2 :size="22" />
              <strong>這個分類目前沒有風險</strong>
              <span>可切換其他分類繼續查看。</span>
            </div>

            <div v-else class="risk-list-footer">
              已顯示全部 {{ filteredRisks.length }} 項分析結果
            </div>
          </div>
        </section>

        <section
          v-if="chatOpen"
          ref="chatPanelRef"
          class="legal-chat-panel"
          :class="{ 'is-dragging': chatDragging }"
          role="dialog"
          aria-modal="false"
          aria-labelledby="legal-chat-title"
          :style="{ left: `${chatPosition.x}px`, top: `${chatPosition.y}px` }"
        >
          <div class="chat-heading" @pointerdown="beginChatDrag">
            <span class="chat-bot-mark"><Bot :size="20" /></span>
            <div>
              <h2 id="legal-chat-title">AI 談判腳本 Law Chat</h2>
              <p>結合目前風險與契約內容，產生可直接使用的溝通建議。</p>
              <small>拖曳標題列移動，右下角可調整視窗大小</small>
            </div>
            <span class="chat-demo-badge">前端 Demo</span>
            <button
              type="button"
              class="chat-close-button"
              aria-label="關閉 AI 談判腳本 Law Chat"
              @click="chatOpen = false"
            >
              <X :size="17" />
            </button>
          </div>

          <div class="chat-messages" aria-live="polite">
            <div
              v-for="message in chatMessages"
              :key="message.id"
              class="chat-message"
              :class="`is-${message.role}`"
            >
              <span class="chat-avatar">
                <Bot v-if="message.role === 'assistant'" :size="16" />
                <UserRound v-else :size="16" />
              </span>
              <div class="chat-bubble">
                <p>{{ message.text }}</p>
                <div v-if="message.sources?.length" class="chat-sources">
                  <span v-for="source in message.sources" :key="source">{{ source }}</span>
                </div>
                <button
                  v-if="message.role === 'assistant'"
                  type="button"
                  class="chat-copy"
                  aria-label="複製這則回覆"
                  @click="copyMessage(message)"
                >
                  <Copy :size="13" />
                </button>
              </div>
            </div>
          </div>

          <div class="chat-suggestions" aria-label="建議提問">
            <button
              v-for="suggestion in promptSuggestions"
              :key="suggestion"
              type="button"
              @click="sendChat(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>

          <form class="chat-composer" @submit.prevent="sendChat()">
            <textarea
              v-model="chatInput"
              rows="2"
              placeholder="輸入你的問題，例如：幫我把押金問題整理成給房東的 LINE 訊息"
              aria-label="輸入法律 GPT 問題"
              @keydown.enter.exact.prevent="sendChat()"
            />
            <button type="submit" :disabled="!chatInput.trim()" aria-label="送出問題">
              <Send :size="18" />
            </button>
          </form>
          <p class="chat-disclaimer">AI 回覆僅供契約溝通參考，不取代律師的個案法律意見。</p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped src="./analysis.css"></style>
