<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loadContractOcrResult, type ContractFieldReview } from '@/src/utils/contract-ocr'
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
  FileSearch,
  FileText,
  MessageSquareText,
  Search,
  Send,
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
    result.push({
      id: `missing-${groupId}`,
      title: `${group?.title ?? '契約資料'}缺少 ${missingFields.length} 項`,
      severity: 'high',
      source: 'field',
      sourceLabel: '關鍵欄位檢核',
      groupId,
      groupLabel: group?.title ?? '契約資料',
      fieldIds: missingFields.map((field) => field.id),
      pageIndex: null,
      focusText: '',
      clause: `未確認欄位：${missingFields.map((field) => field.label).join('、')}`,
      description: '契約缺少必要資訊，可能使租賃範圍、費用或權利義務難以認定。',
      advice: `請房東協助確認並補充：${missingFields.map((field) => field.label).join('、')}。`,
    })
  })

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

  const equipmentRepairClause = findClause(
    /冷氣[^。]{0,50}(?:熱水器|電燈|插座)[^。]{0,180}不論新舊[^。]{0,140}(?:承租人負擔|承租人負責)[^。]*。?/,
    '冷氣',
  )
  if (equipmentRepairClause) {
    result.push({
      id: 'rag-equipment-repair',
      title: '設備故障責任概括轉嫁承租人',
      severity: 'high',
      source: 'rag',
      sourceLabel: 'RAG 法規比對',
      groupId: null,
      groupLabel: '修繕與保養',
      fieldIds: [],
      pageIndex: equipmentRepairClause.pageIndex,
      focusText: equipmentRepairClause.focusText,
      clause: equipmentRepairClause.text,
      description:
        '現行住宅租賃規範以出租人修繕為原則；若簽約前約定由承租人修繕，應說明具體項目與範圍並經承租人確認。本條以「不論新舊、一律負擔」概括轉嫁，未排除自然耗損或設備老化，屬高風險約定。',
      advice:
        '建議改為：自然耗損、設備老化及非可歸責於承租人的故障由出租人修繕；僅因承租人故意或過失造成的損壞，由承租人負擔。另載明通知、修繕期限及緊急處理方式。',
      legalBasis: [
        '民法第 423、429、430 條',
        '住宅租賃定型化契約應記載事項第 9、11 點',
      ],
    })
  }

  const broadDamageClause = findClause(
    /非因自然耗損[^。]{0,220}(?:概由承租人|承租人負責)[^。]*。?/,
    '非因自然耗損',
  )
  if (broadDamageClause) {
    result.push({
      id: 'rag-broad-damage-liability',
      title: '承租人損壞責任範圍過廣',
      severity: 'medium',
      source: 'rag',
      sourceLabel: 'RAG 法規比對',
      groupId: null,
      groupLabel: '修繕與保養',
      fieldIds: [],
      pageIndex: broadDamageClause.pageIndex,
      focusText: broadDamageClause.focusText,
      clause: broadDamageClause.text,
      description:
        '「非自然耗損」不等於損壞必然可歸責於承租人；設備瑕疵、第三人行為或不可抗力仍可能落入本條。承租人原則上僅就違反善良管理人注意義務所造成的毀損負責。',
      advice:
        '建議將責任要件改為「因承租人故意、過失或可歸責於承租人之事由所致」，並排除自然耗損、設備老化、原有瑕疵及不可抗力。',
      legalBasis: ['民法第 432 條', '住宅租賃定型化契約應記載事項第 9、12 點'],
    })
  }

  const taxTransferClause = findClause(
    /(?:房屋稅|地價稅)[^。]{0,260}(?:承租人承擔|承租人負擔)[^。]*。?/,
    '房屋稅',
  )
  if (taxTransferClause) {
    result.push({
      id: 'rag-tax-transfer',
      title: '房屋稅、地價稅轉嫁承租人',
      severity: 'high',
      source: 'rag',
      sourceLabel: 'RAG 法規比對',
      groupId: null,
      groupLabel: '稅費負擔',
      fieldIds: [],
      pageIndex: taxTransferClause.pageIndex,
      focusText: taxTransferClause.focusText,
      clause: taxTransferClause.text,
      description:
        '民法及現行住宅租賃定型化契約規範均將租賃住宅的房屋稅、地價稅列為出租人負擔。契約將既有稅負、稅率調升或新增稅費概括轉由承租人承擔，應列為高風險。',
      advice:
        '建議刪除房屋稅、地價稅及其增加部分由承租人負擔的內容；其他稅費應逐項寫明名稱、金額或計算方式及負擔人，不使用概括授權。',
      legalBasis: ['民法第 427 條', '住宅租賃定型化契約應記載事項第 7 點'],
    })
  }

  result.push(
    {
      id: 'ai-termination',
      title: '提前終止與通知流程可再明確',
      severity: 'low',
      source: 'ai',
      sourceLabel: 'AI 語意分析',
      groupId: null,
      groupLabel: '提前終止',
      fieldIds: [],
      pageIndex: findPageByKeyword('終止'),
      focusText: '終止',
      clause: '提前終止條款涉及通知期間、通知方式及違約責任，建議進一步確認。',
      description: 'AI 從條文語意辨識出流程可能不夠明確，此結果應搭配原始條文與專業意見判讀。',
      advice: '建議補充書面通知方式、通知送達日與違約金計算基準，降低雙方認定差異。',
    },
  )

  return result
}

