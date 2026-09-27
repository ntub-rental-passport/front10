/**
 * 系統設定頁的「照這個值，現在會標出幾筆」。純邏輯。
 *
 * 門檻原本是盲改：改完要到工單頁、使用者頁才知道影響多大。這裡用草稿裡的值
 * （還沒儲存的）即時算給管理員看，按儲存之前就知道後果。
 */

import { shouldAutoMarkOverdue, type MaintenanceStatus } from './admin-maintenance'
import { isSubscriptionExpiring } from './admin-user-directory'
import { classifyResponseTime, monitorStateLabels } from './admin-monitoring'
import type { Subscription } from '@/src/mocks/admin/subscription'

const DAY_MS = 86_400_000

function formatDate(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

/** 稽核保留天數：用一個日期講，比「隱藏 N 筆」好懂 */
export function retentionPreview(days: number, now: Date = new Date()): string {
  if (!Number.isFinite(days) || days <= 0) return '照這個值：不限制，所有紀錄都會顯示'
  return `照這個值：稽核頁會顯示 ${formatDate(new Date(now.getTime() - days * DAY_MS))} 之後的紀錄`
}

export interface ImpactPreview {
  /** 會被標出來的筆數，給畫面決定要不要上色 */
  count: number
  text: string
}

/**
 * 報修逾期門檻。已經是「逾期未回應」的不會因為門檻調大而變回去，
 * 所以分開講：這次會多標幾張、目前已經有幾張。
 */
export function overduePreview(
  tickets: { status: MaintenanceStatus; notifiedAt: string | null }[],
  days: number,
  now: Date = new Date(),
): ImpactPreview {
  const count = tickets.filter((ticket) => shouldAutoMarkOverdue(ticket.status, ticket.notifiedAt, days, now)).length
  const already = tickets.filter((ticket) => ticket.status === 'overdue').length
  const alreadyText = already > 0 ? `（目前已有 ${already} 張逾期）` : ''
  if (count === 0) return { count, text: `照這個值：不會再有工單被標成逾期${alreadyText}` }
  return { count, text: `照這個值：${count} 張已通報房東的工單會被標成「逾期未回應」${alreadyText}` }
}

export function expiringPreview(
  subscriptions: Subscription[],
  days: number,
  now: Date = new Date(),
): ImpactPreview {
  const count = subscriptions.filter((subscription) => isSubscriptionExpiring(subscription, days, now)).length
  return {
    count,
    text: count === 0 ? '照這個值：目前沒有人會被標示' : `照這個值：${count} 人會被標示「訂閱即將到期」`,
  }
}

export function responsePreview(ms: number | null, okMs: number, degradedMs: number): string {
  if (ms === null) return '目前量不到後端的回應時間'
  const state = classifyResponseTime(ms, okMs, degradedMs)
  return `目前後端回應 ${Math.round(ms)} ms，照這個值判定為「${monitorStateLabels[state]}」`
}

export function quotaPreview(
  usages: { label: string; percent: number; levelLabel: string; unset: boolean }[],
): string {
  const parts = usages.map((usage) =>
    usage.unset ? `${usage.label} 未設定額度` : `${usage.label} ${usage.percent}%（${usage.levelLabel}）`,
  )
  return `照這個值：${parts.join('、')}`
}
