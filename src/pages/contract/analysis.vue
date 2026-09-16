<script setup lang="ts">
import { onMounted } from 'vue'
import { assessmentKey, evidenceKey, isDismissed, reconcileRecord, type ResolutionRecord } from '@/src/utils/contract-resolution'
import { EVIDENCE_ACCEPT, formatEvidenceSize, validateEvidenceFiles, saveEvidenceFiles, removeEvidenceFiles, loadEvidenceFile, type EvidenceAttachment } from '@/src/utils/contract-evidence'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

// 與 authApi.ts 相同的 API 位址來源：開發模式讀 VITE_API_BASE_URL，正式環境走同源 /api
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
import { loadContractOcrResult, saveContractOcrResult } from '@/src/utils/contract-ocr'
import { downloadPdf, generateContractReportPdf } from '@/src/utils/contract-report'
import { buildContractAssessments, gateRemoteAssessments, summarizeAssessments, assessmentLabels, type ContractAssessment } from '@/src/utils/contract-risk'
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
  Paperclip,
  UploadCloud,
  LoaderCircle,
  Info,
  MessageSquareText,
  Search,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-vue-next'

type RiskTab = 'risk' | 'pending' | 'history'
type RiskItem = ContractAssessment

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

const router = useRouter()
const ocrResult = loadContractOcrResult()
if (ocrResult && !ocrResult.reviewSessionId) {
  ocrResult.reviewSessionId = crypto.randomUUID()
  saveContractOcrResult(ocrResult)
}
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
const activeRiskTab = ref<RiskTab>('risk')
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

function buildRisks(): RiskItem[] {
  return buildContractAssessments(ocrResult)
}

const risks = ref<RiskItem[]>(buildRisks())
const historyKey = 'rentmate-review:' + ocrResult?.reviewSessionId
const records = ref<ResolutionRecord[]>([])
try {
  const stored = JSON.parse(localStorage.getItem(historyKey) || sessionStorage.getItem(historyKey) || '[]')
  if (Array.isArray(stored)) records.value = stored.filter(record => record && typeof record.rule === 'string' && typeof record.evidence === 'string')
} catch { /* unavailable storage */ }
const severityFilter = ref<string | null>(null)
const activeRisks = computed(() => risks.value.filter(risk => !isDismissed(risk, records.value)))
const filteredRisks = computed(() => activeRisks.value.filter(risk => activeRiskTab.value === 'risk'
  ? risk.status === 'confirmed' && (!severityFilter.value || risk.severity === severityFilter.value)
  : activeRiskTab.value === 'pending' ? !['confirmed', 'not_applicable'].includes(risk.status)
  : risk.status === 'not_applicable'))
