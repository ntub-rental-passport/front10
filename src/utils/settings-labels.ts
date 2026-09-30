/**
 * 系統設定欄位的中文名稱與單位，以及「改了什麼」的一句話。純邏輯。
 *
 * 稽核紀錄原本寫「更新欄位：loginMaxAttempts、sessionTimeoutMinutes」——
 * 英文欄位名，而且看不出從多少改成多少。事後回頭查，要的是
 * 「報修逾期提醒門檻：7 → 10 天」。
 */

import type { SystemSettings } from '@/src/mocks/admin/settings'

type FieldKind = 'number' | 'text' | 'boolean' | 'datetime'

interface FieldMeta {
  label: string
  unit?: string
  kind: FieldKind
}

export const SETTING_FIELDS: Record<keyof SystemSettings, FieldMeta> = {
  siteName: { label: '網站名稱', kind: 'text' },
  supportEmail: { label: '客服信箱', kind: 'text' },
  maintenanceMode: { label: '維護模式', kind: 'boolean' },
  maintenanceMessage: { label: '維護說明文字', kind: 'text' },
  maintenanceStartsAt: { label: '維護開始時間', kind: 'datetime' },
  maintenanceEndsAt: { label: '維護結束時間', kind: 'datetime' },
  maintenanceAllowlist: { label: '維護白名單', kind: 'text' },
  auditRetentionDays: { label: '稽核紀錄保留天數', unit: '天', kind: 'number' },
  maintenanceOverdueDays: { label: '報修逾期提醒門檻', unit: '天', kind: 'number' },
  subscriptionExpiringSoonDays: { label: '訂閱到期提醒天數', unit: '天', kind: 'number' },
  platformVisionPageQuota: { label: 'Vision 每月頁數上限', unit: '頁', kind: 'number' },
  quotaWarnPercent: { label: '額度預警門檻', unit: '%', kind: 'number' },
  quotaCriticalPercent: { label: '額度告急門檻', unit: '%', kind: 'number' },
  aiQuotaCriticalDays: { label: '剩餘天數告急門檻', unit: '天', kind: 'number' },
  responseOkMs: { label: '回應時間正常門檻', unit: 'ms', kind: 'number' },
  responseDegradedMs: { label: '回應時間變慢門檻', unit: 'ms', kind: 'number' },
}

function withUnit(value: string, unit: string | undefined): string {
  if (!unit) return value
  return unit === '%' ? `${value}%` : `${value} ${unit}`
}

function formatDatetime(value: string): string {
  if (!value) return '未設定'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 一個欄位的變更。文字欄位只說「已更新」—— 把整段維護文案塞進稽核紀錄只會
 * 讓那一列撐得老長，而且 CSV 裡一格裝不下。
 */
export function describeSettingChange<K extends keyof SystemSettings>(
  key: K,
  before: SystemSettings[K],
  after: SystemSettings[K],
): string {
  const { label, unit, kind } = SETTING_FIELDS[key]
  if (kind === 'text') return `${label}：已更新`
  if (kind === 'boolean') return `${label}：${after ? '開啟' : '關閉'}`
  if (kind === 'datetime') {
    return `${label}：${formatDatetime(String(before))} → ${formatDatetime(String(after))}`
  }
  const format = (value: unknown) => Number(value).toLocaleString('zh-TW')
  return `${label}：${format(before)} → ${withUnit(format(after), unit)}`
}

/** 所有有變的欄位，依 SETTING_FIELDS 的順序 */
export function describeSettingChanges(before: SystemSettings, after: SystemSettings): string[] {
  return (Object.keys(SETTING_FIELDS) as (keyof SystemSettings)[])
    .filter((key) => before[key] !== after[key])
    .map((key) => describeSettingChange(key, before[key], after[key]))
}

/** 登入有效時間的選單文字：「30 分鐘」「2 小時」「7 天」 */
export function sessionLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`
  if (minutes < 1440) return `${minutes / 60} 小時`
  return `${minutes / 1440} 天`
}
