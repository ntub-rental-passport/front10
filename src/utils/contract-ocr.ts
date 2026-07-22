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
}

const CONTRACT_OCR_STORAGE_KEY = 'rentmate:contract-ocr-result'

export function saveContractOcrResult(result: ContractOcrResult): boolean {
  if (typeof window === 'undefined') return false

  try {
    window.sessionStorage.setItem(CONTRACT_OCR_STORAGE_KEY, JSON.stringify({
      engine: result.engine,
      fileName: result.fileName,
      mimeType: result.mimeType,
      size: result.size,
      text: result.text,
      pageCount: result.pageCount,
      pageTexts: result.pageTexts,
      languageHints: result.languageHints,
      warnings: result.warnings,
    }))
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

    const result = JSON.parse(rawResult) as Partial<ContractOcrResult>
    const pageTexts = Array.isArray(result.pageTexts)
      ? result.pageTexts.map(pageText => typeof pageText === 'string' ? pageText : '')
      : []
    const text = typeof result.text === 'string'
      ? result.text
      : pageTexts.filter(Boolean).join('\n\n')

    if (!text.trim()) return null

    return {
      engine: result.engine ?? '',
      fileName: result.fileName ?? '',
      mimeType: result.mimeType ?? '',
      size: result.size ?? 0,
      text,
      pageCount: result.pageCount ?? pageTexts.length,
      pageTexts,
      languageHints: result.languageHints ?? [],
      warnings: result.warnings ?? [],
    }
  } catch {
    return null
  }
}

export function clearContractOcrResult(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(CONTRACT_OCR_STORAGE_KEY)
}