const assessmentSummary = computed(() => summarizeAssessments(activeRisks.value))
const processDialog = ref<HTMLDialogElement | null>(null)
const processRisk = ref<RiskItem | null>(null)
const processAction = ref<ResolutionRecord['action']>('discussed')
const processNote = ref('')
const processError = ref('')
const processSaving = ref(false)
const evidenceInput = ref<HTMLInputElement | null>(null)
const evidenceDragging = ref(false)
const evidenceError = ref('')
const evidenceDownloadError = ref('')
const processSuccess = ref('')
type PendingEvidence = EvidenceAttachment & { file: File; preview: string }
const processAttachments = ref<PendingEvidence[]>([])
const processOptions = [
  { value: 'discussed', label: '已與房東確認', description: '保存溝通結果，保留目前檢查項目。' },
  { value: 'not_applicable', label: '確認不適用', description: '記錄不適用原因，將此項移至處理紀錄。' },
  { value: 'correct', label: '修正辨識／回報誤判', description: '儲存後返回契約校對，修正原文或欄位。' },
  { value: 'reopen', label: '恢復檢查', description: '保留歷次紀錄，重新列入檢查。' },
] as const
function clearProcessAttachments() {
  for (const attachment of processAttachments.value) if (attachment.preview) URL.revokeObjectURL(attachment.preview)
  processAttachments.value = []
  evidenceDragging.value = false
  if (evidenceInput.value) evidenceInput.value.value = ''
}
function addEvidence(files: File[]) {
  if (processSaving.value || !files.length) return
  evidenceError.value = validateEvidenceFiles(processAttachments.value, files)
  if (evidenceError.value) return
  processAttachments.value.push(...files.map(file => ({
    id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, file,
    preview: /^image\/(jpeg|png|webp|gif)$/.test(file.type) ? URL.createObjectURL(file) : '',
  })))
}
function selectEvidence(event: Event) {
  const input = event.target as HTMLInputElement
  addEvidence(Array.from(input.files || []))
  input.value = ''
}
function dropEvidence(event: DragEvent) {
  evidenceDragging.value = false
  addEvidence(Array.from(event.dataTransfer?.files || []))
}
function removeEvidence(id: string) {
  const attachment = processAttachments.value.find(item => item.id === id)
  if (attachment?.preview) URL.revokeObjectURL(attachment.preview)
  processAttachments.value = processAttachments.value.filter(item => item.id !== id)
  evidenceError.value = ''
}
async function downloadEvidence(attachment: EvidenceAttachment) {
  evidenceDownloadError.value = ''
  try {
    const blob = await loadEvidenceFile(attachment.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = attachment.name
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    evidenceDownloadError.value = '無法讀取附件，瀏覽器中的附件可能已被清除。請重新加入檔案。'
  }
}
onBeforeUnmount(clearProcessAttachments)
function openProcess(risk: RiskItem) {
  clearProcessAttachments()
  evidenceError.value = ''; processSuccess.value = ''
  processRisk.value = risk; processAction.value = 'discussed'; processNote.value = ''; processError.value = ''
  processDialog.value?.showModal()
}
async function saveProcess() {
  const risk = processRisk.value
  if (!risk || processSaving.value) return
  if (!processNote.value.trim()) { processError.value = '請填寫原因與核對依據，再儲存紀錄。'; return }
  processError.value = ''
  processSaving.value = true
  const attachments = processAttachments.value.map(({ id, name, size, type }) => ({ id, name, size, type }))
  const record: ResolutionRecord = { id: crypto.randomUUID(), rule: assessmentKey(risk), title: risk.title,
    action: processAction.value, note: processNote.value.trim(), at: new Date().toISOString(), evidence: evidenceKey(risk), attachments }
  const next = [...records.value, record]
  try {
    await saveEvidenceFiles(processAttachments.value)
    localStorage.setItem(historyKey, JSON.stringify(next))
  } catch {
    await removeEvidenceFiles(attachments.map(item => item.id)).catch(() => {})
    processError.value = '紀錄或附件儲存失敗，請確認瀏覽器允許儲存資料，或減少附件大小後重試。'
    return
  } finally { processSaving.value = false }
  records.value = next
  processSuccess.value = '處理紀錄已儲存，可在「處理紀錄」查看與下載附件。'
  processDialog.value?.close()
  if (record.action === 'correct') openFieldEditor(risk)
}
function filterSeverity(severity: string) { severityFilter.value = severity; activeRiskTab.value = 'risk' }
function legalLink(basis: string) { return basis.match(/https?:\/\/[^\s]+/)?.[0] }
function legalTitle(risk: RiskItem) {
  const titles: Record<string, string> = {
    'deposit-limit': '押金約定及返還', 'deposit-return-delay': '押金返還與住宅點交',
    'review-waiver': '契約審閱期', 'electricity-objection': '費用約定與出租人義務',
    'electricity-reference': '電費計收', 'internet-adjustment': '租金與費用約定',
    'termination-deposit-forfeit': '提前終止與違約金',
  }
  return titles[risk.ruleId || ''] || '相關契約規範'
}
function riskImpact(risk: RiskItem) {
  const excess = risk.metrics?.find(metric => metric.label === '超出兩個月部分')
  return risk.ruleId === 'deposit-limit' && risk.status === 'confirmed' && excess
    ? `押金比兩個月租金上限多出 ${excess.value.toLocaleString()} 元。` : risk.description
}
function moveRiskTab(event: KeyboardEvent, id: RiskTab) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const ids = riskTabs.value.map(tab => tab.id)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1
    : (ids.indexOf(id) + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  activeRiskTab.value = ids[index]!
  severityFilter.value = null
  void nextTick(() => document.getElementById(`review-tab-${activeRiskTab.value}`)?.focus())
}
function legalLabel(basis: string) { return basis.replace(/https?:\/\/[^\s]+/g, '').replace(/：$/, '') }
const highRiskCount = computed(() => assessmentSummary.value.high)
const mediumRiskCount = computed(() => assessmentSummary.value.medium)
const lowRiskCount = computed(() => assessmentSummary.value.low)
const riskTabs = computed(() => [
  { id: 'risk' as const, label: '風險提醒', count: assessmentSummary.value.total },
  { id: 'pending' as const, label: '待確認', count: activeRisks.value.filter(r => !['confirmed', 'not_applicable'].includes(r.status)).length },
  { id: 'history' as const, label: '處理紀錄', count: records.value.length + activeRisks.value.filter(r => r.status === 'not_applicable').length },
])
/*
 * AI 分析的狀態必須讓使用者看得到。
 *
 * 原本失敗時是靜靜 return，畫面會顯示「RAG 風險 0 項、AI 建議 0 項」，
 * 使用者會理解成「我的合約沒有這些問題」—— 但真相是分析根本沒有跑。
 * 對一個要拿去跟房東談判的人來說，這跟給錯資訊沒有兩樣。
 */
type AiAnalysisState = 'loading' | 'ok' | 'failed'
const aiAnalysisState = ref<AiAnalysisState>('loading')

async function loadBackendRagAndAiAnalysis() {
  if (!ocrResult?.text) {
    aiAnalysisState.value = 'failed'
    return
  }

  aiAnalysisState.value = 'loading'
  try {
    const response = await fetch(`${API_BASE_URL}/contract/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ocr_text: ocrResult.text,
        page_texts: ocrResult.pageTexts ?? [ocrResult.text],
        field_reviews: ocrResult.fieldReviews ?? {}
      })
    })

    if (response.status === 401) {
      // 登入逾期：導回登入頁，完成後回到本頁
      window.location.assign('/login?redirect=' + encodeURIComponent(window.location.pathname))
      return
    }
    if (!response.ok) {
      aiAnalysisState.value = 'failed'
      return
    }
    const data = await response.json()
    if (!data || !Array.isArray(data.rag_risks) || !Array.isArray(data.ai_risks)) {
      throw new Error('分析回應格式不完整')
    }

    // 取得後端真正的 RAG 與 AI 風險，並與本機 field 風險疊加
    const localFieldRisks = buildRisks()
    risks.value = [...localFieldRisks, ...gateRemoteAssessments(data.rag_risks, 'rag', pages.value), ...gateRemoteAssessments(data.ai_risks, 'ai', pages.value)]
    aiAnalysisState.value = 'ok'
  } catch (error) {
    console.error('後端 API 呼叫失敗，維持本機檢核結果:', error)
    aiAnalysisState.value = 'failed'
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
      page: risk.pageIndex ?? undefined,
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
    const response = await fetch(`${API_BASE_URL}/contract/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: userMessage,
        contract_text: ocrResult?.text ?? '',
        active_risk: activeRisk ?? null,
      }),
    })

    if (response.status === 401) {
      window.location.assign('/login?redirect=' + encodeURIComponent(window.location.pathname))
      return
    }
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
      risks: risks.value.map(risk => isDismissed(risk, records.value) ? { ...risk, status: 'not_applicable' as const, severity: null, description: '使用者確認不適用；原規則證據保留供追溯。' } : risk),
      handlingRecords: records.value.map(record => ({ ...record, outcome: reconcileRecord(record, risks.value) })),
      fieldValues,
      privacyMode: exportPrivacyMode.value,
      analysisState: aiAnalysisState.value,
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
            <strong>{{ assessmentSummary.total }}</strong>
            <span>項規則風險<br />已確認證據</span>
          </div>
          <p v-if="highRiskCount">優先確認 {{ highRiskCount }} 項高風險，再依序檢視其他提醒。</p>
          <p v-else>目前規則未確認高風險；待確認與未完成分析不代表沒有問題。</p>
          <p>{{ assessmentSummary.pending }} 項待確認，不計入風險數量。</p>
        </div>
        <span class="analysis-status-pill" :class="{ 'is-incomplete': aiAnalysisState !== 'ok' }"><CheckCircle2 :size="15" /> 欄位檢查完成／{{ aiAnalysisState === 'ok' ? 'AI 候選分析完成' : aiAnalysisState === 'loading' ? 'AI 分析中' : 'AI 分析未完成' }}</span>
      </div>
      <div class="analysis-stats">
        <button type="button" class="is-high" :aria-pressed="activeRiskTab === 'risk' && severityFilter === 'high'" @click="filterSeverity('high')"><span>HIGH · 高風險</span><strong>{{ highRiskCount }}</strong><small>{{ aiAnalysisState === 'ok' ? '規則確認項目' : '完整統計尚未完成' }}</small></button>
        <button type="button" class="is-medium" :aria-pressed="activeRiskTab === 'risk' && severityFilter === 'medium'" @click="filterSeverity('medium')"><span>MED · 中風險</span><strong>{{ mediumRiskCount }}</strong><small>{{ aiAnalysisState === 'ok' ? '規則確認項目' : '完整統計尚未完成' }}</small></button>
        <button type="button" class="is-low" :aria-pressed="activeRiskTab === 'risk' && severityFilter === 'low'" @click="filterSeverity('low')"><span>LOW · 低風險</span><strong>{{ lowRiskCount }}</strong><small>{{ aiAnalysisState === 'ok' ? '規則確認項目' : '完整統計尚未完成' }}</small></button>
        <button type="button" class="is-pending" :aria-pressed="activeRiskTab === 'pending'" @click="activeRiskTab = 'pending'; severityFilter = null"><span>CHECK · 待確認</span><strong>{{ assessmentSummary.pending }}</strong><small>待核對，不計入風險數量</small></button>
      </div>
    </section>

    <dialog ref="processDialog" class="process-dialog" aria-labelledby="process-title" aria-describedby="process-subtitle" @close="clearProcessAttachments" @cancel="processSaving && $event.preventDefault()">
      <form class="process-form" :aria-busy="processSaving" @submit.prevent="saveProcess">
        <header class="process-header">
          <span class="process-header-icon"><ShieldCheck :size="26" /></span>
          <div><span class="process-eyebrow">REVIEW NOTE · 處理紀錄</span><h2 id="process-title">處理此項</h2><p id="process-subtitle">記下確認結果，讓每一項處理都有依據。</p></div>
          <button type="button" class="process-close" aria-label="關閉處理視窗" :disabled="processSaving" @click="processDialog?.close()"><X :size="20" /></button>
        </header>
        <div class="process-body">
          <div class="process-context"><span>本次處理項目</span><strong>{{ processRisk?.title }}</strong><span v-if="processRisk?.severity" class="process-severity" :class="`is-${processRisk.severity}`">{{ processRisk.severity === 'high' ? '高風險' : processRisk.severity === 'medium' ? '中風險' : '低風險' }}</span></div>
          <fieldset class="process-methods" :disabled="processSaving">
            <legend><span class="process-step">01</span>選擇處理方式</legend>
            <div class="process-method-grid">
              <label v-for="option in processOptions" :key="option.value" class="process-method" :class="{ 'is-selected': processAction === option.value }">
                <input v-model="processAction" type="radio" name="process-action" :value="option.value" />
                <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
              </label>
            </div>
          </fieldset>
          <div class="process-note-field">
            <label for="process-note" class="process-section-label"><span class="process-step">02</span>原因與核對依據 <span class="process-required">必填</span></label>
            <p id="process-note-hint" class="process-field-hint">說明核對的原文、修正內容，或與房東確認的結果。</p>
            <textarea id="process-note" v-model="processNote" required maxlength="5000" :disabled="processSaving" aria-describedby="process-note-hint" placeholder="例如：已於 9/17 與房東確認，押金將調整為兩個月租金，並附上對話截圖及修訂後契約。" />
            <span class="process-character-count">{{ processNote.length.toLocaleString() }} / 5,000</span>
          </div>
          <section class="process-evidence" aria-labelledby="process-evidence-title">
            <h3 id="process-evidence-title" class="process-section-label"><span class="process-step">03</span>佐證附件 <span class="process-optional">選填</span><span class="process-file-count">{{ processAttachments.length }} / 5</span></h3>
            <input ref="evidenceInput" type="file" multiple :accept="EVIDENCE_ACCEPT" class="process-file-input" tabindex="-1" aria-label="選擇佐證附件" :disabled="processSaving" @change="selectEvidence" />
            <button type="button" class="process-dropzone" :class="{ 'is-dragging': evidenceDragging }" :disabled="processSaving" aria-describedby="process-file-hint" @click="evidenceInput?.click()" @dragover.prevent="evidenceDragging = true" @dragleave.prevent="evidenceDragging = false" @drop.prevent="dropEvidence">
              <span class="process-upload-icon"><UploadCloud :size="25" /></span><span><strong>點擊選擇檔案，或拖曳至此</strong><small>對話截圖、修訂契約、收據，都可以作為核對依據</small></span><span class="process-upload-label">選擇檔案</span>
            </button>
            <p id="process-file-hint" class="process-field-hint">圖片（JPG、PNG、WebP、GIF）、PDF、Word、Excel、TXT、CSV。單檔上限 10 MB，合計 25 MB。</p>
            <p v-if="evidenceError" class="process-error" role="alert"><CircleAlert :size="16" />{{ evidenceError }}</p>
            <ul v-if="processAttachments.length" class="process-attachment-list">
              <li v-for="attachment in processAttachments" :key="attachment.id">
                <img v-if="attachment.preview" :src="attachment.preview" :alt="attachment.name + ' 預覽'" /><span v-else class="process-file-icon"><FileText :size="22" /></span>
                <span class="process-attachment-copy"><strong>{{ attachment.name }}</strong><small>{{ formatEvidenceSize(attachment.size) }} · 待儲存</small></span>
                <button type="button" :aria-label="`移除 ${attachment.name}`" :disabled="processSaving" @click="removeEvidence(attachment.id)"><X :size="18" /></button>
              </li>
            </ul>
          </section>
          <div class="process-info"><Info :size="18" /><p>溝通紀錄不代表風險解除。修正資料後會重新檢查；不適用判定只對目前證據有效。</p></div>
          <p v-if="processError" class="process-error" role="alert"><CircleAlert :size="18" />{{ processError }}</p>
        </div>
        <footer class="process-footer"><p><ShieldCheck :size="16" />紀錄與附件保存在此瀏覽器，可於本次契約的處理紀錄查看。</p><div class="process-footer-actions"><button type="button" class="process-cancel" :disabled="processSaving" @click="processDialog?.close()">取消</button><button type="submit" class="process-save" :disabled="processSaving"><LoaderCircle v-if="processSaving" :size="19" class="process-spinner" /><CheckCircle2 v-else :size="19" />{{ processSaving ? '儲存中…' : '儲存紀錄' }}</button></div></footer>
      </form>
    </dialog>

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
              <h2 id="risk-panel-title"><AlertTriangle :size="19" /> 規則風險與待確認項目</h2>
              <p>先看摘要，展開後再定位條文或詢問 AI。</p>
            </div>
          </div>

          <details v-if="aiAnalysisState === 'failed'" class="ai-analysis-alert">
            <summary><AlertTriangle :size="18" aria-hidden="true" />規則檢查已完成，AI 分析尚未完成<span>查看說明</span></summary>
            <p>以下仍可檢視欄位與契約條款規則檢查結果。AI 分析尚未完成，不代表契約沒有問題；請核對原文，稍後再試。</p>
          </details>

          <div class="risk-tabs" role="tablist" aria-label="檢查工作分類">
            <button
              v-for="tab in riskTabs"
              :key="tab.id"
              :id="`review-tab-${tab.id}`"
              aria-controls="review-results"
              :tabindex="activeRiskTab === tab.id ? 0 : -1"
              @keydown="moveRiskTab($event, tab.id)"
              type="button"
              role="tab"
              :aria-selected="activeRiskTab === tab.id"
              :class="{ 'is-active': activeRiskTab === tab.id }"
              @click="activeRiskTab = tab.id; severityFilter = null"
            >
              {{ tab.label }} <span>{{ tab.count }}</span>
            </button>
          </div>

          <div id="review-results" class="risk-list" role="tabpanel" :aria-labelledby="`review-tab-${activeRiskTab}`" tabindex="0">
            <p v-if="processSuccess" class="process-success" role="status"><CheckCircle2 :size="18" />{{ processSuccess }}<button v-if="activeRiskTab !== 'history'" type="button" @click="activeRiskTab = 'history'; severityFilter = null">查看紀錄</button></p>
            <p v-if="evidenceDownloadError" class="process-error" role="alert">{{ evidenceDownloadError }}</p>
            <button v-if="severityFilter && activeRiskTab === 'risk'" @click="severityFilter = null">清除風險等級篩選</button>
            <template v-if="activeRiskTab === 'history'">
              <article v-for="record in [...records].reverse()" :key="record.id" class="risk-card history-entry">
                <strong>{{ record.title }}</strong><p>{{ reconcileRecord(record, risks) }}</p><p>{{ record.note }}</p><small>{{ new Date(record.at).toLocaleString() }}</small>
                <div v-if="record.attachments?.length" class="history-attachments"><span><Paperclip :size="15" />佐證附件 · {{ record.attachments.length }}</span><button v-for="attachment in record.attachments" :key="attachment.id" type="button" :aria-label="`下載 ${attachment.name}`" @click="downloadEvidence(attachment)"><FileText :size="18" /><span>{{ attachment.name }}<small>{{ formatEvidenceSize(attachment.size) }}</small></span><FileDown :size="18" /></button></div>
                <button v-if="risks.find(r => assessmentKey(r) === record.rule)" @click="openProcess(risks.find(r => assessmentKey(r) === record.rule)!)">重新處理此項</button>
              </article>
            </template>
            <article
              v-for="risk in filteredRisks"
              :key="risk.id"
              class="risk-card"
              :class="[`is-${risk.severity || risk.status}`, { 'is-active': activeRiskId === risk.id }]"
            >
              <div class="risk-card-main">
                <span class="risk-icon">
                  <CircleAlert v-if="risk.severity === 'high'" :size="17" />
                  <Database v-else-if="risk.source === 'rag'" :size="17" />
                  <Sparkles v-else :size="17" />
                </span>
                <span class="risk-card-copy">
                  <span class="risk-card-title-row">
                    <strong>{{ risk.priority ? '優先核對 · ' : '' }}{{ risk.title }}</strong>
                    <span class="risk-severity">{{ risk.status === 'confirmed' ? (risk.severity === 'high' ? '高風險' : risk.severity === 'medium' ? '中風險' : '低風險') : assessmentLabels[risk.status] }}</span>
                  </span>
                  <span class="risk-impact">{{ riskImpact(risk) }}</span>
                  <span v-if="risk.metrics?.length" class="risk-metrics"><span v-for="metric in risk.metrics" :key="metric.label">{{ metric.label }}<strong>{{ metric.value.toLocaleString() }} 元</strong></span></span>
                  <span class="risk-advice"><b>建議：</b>{{ risk.advice }}</span>
                  <template v-if="activeRiskId === risk.id">
                    <span class="risk-meta"><span>{{ risk.sourceLabel }}</span><span>{{ risk.groupLabel }}</span></span>
                    <ul v-if="risk.details?.length" class="risk-detail-list">
                      <li v-for="(detail, index) in risk.details" :key="index">
                        <span>{{ detail.focusText }}</span>
                        <button v-if="detail.pageIndex !== null" class="risk-page-button" @click="focusRiskDetail(detail)">第 {{ detail.pageIndex + 1 }} 頁 ↗</button>
                        <small v-else>來源未定位</small>
                      </li>
                    </ul>
                    <span v-else class="risk-clause">{{ risk.clause }}</span>
                    <span class="risk-legal-basis"><template v-for="basis in risk.legalBasis" :key="basis"><a v-if="legalLink(basis)" :href="legalLink(basis)" target="_blank" rel="noopener noreferrer">查看依據：{{ legalTitle(risk) }} <ExternalLink :size="13" aria-hidden="true" /></a><small v-if="legalLink(basis)">{{ legalLabel(basis) }}</small><span v-else>{{ basis }}</span></template></span>
                  </template>
                </span>
              </div>
              <div class="risk-actions">
                <button type="button" class="risk-primary-action" @click="focusRisk(risk)">{{ risk.details?.length ? `查看 ${risk.details.length} 處原文` : '查看原文' }}</button>
                <button type="button" class="risk-process-action" @click="openProcess(risk)">處理此項</button>
                <button
                  type="button"
                  class="risk-summary-button"
                  :aria-expanded="activeRiskId === risk.id"
                  @click="toggleRiskDetails(risk)"
                >
                  {{ activeRiskId === risk.id ? '收合判斷依據' : '查看判斷依據' }}
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
                  <MessageSquareText :size="14" /> 詢問 AI
                </button>
              </div>
            </article>

            <div v-if="!filteredRisks.length && !(activeRiskTab === 'history' && records.length)" class="risk-empty-state">
              <CheckCircle2 :size="22" />
              <strong>這個分類目前沒有待列項目</strong>
              <span>這不代表完整契約已通過檢查，請核對原文與分析狀態。</span>
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
