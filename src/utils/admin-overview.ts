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
import type { MaintenanceStatus } from './admin-maintenance'

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

/**
 * 待辦的種類。
 *
 * 收錄標準只有一條：**管理員在後台真的做得了事**。
 * 押金對帳與訂閱到期刻意不在此列 —— 押金是唯讀的，訂閱續約是使用者自己的事，
 * 把做不了的項目放進待辦，只會讓人點進去發現沒有按鈕，然後不再相信這張卡。
 */
export type QueueKind = 'ticket-pending' | 'ticket-disputed' | 'ticket-overdue' | 'quota-alert'

export const queueKindLabels: Record<QueueKind, string> = {
  'ticket-pending': '待通報房東',
  'ticket-disputed': '爭議待介入',
  'ticket-overdue': '逾期待催辦',
  'quota-alert': 'AI 額度告急',
}

/** 每一種待辦對應的下一步動作，直接寫在卡片上，不用使用者自己推敲 */
export const queueKindHints: Record<QueueKind, string> = {
  'ticket-pending': '租客已送出，等你通報房東',
  'ticket-disputed': '雙方對責任有爭議，等你介入判斷',
  'ticket-overdue': '房東逾期未回應，需要催辦或轉爭議',
  'quota-alert': '供應商額度接近用盡，到系統設定調整',
}

export interface QueueEntry {
  id: string
  label: string
  to: string
}

export interface QueueGroup {
  kind: QueueKind
  label: string
  hint: string
  /** 該種類的總件數，不受預覽筆數影響 */
  count: number
  /** 預覽用的前幾筆 */
  items: QueueEntry[]
  /** 「查看全部」的去處 */
  to: string
}

/** 建佇列時需要的工單欄位，刻意只取這幾個，方便測試 */
export interface QueueTicket {
  id: string
  address: string
  tenantName: string
  status: MaintenanceStatus
}

export interface QueueQuotaAlert {
  id: string
  label: string
}

const TICKET_KIND_BY_STATUS: Partial<Record<MaintenanceStatus, QueueKind>> = {
  submitted: 'ticket-pending',
  disputed: 'ticket-disputed',
  overdue: 'ticket-overdue',
}

/** 工單頁的狀態頁籤，讓「查看全部」能直接落在對的分頁 */
const TAB_BY_KIND: Record<QueueKind, string> = {
  'ticket-pending': '/admin/maintenance-tickets?tab=pending',
  'ticket-disputed': '/admin/maintenance-tickets?tab=disputed',
  'ticket-overdue': '/admin/maintenance-tickets?tab=overdue',
  'quota-alert': '/admin/ai-usage',
}

/** 依急迫度排序：爭議要人判斷最急，待通報卡在自己手上次之 */
const KIND_ORDER: QueueKind[] = [
  'ticket-disputed',
  'ticket-pending',
  'ticket-overdue',
  'quota-alert',
]

/**
 * 待辦佇列，依種類分組。
 *
 * 每組給「幾件」與前幾筆明細；件數是真實總數，不會因為只預覽三筆就縮水。
 * 沒有任何件數的種類整組不顯示 —— 空的分組只是在告訴你沒事做，不需要佔版面。
 */
export function buildQueueGroups(
  tickets: QueueTicket[],
  quotaAlerts: QueueQuotaAlert[],
  previewLimit = 3,
): QueueGroup[] {
  const byKind = new Map<QueueKind, QueueEntry[]>()

  for (const ticket of tickets) {
    const kind = TICKET_KIND_BY_STATUS[ticket.status]
    if (!kind) continue
    const entries = byKind.get(kind) ?? []
    entries.push({
      id: ticket.id,
      label: `${ticket.address}・${ticket.tenantName}`,
      to: `/admin/maintenance-tickets?ticket=${ticket.id}`,
    })
    byKind.set(kind, entries)
  }

  if (quotaAlerts.length > 0) {
    byKind.set(
      'quota-alert',
      quotaAlerts.map((alert) => ({
        id: alert.id,
        label: alert.label,
        to: '/admin/ai-usage',
      })),
    )
  }

  return KIND_ORDER.filter((kind) => (byKind.get(kind)?.length ?? 0) > 0).map((kind) => {
    const entries = byKind.get(kind) ?? []
    return {
      kind,
      label: queueKindLabels[kind],
      hint: queueKindHints[kind],
      count: entries.length,
      items: entries.slice(0, previewLimit),
      to: TAB_BY_KIND[kind],
    }
  })
}

/** 待辦總件數，供卡片標題顯示 */
export function queueTotal(groups: QueueGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0)
}