const risks = ref<RiskItem[]>(buildRisks())
if (!risks.value.some((risk) => risk.source === 'field')) activeRiskTab.value = 'rag'
const filteredRisks = computed(() => risks.value.filter((risk) => risk.source === activeRiskTab.value))
const highRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'high').length)
const mediumRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'medium').length)
const lowRiskCount = computed(() => risks.value.filter((risk) => risk.severity === 'low').length)
const riskTabs = computed(() => [
  { id: 'field' as const, label: '關鍵欄位檢查', count: risks.value.filter((risk) => risk.source === 'field').length },
  { id: 'rag' as const, label: 'RAG 風險分析', count: risks.value.filter((risk) => risk.source === 'rag').length },
  { id: 'ai' as const, label: 'AI 綜合建議', count: risks.value.filter((risk) => risk.source === 'ai').length },
])

const chatMessages = ref<ChatMessage[]>([
  {
    id: 1,
    role: 'assistant',
    text: '你好，我是 RentMate 法律 GPT。你可以點選上方風險，或直接詢問如何與房東溝通。此頁目前為前端互動示意。',
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
  chatMessages.value.push({
    id: nextMessageId.value++,
    role: 'assistant',
    text: `已帶入「${risk.title}」的契約脈絡。${risk.advice}\n\n你希望我整理成溫和、正式，還是強調法律依據的版本？`,
    sources: [risk.sourceLabel, risk.groupLabel, ...(risk.legalBasis ?? [])],
  })
  void nextTick(() => {
    document.querySelector<HTMLElement>('.legal-chat-panel')?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  })
}

function sendChat(message = chatInput.value): void {
  const content = message.trim()
  if (!content) return
  chatMessages.value.push({ id: nextMessageId.value++, role: 'user', text: content })
  chatInput.value = ''

  const activeRisk = risks.value.find((risk) => risk.id === activeRiskId.value)
  chatMessages.value.push({
    id: nextMessageId.value++,
    role: 'assistant',
    text: activeRisk
      ? `可以這樣表達：「您好，關於${activeRisk.title}，想請您協助確認。${activeRisk.advice}希望雙方能在簽約前把內容寫清楚，謝謝。」\n\n目前是前端示意回覆；串接 RAG 與 LLM 後，會依你的問題即時生成內容。`
      : '我已收到你的問題。正式串接後，這裡會結合契約條文、關鍵欄位及 RAG 法規來源產生個人化回覆。',
    sources: activeRisk
      ? [activeRisk.sourceLabel, '契約原文', ...(activeRisk.legalBasis ?? [])]
      : ['契約原文'],
  })
}

function copyMessage(message: ChatMessage): void {
  void navigator.clipboard.writeText(message.text)
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
            <h1>契約 AI 診斷分析</h1>
            <p>整合關鍵欄位、RAG 法規比對與 AI 語意分析，協助你看懂租約風險。</p>
          </div>
        </div>
      </div>
      <Button variant="outline" @click="router.push('/app/contract')">
        重新上傳
      </Button>
    </header>

    <section class="analysis-overview" aria-label="AI 診斷結果總覽">
      <div class="analysis-overview-heading">
        <div>
          <span>AI 診斷結果總覽</span>
          <strong>共發現 {{ risks.length }} 項需留意內容</strong>
        </div>
        <span class="analysis-status-pill"><CheckCircle2 :size="15" /> 分析完成</span>
      </div>
      <div class="analysis-stats">
        <div><span>總風險項目</span><strong>{{ risks.length }}</strong></div>
        <div class="is-high"><span>高風險</span><strong>{{ highRiskCount }}</strong></div>
        <div class="is-medium"><span>中風險</span><strong>{{ mediumRiskCount }}</strong></div>
        <div class="is-low"><span>低風險</span><strong>{{ lowRiskCount }}</strong></div>
      </div>
    </section>

    <section class="legal-scope-panel" aria-labelledby="legal-scope-title">
      <div class="legal-scope-heading">
        <div>
          <strong id="legal-scope-title"><Scale :size="16" /> 法律依據範圍</strong>
          <span>依契約條文比對適用法規，風險卡只顯示實際相關的條文。</span>
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
            <h2 id="analysis-reader-title"><FileText :size="19" /> 契約 PDF 閱讀器</h2>
            <p>一次顯示一頁 OCR 內容，可搜尋全文並定位風險條文。</p>
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
              <h2 id="risk-panel-title"><AlertTriangle :size="19" /> 偵測到的風險項次</h2>
              <p>依來源分類，可回到欄位修改或定位契約條文。</p>
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
              <button type="button" class="risk-card-main" @click="focusRisk(risk)">
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
                    <span v-if="risk.pageIndex !== null">第 {{ risk.pageIndex + 1 }} 頁</span>
                  </span>
                  <span class="risk-clause">{{ risk.clause }}</span>
                  <span class="risk-description">{{ risk.description }}</span>
                  <span v-if="risk.legalBasis?.length" class="risk-legal-basis">
                    <span v-for="basis in risk.legalBasis" :key="basis">{{ basis }}</span>
                  </span>
                </span>
              </button>
              <div class="risk-actions">
                <button
                  v-if="risk.groupId"
                  type="button"
                  class="risk-link-button"
                  @click="openFieldEditor(risk)"
                >
                  <ExternalLink :size="14" /> 回關鍵欄位
                </button>
                <button
                  v-if="risk.pageIndex !== null"
                  type="button"
                  class="risk-link-button"
                  @click="focusRisk(risk)"
                >
                  <FileSearch :size="14" /> 定位條文
                </button>
                <button type="button" class="risk-chat-button" @click="startNegotiation(risk)">
                  <MessageSquareText :size="14" /> 詢問法律 GPT
                </button>
              </div>
            </article>

            <div v-if="!filteredRisks.length" class="risk-empty-state">
              <CheckCircle2 :size="22" />
              <strong>這個分類目前沒有風險</strong>
              <span>可切換其他分類繼續查看。</span>
            </div>
          </div>
        </section>

        <section class="legal-chat-panel" aria-labelledby="legal-chat-title">
          <div class="chat-heading">
            <span class="chat-bot-mark"><Bot :size="20" /></span>
            <div>
              <h2 id="legal-chat-title">AI 談判腳本／法律 GPT</h2>
              <p>結合目前風險與契約內容，產生可直接使用的溝通建議。</p>
            </div>
            <span class="chat-demo-badge">前端 Demo</span>
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
