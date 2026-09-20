/**
 * 後台總覽「最近登入的使用者」。純邏輯，不依賴 Vue。
 *
 * 只吃真實帳號（useAdminDirectory().realAccounts，也就是後端 /api/admin/users
 * 的原始回傳）——展示資料沒有人真正登入過，混進來會生出不存在的登入紀錄。
 *
 * 從未登入過的帳號 lastLoginAt 是 null，直接濾掉，不參與排序：這張卡片要看的是
 * 「最近誰登入」，不是「有哪些帳號」，硬排進去也不知道該排在最前面還是最後面。
 */

export interface RecentLoginLike {
  id: number
  email: string
  displayName: string | null
  lastLoginAt: string | null
}

export interface RecentLoginEntry {
  id: number
  /** 顯示用名稱：暱稱優先，沒有暱稱退回 email */
  name: string
  email: string
  /** 文字頭像用的首字，規則與 AdminLayout.vue 的 initials 一致 */
  initial: string
  /** 原始 ISO 字串，交給呼叫端用 formatDateTime 之類的函式顯示 */
  lastLoginAt: string
}

const DEFAULT_LIMIT = 5

interface TimedAccount {
  account: RecentLoginLike
  lastLoginAt: string
  atMs: number
}

function toTimedAccount(account: RecentLoginLike): TimedAccount | null {
  if (!account.lastLoginAt) return null
  const atMs = Date.parse(account.lastLoginAt)
  // 解析失敗（髒資料）也視為沒有登入紀錄，不要讓 NaN 混進排序
  if (Number.isNaN(atMs)) return null
  return { account, lastLoginAt: account.lastLoginAt, atMs }
}

/**
 * 姓名／email 的首字。暱稱保留原樣（中文沒有大小寫可言），email 首字母強制大寫。
 *
 * 匯出是因為 AdminLayout 的頭像也要同一套規則。先前那裡有一份各自實作的
 * 複本，靠註解聲明「規則與此處一致」——那種寫法遲早會漂移成兩套規則，
 * 而且漂移了也不會有任何地方報錯。
 */
export function initialOf(displayName: string | null, email: string): string {
  const name = displayName?.trim()
  if (name) return name.slice(0, 1)
  const emailInitial = email.trim().slice(0, 1)
  return emailInitial ? emailInitial.toUpperCase() : '?'
}

/** 依 lastLoginAt 由新到舊排序，取前 limit 筆。 */
export function recentLogins(
  accounts: RecentLoginLike[],
  limit: number = DEFAULT_LIMIT,
): RecentLoginEntry[] {
  const timed = accounts
    .map(toTimedAccount)
    .filter((entry): entry is TimedAccount => entry !== null)
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, limit)

  return timed.map(({ account, lastLoginAt }) => ({
    id: account.id,
    name: account.displayName?.trim() || account.email,
    email: account.email,
    initial: initialOf(account.displayName, account.email),
    lastLoginAt,
  }))
}
