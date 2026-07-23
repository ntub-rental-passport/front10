<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  loadContractOcrResult,
  mergeContractPageTexts,
  saveContractOcrResult,
  type ContractFieldReview,
  type ContractOcrResult,
} from '@/src/utils/contract-ocr'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import {
  FileText,
  Save,
  AlertTriangle,
  CheckCircle,
  Edit3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  PenLine,
  Info,
  Search,
  X,
} from 'lucide-vue-next'

interface ContractField {
  id: string
  label: string
  value: string
  sourceValue: string
  confidence: 'high' | 'medium' | 'low'
  reviewState: 'unreviewed' | 'verified' | 'edited'
  required: boolean
  editing: boolean
  editStartValue: string
  sourcePageIndex: number | null
  sourceStart: number
  sourceEnd: number
}

interface CapturedValue {
  value: string
  sourceValue: string
}

type FieldFilter = 'all' | 'good' | 'medium' | 'low' | 'reviewed'

interface TextMatch {
  pageIndex: number
  start: number
  end: number
}

interface HighlightSegment {
  text: string
  highlighted: boolean
  fieldSource: boolean
  searchResult: boolean
  activeSearchResult: boolean
}

const storedOcrResult = ref<ContractOcrResult | null>(loadContractOcrResult())
const initialPageTexts = storedOcrResult.value?.pageTexts.length
  ? storedOcrResult.value.pageTexts
  : storedOcrResult.value?.text
    ? [storedOcrResult.value.text]
    : []
const ocrPages = ref<string[]>([...initialPageTexts])
const currentPageIndex = ref(0)
const pageCount = computed(() => ocrPages.value.length)
const currentPageNumber = computed(() => currentPageIndex.value + 1)
const ocrFullText = computed(() => mergeContractPageTexts(ocrPages.value))
const currentPageText = computed({
  get: () => ocrPages.value[currentPageIndex.value] ?? '',
  set: (value: string) => {
    if (currentPageIndex.value < ocrPages.value.length) {
      ocrPages.value[currentPageIndex.value] = value
    }
  },
})
const hasOcrData = computed(() => Boolean(ocrFullText.value.trim()))

function cleanCapturedValue(value?: string): string {
  return value?.replace(/^[\s:：。．、-]+|[\s。；;]+$/g, '').replace(/\s+/g, ' ').trim() ?? ''
}

function captureFirst(text: string, patterns: RegExp[]): CapturedValue {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = cleanCapturedValue(match?.[1])
    if (value) {
      return {
        value,
        sourceValue: match?.[1]?.trim() ?? value,
      }
    }
  }
  return { value: '', sourceValue: '' }
}

function captureValue(value?: string): CapturedValue {
  return {
    value: cleanCapturedValue(value),
    sourceValue: value?.trim() ?? '',
  }
}

function formatCapturedValue(
  captured: CapturedValue,
  formatter: (value: string) => string,
): CapturedValue {
  return {
    ...captured,
    value: captured.value ? formatter(captured.value) : '',
  }
}

function makeField(
  id: string,
  label: string,
  captured: CapturedValue,
  confidence: ContractField['confidence'] = 'high',
  required = true,
): ContractField {
  return {
    id,
    label,
    value: captured.value || '尚未辨識',
    sourceValue: captured.sourceValue,
    confidence: captured.value ? confidence : 'low',
    reviewState: 'unreviewed',
    required,
    editing: false,
    editStartValue: captured.value || '',
    sourcePageIndex: null,
    sourceStart: -1,
    sourceEnd: -1,
  }
}

function locateFieldSource(field: ContractField, pages: string[]): ContractField {
  const candidates = [field.sourceValue, field.value]
    .map(value => value.trim())
    .filter(value => value && value !== '尚未擷取')

  for (const candidate of candidates) {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const sourceStart = (pages[pageIndex] ?? '').indexOf(candidate)
      if (sourceStart < 0) continue

      return {
        ...field,
        sourceValue: candidate,
        sourcePageIndex: pageIndex,
        sourceStart,
        sourceEnd: sourceStart + candidate.length,
      }
    }
  }

  return {
    ...field,
    sourcePageIndex: null,
    sourceStart: -1,
    sourceEnd: -1,
  }
}

