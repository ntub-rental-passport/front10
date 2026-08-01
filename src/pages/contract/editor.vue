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
import {
  extractContractFieldCandidates,
  validateTaiwanAddressInput,
  type ContractFieldCandidate,
} from '@/src/utils/contract-field-extraction'
import {
  CONTRACT_FIELD_DEFINITIONS,
  CONTRACT_FIELD_GROUPS,
  detectContractConditions,
} from '@/shared/contract-field-schema.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card/index'
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
  groupId: string
  label: string
  value: string
  sourceValue: string
  confidence: 'high' | 'medium' | 'low'
  reviewState: 'unreviewed' | 'verified' | 'edited'
  required: boolean
  requirement: 'required' | 'conditional' | 'recommended'
  condition: string | null
  applicable: boolean
  editing: boolean
  editStartValue: string
  sourcePageIndex: number | null
  sourceStart: number
  sourceEnd: number
  googleConfidence: number | null
  formatValid: boolean | null
  labelDistanceNormal: boolean | null
  reviewSource: 'rules' | 'ai' | null
  evidenceType: 'ocr_text' | 'image' | 'administrative_inference' | 'road_inference' | null
  addressResolution: ContractFieldReview['addressResolution'] | null
  validationError: string
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

function makeField(
  definition: {
    id: string
    groupId: string
    label: string
    requirement: 'required' | 'conditional' | 'recommended'
    condition: string | null
  },
  captured: ContractFieldCandidate,
  conditions: Record<string, boolean>,
): ContractField {
  const conditionApplies = !definition.condition || Boolean(conditions[definition.condition])
  const applicable = definition.requirement !== 'conditional' || conditionApplies
  const required =
    definition.requirement === 'required' ||
    (definition.requirement === 'conditional' && conditionApplies)

  return {
    id: definition.id,
    groupId: definition.groupId,
    label: definition.label,
    value: captured.value || '尚未辨識',
    sourceValue: captured.sourceValue,
    confidence: captured.value ? captured.confidence : 'low',
    reviewState: 'unreviewed',
    required,
    requirement: definition.requirement,
    condition: definition.condition,
    applicable,
    editing: false,
    editStartValue: captured.value || '',
    sourcePageIndex: null,
    sourceStart: -1,
    sourceEnd: -1,
    googleConfidence: null,
    formatValid: null,
    labelDistanceNormal: null,
    reviewSource: null,
    evidenceType: captured.addressResolution?.evidenceType ?? null,
    addressResolution: captured.addressResolution ?? null,
    validationError: '',
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findContextualFieldSource(
  field: ContractField,
  pageText: string,
): { sourceValue: string; sourceStart: number; sourceEnd: number } | null {
  if (field.id !== 'due_day') return null

  const monthEndMatch = pageText.match(/每月(?:底|月)\s*(?:以)?前/)
  if (monthEndMatch?.[0] && /每月底前/.test(field.value)) {
    const sourceStart = monthEndMatch.index ?? 0
    return {
      sourceValue: monthEndMatch[0],
      sourceStart,
      sourceEnd: sourceStart + monthEndMatch[0].length,
    }
  }

  const dayValue = (field.sourceValue || field.value).match(/[0-9０-９]{1,2}/)?.[0]
  if (!dayValue) return null

  // 繳租日只有一個數字時很容易誤中身分證、地址或電話，必須連同「每月／日前」語境定位。
  const pattern = new RegExp(`(?:租金\\s*)?(每月\\s*${escapeRegExp(dayValue)}\\s*日\\s*前)`)
  const match = pageText.match(pattern)
  const sourceValue = match?.[1]
  if (!match || !sourceValue) return null

  const sourceStart = (match.index ?? 0) + match[0].indexOf(sourceValue)
  return {
    sourceValue,
    sourceStart,
    sourceEnd: sourceStart + sourceValue.length,
  }
}

function locateFieldSource(field: ContractField, pages: string[]): ContractField {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const contextualSource = findContextualFieldSource(field, pages[pageIndex] ?? '')
    if (!contextualSource) continue

    return {
      ...field,
      ...contextualSource,
      sourcePageIndex: pageIndex,
    }
  }

  // 找不到完整繳租日語境時寧可標示未定位，也不能退回搜尋單一數字而標錯位置。
  if (field.id === 'due_day') {
    return {
      ...field,
      sourcePageIndex: null,
      sourceStart: -1,
      sourceEnd: -1,
    }
  }

  const candidates = [field.sourceValue, field.value]
    .map((value) => value.trim())
    .filter((value) => value && value !== '尚未辨識')

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
  const extracted = extractContractFieldCandidates(text)
  const conditions = detectContractConditions(text) as Record<string, boolean>

  return CONTRACT_FIELD_DEFINITIONS.map((definition) =>
    makeField(
      definition as Parameters<typeof makeField>[0],
      extracted[definition.candidateKey] ?? { value: '', sourceValue: '', confidence: 'low' },
      conditions,
    ),
  )
}

const fields = ref<ContractField[]>(
  extractContractFields(ocrFullText.value).map((extractedField) => {
    const field = locateFieldSource(extractedField, ocrPages.value)
    const savedReview = storedOcrResult.value?.fieldReviews?.[field.id]
    if (!savedReview) return field

    const savedHasValue = Boolean(
      savedReview.value?.trim() && savedReview.value.trim() !== '尚未辨識',
    )
    // 未確認的空白舊資料不可覆蓋新版抽取結果；使用者已確認或修改的內容仍優先保留。
    if (!savedHasValue && savedReview.reviewState === 'unreviewed') return field

    return locateFieldSource(
      {
        ...field,
        value: savedReview.value,
        sourceValue: savedReview.sourceValue,
        confidence: savedReview.confidence,
        reviewState: savedReview.reviewState,
        editStartValue: savedReview.value,
        sourcePageIndex: savedReview.sourcePageIndex ?? field.sourcePageIndex,
        sourceStart: savedReview.sourceStart ?? field.sourceStart,
        sourceEnd: savedReview.sourceEnd ?? field.sourceEnd,
        googleConfidence: savedReview.googleConfidence ?? null,
        formatValid: savedReview.formatValid ?? null,
        labelDistanceNormal: savedReview.labelDistanceNormal ?? null,
        reviewSource: savedReview.reviewSource ?? null,
        evidenceType: savedReview.evidenceType ?? field.evidenceType,
        addressResolution: savedReview.addressResolution ?? field.addressResolution,
      },
      ocrPages.value,
    )
  }),
)

const isEditing = ref(false)
const isSaved = ref(false)
const isDirty = ref(false)
const saveError = ref('')
const pageNumberScrollRef = ref<HTMLElement | null>(null)
const activeFieldFilter = ref<FieldFilter>('all')
const activeFieldGroupId = ref(CONTRACT_FIELD_GROUPS[0]?.id ?? 'review')
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
  () => fields.value.map((field) => `${field.value}:${field.reviewState}`),
  () => {
    isDirty.value = true
    isSaved.value = false
    saveError.value = ''
  },
)

