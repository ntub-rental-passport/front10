/**
 * 使用者與各案件的關聯與篩選。純邏輯，不依賴 Vue。
 *
 * 後台把報修工單、押金對帳、訂閱容量都收斂到使用者底下，
 * 這個檔案負責把散在各 collection 的資料接成一列一列的使用者，以及套用列表的篩選條件。
 */

import type { AdminUser, AdminUserRole, AdminUserStatus } from '@/src/mocks/admin/users'
import type { MaintenanceTicket } from '@/src/types/admin-maintenance'
import type { DepositRecord } from '@/src/mocks/admin/deposit'
import type { Subscription } from '@/src/mocks/admin/subscription'
import type { AccountUsage } from '@/src/types/admin-usage'
import { accountUsageLimits } from './admin-usage'
import { depositGap, depositMatchOf, type DepositMatch } from './admin-deposit'
import type { MaintenanceStatus } from './admin-maintenance'
import type { RealMaintenanceTicket } from './admin-repair'
import {
  effectivePlanKey,
  getPlanLimits,
  hasActivePaidPlan,
  isInTrial,
  planRoleOf,
  tenantAiUsage,
  userPlan,
} from './admin-plans'
import { subscriptionPlans, type PlanKey, type PlanRole } from './subscription-plans'

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
  if (!subscription || !hasActivePaidPlan(subscription)) return false
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
  emailVerified: boolean,
  now: Date = new Date(),
): boolean {
  if (!subscription?.active || subscription.role !== 'tenant') return false
  const storage = getPlanLimits('tenant', effectivePlanKey(subscription, now)).storage.limit
  return tenantAiUsage(subscription, emailVerified, now).exhausted || subscription.storageUsedMb >= storage
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
  /**
   * 資料庫裡的帳號 id。只有真實帳號有值，展示資料為 undefined。
   *
   * 它同時是兩件事的依據：
   *   1. 這一列有沒有「停用」「發送通知」按鈕（展示資料在後端沒有帳號可改）
   *   2. 停用這一列時要打哪個 API（展示資料沒有真的可以停用的對象）
   *
   * 用「有沒有值」而不是另開一個布林旗標：需要 id 的地方剛好就是需要
   * 區分真假的地方，兩個欄位可能不同步，一個不會。
   */
  realAccountId?: number
  /** 沒有訂閱記錄時為 null，仍適用該角色的 Free。 */
  subscription: Subscription | null
  /** null 表示讀不到或不適用，計數為零必須有來源資料。 */
  usage: AccountUsage | null
  overLimit: boolean
  deposits: UserDepositView[]
  tickets: UserTicketView[]
  openTicketCount: number
  overdueTicketCount: number
  mismatchedDepositCount: number
  subscriptionExpiring: boolean
  quotaExhausted: boolean
}

/** 後端 /api/admin/users 回傳的一列，只取這個檔案用得到的欄位。 */
export interface RealAccountInput {
  id: number
  email: string
  displayName: string | null
  roles: string[]
  status: string
  emailVerified: boolean
  createdAt: string | null
  lastLoginAt: string | null
  usage?: AccountUsage | null
}


/**
 * 把資料庫的真實帳號接成列表的一列。
 *
 * 先整理帳號本身，押金與工單由 joinRealUserDirectory 接真實來源。
 * 計數用量只取後端回傳，方案則由角色決定 Free，避免編造使用紀錄。
 *
 * 管理員只能由能登入伺服器的人用 manage_admin.py 授予，後台不提供新增管理員。
 */
export function realAccountToRow(account: RealAccountInput): UserDirectoryRow {
  const isAdmin = account.roles.includes('admin')
  const role: AdminUserRole = isAdmin
    ? 'admin'
    : account.roles.includes('landlord')
      ? 'landlord'
      : 'user'
  const usage = account.usage ?? null

  return {
    realAccountId: account.id,
    user: {
      // 加前綴避免與展示資料的 id（u-001 之類）相撞
      id: `real-${account.id}`,
      email: account.email,
      nickname: account.displayName,
      role,
      status: account.status === 'suspended' ? 'suspended' : 'active',
      emailVerified: account.emailVerified,
      registeredAt: account.createdAt ?? '',
      lastLoginAt: account.lastLoginAt,
    },
    subscription: null,
    usage,
    overLimit: accountUsageLimits(userPlan({ role }, null), usage)?.overLimit ?? false,
    deposits: [],
    tickets: [],
    openTicketCount: 0,
    overdueTicketCount: 0,
    mismatchedDepositCount: 0,
    subscriptionExpiring: false,
    quotaExhausted: false,
  }
}


