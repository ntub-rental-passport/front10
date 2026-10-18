<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import {
  filterContractReviewFields,
  filterMobileContractReviewFields,
  type ContractReviewFilter,
} from '@/src/utils/contract-review-filter'
import {
  createContractFieldCropUrl,
  findContractFieldCrop,
} from '@/src/utils/contract-field-evidence'
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
  buildRentalPayload,
  describeMissingFields,
  type RentalPayloadResult,
} from '@/src/utils/contract-rental-payload'
import { finalizeContract, type FinalizeContractResponse } from '@/src/services/contractApi'
import {
  CONTRACT_FIELD_DEFINITIONS,
  CONTRACT_FIELD_GROUPS,
  detectContractConditions,
} from '@/shared/contract-field-schema.js'
import {
  isValidContractFieldFormat,
  isValidBuildingNumber,
  isValidLandNumber,
  isValidPersonOrEntityName,
  isValidPositiveArea,
  isValidRocDate,
  isValidTaiwanIdentityNumber,
} from '@/shared/contract-field-validation.js'
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
  Database,
  Lock,
  Loader2,
  Check,
  RotateCcw,
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
  control: 'text' | 'choice'
  options: string[]
  placeholder: string
  format: string
}

interface FieldSection {
  id: string
  title: string
  grouped: boolean
  fields: ContractField[]
}

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

interface PaginationItem {
  key: string
  pageIndex: number | null
  label: string
}

const storedOcrResult = ref<ContractOcrResult | null>(loadContractOcrResult())
const route = useRoute()
const initialPageTexts = storedOcrResult.value?.pageTexts.length
  ? storedOcrResult.value.pageTexts
  : storedOcrResult.value?.text
    ? [storedOcrResult.value.text]
    : []
const ocrPages = ref<string[]>([...initialPageTexts])
const requestedPage = Number(route.query.page)
const currentPageIndex = ref(Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage < initialPageTexts.length ? requestedPage : 0)
const pageCount = computed(() => ocrPages.value.length)
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

  if (total <= 5) return Array.from({ length: total }, (_, pageIndex) => pageItem(pageIndex))
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
    control?: 'text' | 'choice'
    options?: string[]
    placeholder?: string
    format?: string
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
    control: definition.control ?? 'text',
    options: definition.options ?? [],
    placeholder: definition.placeholder ?? '',
    format: definition.format ?? 'text',
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

function refreshInteractiveConditions(): void {
  const rentalScope = fields.value.find((field) => field.id === 'rental_scope')?.value
  const parkingAvailable = fields.value.find((field) => field.id === 'parking_available')?.value
  const carParkingCount = fields.value.find((field) => field.id === 'car_parking_count')?.value
  const motorcycleParkingCount = fields.value.find(
    (field) => field.id === 'motorcycle_parking_count',
  )?.value
  const paymentMethod = fields.value.find((field) => field.id === 'payment_method')?.value
  const accessoryAvailable = fields.value.find(
    (field) => field.id === 'accessory_available',
  )?.value

  fields.value.forEach((field) => {
    if (field.condition === 'has_car_parking') {
      const parkingSelected = parkingAvailable === '有'
      field.applicable = parkingSelected
      field.required = parkingSelected && parseNumericValue(carParkingCount ?? '') > 0
      return
    }
    if (field.condition === 'has_motorcycle_parking') {
      const parkingSelected = parkingAvailable === '有'
      field.applicable = parkingSelected
      field.required = parkingSelected && parseNumericValue(motorcycleParkingCount ?? '') > 0
      return
    }

    let applies: boolean | null = null
    if (field.condition === 'partial_scope' && ['全部', '部分'].includes(rentalScope ?? '')) {
      applies = rentalScope === '部分'
    }
    if (field.condition === 'has_parking' && ['有', '無'].includes(parkingAvailable ?? '')) {
      applies = parkingAvailable === '有'
    }
    if (field.condition === 'has_accessory' && ['有', '無'].includes(accessoryAvailable ?? '')) {
      applies = accessoryAvailable === '有'
    }
    if (field.condition === 'transfer' && paymentMethod) {
      applies = /轉帳|匯款/.test(paymentMethod)
    }
    if (applies === null) return
    field.applicable = applies
    field.required = applies
  })
}

watch(
  () => fields.value.map((field) => `${field.id}:${field.value}`),
  refreshInteractiveConditions,
  { immediate: true },
)

const isEditing = ref(false)
const isSaved = ref(false)
const isDirty = ref(false)
const saveError = ref('')
const isMobile = useMediaQuery('(max-width: 639px)')
const documentReader = ref<HTMLDialogElement | null>(null)

function openDocumentReader(): void {
  if (isMobile.value) documentReader.value?.showModal()
}

watch(isMobile, () => {
  if (documentReader.value?.open) documentReader.value.close()
}, { flush: 'pre' })
const desktopFieldFilter = ref<ContractReviewFilter>('all')
const mobileFieldFilter = ref<ContractReviewFilter>('pending')
const activeFieldFilter = computed({
  get: () => isMobile.value ? mobileFieldFilter.value : desktopFieldFilter.value,
  set: (value: ContractReviewFilter) => {
    if (isMobile.value) mobileFieldFilter.value = value
    else desktopFieldFilter.value = value
  },
})
const requestedGroupId = typeof route.query.group === 'string' ? route.query.group : ''
const activeFieldGroupId = ref(
  CONTRACT_FIELD_GROUPS.some((group) => group.id === requestedGroupId)
    ? requestedGroupId
    : (CONTRACT_FIELD_GROUPS[0]?.id ?? 'review'),
)
const fieldGroupNav = ref<HTMLElement | null>(null)
const mobileEmptyMessage = computed(() => {
  switch (mobileFieldFilter.value) {
    case 'pending': return '都確認完了，可以開始分析'
    case 'low': return '沒有缺少的欄位'
    case 'reviewed': return '還沒有處理過的欄位'
    default: return ''
  }
})

