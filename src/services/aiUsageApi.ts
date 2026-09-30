/**
 * AI 用量的 API（backend/routers/ai_usage_api.py）。
 * 目前只有 OCR 服務回報的 Google Vision 頁數，最近 60 天、一天一列。
 */
import type { AiProvider, AiUsageDaily } from '@/src/mocks/admin/ai-usage'
import { adminRequest } from './adminHttp'

export interface AiUsageResponse {
  providers: AiProvider[]
  daily: AiUsageDaily[]
}

/** 讀不到回 null：畫面要分得出「讀不到」和「本月還沒用過」 */
export async function fetchAiUsage(): Promise<AiUsageResponse | null> {
  try {
    return await adminRequest<AiUsageResponse>('/admin/ai-usage')
  } catch {
    return null
  }
}