function extractContractFields(text: string): ContractField[] {
  const landlord = captureFirst(text, [
    /出租人\s*[（(][^\r\n）)]*[）)]\s*[：:]\s*([^\r\n]+)/,
    /出租人姓名\s*[：:]\s*([^\r\n]+)/,
    /出租人[^\r\n]*[\r\n]+(?:[^\r\n]*[\r\n]+){0,2}\s*(?:[o○•]\s*)?姓名\s*[：:]\s*([^\r\n]+)/,
  ])
  const tenant = captureFirst(text, [
    /承租人\s*[（(][^\r\n）)]*[）)]\s*[：:]\s*([^\r\n]+)/,
    /承租人姓名\s*[：:]\s*([^\r\n]+)/,
    /承租人[^\r\n]*[\r\n]+(?:[^\r\n]*[\r\n]+){0,2}\s*(?:[o○•]\s*)?姓名\s*[：:]\s*([^\r\n]+)/,
  ])
  const address = captureFirst(text, [
    /租賃住宅地址[\s\S]{0,100}?(?:位置\s*)?[：:]\s*([^\r\n]+)/,
    /(?:租屋地址|房屋地址|租賃標的地址)\s*[：:]\s*([^\r\n]+)/,
    /坐落於\s*([^\r\n，。]+?)(?:之房屋|，|。)/,
  ])
  const dateRange = text.match(
    /租期自\s*(?:民國\s*)?([^\r\n]+?)\s*起至\s*(?:民國\s*)?([^\r\n]+?)\s*止/,
  ) ?? text.match(
    /自\s*(?:民國\s*)?([0-9０-９]{2,3}\s*年\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日)\s*起至\s*(?:民國\s*)?([0-9０-９]{2,3}\s*年\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日)\s*止/,
  )
  const rent = formatCapturedValue(captureFirst(text, [
    /月租金\s*[：:為]?\s*(?:新臺幣|新台幣|NT\$?)?\s*([0-9０-９,，]+)\s*元/,
  ]), value => `NT$${value.replace('，', ',')}`)
  const dueDay = formatCapturedValue(captureFirst(text, [
    /租金\s*每月\s*([0-9０-９]{1,2})\s*日\s*前/,
    /每月\s*([0-9０-９]{1,2})\s*日\s*前\s*繳納/,
  ]), value => `每月 ${value} 日前`)
  const deposit = formatCapturedValue(captureFirst(text, [
    /押金[^\r\n]{0,60}?(?:新臺幣|新台幣|NT\$?)\s*([0-9０-９,，]+)\s*元/,
  ]), value => `NT$${value.replace('，', ',')}`)
  const penaltyAmount = captureFirst(text, [
    /違約金\s*(?:新臺幣|新台幣|NT\$?)\s*([0-9０-９,，]+)\s*元/,
  ])
  const penaltyDescription = captureFirst(text, [
    /(?:違約金[^\r\n：:]{0,20}[：:]?|支付相當於)\s*([^\r\n。；;]{1,40}?(?:個月租金|元整|元))/,
  ])
  const penalty = penaltyAmount.value
    ? formatCapturedValue(penaltyAmount, value => `NT$${value.replace('，', ',')}`)
    : penaltyDescription

  return [
    makeField('landlord', '出租人（甲方）', landlord),
    makeField('tenant', '承租人（乙方）', tenant),
    makeField('address', '租屋地址', address),
    makeField('start_date', '租期起始', captureValue(dateRange?.[1])),
    makeField('end_date', '租期結束', captureValue(dateRange?.[2])),
    makeField('rent', '每月租金', rent),
    makeField('due_day', '繳租日', dueDay, 'medium'),
    makeField('deposit', '押金', deposit, 'medium'),
    makeField('penalty', '違約金', penalty, 'low', false),
  ]
}

const fields = ref<ContractField[]>(
  extractContractFields(ocrFullText.value).map((extractedField) => {
    const field = locateFieldSource(extractedField, ocrPages.value)
    const savedReview = storedOcrResult.value?.fieldReviews?.[field.id]
    if (!savedReview) return field

    return locateFieldSource({
      ...field,
      value: savedReview.value,
      sourceValue: savedReview.sourceValue,
      confidence: savedReview.confidence,
      reviewState: savedReview.reviewState,
      editStartValue: savedReview.value,
      sourcePageIndex: savedReview.sourcePageIndex ?? field.sourcePageIndex,
      sourceStart: savedReview.sourceStart ?? field.sourceStart,
      sourceEnd: savedReview.sourceEnd ?? field.sourceEnd,
    }, ocrPages.value)
  }),
)

