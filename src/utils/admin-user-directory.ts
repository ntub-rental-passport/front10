/**
 * 使用者與各案件的關聯與篩選。純邏輯，不依賴 Vue。
 *
 * 後台把報修工單、押金對帳、訂閱容量都收斂到使用者底下，
 * 這個檔案負責把散在各 collection 的資料接成一列一列的使用者，以及套用列表的篩選條件。
 */

import type { AdminRole, AdminUser, AdminUserRole, AdminUserStatus } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/mocks/admin/maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import type { PlanId, Subscription, SubscriptionPlan } from '@/src/mocks/admin/subscription'
import { depositGap, depositMatchOf, type DepositMatch } from './admin-deposit'
import type { MaintenanceStatus } from './admin-maintenance'
import { featureVerdict } from './admin-entitlements'

/**
 * 訂閱是否即將到期。
 *
 * 已停用的訂閱不算 —— 它已經沒有續約可言，混進警示只會製造雜訊。
 *
 * `expiringSoonDays`（到期前幾天開始算「即將到期」）由呼叫端傳入，
 * 對應系統設定的 subscriptionExpiringSoonDays —— 這個檔案是純邏輯，不能自己去讀設定 collection。
 */
export function isSubscriptionExpiring(
  subscription: Subscription | null,
  expiringSoonDays: number,
  now: Date = new Date(),
): boolean {
  if (!subscription || !subscription.active) return false
  const remainingMs = new Date(subscription.expiresAt).getTime() - now.getTime()
  return remainingMs > 0 && remainingMs <= expiringSoonDays * 24 * 60 * 60 * 1000
}

/**
 * AI 次數或儲存空間任一達到方案上限。
 *
 * 門檻是「已用滿」而非「快用完」：提醒使用者升級是產品端的事，
 * 後台要追的是已經卡住的人。已停用的訂閱同樣排除，與到期判定一致。
 */
export function isQuotaExhausted(
  subscription: Subscription | null,
  plan: SubscriptionPlan | null,
): boolean {
  if (!subscription || !subscription.active || !plan) return false

  // 契約分析的額度改由功能矩陣決定，並把單次加購算進去
  const analysis = featureVerdict(
    plan.features['contract-analysis'],
    subscription.aiUsed,
    subscription.extraCredits['contract-analysis'] ?? 0,
  )
  const storageFull = plan.storageMb > 0 && subscription.storageUsedMb >= plan.storageMb
  return analysis === 'exhausted' || storageFull
}

/** 列表與案件裡呈現使用者的名稱，沒有暱稱時退回 email */
export function userDisplayName(user: Pick<AdminUser, 'nickname' | 'email'>): string {
  return user.nickname ?? user.email
}

/** 使用者在一筆案件裡站哪一邊 */
export type CaseSide = 'tenant' | 'landlord'

export const caseSideLabels: Record<CaseSide, string> = {
  tenant: '租客',
  landlord: '房東',
}

/** 已結案的工單狀態，不列入「待處理」 */
const CLOSED_TICKET_STATUSES: MaintenanceStatus[] = ['completed', 'closed']

export function isTicketOpen(status: MaintenanceStatus): boolean {
  return !CLOSED_TICKET_STATUSES.includes(status)
}

export interface UserDepositView extends DepositRecord {
  side: CaseSide
  match: DepositMatch
  /** 雙方聲明的差額，相符或未聲明時為 0 */
  gap: number
}

export interface UserTicketView extends MaintenanceTicket {
  side: CaseSide
  open: boolean
}

export interface UserDirectoryRow {
  user: AdminUser
  /** 沒有訂閱記錄時為 null，詳情頁顯示空狀態 */
  subscription: Subscription | null
  plan: SubscriptionPlan | null
  deposits: UserDepositView[]
  tickets: UserTicketView[]
  openTicketCount: number
  overdueTicketCount: number
  mismatchedDepositCount: number
  subscriptionExpiring: boolean
  quotaExhausted: boolean
}

export interface UserDirectorySources {
  users: AdminUser[]
  tickets: MaintenanceTicket[]
  deposits: DepositRecord[]
  subscriptions: Subscription[]
  plans: SubscriptionPlan[]
}

/**
 * 把工單／押金／訂閱接到每個使用者身上。一筆案件會同時掛在房東與租客兩邊。
 *
 * `now` 可注入，讓「即將到期」的測試不必跟著真實日期飄。
 * `expiringSoonDays` 是訂閱到期提醒門檻，見 isSubscriptionExpiring 的說明。
 */
