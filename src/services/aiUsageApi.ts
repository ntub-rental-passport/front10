/**
 * AI 用量的 API（backend/routers/ai_usage_api.py）。
 * 最近 60 天，依日期、供應商與功能分列。
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
    const result = await adminRequest<AiUsageResponse>('/admin/ai-usage')
    return {
      ...result,
      daily: result.daily.map((record) => ({
        ...record,
        feature: record.feature ?? '',
        failed: record.failed ?? 0,
        prompt_tokens: record.prompt_tokens ?? 0,
        completion_tokens: record.completion_tokens ?? 0,
      })),
    }
  } catch {
    return null
  }
}
