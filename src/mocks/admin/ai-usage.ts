/**
 * AI 用量的型別。Vision 由 OCR 服務回報，NVIDIA 在後端依功能記錄每次 API 請求。
 */
export type AiProviderId = 'vision' | 'nvidia'
export type AiUsageUnit = 'token' | 'page' | 'call'

export interface AiProvider {
  id: AiProviderId
  label: string
  unit: AiUsageUnit
}

export interface AiUsageDaily {
  date: string // YYYY-MM-DD（台灣時間）
  provider: AiProviderId
  feature: string
  units: number
  calls: number
  failed: number
  prompt_tokens: number
  completion_tokens: number
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'vision', label: 'Google Cloud Vision', unit: 'page' },
  { id: 'nvidia', label: 'NVIDIA', unit: 'call' },
]

export const AI_FEATURES = [
  { id: 'contract-analysis', label: '合約分析' },
  { id: 'law-chat', label: 'Law Chat' },
  { id: 'inspection', label: '點交比對' },
] as const
