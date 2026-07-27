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
  visionPages?: ContractVisionPage[]
  cropRegions?: ContractCropRegion[]
  fieldReviews?: Record<string, ContractFieldReview>
  fieldDecisions?: Record<string, ContractFieldDecision>
  timings?: ContractOcrTimings
  aiReview?: ContractAiReview
}

export type ContractAiReview = {
  status: 'pending' | 'completed' | 'failed' | 'skipped'
  jobId: string
  model: string
  fieldCount: number
  ruleFieldCount: number
  unresolvedFieldCount: number
  targetFieldIds: string[]
  cropCount: number
  mode: 'rules' | 'selective' | 'text' | 'multimodal'
  durationMs: number
  performanceMetrics: ContractAiPerformanceMetrics | null
}

export type ContractAiPerformanceMetrics = {
  totalMs: number
  loadMs: number
  promptEvalMs: number
  generationMs: number
  promptTokens: number
  outputTokens: number
  tokensPerSecond: number
}

export type ContractOcrTimings = {
  googleVisionMs: number
  normalizationMs: number
  ruleExtractionMs: number
  cropGenerationMs: number
  ollamaMs: number
}

export type ContractVisionPoint = {
  x: number
  y: number
}

export type ContractVisionBoundingBox = {
  vertices: ContractVisionPoint[]
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type ContractVisionSymbol = {
  symbolIndex: number
  text: string
  confidence: number
  boundingBox: ContractVisionBoundingBox
  detectedLanguages: Array<{ languageCode: string; confidence: number }>
  detectedBreak: { type: string | number | null; text: string; isPrefix: boolean }
}

export type ContractVisionWord = {
  blockIndex: number
  paragraphIndex: number
  wordIndex: number
  text: string
  confidence: number
  boundingBox: ContractVisionBoundingBox
  detectedLanguages: Array<{ languageCode: string; confidence: number }>
  symbols: ContractVisionSymbol[]
}

export type ContractVisionPage = {
  pageIndex: number
  sourceFileIndex: number
  sourcePageIndex: number
  width: number
  height: number
  confidence: number
  text: string
  detectedLanguages: Array<{ languageCode: string; confidence: number }>
  blocks: unknown[]
  words: ContractVisionWord[]
}

export type ContractCropRegion = {
  cropId: string
  fieldIds: string[]
  label: string
  pageIndex: number
  sourceFileIndex: number
  anchorKeyword: string
  visionBoundingBox: ContractVisionBoundingBox
  imageBoundingBox: { left: number; top: number; width: number; height: number }
  mimeType: string
}

export type ContractFieldReview = {
  value: string
  sourceValue: string
  confidence: 'high' | 'medium' | 'low'
  reviewState: 'unreviewed' | 'verified' | 'edited'
  sourcePageIndex?: number | null
  sourceStart?: number
  sourceEnd?: number
  evidenceType?: 'ocr_text' | 'image'
  sourceBoundingBox?: ContractVisionBoundingBox
  googleConfidence?: number
  formatValid?: boolean
  labelDistanceNormal?: boolean
  candidateCount?: number
  reviewReasons?: string[]
  reviewSource?: 'rules' | 'ai'
}

export type ContractFieldDecision = {
  confidence: 'high' | 'medium' | 'low'
  googleConfidence: number
  formatValid: boolean
  labelDistanceNormal: boolean
  candidateCount: number
  reasons: string[]
}

export type ContractAiReviewJob = {
  jobId: string
  status: 'pending' | 'completed' | 'failed' | 'skipped'
  model: string
  fieldReviews: Record<string, ContractFieldReview>
  targetFieldIds: string[]
  cropCount: number
  cropRegions: ContractCropRegion[]
  mode: 'selective' | 'text' | 'multimodal'
  durationMs: number
  performanceMetrics: ContractAiPerformanceMetrics | null
  timings: Pick<ContractOcrTimings, 'cropGenerationMs' | 'ollamaMs'>
  warnings: string[]
}

const CONTRACT_OCR_STORAGE_KEY = 'rentmate:contract-ocr-result'

function normalizePageText(pageText: unknown): string {
  return typeof pageText === 'string'
    ? pageText.replace(/\r\n?/g, '\n')
    : ''
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeBoundingBox(
  input: Partial<ContractVisionBoundingBox> | null | undefined,
): ContractVisionBoundingBox {
  return {
    vertices: Array.isArray(input?.vertices)
      ? input.vertices.slice(0, 4).map(vertex => ({
          x: finiteNumber(vertex?.x),
          y: finiteNumber(vertex?.y),
        }))
      : [],
    left: finiteNumber(input?.left),
    top: finiteNumber(input?.top),
    right: finiteNumber(input?.right),
    bottom: finiteNumber(input?.bottom),
    width: Math.max(0, finiteNumber(input?.width)),
    height: Math.max(0, finiteNumber(input?.height)),
  }
}

function normalizeCropRegions(input: unknown): ContractCropRegion[] {
  if (!Array.isArray(input)) return []

  return input
    .filter(region => region && typeof region === 'object')
    .map(region => {
      const sourceRegion = region as Partial<ContractCropRegion>
      const imageBoundingBox = sourceRegion.imageBoundingBox

      return {
        cropId: typeof sourceRegion.cropId === 'string' ? sourceRegion.cropId : '',
        fieldIds: Array.isArray(sourceRegion.fieldIds)
          ? sourceRegion.fieldIds.map(String).filter(Boolean)
          : [],
        label: typeof sourceRegion.label === 'string' ? sourceRegion.label : '',
        pageIndex: Math.max(0, Math.trunc(finiteNumber(sourceRegion.pageIndex))),
        sourceFileIndex: Math.max(0, Math.trunc(finiteNumber(sourceRegion.sourceFileIndex))),
        anchorKeyword:
          typeof sourceRegion.anchorKeyword === 'string' ? sourceRegion.anchorKeyword : '',
        visionBoundingBox: normalizeBoundingBox(sourceRegion.visionBoundingBox),
        imageBoundingBox: {
          left: Math.max(0, Math.trunc(finiteNumber(imageBoundingBox?.left))),
          top: Math.max(0, Math.trunc(finiteNumber(imageBoundingBox?.top))),
          width: Math.max(0, Math.trunc(finiteNumber(imageBoundingBox?.width))),
          height: Math.max(0, Math.trunc(finiteNumber(imageBoundingBox?.height))),
        },
        mimeType: typeof sourceRegion.mimeType === 'string' ? sourceRegion.mimeType : '',
      }
    })
    .filter(region => region.cropId && region.fieldIds.length)
}

function normalizeVisionPages(input: unknown): ContractVisionPage[] {
  if (!Array.isArray(input)) return []

  return input
    .filter(page => page && typeof page === 'object')
    .map((page, pageIndex) => {
      const sourcePage = page as Partial<ContractVisionPage>
      const words = Array.isArray(sourcePage.words)
        ? sourcePage.words.map((word, wordIndex) => ({
            blockIndex: Math.max(0, Math.trunc(finiteNumber(word.blockIndex))),
            paragraphIndex: Math.max(0, Math.trunc(finiteNumber(word.paragraphIndex))),
            wordIndex: Math.max(0, Math.trunc(finiteNumber(word.wordIndex, wordIndex))),
            text: typeof word.text === 'string' ? word.text : '',
            confidence: Math.min(1, Math.max(0, finiteNumber(word.confidence))),
            boundingBox: normalizeBoundingBox(word.boundingBox),
            detectedLanguages: Array.isArray(word.detectedLanguages) ? word.detectedLanguages : [],
            symbols: Array.isArray(word.symbols)
              ? word.symbols.map((symbol, symbolIndex) => ({
                  symbolIndex: Math.max(0, Math.trunc(finiteNumber(symbol.symbolIndex, symbolIndex))),
                  text: typeof symbol.text === 'string' ? symbol.text : '',
                  confidence: Math.min(1, Math.max(0, finiteNumber(symbol.confidence))),
                  boundingBox: normalizeBoundingBox(symbol.boundingBox),
                  detectedLanguages: Array.isArray(symbol.detectedLanguages)
                    ? symbol.detectedLanguages
                    : [],
                  detectedBreak: {
                    type: symbol.detectedBreak?.type ?? null,
                    text: typeof symbol.detectedBreak?.text === 'string'
                      ? symbol.detectedBreak.text
                      : '',
                    isPrefix: Boolean(symbol.detectedBreak?.isPrefix),
                  },
                }))
              : [],
          }))
        : []

      return {
        pageIndex: Math.max(0, Math.trunc(finiteNumber(sourcePage.pageIndex, pageIndex))),
        sourceFileIndex: Math.max(0, Math.trunc(finiteNumber(sourcePage.sourceFileIndex))),
        sourcePageIndex: Math.max(0, Math.trunc(finiteNumber(sourcePage.sourcePageIndex))),
        width: Math.max(0, finiteNumber(sourcePage.width)),
        height: Math.max(0, finiteNumber(sourcePage.height)),
        confidence: Math.min(1, Math.max(0, finiteNumber(sourcePage.confidence))),
        text: typeof sourcePage.text === 'string' ? sourcePage.text : '',
        detectedLanguages: Array.isArray(sourcePage.detectedLanguages)
          ? sourcePage.detectedLanguages
          : [],
        blocks: Array.isArray(sourcePage.blocks) ? sourcePage.blocks : [],
        words,
      }
    })
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
            evidenceType: ['ocr_text', 'image'].includes(review.evidenceType ?? '')
              ? review.evidenceType
              : undefined,
            sourceBoundingBox: review.sourceBoundingBox
              ? normalizeBoundingBox(review.sourceBoundingBox)
              : undefined,
            googleConfidence: Number.isFinite(review.googleConfidence)
              ? Math.min(1, Math.max(0, Number(review.googleConfidence)))
              : undefined,
            formatValid:
              typeof review.formatValid === 'boolean' ? review.formatValid : undefined,
            labelDistanceNormal:
              typeof review.labelDistanceNormal === 'boolean'
                ? review.labelDistanceNormal
                : undefined,
            candidateCount: Number.isFinite(review.candidateCount)
              ? Math.max(0, Math.trunc(Number(review.candidateCount)))
              : undefined,
            reviewReasons: Array.isArray(review.reviewReasons)
              ? review.reviewReasons.map(String).filter(Boolean)
              : undefined,
            reviewSource: review.reviewSource === 'ai' ? 'ai' : 'rules',
          }]),
      ) as Record<string, ContractFieldReview>
    : undefined

  const aiReview = input.aiReview && typeof input.aiReview === 'object'
    ? {
        status: ['pending', 'completed', 'failed', 'skipped'].includes(input.aiReview.status)
          ? input.aiReview.status
          : 'failed',
        jobId: typeof input.aiReview.jobId === 'string' ? input.aiReview.jobId : '',
        model: typeof input.aiReview.model === 'string' ? input.aiReview.model : '',
        fieldCount: Number.isFinite(input.aiReview.fieldCount)
          ? Math.max(0, Math.trunc(Number(input.aiReview.fieldCount)))
          : 0,
        ruleFieldCount: Number.isFinite(input.aiReview.ruleFieldCount)
          ? Math.max(0, Math.trunc(Number(input.aiReview.ruleFieldCount)))
          : 0,
        unresolvedFieldCount: Number.isFinite(input.aiReview.unresolvedFieldCount)
          ? Math.max(0, Math.trunc(Number(input.aiReview.unresolvedFieldCount)))
          : 0,
        targetFieldIds: Array.isArray(input.aiReview.targetFieldIds)
          ? input.aiReview.targetFieldIds.map(String).filter(Boolean)
          : [],
        cropCount: Number.isFinite(input.aiReview.cropCount)
          ? Math.max(0, Math.trunc(Number(input.aiReview.cropCount)))
          : 0,
        mode: ['rules', 'selective', 'text', 'multimodal'].includes(input.aiReview.mode)
          ? input.aiReview.mode
          : 'rules',
        durationMs: Number.isFinite(input.aiReview.durationMs)
          ? Math.max(0, Math.trunc(Number(input.aiReview.durationMs)))
          : 0,
        performanceMetrics: input.aiReview.performanceMetrics
          ? {
              totalMs: Math.max(0, finiteNumber(input.aiReview.performanceMetrics.totalMs)),
              loadMs: Math.max(0, finiteNumber(input.aiReview.performanceMetrics.loadMs)),
              promptEvalMs: Math.max(
                0,
                finiteNumber(input.aiReview.performanceMetrics.promptEvalMs),
              ),
              generationMs: Math.max(
                0,
                finiteNumber(input.aiReview.performanceMetrics.generationMs),
              ),
              promptTokens: Math.max(
                0,
                Math.trunc(finiteNumber(input.aiReview.performanceMetrics.promptTokens)),
              ),
              outputTokens: Math.max(
                0,
                Math.trunc(finiteNumber(input.aiReview.performanceMetrics.outputTokens)),
              ),
              tokensPerSecond: Math.max(
                0,
                finiteNumber(input.aiReview.performanceMetrics.tokensPerSecond),
              ),
            }
          : null,
      } as ContractAiReview
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
    visionPages: normalizeVisionPages(input.visionPages),
    cropRegions: normalizeCropRegions(input.cropRegions),
    fieldDecisions:
      input.fieldDecisions && typeof input.fieldDecisions === 'object'
        ? (input.fieldDecisions as Record<string, ContractFieldDecision>)
        : undefined,
    timings: input.timings
      ? {
          googleVisionMs: Math.max(0, finiteNumber(input.timings.googleVisionMs)),
          normalizationMs: Math.max(0, finiteNumber(input.timings.normalizationMs)),
          ruleExtractionMs: Math.max(0, finiteNumber(input.timings.ruleExtractionMs)),
          cropGenerationMs: Math.max(0, finiteNumber(input.timings.cropGenerationMs)),
          ollamaMs: Math.max(0, finiteNumber(input.timings.ollamaMs)),
        }
      : undefined,
    fieldReviews,
    aiReview,
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
