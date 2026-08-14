/**
 * 後台總覽的資料聚合。純邏輯，不依賴 Vue。
 *
 * 頁面分成兩半：上半是「現在有什麼要處理」（巡邏），下半是「這個系統長什麼樣」（匯報）。
 * 這個檔案負責把散在各 collection 的資料算成那兩半需要的形狀。
 */

import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { AdminUser } from '@/src/mocks/admin/users'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import { depositMatchOf, type DepositMatch } from './admin-deposit'
import type { UserDirectoryRow } from './admin-user-directory'
import { userDisplayName } from './admin-user-directory'

// ── 匯報：時間序列 ────────────────────────────────────────────────

export interface TrendPoint {
  label: string
  value: number
}

/** 一週的毫秒數 */
const WEEK_MS = 7 * 86400000

/**
 * 近 N 週的每週新增工單。
 *
 * 用「週」而不是「日」：目前的資料量下每日只有一到兩件、還夾雜零，
 * 畫成日折線是雜訊不是趨勢。週的粒度才看得出成長。
 */
export function weeklyTicketTrend(
  tickets: MaintenanceTicket[],
  weeks = 12,
  now: Date = new Date(),
): TrendPoint[] {
  // 以「今天」為最後一週的結尾往回切，每格 7 天
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  end.setDate(end.getDate() + 1) // 含今天

  const buckets: TrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const bucketEnd = end.getTime() - i * WEEK_MS
    const bucketStart = bucketEnd - WEEK_MS
    const count = tickets.filter((ticket) => {
      const at = new Date(ticket.createdAt).getTime()
      return at >= bucketStart && at < bucketEnd
    }).length

    const startDate = new Date(bucketStart)
    buckets.push({
      label: `${startDate.getMonth() + 1}/${startDate.getDate()}`,
      value: count,
    })
  }

  return buckets
}

/**
 * 近 N 個月的使用者累計數。
 *
 * 用累計而非當月新增：本月還沒過完，當月新增畫出來永遠是往下掉的最後一格，
 * 看起來像流失。累計則單調遞增，講的才是「平台長多大」。
 */
export function monthlyUserGrowth(
  users: AdminUser[],
  months = 12,
  now: Date = new Date(),
): TrendPoint[] {
  const points: TrendPoint[] = []

  for (let i = months - 1; i >= 0; i -= 1) {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = `${cutoff.getMonth() === 0 ? 12 : cutoff.getMonth()}月`
    const total = users.filter((user) => new Date(user.registeredAt) < cutoff).length
    points.push({ label, value: total })
  }

  return points
}

// ── 匯報：組成 ────────────────────────────────────────────────────

export interface DepositMatchSummary {
  match: DepositMatch
  value: number
}

/** 押金對帳結果分布，順序固定：相符、不符、待補 */
export function depositMatchDistribution(records: DepositRecord[]): DepositMatchSummary[] {
  const counts: Record<DepositMatch, number> = { matched: 0, mismatched: 0, pending: 0 }
  for (const record of records) {
    counts[depositMatchOf(record.landlordDeclared, record.tenantDeclared)] += 1
  }
  return [
    { match: 'matched', value: counts.matched },
    { match: 'mismatched', value: counts.mismatched },
    { match: 'pending', value: counts.pending },
  ]
}

// ── 巡邏：待辦佇列 ────────────────────────────────────────────────

export type QueueKind =
  | 'ticket-overdue'
  | 'deposit-mismatch'
  | 'subscription-expiring'
  | 'quota-exhausted'

export const queueKindLabels: Record<QueueKind, string> = {
  'ticket-overdue': '工單逾期',
  'deposit-mismatch': '押金不符',
  'subscription-expiring': '訂閱到期',
  'quota-exhausted': '額度用滿',
}

export interface QueueItem {
  id: string
  kind: QueueKind
  label: string
  to: string
}

/**
 * 待辦佇列：把四種警示攤成一筆一筆帶連結的明細。
 *
 * 巡邏列給的是數字，這裡給的是「是誰、哪一件」，兩者是同一組資料的兩種粒度。
 */
export function buildQueue(rows: UserDirectoryRow[], limit = 8): QueueItem[] {
  const items: QueueItem[] = []

  for (const row of rows) {
    const who = userDisplayName(row.user)

    if (row.overdueTicketCount > 0) {
      items.push({
        id: `overdue-${row.user.id}`,
        kind: 'ticket-overdue',
        label: `${who} 有 ${row.overdueTicketCount} 件工單逾期未回應`,
        to: `/admin/maintenance-tickets?user=${row.user.id}`,
      })
    }

    if (row.mismatchedDepositCount > 0) {
      items.push({
        id: `deposit-${row.user.id}`,
        kind: 'deposit-mismatch',
        label: `${who} 有 ${row.mismatchedDepositCount} 筆押金金額對不起來`,
        to: `/admin/users/${row.user.id}`,
      })
    }

    if (row.subscriptionExpiring) {
      items.push({
        id: `expiring-${row.user.id}`,
        kind: 'subscription-expiring',
        label: `${who} 的訂閱即將到期`,
        to: `/admin/users/${row.user.id}`,
      })
    }

    if (row.quotaExhausted) {
      items.push({
        id: `quota-${row.user.id}`,
        kind: 'quota-exhausted',
        label: `${who} 的方案額度已用滿`,
        to: `/admin/users/${row.user.id}`,
      })
    }
  }

  // 依急迫度輪替，而不是把最急的那類排滿。
  //
  // 純按優先級排序的話，逾期工單一多就會塞滿整張卡，
  // 讓人完全看不出還有押金與訂閱要處理 —— 佇列該呈現工作量的組成，不只是最上面那一類。
  const order: QueueKind[] = [
    'ticket-overdue',
    'deposit-mismatch',
    'subscription-expiring',
    'quota-exhausted',
  ]
  const buckets = order.map((kind) => items.filter((item) => item.kind === kind))

  const interleaved: QueueItem[] = []
  for (let round = 0; interleaved.length < items.length; round += 1) {
    let addedThisRound = false
    for (const bucket of buckets) {
      const item = bucket[round]
      if (item) {
        interleaved.push(item)
        addedThisRound = true
      }
    }
    if (!addedThisRound) break
  }

  return interleaved.slice(0, limit)
}

/** 待辦總數，不受顯示上限影響 —— 卡片標題要說的是真實數量 */
export function queueTotal(rows: UserDirectoryRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.overdueTicketCount > 0 ? 1 : 0) +
      (row.mismatchedDepositCount > 0 ? 1 : 0) +
      (row.subscriptionExpiring ? 1 : 0) +
      (row.quotaExhausted ? 1 : 0),
    0,
  )
}