export function joinUserDirectory(
  sources: UserDirectorySources,
  expiringSoonDays: number,
  now: Date = new Date(),
): UserDirectoryRow[] {
  const { users, tickets, deposits, subscriptions, plans } = sources

  return users.map((user) => {
    const subscription = subscriptions.find((item) => item.userId === user.id) ?? null
    const plan = subscription
      ? (plans.find((item) => item.id === subscription.planId) ?? null)
      : null

    const userDeposits: UserDepositView[] = deposits
      .filter((item) => item.tenantUserId === user.id || item.landlordUserId === user.id)
      .map((item) => ({
        ...item,
        side: item.tenantUserId === user.id ? 'tenant' : 'landlord',
        match: depositMatchOf(item.landlordDeclared, item.tenantDeclared),
        gap: depositGap(item.landlordDeclared, item.tenantDeclared),
      }))

    const userTickets: UserTicketView[] = tickets
      .filter((item) => item.tenantUserId === user.id || item.landlordUserId === user.id)
      .map((item) => ({
        ...item,
        side: item.tenantUserId === user.id ? 'tenant' : 'landlord',
        open: isTicketOpen(item.status),
      }))

    return {
      user,
      subscription,
      plan,
      deposits: userDeposits,
      tickets: userTickets,
      openTicketCount: userTickets.filter((item) => item.open).length,
      overdueTicketCount: userTickets.filter((item) => item.status === 'overdue').length,
      mismatchedDepositCount: userDeposits.filter((item) => item.match === 'mismatched').length,
      subscriptionExpiring: isSubscriptionExpiring(subscription, expiringSoonDays, now),
      quotaExhausted: isQuotaExhausted(subscription, plan),
    }
  })
}

export type UserAlert =
  | 'deposit-mismatch'
  | 'ticket-overdue'
  | 'subscription-expiring'
  | 'quota-exhausted'

export const userAlertLabels: Record<UserAlert, string> = {
  'deposit-mismatch': '押金金額不符',
  'ticket-overdue': '工單逾期',
  'subscription-expiring': '訂閱即將到期',
  'quota-exhausted': '額度已用滿',
}

export interface UserDirectoryFilter {
  keyword: string
  role: AdminUserRole | 'all'
  status: AdminUserStatus | 'all'
  /** 'none' 篩出沒有訂閱記錄的使用者 */
  plan: PlanId | 'none' | 'all'
  alert: UserAlert | 'all'
}

export const emptyUserDirectoryFilter: UserDirectoryFilter = {
  keyword: '',
  role: 'all',
  status: 'all',
  plan: 'all',
  alert: 'all',
}

export function isFilterActive(filter: UserDirectoryFilter): boolean {
  return (
    filter.keyword.trim() !== '' ||
    filter.role !== 'all' ||
    filter.status !== 'all' ||
    filter.plan !== 'all' ||
    filter.alert !== 'all'
  )
}

function matchesKeyword(row: UserDirectoryRow, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return (
    row.user.email.toLowerCase().includes(kw) ||
    (row.user.nickname ?? '').toLowerCase().includes(kw)
  )
}

function matchesPlan(row: UserDirectoryRow, plan: UserDirectoryFilter['plan']): boolean {
  if (plan === 'all') return true
  if (plan === 'none') return row.subscription === null
  return row.subscription?.planId === plan
}

function matchesAlert(row: UserDirectoryRow, alert: UserDirectoryFilter['alert']): boolean {
  switch (alert) {
    case 'all':
      return true
    case 'deposit-mismatch':
      return row.mismatchedDepositCount > 0
    case 'ticket-overdue':
      return row.overdueTicketCount > 0
    case 'subscription-expiring':
      return row.subscriptionExpiring
    case 'quota-exhausted':
      return row.quotaExhausted
    default:
      return true
  }
}

/** 訂閱方案分布的一段。planId 為 'none' 代表尚未訂閱。 */
export interface PlanDistributionSegment {
  planId: PlanId | 'none'
  label: string
  value: number
}

/**
 * 訂閱方案分布。永遠以全量 rows 計算 —— 圖表的用途是「進來先看一眼盤子長怎樣」，
 * 跟著篩選跑的話篩到單一方案時圖表只剩一段，等於自己把自己吃掉。
 */
export function planDistribution(
  rows: UserDirectoryRow[],
  plans: SubscriptionPlan[],
): PlanDistributionSegment[] {
  const segments: PlanDistributionSegment[] = plans.map((plan) => ({
    planId: plan.id,
    label: plan.name,
    value: rows.filter((row) => row.subscription?.planId === plan.id).length,
  }))

  segments.push({
    planId: 'none',
    label: '尚未訂閱',
    value: rows.filter((row) => row.subscription === null).length,
  })

  return segments
}

/** 管理員權限角色人數。adminRole 為 null 時視為超級管理員，與詳情頁的預設值一致。 */
export function adminRoleCounts(rows: UserDirectoryRow[]): Record<AdminRole, number> {
  const counts: Record<AdminRole, number> = { super: 0, admin: 0 }
  for (const row of rows) {
    if (row.user.role !== 'admin') continue
    counts[row.user.adminRole ?? 'super'] += 1
  }
  return counts
}

/** 五軸皆為 AND 疊加 */
export function filterUserDirectory(
  rows: UserDirectoryRow[],
  filter: UserDirectoryFilter,
): UserDirectoryRow[] {
  return rows.filter(
    (row) =>
      matchesKeyword(row, filter.keyword) &&
      (filter.role === 'all' || row.user.role === filter.role) &&
      (filter.status === 'all' || row.user.status === filter.status) &&
      matchesPlan(row, filter.plan) &&
      matchesAlert(row, filter.alert),
  )
}