async function scrollActiveFieldGroupIntoView(): Promise<void> {
  if (!isMobile.value) return
  await nextTick()
  const nav = fieldGroupNav.value
  const chip = nav?.querySelector<HTMLElement>('.is-active')
  if (!nav || !chip) return
  const navBounds = nav.getBoundingClientRect()
  const chipBounds = chip.getBoundingClientRect()
  const offset = chipBounds.left < navBounds.left
    ? chipBounds.left - navBounds.left
    : chipBounds.right > navBounds.right
      ? chipBounds.right - navBounds.right
      : 0
  if (offset) nav.scrollBy({ left: offset, behavior: 'auto' })
}

watch([isMobile, activeFieldGroupId, mobileFieldFilter], scrollActiveFieldGroupIntoView, { flush: 'post' })
onMounted(scrollActiveFieldGroupIntoView)
const linkedFieldId = ref(typeof route.query.field === 'string' ? route.query.field : '')
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
const reviewableRequiredCount = computed(
  () => requiredFields.value.filter(isFieldPopulated).length,
)
const reviewProgress = computed(() =>
  reviewableRequiredCount.value
    ? Math.round((completedRequiredCount.value / reviewableRequiredCount.value) * 100)
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
const canStartAnalysis = computed(
  () => hasOcrData.value && pendingRequiredReviewCount.value === 0,
)

const activeGroupFields = computed(() =>
  applicableFields.value.filter((field) => field.groupId === activeFieldGroupId.value),
)
const filteredFields = computed(() =>
  isMobile.value
    ? filterMobileContractReviewFields(
      applicableFields.value,
      activeFieldFilter.value,
      activeFieldGroupId.value,
      CONTRACT_FIELD_GROUPS,
    )
    : filterContractReviewFields(activeGroupFields.value, activeFieldFilter.value),
)

const fieldSections = computed<FieldSection[]>(() => {
  if (isMobile.value || activeFieldGroupId.value !== 'scope') {
    return [{ id: 'default', title: '', grouped: false, fields: filteredFields.value }]
  }

  const visibleFields = new Map(filteredFields.value.map((field) => [field.id, field]))
  const definitions = [
    {
      id: 'rental-scope',
      title: '住宅出租範圍',
      grouped: true,
      fieldIds: ['rental_scope', 'rental_room', 'rental_area'],
    },
    {
      id: 'parking-scope',
      title: '是否包含車位',
      grouped: true,
      fieldIds: [
        'parking_available',
        'car_parking_count',
        'car_parking_type',
        'car_parking_floor',
        'car_parking_number',
        'motorcycle_parking_count',
        'motorcycle_parking_floor',
        'motorcycle_parking_number',
        'parking_usage_time',
      ],
    },
    {
      id: 'scope-other',
      title: '',
      grouped: false,
      fieldIds: ['rental_equipment', 'rental_equipment_details'],
    },
  ]

  return definitions
    .map(({ fieldIds, ...section }) => ({
      ...section,
      fields: fieldIds.flatMap((fieldId) => {
        const field = visibleFields.get(fieldId)
        return field ? [field] : []
      }),
    }))
    .filter((section) => section.fields.length > 0)
})

const fieldFilters = computed<Array<{ id: ContractReviewFilter; label: string; count: number }>>(() => isMobile.value ? [
  { id: 'pending' as const, label: '待確認' },
  { id: 'low' as const, label: '缺少' },
  { id: 'reviewed' as const, label: '已處理' },
].map(filter => ({
  ...filter,
  count: filterMobileContractReviewFields(
    applicableFields.value, filter.id, activeFieldGroupId.value, CONTRACT_FIELD_GROUPS,
  ).length,
})) : [
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

onMounted(async () => {
  if (!linkedFieldId.value) return
  activeFieldFilter.value = 'all'
  await nextTick()
  document.querySelector<HTMLElement>(`[data-field-id="${linkedFieldId.value}"]`)?.scrollIntoView({
    block: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
})

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
  activeGroupFields.value.filter(isBatchConfirmableField),
)

function isBatchConfirmableField(field: ContractField): boolean {
  return isFieldPopulated(field) &&
    field.reviewState === 'unreviewed' &&
    field.confidence === 'high' &&
    field.formatValid !== false &&
    field.labelDistanceNormal !== false &&
    !validateLegalField(field)
}

const mobileBatchConfirmableFields = computed(() => {
  if (!isMobile.value || !['pending', 'all'].includes(activeFieldFilter.value)) return []
  return filteredFields.value.filter(isBatchConfirmableField)
})

function selectFieldGroup(groupId: string): void {
  if (isMobile.value) fields.value.filter(field => field.editing).forEach(cancelFieldEdit)
  activeFieldGroupId.value = groupId
  activeFieldFilter.value = 'all'
}

function selectFieldFilter(filter: ContractReviewFilter): void {
  if (isMobile.value) fields.value.filter(field => field.editing).forEach(cancelFieldEdit)
  activeFieldFilter.value = filter
}

function fieldGroupTitle(groupId: string): string {
  return fieldGroups.value.find((group) => group.id === groupId)?.title ?? ''
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
  if (isMobile.value) {
    fields.value.filter(other => other !== field && other.editing).forEach(cancelFieldEdit)
    if (field.editing) return
  }
  field.editStartValue = field.value === '尚未辨識' ? '' : field.value
  field.value = field.editStartValue
  field.validationError = ''
  saveError.value = ''
  field.editing = true
  if (isMobile.value) {
    void nextTick(() => {
      if (!field.editing || typeof document === 'undefined') return
      document.querySelector<HTMLElement>(`[data-field-id="${field.id}"] .mobile-field-input`)?.focus()
    })
  }
}

function cancelFieldEdit(field: ContractField): void {
  field.value = field.editStartValue
  field.editing = false
  clearFieldValidation(field)
}

function clearFieldValidation(field: ContractField): void {
  field.validationError = ''
  saveError.value = ''
}

function updateMobileField(field: ContractField, value: string): void {
  if (!field.editing) startFieldEdit(field)
  field.value = value
  clearFieldValidation(field)
}

function confirmMobileField(field: ContractField): void {
  if (field.editing) confirmFieldEdit(field)
  else verifyField(field)
}

function resetFieldReview(field: ContractField): void {
  field.reviewState = 'unreviewed'
}

const fieldEvidenceUrls = ref<Record<string, string | null>>({})
const expandedEvidenceId = ref<string | null>(null)
const loadingEvidence = ref(new Set<string>())
const evidenceDialog = ref<HTMLDialogElement | null>(null)
const enlargedEvidence = ref<{ url: string; label: string } | null>(null)
let evidenceDisposed = false

function fieldEvidencePage(field: ContractField): number | null {
  return findContractFieldCrop(storedOcrResult.value, field.id)?.pageIndex ?? field.sourcePageIndex
}

function toggleFieldEvidence(field: ContractField): void {
  expandedEvidenceId.value = expandedEvidenceId.value === field.id ? null : field.id
  if (expandedEvidenceId.value) void loadFieldEvidence(field)
}

async function loadFieldEvidence(field: ContractField): Promise<void> {
  if (field.id in fieldEvidenceUrls.value || loadingEvidence.value.has(field.id)) return
  loadingEvidence.value.add(field.id)
  try {
    const url = await createContractFieldCropUrl(storedOcrResult.value, field.id)
    if (evidenceDisposed) {
      if (url) URL.revokeObjectURL(url)
      return
    }
    fieldEvidenceUrls.value[field.id] = url
  } catch {
    fieldEvidenceUrls.value[field.id] = null
  } finally {
    loadingEvidence.value.delete(field.id)
  }
}

async function enlargeFieldEvidence(field: ContractField): Promise<void> {
  const url = fieldEvidenceUrls.value[field.id]
  if (!url) return
  enlargedEvidence.value = { url, label: field.label }
  await nextTick()
  evidenceDialog.value?.showModal()
}

watch(isMobile, () => evidenceDialog.value?.close())
onUnmounted(() => {
  evidenceDisposed = true
  Object.values(fieldEvidenceUrls.value).forEach(url => {
    if (url) URL.revokeObjectURL(url)
  })
})

function parseNumericValue(value: string): number {
  return Number(value.replace(/[^0-9]/g, '')) || 0
}

function areaInPing(value: string): string {
  if (!/平方公尺/.test(value)) return ''
  const squareMeters = Number(value.replace(/[^0-9.]/g, ''))
  return squareMeters > 0 ? `約 ${(squareMeters * 0.3025).toFixed(2)} 坪` : ''
}

function validateLegalField(field: ContractField, value = field.value.trim()): string {
  if (!value || value === '尚未辨識') return field.required ? `請補上「${field.label}」。` : ''

  if (field.id === 'review_date' && !isValidRocDate(value)) {
    return '審閱日期請填寫完整有效日期，例如「民國 114 年 7 月 14 日」。'
  }
  if (field.id === 'review_days' && !/^\d+\s*日$/.test(value)) {
    return '審閱日數請填寫整數日數，例如「2 日」；是否符合審閱期規範將另行分析。'
  }
  if (/(?:landlord|tenant)_review_signature$/.test(field.id) && !/簽章|簽署|已簽/.test(value)) {
    return '簽章欄位必須確認契約中已載明簽章或已完成簽署。'
  }
  if (['landlord', 'tenant', 'agent_name'].includes(field.id) && !isValidPersonOrEntityName(value)) {
    return '姓名／名稱只能使用中文、英文字母及姓名常用符號，不得填寫純數字。'
  }
  if (/(?:landlord|tenant|agent)_id$/.test(field.id)) {
    if (!isValidTaiwanIdentityNumber(value)) {
      return '身分證字號或 8 碼統一編號檢核失敗，請確認英文字母、數字與檢查碼。'
    }
  }
  if (/(?:landlord|tenant)_phone$/.test(field.id) && value.replace(/\D/g, '').length < 7) {
    return '聯絡電話格式不完整。'
  }
  if (field.id === 'land_number' && !isValidLandNumber(value)) {
    return '基地地號請完整填寫「段／小段／地號」，例如「中正段一小段 123 地號」。'
  }
  if (field.id === 'building_number' && !isValidBuildingNumber(value)) {
    return '專有部分建號請填寫數字建號並以「建號」結尾，例如「00649-000 建號」。'
  }
  if (['exclusive_area', 'accessory_area', 'rental_area'].includes(field.id) && !isValidPositiveArea(value)) {
    return '面積請填寫大於 0 的數字與單位，例如「30 平方公尺」。'
  }
  if (field.id === 'accessory_purpose' && !/^[\p{Script=Han}A-Za-z、，,／/\s]{2,30}$/u.test(value)) {
    return '附屬建物用途請填寫陽台、平台、花台、露台、雨遮等文字用途。'
  }
  if (field.control === 'choice' && !field.options.includes(value)) {
    return `請從指定選項中選擇「${field.label}」。`
  }
  if (/(?:car|motorcycle)_parking_count$/.test(field.id) && !/^\d+\s*個$/.test(value)) {
    return '停車位數量請填寫整數，例如「1 個」。'
  }
  if (/(?:car|motorcycle)_parking_floor$/.test(field.id) && !/^(?:地上|地下)?\s*B?\d+\s*層$/i.test(value)) {
    return '停車位樓層請填寫例如「地下 B1 層」或「地上 1 層」。'
  }
  if (/(?:car|motorcycle)_parking_number$/.test(field.id) && !/(?:第\s*)?[A-Za-z0-9-]+\s*號|位置示意圖/.test(value)) {
    return '停車位編號請填寫例如「第 20 號」，或註明附件位置示意圖。'
  }
  if (
    field.id === 'leftover_handling' &&
    !(/遺留物/.test(value) && /(?:催告|通知)/.test(value) && /(?:拋棄|處理)/.test(value))
  ) {
    return '遺留物條款必須載明催告、逾期視為拋棄及處理費用約定。'
  }
  if (field.id === 'jurisdiction_court' && !/^臺灣[^，,。]{1,20}地方法院/.test(value)) {
    return '法院名稱請填寫完整，例如「臺灣臺北地方法院」。'
  }
  if (['start_date', 'end_date'].includes(field.id) && !isValidRocDate(value)) {
    return '租賃日期請填寫完整有效的民國年月日。'
  }
  if (!isValidContractFieldFormat(field.format, value, field.options)) {
    const formatMessages: Record<string, string> = {
      money: '金額請填寫正整數，例如「NT$18,000」。',
      phone: '請填寫有效的臺灣手機或市內電話，例如「0912-345-678」。',
      party_address: '請填寫完整地址，或填寫「同上／同戶籍地址」。',
      tax_id: '房屋稅籍編號請填寫 6 至 30 碼數字。',
      rental_room: '請填寫可辨識的樓層、房間或室號，例如「第 3 樓 A 室」。',
      handover_time: '請填寫完整交屋日期，例如「民國 114 年 7 月 14 日」。',
      payment_period: '每期繳納月數請填寫 1 至 12 個月，例如「1 個月」。',
      due_day: '請填寫每月繳租期限，例如「每月 5 日前」或「每月底前」。',
      payment_method: '支付方式請填寫「現金」、「轉帳」、「匯款」或具體其他方式。',
      bank_account: '轉帳資料須包含銀行／金融機構、戶名及至少 6 碼帳號。',
      expense: '費用約定須載明負擔人、計費基準、金額或依帳單繳納。',
    }
    return formatMessages[field.format] ?? `「${field.label}」格式不正確，請依欄位提示重新填寫。`
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

  const appendManualCorrection = (): boolean => {
    if (!ocrPages.value.length) return false
    const supplementalText = `【人工校對補充】${field.label}：${newValue}`
    ocrPages.value[0] = `${ocrPages.value[0]?.trimEnd() ?? ''}\n\n${supplementalText}`.trim()
    field.sourceValue = newValue
    return true
  }

  if (field.control === 'choice') {
    return appendManualCorrection()
  }

  if (field.id === 'rent' && moneyValue) {
    const insertedValue = replaceFirstInPages(
      /((?:租金每個月|每月租金|月租金|租金\s*[：:]?\s*每月)\s*[：:為]?\s*(?:新臺幣|新台幣|NT\$?)?\s*)[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    if (insertedValue !== null) return true
  }

  if (field.id === 'deposit' && moneyValue) {
    const insertedValue = replaceFirstInPages(
      /((?:押租保證金|押金|保證金)[^\r\n]{0,60}?(?:新臺幣|新台幣|NT\$?)\s*)[0-9０-９,，零〇○一二三四五六七八九十百千萬万億亿壹貳贰參叁肆伍陸陆柒捌玖拾佰仟兩两]+(\s*元)/,
      `$1${moneyValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = moneyValue
    if (insertedValue !== null) return true
  }

  if (field.id === 'due_day' && dayValue) {
    const insertedValue = replaceFirstInPages(
      /((?:租金\s*)?每月\s*)[0-9０-９]{1,2}(\s*日\s*前)/,
      `$1${dayValue}$2`,
    )
    if (insertedValue !== null) field.sourceValue = dayValue
    if (insertedValue !== null) return true
  }

  if (!field.sourceValue) {
    return appendManualCorrection()
  }

  for (let pageIndex = 0; pageIndex < ocrPages.value.length; pageIndex += 1) {
    const pageText = ocrPages.value[pageIndex] ?? ''
    const sourceIndex = pageText.indexOf(field.sourceValue)
    if (sourceIndex < 0) continue

    // These sources include their labels to distinguish repeated names/addresses.
    // Keep the label when the user corrects the value in the document.
    const labeledSource = field.groupId === 'parties' || field.groupId === 'term'
      || ['review_days', 'payment_period', 'rental_area'].includes(field.id)
      || /^(?:car|motorcycle)_parking_(?:count|floor|number)$/.test(field.id)
    const prefix = labeledSource ? field.sourceValue.match(/^[\s\S]*?[：:]\s*/)?.[0] ?? '' : ''
    const suffix = labeledSource && /^(?:landlord|tenant)$/.test(field.id)
      ? field.sourceValue.match(/\s*(?:簽章|簽名|蓋章)[\s\S]*$/)?.[0] ?? ''
      : ''
    const replacement = `${prefix}${newValue}${suffix}`
    ocrPages.value[pageIndex] =
      `${pageText.slice(0, sourceIndex)}${replacement}${pageText.slice(sourceIndex + field.sourceValue.length)}`
    field.sourceValue = replacement
    return true
  }

  return appendManualCorrection()
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
    if (isMobile.value) startFieldEdit(field)
    else {
      field.editStartValue = field.value
      field.editing = true
    }
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

function confirmMobileHighConfidence(): void {
  const confirmableFields = [...mobileBatchConfirmableFields.value]
  if (!confirmableFields.length) return
  fields.value.filter((field) => field.editing).forEach(cancelFieldEdit)
  confirmableFields.forEach((field) => {
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

  for (const field of applicableFields.value) {
    if (!isFieldPopulated(field)) continue
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

// 終版確認不得預選或自動存檔，避免協商中條件影響帳單與補助；確認後個資由後端 AES-GCM 加密，未確認則只留 sessionStorage。
const finalizeDialog = ref<HTMLDialogElement | null>(null)
const finalizeChoice = ref<'final' | 'draft' | null>(null)
const contractTag = ref('')
const finalizeSaving = ref(false)
const finalizeError = ref('')
const finalizeResult = ref<FinalizeContractResponse | null>(null)
const rentalPayload = ref<RentalPayloadResult | null>(null)

const missingRentalLabels = computed(() =>
  rentalPayload.value ? describeMissingFields(rentalPayload.value.missing) : '',
)
const rentalWarnings = computed(() => rentalPayload.value?.warnings ?? [])
const canPersistToDatabase = computed(() => Boolean(rentalPayload.value?.rental))

function completeReviewAndAnalyze(): void {
  if (!canStartAnalysis.value || !persistContract()) return

  rentalPayload.value = buildRentalPayload(storedOcrResult.value)
  finalizeChoice.value = null
  finalizeError.value = ''
  finalizeResult.value = null
  contractTag.value = ''
  finalizeDialog.value?.showModal()
}

async function saveFinalVersion(): Promise<void> {
  const payload = rentalPayload.value?.rental
  if (!payload || finalizeSaving.value) return

  finalizeSaving.value = true
  finalizeError.value = ''
  try {
    finalizeResult.value = await finalizeContract({
      is_final: true,
      rental: payload,
      contract_tag: contractTag.value.trim() || null,
      review_id: storedOcrResult.value?.reviewSessionId,
    })
  } catch (error) {
    finalizeError.value =
      error instanceof Error ? error.message : '契約存檔失敗，請稍後重試。'
  } finally {
    finalizeSaving.value = false
  }
}

function continueToAnalysis(): void {
  finalizeDialog.value?.close()
  router.push('/app/contract-analysis')
}

function jumpToMissingField(fieldId: string): void {
  const target = fields.value.find((field) => field.id === fieldId)
  if (!target) return
  finalizeDialog.value?.close()
  activeFieldGroupId.value = target.groupId
  activeFieldFilter.value = 'all'
  void revealFieldSource(target)
}

function returnToOcr(): void {
  router.push('/app/contract/scanner')
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
      class="editor-empty-notice flex items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
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
      <div v-if="isMobile" class="mobile-review-summary">
        <p class="mobile-review-count">已校對 {{ completedRequiredCount }} / {{ reviewableRequiredCount }}</p>
        <button type="button" class="mobile-text-button" @click="openDocumentReader">看合約全文</button>
      </div>
      <div class="review-summary-header">
        <div>
          <p class="review-summary-kicker">OCR 辨識完成</p>
          <h2 id="review-summary-title">契約校對摘要</h2>
        </div>
        <div class="review-progress-display">
          <span>已辨識欄位校對</span>
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
          <span>已辨識欄位校對</span>
          <strong>{{ completedRequiredCount }} / {{ reviewableRequiredCount }}</strong>
          <small>確認或修正後才計入</small>
        </div>
        <div class="review-stat review-stat--warning">
          <span>已有值、待確認</span>
          <strong>{{ pendingRequiredReviewCount }}</strong>
        </div>
        <div class="review-stat review-stat--warning">
          <span>留待風險分析</span>
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
          <p v-if="pendingRequiredReviewCount">
            尚有 <strong>{{ pendingRequiredReviewCount }}</strong> 個已辨識欄位待確認；缺少的
            <strong>{{ missingRequiredCount }}</strong> 個資料將留待 AI 風險分析提醒。
          </p>
          <p v-else-if="missingRequiredCount">
            已辨識欄位皆已完成校對；缺少的 <strong>{{ missingRequiredCount }}</strong>
            個資料將由 AI 風險分析列出，不影響進入下一步。
          </p>
          <p v-else>所有已辨識欄位皆已確認，可以開始 AI 契約分析。</p>
        </div>
        <Button :disabled="!canStartAnalysis" @click="completeReviewAndAnalyze">
          完成校對並確認契約版本
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
      <component
        :is="isMobile ? 'dialog' : 'div'"
        ref="documentReader"
        :class="isMobile ? 'mobile-document-dialog' : 'document-reader-wrapper'"
        :aria-label="isMobile ? '合約全文' : undefined"
      >
        <div v-if="isMobile" class="mobile-document-toolbar">
          <Button variant="outline" :disabled="!hasOcrData" @click="isEditing = !isEditing">
            <PenLine v-if="!isEditing" data-icon="inline-start" />
            <Eye v-else data-icon="inline-start" />
            {{ isEditing ? '預覽模式' : '編輯模式' }}
          </Button>
          <button type="button" class="mobile-document-close" aria-label="關閉合約全文" autofocus @click="documentReader?.close()">
            <X :size="24" />
          </button>
        </div>
      <Card class="contract-document-card">
        <CardHeader class="document-reader-heading">
          <CardTitle class="flex items-center gap-2 text-lg">
            <FileText :size="18" />
            契約 PDF 閱讀器
          </CardTitle>
          <CardDescription>一次顯示一頁 OCR 內容，可使用頁碼切換與逐頁修改</CardDescription>
        </CardHeader>
        <CardContent class="document-reader-content">
          <div v-if="pageCount" class="pdf-reader-toolbar">
            <div class="pdf-file-info">
              <strong>{{ storedOcrResult?.fileName || 'OCR 契約文件' }}</strong>
              <span>第 {{ currentPageNumber }} 頁，共 {{ pageCount }} 頁</span>
            </div>

            <div
              class="pdf-search-bar"
              :class="{ 'has-query': searchQuery.trim() }"
              role="search"
            >
              <Search :size="15" class="pdf-search-icon" aria-hidden="true" />
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
                {{ searchResultPosition }}/{{ searchMatches.length }}
              </span>
              <button
                v-if="searchQuery.trim()"
                type="button"
                class="pdf-search-button"
                :disabled="!searchMatches.length"
                aria-label="上一個搜尋結果"
                title="上一個搜尋結果（Shift + Enter）"
                @click="moveToSearchResult(-1)"
              >
                <ChevronLeft :size="15" />
              </button>
              <button
                v-if="searchQuery.trim()"
                type="button"
                class="pdf-search-button"
                :disabled="!searchMatches.length"
                aria-label="下一個搜尋結果"
                title="下一個搜尋結果（Enter）"
                @click="moveToSearchResult(1)"
              >
                <ChevronRight :size="15" />
              </button>
              <button
                v-if="searchQuery"
                type="button"
                class="pdf-search-button"
                aria-label="清除搜尋"
                title="清除搜尋"
                @click="clearSearch"
              >
                <X :size="15" />
              </button>
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

              <div class="page-number-scroll" aria-label="契約頁碼">
                <template v-for="item in paginationItems" :key="item.key">
                  <span v-if="item.pageIndex === null" class="page-number-ellipsis" aria-hidden="true">
                    {{ item.label }}
                  </span>
                  <button
                    v-else
                    type="button"
                    class="page-number-button"
                    :class="{ 'is-active': item.pageIndex === currentPageIndex }"
                    :aria-current="item.pageIndex === currentPageIndex ? 'page' : undefined"
                    :aria-label="`前往第 ${item.pageIndex + 1} 頁`"
                    @click="goToPage(item.pageIndex)"
                  >
                    {{ item.label }}
                  </button>
                </template>
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
      </component>

      <div class="editor-side-column">
        <Card class="contract-fields-panel">
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
                  <div v-if="isMobile" class="field-status-legend">
                    <div><span class="mobile-status-dot mobile-status-dot--pending" />黃＝待確認</div>
                    <div><span class="mobile-status-dot mobile-status-dot--reviewed" />綠＝已確認</div>
                    <div><span class="mobile-status-dot mobile-status-dot--missing" />灰＝缺少</div>
                  </div>
                  <div v-else class="field-status-legend">
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
            <CardDescription class="field-panel-description">依契約章節順序整理關鍵欄位，分類編號不代表契約條號</CardDescription>
          </CardHeader>

          <nav v-if="!isMobile" class="field-group-nav" aria-label="法規欄位分類">
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

          <div v-if="!isMobile" class="active-field-group-heading">
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

          <div
            v-if="isMobile || activeGroupFields.length"
            ref="fieldGroupNav"
            class="field-filter-bar"
            :aria-label="isMobile ? '依欄位狀態或分類篩選' : '依欄位狀態篩選'"
          >
            <button
              v-for="filter in fieldFilters"
              :key="filter.id"
              type="button"
              class="field-filter-button"
              :class="{ 'is-active': activeFieldFilter === filter.id }"
              :aria-pressed="activeFieldFilter === filter.id"
              @click="selectFieldFilter(filter.id)"
            >
              <span>{{ filter.label }}</span>
              <strong>{{ filter.count }}</strong>
            </button>
            <template v-if="isMobile">
              <button
                v-for="group in fieldGroups"
                :key="group.id"
                type="button"
                class="field-filter-button"
                :class="{ 'is-active': activeFieldFilter === 'all' && activeFieldGroupId === group.id }"
                :aria-pressed="activeFieldFilter === 'all' && activeFieldGroupId === group.id"
                @click="selectFieldGroup(group.id)"
              >{{ group.order }} {{ group.shortTitle }}</button>
            </template>
          </div>

          <CardContent
            class="field-list"
            :class="{ 'field-list--single': activeFieldGroupId === 'property' }"
          >
            <button
              v-if="isMobile && mobileBatchConfirmableFields.length"
              type="button"
              class="mobile-batch-confirm"
              @click="confirmMobileHighConfidence"
            >
              <CheckCircle :size="18" />
              一鍵確認 {{ mobileBatchConfirmableFields.length }} 個高信心欄位
            </button>
            <section
              v-for="section in fieldSections"
              :key="section.id"
              class="field-section"
              :class="[
                { 'field-section--grouped': section.grouped },
                `field-section--${section.id}`,
              ]"
            >
              <header v-if="section.grouped" class="field-section-header">
                <strong>{{ section.title }}</strong>
                <span>相關明細會依你的選擇顯示</span>
              </header>
              <div class="field-section-grid">
                <div
                  v-for="field in section.fields"
                  :key="field.id"
                  :data-field-id="field.id"
                  class="contract-field-card"
                  :class="[
                    isMobile ? 'mobile-field-row' : ['rounded-lg border transition-colors', fieldCardClass(field)],
                    { 'is-linked-field': linkedFieldId === field.id },
                  ]"
                >
              <div v-if="!isMobile" class="field-card-header">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ field.label }}
                  <span v-if="field.required" class="required-mark">必填</span>
                  <span v-else-if="field.requirement === 'conditional'" class="conditional-mark">
                    依條件
                  </span>
                  <span v-else class="recommended-mark">建議</span>
                </span>
                <div class="field-card-badges">
                  <button
                    v-if="!isMobile && field.sourcePageIndex !== null"
                    type="button"
                    class="field-source-page"
                    :aria-label="`前往${field.label}的來源第 ${field.sourcePageIndex + 1} 頁`"
                    :title="`在左側顯示並標記第 ${field.sourcePageIndex + 1} 頁原文`"
                    @click="revealFieldSource(field)"
                  >
                    第 {{ field.sourcePageIndex + 1 }} 頁
                  </button>
                  <span v-else-if="!isMobile" class="field-source-page field-source-page--missing">
                    來源未定位
                  </span>
                  <Badge variant="secondary" class="text-xs" :class="fieldStatus(field).class">
                    {{ fieldStatus(field).text }}
                  </Badge>
                </div>
              </div>

              <template v-if="isMobile">
                <div class="mobile-field-main" :class="{ 'is-editing': field.editing }">
                  <span
                    class="mobile-status-dot"
                    :class="!isFieldPopulated(field) && !field.editing ? 'mobile-status-dot--missing' : field.reviewState === 'unreviewed' ? 'mobile-status-dot--pending' : 'mobile-status-dot--reviewed'"
                    aria-hidden="true"
                  />
                  <div class="mobile-field-content">
                    <div class="mobile-field-label">
                      <span class="mobile-field-category">{{ fieldGroupTitle(field.groupId) }}・{{ field.label }}<span v-if="field.required" class="required-mark">必填</span></span>
                      <button
                        v-if="!field.editing && (field.sourceValue || findContractFieldCrop(storedOcrResult, field.id))"
                        type="button"
                        class="mobile-evidence-link"
                        :aria-label="`查看${field.label}原文`"
                        :aria-expanded="expandedEvidenceId === field.id"
                        :aria-controls="`${field.id}-evidence`"
                        @click="toggleFieldEvidence(field)"
                      >・原文</button>
                    </div>
                    <template v-if="field.editing">
                      <select
                        v-if="field.control === 'choice'"
                        class="mobile-field-input"
                        :value="field.value"
                        :aria-label="field.label"
                        :aria-invalid="Boolean(field.validationError)"
                        :aria-describedby="field.validationError ? `${field.id}-validation-error` : undefined"
                        @change="updateMobileField(field, ($event.target as HTMLSelectElement).value)"
                      >
                        <option disabled value="">請選擇</option>
                        <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                      </select>
                      <input
                        v-else
                        class="mobile-field-input"
                        :value="field.value"
                        :aria-label="field.label"
                        :aria-invalid="Boolean(field.validationError)"
                        :aria-describedby="field.validationError ? `${field.id}-validation-error` : undefined"
                        :placeholder="field.placeholder"
                        @input="updateMobileField(field, ($event.target as HTMLInputElement).value)"
                        @keyup.enter="confirmMobileField(field)"
                      />
                      <span
                        v-if="['exclusive_area', 'accessory_area', 'rental_area'].includes(field.id) && areaInPing(field.value)"
                        class="field-area-conversion"
                      >{{ areaInPing(field.value) }}</span>
                      <div
                        v-if="field.validationError"
                        :id="`${field.id}-validation-error`"
                        class="field-validation-error"
                        role="alert"
                      >
                        <AlertTriangle :size="14" />
                        <span>{{ field.validationError }}</span>
                      </div>
                      <div class="mobile-field-actions">
                        <Button variant="outline" @click="cancelFieldEdit(field)">取消</Button>
                        <Button @click="confirmFieldEdit(field)">儲存並確認</Button>
                      </div>
                    </template>
                    <button
                      v-else-if="isFieldPopulated(field)"
                      type="button"
                      class="mobile-field-value"
                      :aria-label="`編輯${field.label}`"
                      @click="startFieldEdit(field)"
                    >{{ field.value }}</button>
                    <div v-else class="mobile-missing-value">
                      <span>合約沒寫，分析時會提醒</span>
                      <button type="button" class="mobile-field-fill" :aria-label="`補填${field.label}`" @click="startFieldEdit(field)">補填</button>
                    </div>
                  </div>
                  <button
                    v-if="!field.editing && isFieldPopulated(field)"
                    type="button"
                    class="mobile-field-confirm"
                    :class="{ 'is-reviewed': field.reviewState !== 'unreviewed' }"
                    :aria-label="field.reviewState === 'unreviewed' ? `${field.label}正確` : `${field.label}改回待確認`"
                    @click="field.reviewState === 'unreviewed' ? verifyField(field) : resetFieldReview(field)"
                  >
                    <Check v-if="field.reviewState === 'unreviewed'" :size="20" />
                    <RotateCcw v-else :size="20" />
                  </button>
                </div>
                <div
                  v-if="expandedEvidenceId === field.id"
                  :id="`${field.id}-evidence`"
                  class="field-evidence-source"
                >
                  <p>{{ fieldEvidencePage(field) !== null ? `第 ${fieldEvidencePage(field)! + 1} 頁` : '來源未定位' }}</p>
                  <p v-if="loadingEvidence.has(field.id)" role="status">正在載入原文圖片…</p>
                  <button
                    v-else-if="fieldEvidenceUrls[field.id]"
                    type="button"
                    class="field-evidence-image"
                    :aria-label="`全螢幕檢視${field.label}原文`"
                    @click="enlargeFieldEvidence(field)"
                  >
                    <img :src="fieldEvidenceUrls[field.id]!" :alt="`${field.label}的原文裁切圖片`" />
                  </button>
                  <p v-else class="field-evidence-text">{{ field.sourceValue || '沒有可用的原文影像，請對照原始契約。' }}</p>
                </div>
              </template>
              <template v-else>
              <div
                v-if="field.editing && field.control === 'choice'"
                class="field-choice-edit-row"
                role="radiogroup"
                :aria-label="field.label"
              >
                <div class="field-choice-options">
                  <button
                    v-for="option in field.options"
                    :key="option"
                    type="button"
                    class="field-choice-option"
                    :class="{ 'is-selected': field.value === option }"
                    role="radio"
                    :aria-checked="field.value === option"
                    @click="field.value = option"
                  >
                    {{ option }}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="確認欄位選項"
                  @click="confirmFieldEdit(field)"
                >
                  <CheckCircle :size="16" class="text-green-600" />
                </Button>
              </div>
              <div v-else-if="field.editing" class="field-edit-row">
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
                  :placeholder="field.placeholder"
                  @input="clearFieldValidation(field)"
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
              <div v-if="!field.editing" class="field-value-row">
                <div class="field-value-content">
                  <span
                    v-if="field.id === 'address' && field.addressResolution"
                    class="field-value-caption"
                  >
                    系統建議值
                  </span>
                  <span class="text-sm font-semibold text-foreground" :style="field.id === 'rental_equipment_details' ? { whiteSpace: 'pre-line' } : undefined">
                    {{ field.value }}
                  </span>
                  <span
                    v-if="['exclusive_area', 'accessory_area', 'rental_area'].includes(field.id) && areaInPing(field.value)"
                    class="field-area-conversion"
                  >
                    {{ areaInPing(field.value) }}
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
              </template>
              <div
                v-if="!isMobile && !field.editing && field.id === 'address' && field.addressResolution"
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
                v-if="!isMobile && field.googleConfidence !== null"
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
              </div>
            </section>
            <p
              v-if="isMobile && mobileEmptyMessage && !filteredFields.length"
              class="field-filter-empty"
            >{{ mobileEmptyMessage }}</p>
            <p
              v-else-if="!activeGroupFields.length && (!isMobile || activeFieldFilter === 'all')"
              class="field-filter-empty field-filter-empty--conditional"
            >
              本契約未適用代理或轉租，不需填寫代理人及相關授權資料。若實際由代理人或二房東簽約，請先在左側補上相關內容後重新辨識。
            </p>
            <p v-else-if="!filteredFields.length" class="field-filter-empty">
              目前沒有符合此狀態的欄位
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- 手機操作列移至頁面外，避免捲動容器或下拉重新整理的位移影響固定定位。 -->
    <Teleport to="body" :disabled="!isMobile">
      <div class="mobile-review-actions" aria-label="校對操作">
        <Button
          variant="outline"
          :disabled="!hasOcrData || (isSaved && !isDirty)"
          @click="handleSave"
        >儲存</Button>
        <Button :disabled="!canStartAnalysis" @click="completeReviewAndAnalyze">
          完成校對，開始分析
        </Button>
      </div>
    </Teleport>

    <dialog ref="finalizeDialog" class="finalize-dialog" @cancel.prevent>
      <form class="finalize-form" method="dialog" @submit.prevent>
        <header class="finalize-header">
          <h2 class="finalize-title">
            <Database :size="18" />
            這份契約是最終簽署版嗎？
          </h2>
          <p class="finalize-subtitle">
            只有最終版才會存入資料庫，供帳單、繳租提醒與點交紀錄使用。
            還在協商中的版本請選「尚未定版」，校對結果仍會留在本機工作階段。
          </p>
        </header>

        <!-- 存檔成功後只保留結果，避免重複送出建立兩筆租約 -->
        <div v-if="finalizeResult" class="finalize-result" role="status">
          <CheckCircle class="shrink-0 text-emerald-600" :size="20" />
          <div>
            <p class="finalize-result-title">已建立租約 #{{ finalizeResult.rental_id }}</p>
            <p class="finalize-result-note">
              共 {{ finalizeResult.encrypted_field_count }} 個個資欄位以 AES-GCM 加密儲存。
            </p>
          </div>
        </div>

        <template v-else>
          <div class="finalize-options">
            <label class="finalize-option" :class="{ 'finalize-option--active': finalizeChoice === 'final' }">
              <input v-model="finalizeChoice" type="radio" value="final" name="finalize-choice" />
              <span>
                <strong>是，這是雙方已簽署的最終版</strong>
                <small>建立租約並將欄位寫入資料庫；個資欄位加密後落地。</small>
              </span>
            </label>
            <label class="finalize-option" :class="{ 'finalize-option--active': finalizeChoice === 'draft' }">
              <input v-model="finalizeChoice" type="radio" value="draft" name="finalize-choice" />
              <span>
                <strong>尚未定版，先看風險分析</strong>
                <small>不寫入資料庫，校對結果僅保留在這個瀏覽器工作階段。</small>
              </span>
            </label>
          </div>

          <div v-if="finalizeChoice === 'final'" class="finalize-detail">
            <template v-if="canPersistToDatabase">
              <label class="finalize-tag">
                <span>契約別名（選填）</span>
                <input
                  v-model="contractTag"
                  type="text"
                  maxlength="30"
                  placeholder="例如：中正路小套房"
                />
              </label>
              <p class="finalize-encrypt-note">
                <Lock :size="14" />
                姓名、身分證字號、戶籍與通訊地址、聯絡電話將加密儲存，資料庫中無法直接讀取。
              </p>
            </template>
            <div v-else class="finalize-blocked" role="alert">
              <AlertTriangle class="shrink-0 text-amber-600" :size="18" />
              <div>
                <p v-if="missingRentalLabels">
                  以下必填欄位還沒有可寫入資料庫的值，請先補齊：
                  <strong>{{ missingRentalLabels }}</strong>
                </p>
                <p v-for="warning in rentalWarnings" :key="warning">{{ warning }}</p>
                <div v-if="rentalPayload?.missing.length" class="finalize-jump">
                  <Button
                    v-for="field in rentalPayload.missing"
                    :key="field.id"
                    size="sm"
                    variant="outline"
                    @click="jumpToMissingField(field.id)"
                  >
                    前往「{{ field.label }}」
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <p v-if="finalizeError" class="finalize-error" role="alert">{{ finalizeError }}</p>
        </template>

        <footer class="finalize-actions">
          <Button
            v-if="!finalizeResult && finalizeChoice === 'final'"
            :disabled="!canPersistToDatabase || finalizeSaving"
            @click="saveFinalVersion"
          >
            <Loader2 v-if="finalizeSaving" data-icon="inline-start" class="animate-spin" />
            <Save v-else data-icon="inline-start" />
            {{ finalizeSaving ? '正在加密存檔…' : '確認終版並存入資料庫' }}
          </Button>
          <Button
            variant="outline"
            :disabled="finalizeSaving || (!finalizeResult && !finalizeChoice)"
            @click="continueToAnalysis"
          >
            前往 AI 風險分析
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button variant="ghost" :disabled="finalizeSaving" @click="finalizeDialog?.close()">
            返回繼續校對
          </Button>
        </footer>
      </form>
    </dialog>
    <dialog
      v-if="isMobile"
      ref="evidenceDialog"
      class="field-evidence-dialog"
      aria-label="契約原文圖片"
      @close="enlargedEvidence = null"
    >
      <button type="button" class="field-evidence-close" aria-label="關閉原文圖片" autofocus @click="evidenceDialog?.close()">
        <X :size="24" />
      </button>
      <img v-if="enlargedEvidence" :src="enlargedEvidence.url" :alt="`${enlargedEvidence.label}的原文裁切圖片`" />
    </dialog>
  </div>
</template>

<style scoped src="./editor.css"></style>