function isFieldPopulated(field: ContractField): boolean {
  return Boolean(field.value.trim() && field.value !== '尚未辨識')
}

function isFieldCompleted(field: ContractField): boolean {
  return isFieldPopulated(field) && field.reviewState !== 'unreviewed'
}

const applicableFields = computed(() => fields.value.filter((field) => field.applicable))
const requiredFields = computed(() => applicableFields.value.filter((field) => field.required))
const extractedCount = computed(() => applicableFields.value.filter(isFieldPopulated).length)
const recommendedFieldCount = computed(
  () => applicableFields.value.filter((field) => !field.required).length,
)
const extractionProgress = computed(() =>
  applicableFields.value.length
    ? Math.round((extractedCount.value / applicableFields.value.length) * 100)
    : 0,
)
const completedRequiredCount = computed(() => requiredFields.value.filter(isFieldCompleted).length)
const reviewProgress = computed(() =>
  requiredFields.value.length
    ? Math.round((completedRequiredCount.value / requiredFields.value.length) * 100)
    : 0,
)
const missingRequiredCount = computed(
  () => requiredFields.value.filter((field) => !isFieldPopulated(field)).length,
)
const pendingRequiredReviewCount = computed(
  () =>
    requiredFields.value.filter(
      (field) => isFieldPopulated(field) && field.reviewState === 'unreviewed',
    ).length,
)
const requiredRemainingCount = computed(
  () => requiredFields.value.filter((field) => !isFieldCompleted(field)).length,
)
const canStartAnalysis = computed(() => hasOcrData.value && requiredRemainingCount.value === 0)