const isEditing = ref(false)
const isSaved = ref(false)
const isDirty = ref(false)
const saveError = ref('')
const pageNumberScrollRef = ref<HTMLElement | null>(null)
const activeFieldFilter = ref<FieldFilter>('all')
const searchQuery = ref('')
const activeSearchMatchIndex = ref(-1)
const activeFieldHighlight = ref<TextMatch | null>(null)

watch(
  ocrPages,
  () => {
    isDirty.value = true
    isSaved.value = false
    saveError.value = ''
  },
  { deep: true },
)

watch(
  () => fields.value.map(field => `${field.value}:${field.reviewState}`),
  () => {
    isDirty.value = true
    isSaved.value = false
    saveError.value = ''
  },
)

const extractedCount = computed(() =>
  fields.value.filter(field => field.value !== '尚未辨識').length
)
const verifiedCount = computed(() =>
  fields.value.filter(field => field.reviewState !== 'unreviewed').length
)
const mediumConfidenceCount = computed(() =>
  fields.value.filter(field => field.confidence === 'medium' && field.reviewState === 'unreviewed').length
)
const lowConfidenceCount = computed(() =>
  fields.value.filter(field => field.confidence === 'low' && field.reviewState === 'unreviewed').length
)
const reviewProgress = computed(() =>
  fields.value.length ? Math.round((verifiedCount.value / fields.value.length) * 100) : 0
)
const requiredRemainingCount = computed(() =>
  fields.value.filter(field => field.required && field.reviewState === 'unreviewed').length
)
const canStartAnalysis = computed(() =>
  hasOcrData.value && requiredRemainingCount.value === 0
)

const goodConfidenceCount = computed(() =>
  fields.value.filter(field => field.confidence === 'high' && field.reviewState === 'unreviewed').length
)
const reviewedFieldCount = computed(() =>
  fields.value.filter(field => field.reviewState !== 'unreviewed').length
)
const filteredFields = computed(() => fields.value.filter((field) => {
  switch (activeFieldFilter.value) {
    case 'good':
      return field.confidence === 'high' && field.reviewState === 'unreviewed'
    case 'medium':
      return field.confidence === 'medium' && field.reviewState === 'unreviewed'
    case 'low':
      return field.confidence === 'low' && field.reviewState === 'unreviewed'
    case 'reviewed':
      return field.reviewState !== 'unreviewed'
    default:
      return true
  }
}))

const fieldFilters = computed<Array<{ id: FieldFilter; label: string; count: number }>>(() => [
  { id: 'all', label: '全部', count: fields.value.length },
  { id: 'good', label: '辨識良好', count: goodConfidenceCount.value },
  { id: 'medium', label: '建議確認', count: mediumConfidenceCount.value },
  { id: 'low', label: '人工確認', count: lowConfidenceCount.value },
  { id: 'reviewed', label: '已處理', count: reviewedFieldCount.value },
])

const searchMatches = computed<TextMatch[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return []

  const matches: TextMatch[] = []
  ocrPages.value.forEach((pageText, pageIndex) => {
    const searchableText = pageText.toLocaleLowerCase()
    let start = 0

    while (start < searchableText.length) {
      const matchStart = searchableText.indexOf(query, start)
      if (matchStart < 0) break
      matches.push({ pageIndex, start: matchStart, end: matchStart + query.length })
      start = matchStart + Math.max(query.length, 1)
    }
  })

  return matches
})

const activeSearchMatch = computed<TextMatch | null>(() =>
  searchMatches.value[activeSearchMatchIndex.value] ?? null
)

const searchResultPosition = computed(() =>
  activeSearchMatch.value ? activeSearchMatchIndex.value + 1 : 0
)

