/**
 * 使用者活躍度。
 *
 * 這裡刻意不做「在線人數」——那需要 session heartbeat、WebSocket 連線數或後端
 * access log，本專案三樣都沒有，任何即時人數都只能是編出來的。改為統計「近 N 天
 * 曾經登入過的人」：數字來自實際發生過的登入，登入時由 recordLogin() 寫入時間戳，
 * 是這個資料模型撐得起的最強說法。
 */
export interface ActivityUser {
  /** 從未登入過的帳號為 null */
  lastLoginAt: string | null
}

export const activeWindowDays = 7

/** 舊資料沒有這個欄位，補 null 代表「沒有登入紀錄」，不要假裝成剛登入過。 */
export function migrateLastLoginAt<T extends { lastLoginAt?: string | null }>(users: T[]): T[] {
  return users.map((user) =>
    user.lastLoginAt === undefined ? { ...user, lastLoginAt: null } : user,
  )
}

export function isActiveSince(
  user: ActivityUser,
  days: number = activeWindowDays,
  now: Date = new Date(),
): boolean {
  if (!user.lastLoginAt) return false
  const at = new Date(user.lastLoginAt).getTime()
  if (Number.isNaN(at)) return false
  // 未來時間視為活躍，比當成無效資料丟掉合理——時鐘偏移不該讓人憑空消失
  return at > now.getTime() - days * 86400000
}

export function countActiveUsers(
  users: ActivityUser[],
  days: number = activeWindowDays,
  now: Date = new Date(),
): number {
  return users.filter((user) => isActiveSince(user, days, now)).length
}