const activeGroupFields = computed(() =>
  applicableFields.value.filter((field) => field.groupId === activeFieldGroupId.value),
)
const filteredFields = computed(() =>
  activeGroupFields.value.filter((field) => {
    switch (activeFieldFilter.value) {
      case 'good':
        return (
          isFieldPopulated(field) &&
          field.confidence === 'high' &&
          field.reviewState === 'unreviewed'
        )
      case 'medium':
        return (
          isFieldPopulated(field) &&
          field.confidence !== 'high' &&
          field.reviewState === 'unreviewed'
        )
      case 'low':
        return !isFieldPopulated(field)
      case 'reviewed':
        return field.reviewState !== 'unreviewed'
      default:
        return true
    }
  }),
)

const fieldFilters = computed<Array<{ id: FieldFilter; label: string; count: number }>>(() => [
  { id: 'all', label: '本類全部', count: activeGroupFields.value.length },
  {
    id: 'good',
    label: '高信心待確認',
    count: activeGroupFields.value.filter(
      (field) =>
        isFieldPopulated(field) &&
        field.confidence === 'high' &&
        field.reviewState === 'unreviewed',
    ).length,
  },
  {
    id: 'medium',
    label: '建議確認',
    count: activeGroupFields.value.filter(
      (field) =>
        isFieldPopulated(field) &&
        field.confidence !== 'high' &&
        field.reviewState === 'unreviewed',
    ).length,
  },
  {
    id: 'low',
    label: '缺少資料',
    count: activeGroupFields.value.filter((field) => !isFieldPopulated(field)).length,
  },
  {
    id: 'reviewed',
    label: '已處理',
    count: activeGroupFields.value.filter((field) => field.reviewState !== 'unreviewed').length,
  },
])

const fieldGroups = computed(() =>
  CONTRACT_FIELD_GROUPS.map((group) => {
    const groupFields = applicableFields.value.filter((field) => field.groupId === group.id)
    const groupRequiredFields = groupFields.filter((field) => field.required)
    return {
      ...group,
      active: groupFields.length > 0,
      completedCount: groupRequiredFields.filter(isFieldCompleted).length,
      requiredCount: groupRequiredFields.length,
      missingCount: groupRequiredFields.filter((field) => !isFieldPopulated(field)).length,
    }
  }),
)

const activeFieldGroup = computed(
  () =>
    fieldGroups.value.find((group) => group.id === activeFieldGroupId.value) ??
    fieldGroups.value[0],
)

const batchConfirmableFields = computed(() =>
  activeGroupFields.value.filter(
    (field) =>
      isFieldPopulated(field) &&
      field.reviewState === 'unreviewed' &&
      field.confidence === 'high' &&
      field.formatValid !== false &&
      field.labelDistanceNormal !== false &&
      !validateLegalField(field),
  ),
)

function selectFieldGroup(groupId: string): void {
  activeFieldGroupId.value = groupId
  activeFieldFilter.value = 'all'
}

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

const activeSearchMatch = computed<TextMatch | null>(
  () => searchMatches.value[activeSearchMatchIndex.value] ?? null,
)

const searchResultPosition = computed(() =>
  activeSearchMatch.value ? activeSearchMatchIndex.value + 1 : 0,
)