const highlightedPageSegments = computed<HighlightSegment[]>(() => {
  const pageText = currentPageText.value
  if (!pageText) return []

  const searchRanges = searchMatches.value.filter(match => match.pageIndex === currentPageIndex.value)
  const fieldRange = activeFieldHighlight.value?.pageIndex === currentPageIndex.value
    ? activeFieldHighlight.value
    : null
  const boundaries = new Set<number>([0, pageText.length])

  searchRanges.forEach((range) => {
    boundaries.add(range.start)
    boundaries.add(range.end)
  })
  if (fieldRange) {
    boundaries.add(fieldRange.start)
    boundaries.add(fieldRange.end)
  }

  const sortedBoundaries = [...boundaries]
    .filter(position => position >= 0 && position <= pageText.length)
    .sort((left, right) => left - right)

  return sortedBoundaries.slice(0, -1).map((start, index) => {
    const end = sortedBoundaries[index + 1] ?? pageText.length
    const fieldSource = Boolean(fieldRange && start >= fieldRange.start && end <= fieldRange.end)
    const searchResult = searchRanges.some(range => start >= range.start && end <= range.end)
    const activeSearchResult = Boolean(
      activeSearchMatch.value
      && activeSearchMatch.value.pageIndex === currentPageIndex.value
      && start >= activeSearchMatch.value.start
      && end <= activeSearchMatch.value.end
    )

    return {
      text: pageText.slice(start, end),
      highlighted: fieldSource || searchResult,
      fieldSource,
      searchResult,
      activeSearchResult,
    }
  })
})

watch(searchQuery, () => {
  activeSearchMatchIndex.value = -1
})

function fieldStatus(field: ContractField): { text: string; class: string } {
  if (field.reviewState === 'edited') {
    return { text: '已修正', class: 'bg-blue-100 text-blue-700' }
  }
  if (field.reviewState === 'verified') {
    return { text: '已確認', class: 'bg-violet-100 text-violet-700' }
  }

  switch (field.confidence) {
    case 'high':
      return { text: '辨識結果良好', class: 'bg-green-100 text-green-700' }
    case 'medium':
      return { text: '建議確認', class: 'bg-amber-100 text-amber-700' }
    case 'low':
      return { text: '需要人工確認', class: 'bg-red-100 text-red-700' }
  }
}

function fieldCardClass(field: ContractField): string {
  if (field.reviewState === 'edited') return 'border-blue-300 bg-blue-50'
  if (field.reviewState === 'verified') return 'border-violet-300 bg-violet-50'

  switch (field.confidence) {
    case 'high': return 'border-green-200 bg-green-50'
    case 'medium': return 'border-amber-300 bg-amber-50'
    case 'low': return 'border-red-300 bg-red-50'
  }
}

function startFieldEdit(field: ContractField): void {
  field.editStartValue = field.value === '尚未辨識' ? '' : field.value
  field.value = field.editStartValue
  field.editing = true
}

function replaceFirstInPages(pattern: RegExp, replacement: string): string | null {
  for (let pageIndex = 0; pageIndex < ocrPages.value.length; pageIndex += 1) {
    const pageText = ocrPages.value[pageIndex] ?? ''
    if (!pattern.test(pageText)) continue

    ocrPages.value[pageIndex] = pageText.replace(pattern, replacement)
    return replacement
  }
  return null
}

