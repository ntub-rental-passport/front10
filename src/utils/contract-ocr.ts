export type ContractOcrResult = {
  engine: string
  fileName: string
  mimeType: string
  size: number
  text: string
  pageCount: number
  pageTexts: string[]
  languageHints: string[]
  warnings: string[]
  fieldReviews?: Record<string, ContractFieldReview>
}

export type ContractFieldReview = {
  value: string
  sourceValue: string
  confidence: 'high' | 'medium' | 'low'
  reviewState: 'unreviewed' | 'verified' | 'edited'
  sourcePageIndex?: number | null
  sourceStart?: number
  sourceEnd?: number
}

const CONTRACT_OCR_STORAGE_KEY = 'rentmate:contract-ocr-result'

function normalizePageText(pageText: unknown): string {
  return typeof pageText === 'string'
    ? pageText.replace(/\r\n?/g, '\n')
    : ''
}

/**
 * 依照原始頁面順序重新合併 OCR 文字。
 * 不使用 filter(Boolean)，避免空白頁造成頁面順序錯位。
 */
export function mergeContractPageTexts(pageTexts: string[]): string {
  return pageTexts
    .map(pageText => normalizePageText(pageText).trimEnd())
    .join('\n\n')
    .trim()
}

export function normalizeContractOcrResult(
  input: Partial<ContractOcrResult> | null | undefined,
): ContractOcrResult | null {
  if (!input) return null

  const sourceText = normalizePageText(input.text)
  const storedPages = Array.isArray(input.pageTexts)
    ? input.pageTexts.map(normalizePageText)
    : []

  // 相容舊資料：若只有全文而沒有逐頁文字，至少保留成單頁。
  const pageTexts = storedPages.length
    ? [...storedPages]
    : sourceText.trim()
      ? [sourceText]
      : []

  const declaredPageCount = Number.isFinite(input.pageCount)
    ? Math.max(0, Math.trunc(Number(input.pageCount)))
    : 0
  const normalizedPageCount = Math.max(declaredPageCount, pageTexts.length)

  while (pageTexts.length < normalizedPageCount) {
    pageTexts.push('')
  }

  const text = mergeContractPageTexts(pageTexts) || sourceText.trim()
  if (!text) return null

  const fieldReviews = input.fieldReviews && typeof input.fieldReviews === 'object'
    ? Object.fromEntries(
        Object.entries(input.fieldReviews)
          .filter(([, review]) => review && typeof review.value === 'string')
          .map(([fieldId, review]) => [fieldId, {
            value: review.value,
            sourceValue: typeof review.sourceValue === 'string' ? review.sourceValue : '',
            confidence: ['high', 'medium', 'low'].includes(review.confidence)
              ? review.confidence
              : 'low',
            reviewState: ['unreviewed', 'verified', 'edited'].includes(review.reviewState)
              ? review.reviewState
              : 'unreviewed',
            sourcePageIndex: Number.isInteger(review.sourcePageIndex)
              ? Math.max(0, Number(review.sourcePageIndex))
              : null,
            sourceStart: Number.isInteger(review.sourceStart)
              ? Math.max(-1, Number(review.sourceStart))
              : -1,
            sourceEnd: Number.isInteger(review.sourceEnd)
              ? Math.max(-1, Number(review.sourceEnd))
              : -1,
          }]),
      ) as Record<string, ContractFieldReview>
    : undefined

  return {
    engine: typeof input.engine === 'string' ? input.engine : '',
    fileName: typeof input.fileName === 'string' ? input.fileName : '',
    mimeType: typeof input.mimeType === 'string' ? input.mimeType : '',
    size: Number.isFinite(input.size) ? Math.max(0, Number(input.size)) : 0,
    text,
    pageCount: pageTexts.length,
    pageTexts,
    languageHints: Array.isArray(input.languageHints)
      ? input.languageHints.map(item => String(item)).filter(Boolean)
      : [],
    warnings: Array.isArray(input.warnings)
      ? input.warnings.map(item => String(item)).filter(Boolean)
      : [],
    fieldReviews,
  }
}

export function saveContractOcrResult(result: ContractOcrResult): boolean {
  if (typeof window === 'undefined') return false

  const normalizedResult = normalizeContractOcrResult(result)
  if (!normalizedResult) return false

  try {
    window.sessionStorage.setItem(
      CONTRACT_OCR_STORAGE_KEY,
      JSON.stringify(normalizedResult),
    )
    return true
  } catch {
    return false
  }
}

export function loadContractOcrResult(): ContractOcrResult | null {
  if (typeof window === 'undefined') return null

  try {
    const rawResult = window.sessionStorage.getItem(CONTRACT_OCR_STORAGE_KEY)
    if (!rawResult) return null

    return normalizeContractOcrResult(
      JSON.parse(rawResult) as Partial<ContractOcrResult>,
    )
  } catch {
    return null
  }
}

export function clearContractOcrResult(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(CONTRACT_OCR_STORAGE_KEY)
}