/** 共用案件關聯規則；呼叫端分開傳真實與展示來源，避免兩邊混接。 */
export function joinUserCases(
  row: UserDirectoryRow,
  deposits: DepositRecord[],
  tickets: (MaintenanceTicket & { overdue?: boolean })[],
): UserDirectoryRow {
  const userDeposits: UserDepositView[] = deposits
    .filter((item) => item.tenantUserId === row.user.id || item.landlordUserId === row.user.id)
    .map((item) => ({
      ...item,
      side: item.tenantUserId === row.user.id ? 'tenant' : 'landlord',
      match: depositMatchOf(item.landlordDeclared, item.tenantDeclared),
      gap: depositGap(item.landlordDeclared, item.tenantDeclared),
    }))

  const userTickets: UserTicketView[] = tickets
    .filter((item) => item.tenantUserId === row.user.id || item.landlordUserId === row.user.id)
    .map((item) => ({
      ...item,
      side: item.tenantUserId === row.user.id ? 'tenant' : 'landlord',
      open: isTicketOpen(item.status),
    }))

  return {
    ...row,
    deposits: userDeposits,
    tickets: userTickets,
    openTicketCount: userTickets.filter((item) => item.open).length,
    // 真實工單的逾期是獨立旗標，展示工單則沿用狀態。
    overdueTicketCount: userTickets.filter((item) =>
      'overdue' in item ? item.overdue === true : item.status === 'overdue',
    ).length,
    mismatchedDepositCount: userDeposits.filter((item) => item.match === 'mismatched').length,
  }
}

/** 只在使用者關聯時換 id，工單頁仍使用後端的數字字串。 */
export function joinRealUserDirectory(
  accounts: RealAccountInput[],
  deposits: DepositRecord[],
  tickets: RealMaintenanceTicket[],
): UserDirectoryRow[] {
  const directoryTickets = tickets.map((ticket) => ({
    ...ticket,
    landlordUserId: `real-${ticket.landlordUserId}`,
    tenantUserId: `real-${ticket.tenantUserId}`,
  }))
  return accounts.map((account) => joinUserCases(realAccountToRow(account), deposits, directoryTickets))
}

export interface UserDirectorySources {
  users: AdminUser[]
  tickets: MaintenanceTicket[]
  deposits: DepositRecord[]
  subscriptions: Subscription[]
  usageByUserId?: Record<string, AccountUsage>
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
  const { users, tickets, deposits, subscriptions } = sources

  return users.map((user) => {
    const subscription = subscriptions.find(
      (item) => item.userId === user.id && item.role === planRoleOf(user.role),
    ) ?? null
    const usage = sources.usageByUserId?.[user.id] ?? null

    return joinUserCases({
      user,
      subscription,
      usage,
      overLimit: accountUsageLimits(userPlan(user, subscription, now), usage)?.overLimit ?? false,
      deposits: [],
      tickets: [],
      openTicketCount: 0,
      overdueTicketCount: 0,
      mismatchedDepositCount: 0,
      subscriptionExpiring: isSubscriptionExpiring(subscription, expiringSoonDays, now),
      quotaExhausted: isQuotaExhausted(subscription, user.emailVerified, now),
    }, deposits, tickets)
  })
}

export type UserAlert =
  | 'deposit-mismatch'
  | 'ticket-overdue'
  | 'subscription-expiring'
  | 'quota-exhausted'
  | 'over-limit'

export const userAlertLabels: Record<UserAlert, string> = {
  'deposit-mismatch': '押金金額不符',
  'ticket-overdue': '工單逾期',
  'subscription-expiring': '訂閱即將到期',
  'quota-exhausted': '額度已用滿',
  'over-limit': '超出方案上限',
}

export interface UserDirectoryFilter {
  keyword: string
  role: AdminUserRole | 'all'
  status: AdminUserStatus | 'all'
  plan: `${PlanRole}-${PlanKey}` | 'all'
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

function matchesPlan(row: UserDirectoryRow, plan: UserDirectoryFilter['plan'], now: Date): boolean {
  if (plan === 'all') return true
  const current = userPlan(row.user, row.subscription, now)
  return !!current && `${current.role}-${current.key}` === plan
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
    case 'over-limit':
      return row.overLimit
    default:
      return true
  }
}

export interface PlanDistributionSegment {
  planKey: PlanKey
  label: string
  value: number
  trialCount: number
}

/** 分布吃全量使用者；只依角色分組，避免列表篩到單一方案後圖表也只剩一段。 */
export function planDistribution(
  rows: UserDirectoryRow[],
  role: PlanRole,
  now: Date = new Date(),
): PlanDistributionSegment[] {
  return subscriptionPlans[role].map((plan) => {
    const members = rows.filter((row) => {
      const current = userPlan(row.user, row.subscription, now)
      return current?.role === role && current.key === plan.key
    })
    return {
      planKey: plan.key,
      label: plan.name,
      value: members.length,
      trialCount: members.filter((row) =>
        row.subscription?.role === role && row.subscription.active && isInTrial(row.subscription.trialEndsAt, now),
      ).length,
    }
  })
}

export function adminCount(rows: UserDirectoryRow[]): number {
  return rows.filter((row) => row.user.role === 'admin').length
}

/** 五軸皆為 AND 疊加 */
export function filterUserDirectory(
  rows: UserDirectoryRow[],
  filter: UserDirectoryFilter,
  now: Date = new Date(),
): UserDirectoryRow[] {
  return rows.filter(
    (row) =>
      matchesKeyword(row, filter.keyword) &&
      (filter.role === 'all' || row.user.role === filter.role) &&
      (filter.status === 'all' || row.user.status === filter.status) &&
      matchesPlan(row, filter.plan, now) &&
      matchesAlert(row, filter.alert),
  )
}