function syncFieldToContract(field: ContractField, newValue: string): boolean {
  const moneyValue = newValue.replace(/[^0-9０-９,，]/g, '')
  const dayValue = newValue.match(/[0-9０-９]{1,2}/)?.[0] ?? ''
  let insertedValue: string | null = null

  if (field.id === 'rent' && moneyValue) {
    insertedValue = replaceFirstInPages(
      /(月租金\s*[：:為]?\s*(?:新臺幣|新台幣|NT\$?)?\s*)[0-9０-９,，]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    return insertedValue !== null
  }

  if (field.id === 'deposit' && moneyValue) {
    insertedValue = replaceFirstInPages(
      /(押金[^\r\n]{0,60}?(?:新臺幣|新台幣|NT\$?)\s*)[0-9０-９,，]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    return insertedValue !== null
  }

  if (field.id === 'penalty' && moneyValue) {
    insertedValue = replaceFirstInPages(
      /(違約金\s*(?:新臺幣|新台幣|NT\$?)\s*)[0-9０-９,，]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) {
      field.sourceValue = moneyValue
      return true
    }
  }

  if (field.id === 'due_day' && dayValue) {
    insertedValue = replaceFirstInPages(
      /((?:租金\s*)?每月\s*)[0-9０-９]{1,2}(\s*日\s*前)/,
      `$1${dayValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = dayValue
    return insertedValue !== null
  }

  if (!field.sourceValue) {
    if (!ocrPages.value.length) return false
    const supplementalText = `【人工校對補充】${field.label}：${newValue}`
    ocrPages.value[0] = `${ocrPages.value[0]?.trimEnd() ?? ''}\n\n${supplementalText}`.trim()
    field.sourceValue = newValue
    return true
  }

  for (let pageIndex = 0; pageIndex < ocrPages.value.length; pageIndex += 1) {
    const pageText = ocrPages.value[pageIndex] ?? ''
    const sourceIndex = pageText.indexOf(field.sourceValue)
    if (sourceIndex < 0) continue

    ocrPages.value[pageIndex] = `${pageText.slice(0, sourceIndex)}${newValue}${pageText.slice(sourceIndex + field.sourceValue.length)}`
    field.sourceValue = newValue
    return true
  }

  return false
}

function confirmFieldEdit(field: ContractField): void {
  const nextValue = field.value.trim()
  if (!nextValue) {
    field.value = '尚未辨識'
    field.reviewState = 'unreviewed'
    field.editing = false
    return
  }

  if (nextValue !== field.editStartValue) {
    if (!syncFieldToContract(field, nextValue)) {
      saveError.value = `無法在契約全文定位「${field.label}」的原始文字，請先在左側編輯模式中修正。`
      return
    }
    Object.assign(field, locateFieldSource(field, ocrPages.value))
    field.reviewState = 'edited'
  } else {
    field.reviewState = 'verified'
  }

  field.editing = false
  saveError.value = ''
}

function verifyField(field: ContractField): void {
  if (field.value === '尚未辨識') {
    startFieldEdit(field)
    return
  }
  field.reviewState = 'verified'
}

function persistContract(): boolean {
  if (!storedOcrResult.value || !ocrFullText.value.trim()) return false

  const updatedResult: ContractOcrResult = {
    ...storedOcrResult.value,
    text: mergeContractPageTexts(ocrPages.value),
    pageCount: pageCount.value,
    pageTexts: [...ocrPages.value],
    fieldReviews: Object.fromEntries(
      fields.value.map(field => [field.id, {
        value: field.value,
        sourceValue: field.sourceValue,
        confidence: field.confidence,
        reviewState: field.reviewState,
        sourcePageIndex: field.sourcePageIndex,
        sourceStart: field.sourceStart,
        sourceEnd: field.sourceEnd,
      } satisfies ContractFieldReview]),
    ),
  }

  if (!saveContractOcrResult(updatedResult)) {
    saveError.value = '無法儲存契約內容，請確認瀏覽器允許工作階段儲存後再試。'
    return false
  }

  storedOcrResult.value = updatedResult
  isDirty.value = false
  isSaved.value = true
  isEditing.value = false
  saveError.value = ''
  return true
}

function handleSave(): void {
  persistContract()
}

async function goToPage(pageIndex: number): Promise<void> {
  if (pageIndex < 0 || pageIndex >= pageCount.value) return
  currentPageIndex.value = pageIndex

  await nextTick()
  const activePageButton = pageNumberScrollRef.value?.querySelector<HTMLElement>('[aria-current="page"]')
  activePageButton?.scrollIntoView({
    block: 'nearest',
    inline: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function goToPreviousPage(): void {
  void goToPage(currentPageIndex.value - 1)
}

function goToNextPage(): void {
  void goToPage(currentPageIndex.value + 1)
}

async function scrollToHighlight(): Promise<void> {
  await nextTick()
  const highlight = document.querySelector<HTMLElement>('.pdf-page .reader-highlight--target')
  highlight?.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

async function revealFieldSource(field: ContractField): Promise<void> {
  const locatedField = locateFieldSource(field, ocrPages.value)
  Object.assign(field, locatedField)

  if (field.sourcePageIndex === null || field.sourceStart < 0) {
    saveError.value = `目前找不到「${field.label}」在契約中的來源文字，可能已在編輯模式中被移除。`
    return
  }

  isEditing.value = false
  saveError.value = ''
  activeSearchMatchIndex.value = -1
  activeFieldHighlight.value = {
    pageIndex: field.sourcePageIndex,
    start: field.sourceStart,
    end: field.sourceEnd,
  }
  await goToPage(field.sourcePageIndex)
  await scrollToHighlight()
}

async function moveToSearchResult(direction: 1 | -1): Promise<void> {
  const matches = searchMatches.value
  if (!matches.length) {
    activeSearchMatchIndex.value = -1
    return
  }

  const currentIndex = activeSearchMatchIndex.value
  activeSearchMatchIndex.value = currentIndex < 0
    ? direction === 1 ? 0 : matches.length - 1
    : (currentIndex + direction + matches.length) % matches.length

  const match = matches[activeSearchMatchIndex.value]
  if (!match) return

  isEditing.value = false
  activeFieldHighlight.value = null
  await goToPage(match.pageIndex)
  await scrollToHighlight()
}

function clearSearch(): void {
  searchQuery.value = ''
  activeSearchMatchIndex.value = -1
}

const router = useRouter()
function completeReviewAndAnalyze(): void {
  if (!canStartAnalysis.value || !persistContract()) return
  router.push('/app/contract-analysis')
}

function returnToOcr(): void {
  router.push('/app/contract')
}
</script>

<template>
  <div class="contract-editor-page">
    <div class="editor-header">
      <div class="editor-heading">
        <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText class="text-primary" />
          契約電子檔編輯
        </h1>
      </div>
      <div class="editor-actions">
        <Button variant="outline" :disabled="!hasOcrData" @click="isEditing = !isEditing">
          <PenLine v-if="!isEditing" data-icon="inline-start" />
          <Eye v-else data-icon="inline-start" />
          {{ isEditing ? '預覽模式' : '編輯模式' }}
        </Button>
        <Button @click="handleSave" :disabled="!hasOcrData || (isSaved && !isDirty)">
          <Save data-icon="inline-start" />
          確認儲存
        </Button>
      </div>
    </div>

    <div
      v-if="!hasOcrData"
      class="flex items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
    >
      <div class="flex items-center gap-3">
        <AlertTriangle class="shrink-0 text-red-600" :size="20" />
        <span class="text-sm text-red-800">找不到 OCR 辨識結果，請返回契約辨識頁重新上傳文件。</span>
      </div>
      <Button size="sm" variant="outline" @click="returnToOcr">返回 OCR</Button>
    </div>

    <section v-if="hasOcrData" class="review-summary" aria-labelledby="review-summary-title">
      <div class="review-summary-header">
        <div>
          <p class="review-summary-kicker">OCR 辨識完成</p>
          <h2 id="review-summary-title">契約校對摘要</h2>
        </div>
        <strong class="review-progress-value">{{ reviewProgress }}%</strong>
      </div>

      <div class="review-stat-grid">
        <div class="review-stat">
          <span>已擷取欄位</span>
          <strong>{{ extractedCount }} / {{ fields.length }}</strong>
        </div>
        <div class="review-stat">
          <span>已確認或修正</span>
          <strong>{{ verifiedCount }}</strong>
        </div>
        <div class="review-stat review-stat--warning">
          <span>建議確認</span>
          <strong>{{ mediumConfidenceCount }}</strong>
        </div>
        <div class="review-stat review-stat--danger">
          <span>需要人工確認</span>
          <strong>{{ lowConfidenceCount }}</strong>
        </div>
      </div>

      <div class="review-progress-track" role="progressbar" aria-label="契約校對完成度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="reviewProgress">
        <div class="review-progress-bar" :style="{ width: `${reviewProgress}%` }" />
      </div>

      <div class="review-summary-footer">
        <p v-if="requiredRemainingCount">
          尚有 <strong>{{ requiredRemainingCount }}</strong> 個必填欄位需要確認，完成後才能進入下一步。
        </p>
        <p v-else>所有必填欄位皆已確認，可以開始 AI 契約分析。</p>
        <Button :disabled="!canStartAnalysis" @click="completeReviewAndAnalyze">
          完成校對並開始 AI 契約分析
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </section>

    <div
      v-if="saveError"
      class="editor-notice editor-notice--error"
      role="alert"
    >
      <div class="flex items-center gap-3">
        <AlertTriangle class="shrink-0 text-red-600" :size="20" />
        <span class="text-sm text-red-800">{{ saveError }}</span>
      </div>
    </div>

    <div class="editor-layout">
      <Card class="contract-document-card">
        <CardHeader class="document-reader-heading">
          <CardTitle class="flex items-center gap-2 text-lg">
            <FileText :size="18" />
            契約 PDF 閱讀器
          </CardTitle>
          <CardDescription>一次顯示一頁 OCR 內容，可使用頁碼切換與逐頁修改</CardDescription>
        </CardHeader>
        <div class="pdf-search-bar" role="search">
          <Search :size="16" class="pdf-search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            class="pdf-search-input"
            placeholder="搜尋契約文字"
            aria-label="搜尋契約全文"
            @keydown.enter.prevent="moveToSearchResult($event.shiftKey ? -1 : 1)"
            @keydown.esc="clearSearch"
          />
          <span v-if="searchQuery.trim()" class="pdf-search-count" aria-live="polite">
            {{ searchResultPosition }} / {{ searchMatches.length }}
          </span>
          <button
            type="button"
            class="pdf-search-button"
            :disabled="!searchMatches.length"
            aria-label="上一個搜尋結果"
            title="上一個搜尋結果（Shift + Enter）"
            @click="moveToSearchResult(-1)"
          >
            <ChevronLeft :size="16" />
          </button>
          <button
            type="button"
            class="pdf-search-button"
            :disabled="!searchMatches.length"
            aria-label="下一個搜尋結果"
            title="下一個搜尋結果（Enter）"
            @click="moveToSearchResult(1)"
          >
            <ChevronRight :size="16" />
          </button>
          <button
            v-if="searchQuery"
            type="button"
            class="pdf-search-button"
            aria-label="清除搜尋"
            title="清除搜尋"
            @click="clearSearch"
          >
            <X :size="16" />
          </button>
        </div>
        <CardContent class="document-reader-content">
          <div v-if="pageCount" class="pdf-reader-toolbar">
            <div class="pdf-file-info">
              <strong>{{ storedOcrResult?.fileName || 'OCR 契約文件' }}</strong>
              <span>第 {{ currentPageNumber }} 頁，共 {{ pageCount }} 頁</span>
            </div>

            <nav class="pdf-pagination" aria-label="契約頁面切換">
              <button
                type="button"
                class="page-nav-button"
                :disabled="currentPageIndex === 0"
                aria-label="上一頁"
                @click="goToPreviousPage"
              >
                <ChevronLeft :size="17" />
              </button>

              <div
                ref="pageNumberScrollRef"
                class="page-number-scroll"
                aria-label="契約頁碼"
              >
                <button
                  v-for="(_, pageIndex) in ocrPages"
                  :key="pageIndex"
                  type="button"
                  class="page-number-button"
                  :class="{ 'is-active': pageIndex === currentPageIndex }"
                  :aria-current="pageIndex === currentPageIndex ? 'page' : undefined"
                  :aria-label="`前往第 ${pageIndex + 1} 頁`"
                  @click="goToPage(pageIndex)"
                >
                  {{ pageIndex + 1 }}
                </button>
              </div>

              <button
                type="button"
                class="page-nav-button"
                :disabled="currentPageIndex === pageCount - 1"
                aria-label="下一頁"
                @click="goToNextPage"
              >
                <ChevronRight :size="17" />
              </button>
            </nav>

            <p class="sr-only" aria-live="polite">
              目前顯示第 {{ currentPageNumber }} 頁，共 {{ pageCount }} 頁
            </p>
          </div>

          <div v-if="pageCount" class="pdf-reader-canvas">
            <section class="pdf-page" :aria-label="`契約第 ${currentPageNumber} 頁`">
              <div class="pdf-page-marker">{{ currentPageNumber }}</div>
              <textarea
                v-if="isEditing"
                v-model="currentPageText"
                class="pdf-page-editor"
                :aria-label="`編輯契約第 ${currentPageNumber} 頁`"
              />
              <div v-else class="pdf-page-text">
                <template v-if="currentPageText">
                  <template v-for="(segment, segmentIndex) in highlightedPageSegments" :key="segmentIndex">
                    <mark
                      v-if="segment.highlighted"
                      class="reader-highlight"
                      :class="{
                        'reader-highlight--field': segment.fieldSource,
                        'reader-highlight--search': segment.searchResult,
                        'reader-highlight--active-search': segment.activeSearchResult,
                        'reader-highlight--target': segment.fieldSource || segment.activeSearchResult,
                      }"
                    >{{ segment.text }}</mark>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </template>
                <template v-else>此頁沒有辨識到文字，請切換至編輯模式手動補充。</template>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>

      <div class="editor-side-column">
        <Card>
          <CardHeader class="field-panel-header">
            <div class="field-panel-title-row">
              <CardTitle class="flex items-center gap-2 text-lg">
                <Edit3 :size="18" />
                關鍵欄位
              </CardTitle>
              <details class="field-status-help">
                <summary>
                  <Info :size="15" />
                  狀態說明
                </summary>
                <div class="field-status-popover">
                  <p class="field-status-popover-title">欄位狀態說明</p>
                  <div class="field-status-legend">
                    <div><span class="status-dot status-dot--good" />辨識結果良好 — 仍請核對原始契約</div>
                    <div><span class="status-dot status-dot--medium" />建議確認 — 系統擷取結果需再次確認</div>
                    <div><span class="status-dot status-dot--low" />需要人工確認 — 請查看原始內容</div>
                    <div><span class="status-dot status-dot--verified" />已確認 — 使用者已完成核對</div>
                    <div><span class="status-dot status-dot--edited" />已修正 — 修改已同步至左側契約</div>
                  </div>
                </div>
              </details>
            </div>
            <CardDescription>系統自動擷取的欄位，點擊可修改</CardDescription>
          </CardHeader>

          <div class="field-filter-bar" aria-label="依欄位狀態篩選">
            <button
              v-for="filter in fieldFilters"
              :key="filter.id"
              type="button"
              class="field-filter-button"
              :class="{ 'is-active': activeFieldFilter === filter.id }"
              :aria-pressed="activeFieldFilter === filter.id"
              @click="activeFieldFilter = filter.id"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
          </div>

          <CardContent class="field-list">
            <div
              v-for="field in filteredFields"
              :key="field.id"
              class="contract-field-card rounded-lg border p-3 transition-colors"
              :class="fieldCardClass(field)"
            >
              <div class="field-card-header">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ field.label }}
                  <span v-if="field.required" class="required-mark">必填</span>
                </span>
                <div class="field-card-badges">
                  <button
                    v-if="field.sourcePageIndex !== null"
                    type="button"
                    class="field-source-page"
                    :aria-label="`前往${field.label}的來源第 ${field.sourcePageIndex + 1} 頁`"
                    :title="`在左側顯示並標記第 ${field.sourcePageIndex + 1} 頁原文`"
                    @click="revealFieldSource(field)"
                  >
                    第 {{ field.sourcePageIndex + 1 }} 頁
                  </button>
                  <span v-else class="field-source-page field-source-page--missing">
                    來源未定位
                  </span>
                  <Badge
                    variant="secondary"
                    class="text-xs"
                    :class="fieldStatus(field).class"
                  >
                    {{ fieldStatus(field).text }}
                  </Badge>
                </div>
              </div>

              <div v-if="field.editing" class="field-edit-row">
                <input
                  v-model="field.value"
                  class="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  @keyup.enter="confirmFieldEdit(field)"
                />
                <Button size="sm" variant="ghost" aria-label="確認欄位修改" @click="confirmFieldEdit(field)">
                  <CheckCircle :size="16" class="text-green-600" />
                </Button>
              </div>
              <div v-else class="field-value-row">
                <span class="text-sm font-semibold text-foreground">
                  {{ field.value }}
                </span>
                <div class="field-actions">
                  <button type="button" class="field-action-button" @click="verifyField(field)">
                    <CheckCircle :size="14" />
                    確認
                  </button>
                  <button type="button" class="field-action-button" @click="startFieldEdit(field)">
                    <PenLine :size="14" />
                    修改
                  </button>
                </div>
              </div>
            </div>
            <p v-if="!filteredFields.length" class="field-filter-empty">
              目前沒有符合此狀態的欄位
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped src="./editor.css"></style>
