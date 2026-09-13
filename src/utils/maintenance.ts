/**
 * 維護模式的判定邏輯。
 *
 * 抽成純函式的理由：這段邏輯決定「使用者能不能進站」，錯了就是全站鎖死，
 * 而 router 守衛本身很難測。放在這裡才能用單元測試把每個分支釘住。
 */

/** 判定所需的欄位子集，避免測試要造出完整的 SystemSettings。 */
export interface MaintenanceConfig {
  maintenanceMode: boolean
  maintenanceStartsAt: string
  maintenanceEndsAt: string
  maintenanceAllowlist: string
}

/** 維護模式生效時仍可通行的路徑前綴。 */
const MAINTENANCE_BYPASS_PATHS = ['/admin', '/staff-login', '/maintenance']

export function parseAllowlist(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '')
}

/**
 * datetime-local 的值沒有時區資訊（YYYY-MM-DDTHH:mm），
 * new Date() 會以本機時區解讀，正好符合管理員設定排程時的心智模型。
 * 空字串或無法解析都回 null，代表「這一端沒有限制」。
 */
function parseLocalDateTime(value: string): Date | null {
  if (value.trim() === '') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * 維護模式此刻是否對這位使用者生效。
 *
 * 判定順序：關閉 → 不在排程區間 → 在白名單 → 生效。
 */
export function isMaintenanceActive(
  config: MaintenanceConfig,
  now: Date = new Date(),
  userEmail?: string | null,
): boolean {
  if (!config.maintenanceMode) return false

  const startsAt = parseLocalDateTime(config.maintenanceStartsAt)
  if (startsAt && now < startsAt) return false

  const endsAt = parseLocalDateTime(config.maintenanceEndsAt)
  if (endsAt && now > endsAt) return false

  if (userEmail) {
    const allowlist = parseAllowlist(config.maintenanceAllowlist)
    if (allowlist.includes(userEmail.trim().toLowerCase())) return false
  }

  return true
}

/**
 * 維護模式生效時，這個路徑是否仍可通行。
 *
 * /staff-login 一定要在清單裡：管理後台的登入入口在那裡，少了它，
 * 維護一開就沒有人能登入後台把維護模式關掉，形成無法自救的死鎖。
 */
export function isMaintenanceBypassPath(path: string): boolean {
  return MAINTENANCE_BYPASS_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  )
}
