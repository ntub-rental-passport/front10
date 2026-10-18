import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractOcrResult } from './contract-ocr'

const STORAGE_KEY = 'rentmate:contract-ocr-result'
const boundingBox = {
  vertices: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }],
  left: 10,
  top: 20,
  right: 30,
  bottom: 40,
  width: 20,
  height: 20,
}

function result(): ContractOcrResult {
  return {
    reviewSessionId: 'review-1',
    engine: 'google-vision',
    fileName: '契約.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    text: '租金每月 18000 元\n\n第二頁',
    pageCount: 2,
    pageTexts: ['租金每月 18000 元', '第二頁'],
    languageHints: ['zh-TW'],
    warnings: ['請確認租金'],
    visionPages: [{
      pageIndex: 0,
      sourceFileIndex: 0,
      sourcePageIndex: 0,
      width: 100,
      height: 200,
      confidence: 0.95,
      text: '租金每月 18000 元',
      detectedLanguages: [{ languageCode: 'zh-TW', confidence: 0.95 }],
      blocks: [{ text: '原始 Vision 區塊' }],
      words: [{
        blockIndex: 0,
        paragraphIndex: 0,
        wordIndex: 0,
        text: '租金',
        confidence: 0.95,
        boundingBox,
        detectedLanguages: [{ languageCode: 'zh-TW', confidence: 0.95 }],
        symbols: [{
          symbolIndex: 0,
          text: 'Vision 符號資料',
          confidence: 0.95,
          boundingBox,
          detectedLanguages: [{ languageCode: 'zh-TW', confidence: 0.95 }],
          detectedBreak: { type: 'SPACE', text: ' ', isPrefix: false },
        }],
      }],
    }],
    cropRegions: [{
      cropId: 'rent-crop',
      fieldIds: ['rent'],
      label: '租金',
      pageIndex: 0,
      sourceFileIndex: 0,
      anchorKeyword: '租金',
      visionBoundingBox: boundingBox,
      imageBoundingBox: { left: 10, top: 20, width: 20, height: 20 },
      mimeType: 'image/png',
    }],
    fieldReviews: {
      rent: {
        value: '18000',
        sourceValue: '18000 元',
        confidence: 'high',
        reviewState: 'verified',
        sourcePageIndex: 0,
        sourceStart: 5,
        sourceEnd: 10,
        evidenceType: 'ocr_text',
        sourceBoundingBox: boundingBox,
        googleConfidence: 0.95,
        formatValid: true,
        labelDistanceNormal: true,
        candidateCount: 1,
        reviewReasons: ['符合租金格式'],
        reviewSource: 'ai',
      },
    },
    fieldDecisions: {
      rent: {
        confidence: 'high',
        googleConfidence: 0.95,
        formatValid: true,
        labelDistanceNormal: true,
        candidateCount: 1,
        reasons: ['符合租金格式'],
      },
    },
    timings: { googleVisionMs: 100, normalizationMs: 10, ruleExtractionMs: 20, cropGenerationMs: 30, ollamaMs: 200 },
    aiReview: {
      status: 'completed',
      jobId: 'job-1',
      model: 'test-model',
      fieldCount: 1,
      ruleFieldCount: 1,
      unresolvedFieldCount: 0,
      targetFieldIds: ['rent'],
      cropCount: 1,
      mode: 'selective',
      durationMs: 200,
      performanceMetrics: {
        totalMs: 200,
        loadMs: 10,
        promptEvalMs: 20,
        generationMs: 170,
        promptTokens: 100,
        outputTokens: 10,
        tokensPerSecond: 50,
      },
    },
  }
}

describe('契約 OCR 結果暫存', () => {
  let ocr: typeof import('./contract-ocr')
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.resetModules()
    ocr = await import('./contract-ocr')
    const data = new Map<string, string>()
    storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
      removeItem: vi.fn((key: string) => { data.delete(key) }),
    }
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('window', { sessionStorage: storage })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('大量 Vision 符號超過配額時，僅將精簡結果寫入儲存空間，記憶體保留完整資料', () => {
    const input = result()
    const word = input.visionPages![0].words[0]
    word.symbols = Array.from({ length: 1000 }, (_, symbolIndex) => ({ ...word.symbols[0], symbolIndex }))
    const normalized = ocr.normalizeContractOcrResult(input)
    const quota = 100_000
    expect(JSON.stringify(normalized).length).toBeGreaterThan(quota)
    const setItem = storage.setItem.getMockImplementation()!
    storage.setItem.mockImplementation((key: string, value: string) => {
      if (value.length > quota) throw new DOMException('quota', 'QuotaExceededError')
      setItem(key, value)
    })

    expect(ocr.saveContractOcrResult(input)).toBe(true)
    const stored = storage.getItem(STORAGE_KEY) as string
    expect(stored.length).toBeLessThan(quota)
    expect(JSON.parse(stored).visionPages).toEqual([])
    expect(stored).not.toContain('symbols')
    expect(stored).not.toContain('Vision 符號資料')
    expect(stored).not.toContain('原始 Vision 區塊')
    expect(ocr.loadContractOcrResult()).toEqual(normalized)
  })

  it('同分頁與重新載入皆保留文字、裁切區域、欄位審閱及其他非 Vision 資料', async () => {
    const input = result()
    const normalized = ocr.normalizeContractOcrResult(input)
    expect(ocr.saveContractOcrResult(input)).toBe(true)
    expect(ocr.loadContractOcrResult()).toEqual(normalized)

    vi.resetModules()
    const reloaded = await import('./contract-ocr')
    expect(reloaded.loadContractOcrResult()).toEqual({ ...normalized, visionPages: [] })
  })

  it('寫入失敗仍使用最新記憶體資料，並移除舊暫存以免重新載入時誤用', async () => {
    expect(ocr.saveContractOcrResult(result())).toBe(true)
    storage.setItem.mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    const latest = { ...result(), text: '新的契約', pageTexts: ['新的契約'], pageCount: 1 }
    expect(ocr.saveContractOcrResult(latest)).toBe(true)
    expect(ocr.loadContractOcrResult()).toEqual(ocr.normalizeContractOcrResult(latest))
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()

    vi.resetModules()
    const reloaded = await import('./contract-ocr')
    expect(reloaded.loadContractOcrResult()).toBeNull()
  })

  it('儲存空間完全停用時，仍可儲存至記憶體並安全清除', () => {
    for (const method of [storage.getItem, storage.setItem, storage.removeItem]) {
      method.mockImplementation(() => { throw new DOMException('disabled', 'SecurityError') })
    }
    const input = result()
    expect(ocr.saveContractOcrResult(input)).toBe(true)
    expect(ocr.loadContractOcrResult()).toEqual(ocr.normalizeContractOcrResult(input))
    expect(() => ocr.clearContractOcrResult()).not.toThrow()
    expect(ocr.loadContractOcrResult()).toBeNull()
  })

  it('清除時同時移除記憶體與工作階段暫存', () => {
    expect(ocr.saveContractOcrResult(result())).toBe(true)
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull()
    ocr.clearContractOcrResult()
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    expect(ocr.loadContractOcrResult()).toBeNull()
  })

  it('無可用文字或無瀏覽器環境時回傳失敗', () => {
    expect(ocr.saveContractOcrResult({ ...result(), text: '', pageTexts: [] })).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(ocr.loadContractOcrResult()).toBeNull()
    vi.stubGlobal('window', undefined)
    expect(ocr.saveContractOcrResult(result())).toBe(false)
    expect(ocr.loadContractOcrResult()).toBeNull()
    expect(() => ocr.clearContractOcrResult()).not.toThrow()
  })
})
