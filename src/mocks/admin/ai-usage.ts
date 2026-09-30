/**
 * AI 用量的型別。資料存在後端（backend/admin/ai_usage.py），由 OCR 服務回報。
 *
 * 目前只記 Google Vision：它是唯一按頁計費的服務。後端早就不用 Gemini 了，
 * NVIDIA、Ollama 之後再加（2026-09-30 決定）。
 */
export type AiProviderId = 'vision'
export type AiUsageUnit = 'token' | 'page'

export interface AiProvider {
  id: AiProviderId
  label: string
  unit: AiUsageUnit
}

export interface AiUsageDaily {
  date: string // YYYY-MM-DD（台灣時間）
  provider: AiProviderId
  units: number
  calls: number
}

export const AI_PROVIDERS: AiProvider[] = [{ id: 'vision', label: 'Google Cloud Vision', unit: 'page' }]