const highlightedPageSegments = computed<HighlightSegment[]>(() => {
  const pageText = currentPageText.value
  if (!pageText) return []

  const searchRanges = searchMatches.value.filter(
    (match) => match.pageIndex === currentPageIndex.value,
  )
  const fieldRange =
    activeFieldHighlight.value?.pageIndex === currentPageIndex.value
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
    .filter((position) => position >= 0 && position <= pageText.length)
    .sort((left, right) => left - right)

  return sortedBoundaries.slice(0, -1).map((start, index) => {
    const end = sortedBoundaries[index + 1] ?? pageText.length
    const fieldSource = Boolean(fieldRange && start >= fieldRange.start && end <= fieldRange.end)
    const searchResult = searchRanges.some((range) => start >= range.start && end <= range.end)
    const activeSearchResult = Boolean(
      activeSearchMatch.value &&
      activeSearchMatch.value.pageIndex === currentPageIndex.value &&
      start >= activeSearchMatch.value.start &&
      end <= activeSearchMatch.value.end,
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
  if (!isFieldPopulated(field)) {
    return { text: '缺少資料', class: 'bg-red-100 text-red-700' }
  }

  switch (field.confidence) {
    case 'high':
      return { text: '待確認・高信心', class: 'bg-emerald-100 text-emerald-700' }
    case 'medium':
      return { text: '建議確認', class: 'bg-amber-100 text-amber-700' }
    case 'low':
      return { text: '需要人工確認', class: 'bg-red-100 text-red-700' }
  }
}

function fieldCardClass(field: ContractField): string {
  if (field.reviewState === 'edited') return 'border-blue-300 bg-blue-50'
  if (field.reviewState === 'verified') return 'border-violet-300 bg-violet-50'
  if (!isFieldPopulated(field)) return 'border-red-300 bg-red-50'

  switch (field.confidence) {
    case 'high':
      return 'border-green-200 bg-green-50'
    case 'medium':
      return 'border-amber-300 bg-amber-50'
    case 'low':
      return 'border-red-300 bg-red-50'
  }
}

function startFieldEdit(field: ContractField): void {
  field.editStartValue = field.value === '尚未辨識' ? '' : field.value
  field.value = field.editStartValue
  field.validationError = ''
  saveError.value = ''
  field.editing = true
}

function parseNumericValue(value: string): number {
  return Number(value.replace(/[^0-9]/g, '')) || 0
}

function validateLegalField(field: ContractField, value = field.value.trim()): string {
  if (!value || value === '尚未辨識') return field.required ? `請補上「${field.label}」。` : ''

  if (field.id === 'review_days' && parseNumericValue(value) < 3) {
    return '契約審閱期間不得少於 3 日。'
  }
  if (field.id === 'deposit_months' && parseNumericValue(value) > 2) {
    return '押金最高不得超過 2 個月租金。'
  }
  if (field.id === 'deposit') {
    const rentField = fields.value.find((item) => item.id === 'rent')
    const rentAmount = rentField ? parseNumericValue(rentField.value) : 0
    const depositAmount = parseNumericValue(value)
    if (rentAmount && depositAmount > rentAmount * 2) {
      return `押金金額不得超過 2 個月租金（目前上限 NT$${(rentAmount * 2).toLocaleString('en-US')}）。`
    }
  }
  if (/(?:landlord|tenant|agent)_id$/.test(field.id)) {
    const normalized = value.replace(/\s/g, '')
    if (!/^(?:[A-Z][12]\d{8}|\d{8}|[A-Z0-9-]{6,20})$/i.test(normalized)) {
      return '請確認身分證明文件編號或統一編號格式。'
    }
  }
  if (/(?:landlord|tenant)_phone$/.test(field.id) && value.replace(/\D/g, '').length < 7) {
    return '聯絡電話格式不完整。'
  }
  return ''
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

  if (field.id === 'rent' && moneyValue) {
    const insertedValue = replaceFirstInPages(
      /((?:租金每個月|每月租金|月租金|租金\s*[：:]?\s*每月)\s*[：:為]?\s*(?:新臺幣|新台幣|NT\$?)?\s*)[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    return insertedValue !== null
  }

  if (field.id === 'deposit' && moneyValue) {
    const insertedValue = replaceFirstInPages(
      /((?:押租保證金|押金|保證金)[^\r\n]{0,60}?(?:新臺幣|新台幣|NT\$?)\s*)[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    return insertedValue !== null
  }

  if (field.id === 'due_day' && dayValue) {
    const insertedValue = replaceFirstInPages(
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

    ocrPages.value[pageIndex] =
      `${pageText.slice(0, sourceIndex)}${newValue}${pageText.slice(sourceIndex + field.sourceValue.length)}`
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

  const legalValidationError = validateLegalField(field, nextValue)
  if (legalValidationError) {
    field.validationError = legalValidationError
    saveError.value = legalValidationError
    return
  }

  if (field.id === 'address') {
    const validation = validateTaiwanAddressInput(nextValue, {
      contractText: ocrFullText.value,
    })
    if (!validation.valid) {
      field.validationError = validation.message
      saveError.value = validation.message
      return
    }
    field.validationError = ''
  }

  if (nextValue !== field.editStartValue) {
    if (!syncFieldToContract(field, nextValue)) {
      saveError.value = `無法在契約全文定位「${field.label}」的原始文字，請先在左側編輯模式中修正。`
      return
    }
    Object.assign(field, locateFieldSource(field, ocrPages.value))
    if (field.id === 'address') {
      field.addressResolution = null
      field.evidenceType = 'ocr_text'
    }
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
  const legalValidationError = validateLegalField(field)
  if (legalValidationError) {
    field.validationError = legalValidationError
    saveError.value = legalValidationError
    return
  }
  field.validationError = ''
  saveError.value = ''
  field.reviewState = 'verified'
}

function confirmActiveGroupHighConfidence(): void {
  if (!batchConfirmableFields.value.length) return
  batchConfirmableFields.value.forEach((field) => {
    field.validationError = ''
    field.reviewState = 'verified'
  })
  saveError.value = ''
}

function persistContract(): boolean {
  if (!storedOcrResult.value || !ocrFullText.value.trim()) return false

  const activeEdit = fields.value.find((field) => field.editing)
  if (activeEdit) {
    activeEdit.validationError = '請先完成此欄位的修改與驗證，再儲存契約。'
    saveError.value = activeEdit.validationError
    return false
  }

  const addressField = fields.value.find((field) => field.id === 'address')
  if (addressField && addressField.value !== '尚未辨識') {
    const validation = validateTaiwanAddressInput(addressField.value, {
      contractText: ocrFullText.value,
    })
    if (!validation.valid) {
      addressField.validationError = validation.message
      saveError.value = validation.message
      return false
    }
    addressField.validationError = ''
  }

  for (const field of applicableFields.value.filter((item) => item.required)) {
    const validationError = validateLegalField(field)
    if (!validationError) continue
    field.validationError = validationError
    activeFieldGroupId.value = field.groupId
    saveError.value = validationError
    return false
  }

  const updatedResult: ContractOcrResult = {
    ...storedOcrResult.value,
    text: mergeContractPageTexts(ocrPages.value),
    pageCount: pageCount.value,
    pageTexts: [...ocrPages.value],
    fieldReviews: Object.fromEntries(
      fields.value.map((field) => [
        field.id,
        {
          value: field.value,
          sourceValue: field.sourceValue,
          confidence: field.confidence,
          reviewState: field.reviewState,
          sourcePageIndex: field.sourcePageIndex,
          sourceStart: field.sourceStart,
          sourceEnd: field.sourceEnd,
          googleConfidence: field.googleConfidence ?? undefined,
          formatValid: field.formatValid ?? undefined,
          labelDistanceNormal: field.labelDistanceNormal ?? undefined,
          reviewSource: field.reviewSource ?? undefined,
          evidenceType: field.evidenceType ?? undefined,
          addressResolution: field.addressResolution ?? undefined,
        } satisfies ContractFieldReview,
      ]),
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
  const activePageButton =
    pageNumberScrollRef.value?.querySelector<HTMLElement>('[aria-current="page"]')
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
  activeSearchMatchIndex.value =
    currentIndex < 0
      ? direction === 1
        ? 0
        : matches.length - 1
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
        <span class="text-sm text-red-800"
          >找不到 OCR 辨識結果，請返回契約辨識頁重新上傳文件。</span
        >
      </div>
      <Button size="sm" variant="outline" @click="returnToOcr">返回 OCR</Button>
    </div>

    <section v-if="hasOcrData" class="review-summary" aria-labelledby="review-summary-title">
      <div class="review-summary-header">
        <div>
          <p class="review-summary-kicker">OCR 辨識完成</p>
          <h2 id="review-summary-title">契約校對摘要</h2>
        </div>
        <div class="review-progress-display">
          <span>必填人工校對</span>
          <strong class="review-progress-value">{{ reviewProgress }}%</strong>
        </div>
      </div>

      <div class="review-stat-grid">
        <div class="review-stat">
          <span>OCR 資料擷取</span>
          <strong>{{ extractedCount }} / {{ applicableFields.length }}</strong>
          <small>{{ extractionProgress }}% 已找到內容</small>
        </div>
        <div class="review-stat">
          <span>必填人工校對</span>
          <strong>{{ completedRequiredCount }} / {{ requiredFields.length }}</strong>
          <small>確認或修正後才計入</small>
        </div>
        <div class="review-stat review-stat--warning">
          <span>已有值、待確認</span>
          <strong>{{ pendingRequiredReviewCount }}</strong>
        </div>
        <div class="review-stat review-stat--danger">
          <span>缺少必填資料</span>
          <strong>{{ missingRequiredCount }}</strong>
        </div>
      </div>

      <div
        class="review-progress-track"
        role="progressbar"
        aria-label="契約校對完成度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="reviewProgress"
      >
        <div class="review-progress-bar" :style="{ width: `${reviewProgress}%` }" />
      </div>

      <div class="review-summary-footer">
        <div class="review-summary-copy">
          <p>
            本契約適用 {{ applicableFields.length }} 個欄位：{{ requiredFields.length }} 個必填、{{
              recommendedFieldCount
            }} 個建議填寫。
          </p>
          <p v-if="requiredRemainingCount">
            尚缺 <strong>{{ missingRequiredCount }}</strong> 個必填資料，另有
            <strong>{{ pendingRequiredReviewCount }}</strong> 個欄位待確認。
          </p>
          <p v-else>所有必填欄位皆已確認，可以開始 AI 契約分析。</p>
        </div>
        <Button :disabled="!canStartAnalysis" @click="completeReviewAndAnalyze">
          完成校對並開始 AI 契約分析
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </section>

    <div v-if="saveError" class="editor-notice editor-notice--error" role="alert">
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

              <div ref="pageNumberScrollRef" class="page-number-scroll" aria-label="契約頁碼">
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
                  <template
                    v-for="(segment, segmentIndex) in highlightedPageSegments"
                    :key="segmentIndex"
                  >
                    <mark
                      v-if="segment.highlighted"
                      class="reader-highlight"
                      :class="{
                        'reader-highlight--field': segment.fieldSource,
                        'reader-highlight--search': segment.searchResult,
                        'reader-highlight--active-search': segment.activeSearchResult,
                        'reader-highlight--target':
                          segment.fieldSource || segment.activeSearchResult,
                      }"
                      >{{ segment.text }}</mark
                    >
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
                    <div>
                      <span class="status-dot status-dot--good" />待確認・高信心 — 可批次確認
                    </div>
                    <div>
                      <span class="status-dot status-dot--medium" />建議確認 —
                      系統擷取結果需再次確認
                    </div>
                    <div>
                      <span class="status-dot status-dot--low" />缺少資料／人工確認 — 請填寫或核對
                    </div>
                    <div>
                      <span class="status-dot status-dot--verified" />已確認 — 使用者已完成核對
                    </div>
                    <div>
                      <span class="status-dot status-dot--edited" />已修正 — 修改已同步至左側契約
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <CardDescription>依現行住宅租賃規範分類，逐組補齊並確認</CardDescription>
          </CardHeader>

          <nav class="field-group-nav" aria-label="法規欄位分類">
            <button
              v-for="group in fieldGroups"
              :key="group.id"
              type="button"
              class="field-group-button"
              :class="{
                'is-active': activeFieldGroupId === group.id,
                'is-inactive': !group.active,
                'has-missing': group.missingCount > 0,
              }"
              :aria-current="activeFieldGroupId === group.id ? 'step' : undefined"
              @click="selectFieldGroup(group.id)"
            >
              <span class="field-group-index">{{ group.order }}</span>
              <span class="field-group-label">
                <strong>{{ group.shortTitle }}</strong>
                <small v-if="group.requiredCount">
                  <template v-if="group.missingCount">缺 {{ group.missingCount }} 項</template>
                  <template v-else>{{ group.completedCount }}/{{ group.requiredCount }} 已校對</template>
                </small>
                <small v-else>{{ group.conditional ? '未偵測適用情境' : '建議確認' }}</small>
              </span>
            </button>
          </nav>

          <div class="active-field-group-heading">
            <div>
              <span>第 {{ activeFieldGroup?.order }} 類</span>
              <strong>{{ activeFieldGroup?.title }}</strong>
              <p>{{ activeFieldGroup?.description }}</p>
            </div>
            <div class="active-field-group-tools">
              <button
                v-if="batchConfirmableFields.length"
                type="button"
                class="group-batch-confirm"
                @click="confirmActiveGroupHighConfidence"
              >
                <CheckCircle :size="14" />
                確認本類 {{ batchConfirmableFields.length }} 個高信心欄位
              </button>
              <Badge
                v-if="activeFieldGroup?.missingCount"
                variant="secondary"
                class="group-missing-badge"
              >
                缺 {{ activeFieldGroup.missingCount }} 項
              </Badge>
            </div>
          </div>

          <div v-if="activeGroupFields.length" class="field-filter-bar" aria-label="依欄位狀態篩選">
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
              class="contract-field-card rounded-lg border transition-colors"
              :class="fieldCardClass(field)"
            >
              <div class="field-card-header">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ field.label }}
                  <span v-if="field.required" class="required-mark">必填</span>
                  <span v-else class="recommended-mark">建議</span>
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
                  <Badge variant="secondary" class="text-xs" :class="fieldStatus(field).class">
                    {{ fieldStatus(field).text }}
                  </Badge>
                </div>
              </div>

              <div v-if="field.editing" class="field-edit-row">
                <input
                  v-model="field.value"
                  class="flex-1 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  :class="
                    field.validationError ? 'border-red-500 focus:ring-red-400' : 'border-border'
                  "
                  :aria-invalid="Boolean(field.validationError)"
                  :aria-describedby="
                    field.validationError ? `${field.id}-validation-error` : undefined
                  "
                  @input="field.validationError = ''"
                  @keyup.enter="confirmFieldEdit(field)"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="確認欄位修改"
                  @click="confirmFieldEdit(field)"
                >
                  <CheckCircle :size="16" class="text-green-600" />
                </Button>
              </div>
              <div
                v-if="field.validationError"
                :id="`${field.id}-validation-error`"
                class="field-validation-error"
                role="alert"
              >
                <AlertTriangle :size="14" />
                <span>{{ field.validationError }}</span>
              </div>
              <div v-else class="field-value-row">
                <div class="field-value-content">
                  <span
                    v-if="field.id === 'address' && field.addressResolution"
                    class="field-value-caption"
                  >
                    系統建議值
                  </span>
                  <span class="text-sm font-semibold text-foreground">
                    {{ field.value }}
                  </span>
                </div>
                <div class="field-actions">
                  <button
                    v-if="isFieldPopulated(field)"
                    type="button"
                    class="field-action-button"
                    @click="verifyField(field)"
                  >
                    <CheckCircle :size="14" />
                    確認
                  </button>
                  <button type="button" class="field-action-button" @click="startFieldEdit(field)">
                    <PenLine :size="14" />
                    {{ isFieldPopulated(field) ? '修改' : '填寫' }}
                  </button>
                </div>
              </div>
              <div
                v-if="!field.editing && field.id === 'address' && field.addressResolution"
                class="address-evidence"
              >
                <div class="address-evidence-row">
                  <span>OCR 原文</span>
                  <strong>{{ field.addressResolution.rawText || field.sourceValue }}</strong>
                </div>
                <div
                  v-if="field.addressResolution.county?.source !== 'google_ocr'"
                  class="address-evidence-row"
                >
                  <span>
                    {{ field.evidenceType === 'road_inference' ? '道路推測' : '行政區補全' }}
                  </span>
                  <strong>
                    縣市：{{ field.addressResolution.county?.value || '尚無法判定' }}（系統推論）
                  </strong>
                </div>
                <div
                  v-if="field.addressResolution.warnings.includes('address_incomplete')"
                  class="address-evidence-warning"
                >
                  <AlertTriangle :size="13" />
                  <span>完整度：缺少道路或門牌，請對照契約人工確認</span>
                </div>
              </div>
              <details
                v-if="field.googleConfidence !== null"
                class="field-evidence-details"
              >
                <summary>辨識詳情</summary>
                <div class="field-evidence-metadata">
                  <span>Google confidence：{{ Math.round(field.googleConfidence * 100) }}%</span>
                  <span>格式驗證：{{ field.formatValid ? '通過' : '需確認' }}</span>
                  <span>標籤距離：{{ field.labelDistanceNormal ? '正常' : '需確認' }}</span>
                  <span>
                    來源：{{
                      field.reviewSource === 'ai'
                        ? 'AI 複核'
                        : field.evidenceType === 'administrative_inference'
                          ? '依行政區補全'
                          : field.evidenceType === 'road_inference'
                            ? '依道路推測'
                            : '規則抽取'
                    }}
                  </span>
                </div>
              </details>
            </div>
            <p
              v-if="!activeGroupFields.length"
              class="field-filter-empty field-filter-empty--conditional"
            >
              目前未在契約中偵測到代理或轉租情境，因此本類別不列入必填完整度。若實際由代理人或二房東簽約，請先在左側補上相關內容後重新辨識。
            </p>
            <p v-else-if="!filteredFields.length" class="field-filter-empty">
              目前沒有符合此狀態的欄位
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped src="./editor.css"></style>
