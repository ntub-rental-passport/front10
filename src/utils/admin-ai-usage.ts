import { dateKey } from './date-key'
import type { AiProviderId, AiUsageDaily } from '@/src/mocks/admin/ai-usage'

export type QuotaLevel = 'ok' | 'warn' | 'critical'

const DEFAULT_AVERAGE_WINDOW = 7

function monthPrefix(date: Date): string {
  return dateKey(date).slice(0, 7) // YYYY-MM
}

export function monthToDateUnits(
  records: AiUsageDaily[],
  provider: AiProviderId,
  today: Date,
): number {
  const prefix = monthPrefix(today)
  return records
    .filter((record) => record.provider === provider && record.date.startsWith(prefix))
    .reduce((sum, record) => sum + record.units, 0)
}

/**
 * 近 N 日平均。視窗不會跨到上個月：當月已過天數不足 N 天時，
 * 除數改為當月已過天數，否則月初會被大量的零稀釋成假的低消耗。
 */
export function dailyAverage(
  records: AiUsageDaily[],
  provider: AiProviderId,
  today: Date,
  days = DEFAULT_AVERAGE_WINDOW,
): number {
  const window = Math.min(days, today.getDate())
  if (window <= 0) return 0

  const keys = new Set<string>()
  for (let offset = 0; offset < window; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
    keys.add(dateKey(date))
  }

  const total = records
    .filter((record) => record.provider === provider && keys.has(record.date))
    .reduce((sum, record) => sum + record.units, 0)

  return total / window
}

/** 依剩餘量與日均推算還能撐幾天。向下取整：寧可低估也不要高估。 */
export function daysUntilExhausted(remaining: number, dailyAvg: number): number | null {
  if (dailyAvg <= 0) return null
  return Math.floor(remaining / dailyAvg)
}

/** 今天到當月最後一日的天數，今天算在內。 */
export function daysLeftInMonth(today: Date): number {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return lastDay - today.getDate() + 1
}

export interface QuotaStatusInput {
  usedUnits: number
  quota: number
  dailyAvg: number
  today: Date
  warnPercent: number
  criticalPercent: number
  /** 依消耗速度推算的剩餘天數低於此值時，規則二判定為 critical（見系統設定的 aiQuotaCriticalDays） */
  criticalDaysLeft: number
}

const SEVERITY: Record<QuotaLevel, number> = { ok: 0, warn: 1, critical: 2 }

function stricter(a: QuotaLevel, b: QuotaLevel): QuotaLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

/**
 * 兩條規則取嚴格者：
 * 規則一 用量百分比門檻；規則二 依消耗速度推算的耗盡預估。
 * 規則二是關鍵 —— 消耗速度翻倍時，等百分比門檻亮燈已來不及。
 */
export function quotaStatus(input: QuotaStatusInput): QuotaLevel {
  const { usedUnits, quota, dailyAvg, today, warnPercent, criticalPercent, criticalDaysLeft } = input

  // 額度為 0 視為未設定：不計算百分比，也避免除以零
  if (quota <= 0) return 'ok'
  if (usedUnits >= quota) return 'critical'

  const percent = (usedUnits / quota) * 100
  const byPercent: QuotaLevel =
    percent >= criticalPercent ? 'critical' : percent >= warnPercent ? 'warn' : 'ok'

  const remaining = Math.max(0, quota - usedUnits)
  const days = daysUntilExhausted(remaining, dailyAvg)
  const byForecast: QuotaLevel =
    days === null
      ? 'ok'
      : days <= criticalDaysLeft
        ? 'critical'
        : days <= daysLeftInMonth(today)
          ? 'warn'
          : 'ok'

  return stricter(byPercent, byForecast)
}
