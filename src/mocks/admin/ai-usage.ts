import { dateKey } from '@/src/utils/date-key'

export type AiProviderId = 'gemini' | 'vision'
export type AiUsageUnit = 'token' | 'page'

export interface AiProvider {
  id: AiProviderId
  label: string
  unit: AiUsageUnit
}

export interface AiUsageDaily {
  date: string // YYYY-MM-DD
  provider: AiProviderId
  units: number
  calls: number
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'gemini', label: 'Gemini API', unit: 'token' },
  { id: 'vision', label: 'Google Cloud Vision', unit: 'page' },
]

function dayKey(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  return dateKey(date)
}

/**
 * 近 30 天、每個供應商每天一筆，相對「今天」產生。
 *
 * Gemini 最近 3 天刻意設為前期的兩倍，製造「用量未破門檻但消耗速度暴衝」
 * 的情境，否則預警的規則二在畫面上永遠不會被觸發。
 */
export function seedAiUsage(): AiUsageDaily[] {
  const records: AiUsageDaily[] = []

  for (let offset = 29; offset >= 0; offset -= 1) {
    const surge = offset <= 2 ? 2 : 1
    const wave = 1 + ((29 - offset) % 5) * 0.08

    records.push({
      date: dayKey(offset),
      provider: 'gemini',
      units: Math.round(26_000 * wave * surge),
      calls: Math.round(48 * wave * surge),
    })

    records.push({
      date: dayKey(offset),
      provider: 'vision',
      units: Math.round(42 * wave),
      calls: Math.round(14 * wave),
    })
  }

  return records
}
