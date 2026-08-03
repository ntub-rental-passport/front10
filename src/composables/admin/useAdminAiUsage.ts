import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { adminSettings } from './useAdminSettings'
import {
  AI_PROVIDERS,
  seedAiUsage,
  type AiProvider,
  type AiProviderId,
  type AiUsageDaily,
} from '@/src/mocks/admin-seed'
import {
  dailyAverage,
  daysUntilExhausted,
  monthToDateUnits,
  quotaStatus,
  type QuotaLevel,
} from '@/src/utils/admin-ai-usage'
import { dateKey } from '@/src/utils/date-key'

const records = createAdminCollection<AiUsageDaily[]>('ai-usage', seedAiUsage)

export const quotaLevelLabels: Record<QuotaLevel, string> = {
  ok: '正常',
  warn: '注意',
  critical: '告急',
}

export interface ProviderUsage {
  provider: AiProvider
  used: number
  quota: number
  remaining: number
  percent: number
  dailyAvg: number
  daysLeft: number | null
  level: QuotaLevel
  /** 額度為 0 代表尚未設定，畫面顯示「未設定額度」而非百分比 */
  unset: boolean
}

function quotaFor(provider: AiProviderId): number {
  return provider === 'gemini'
    ? adminSettings.value.platformGeminiTokenQuota
    : adminSettings.value.platformVisionPageQuota
}

export function useAdminAiUsage() {
  const usages = computed<ProviderUsage[]>(() => {
    const today = new Date()

    return AI_PROVIDERS.map((provider) => {
      const quota = quotaFor(provider.id)
      const used = monthToDateUnits(records.value, provider.id, today)
      const dailyAvg = dailyAverage(records.value, provider.id, today)
      const remaining = Math.max(0, quota - used)

      return {
        provider,
        used,
        quota,
        remaining,
        percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0,
        dailyAvg: Math.round(dailyAvg),
        daysLeft: daysUntilExhausted(remaining, dailyAvg),
        level: quotaStatus({
          usedUnits: used,
          quota,
          dailyAvg,
          today,
          warnPercent: adminSettings.value.quotaWarnPercent,
          criticalPercent: adminSettings.value.quotaCriticalPercent,
        }),
        unset: quota <= 0,
      }
    })
  })

  const alerts = computed(() => usages.value.filter((usage) => usage.level !== 'ok'))
  const alertCount = computed(() => alerts.value.length)

  /** 近 30 天、由舊到新的日期序列，供趨勢圖使用 */
  const trendDates = computed(() => {
    const today = new Date()
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (29 - index))
      return dateKey(date)
    })
  })

  function seriesFor(provider: AiProviderId): number[] {
    return trendDates.value.map((date) => {
      const found = records.value.find(
        (record) => record.date === date && record.provider === provider,
      )
      return found?.units ?? 0
    })
  }

  return { records, usages, alerts, alertCount, trendDates, seriesFor }
}
