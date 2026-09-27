import { computed, type Ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { adminSettings } from './useAdminSettings'
import {
  AI_PROVIDERS,
  seedAiUsage,
  type AiProvider,
  type AiProviderId,
  type AiUsageDaily,
  type SystemSettings,
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

type QuotaSettings = Pick<
  SystemSettings,
  | 'platformGeminiTokenQuota'
  | 'platformVisionPageQuota'
  | 'quotaWarnPercent'
  | 'quotaCriticalPercent'
  | 'aiQuotaCriticalDays'
>

/**
 * `settingsSource` 預設是已儲存的設定；系統設定頁傳草稿進來，
 * 才能在按下儲存之前就看到「照這個門檻，現在是什麼等級」。
 */
export function useAdminAiUsage(settingsSource: Ref<QuotaSettings> = adminSettings) {
  function quotaFor(provider: AiProviderId): number {
    return provider === 'gemini'
      ? settingsSource.value.platformGeminiTokenQuota
      : settingsSource.value.platformVisionPageQuota
  }

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
          warnPercent: settingsSource.value.quotaWarnPercent,
          criticalPercent: settingsSource.value.quotaCriticalPercent,
          criticalDaysLeft: settingsSource.value.aiQuotaCriticalDays,
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
