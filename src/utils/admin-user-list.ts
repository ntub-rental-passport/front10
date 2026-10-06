import type { UserDirectoryRow } from './admin-user-directory'

/**
 * 使用者列表的排序、分頁、去重與批次操作。
 *
 * 從 users.vue 抽出來，因為這幾件事都有「看起來對、其實錯」的陷阱，
 * 放在元件裡測不到（vitest 是 node 環境，不 mount 元件）。
 */

/* -------------------- 重複帳號 -------------------- */

/**
 * 同一個 email 同時是真實帳號與展示資料時，只留真實那一列。
 *
 * 實際發生過：admin@rentmate.tw 是真的登入帳號，展示資料剛好也有一個
 * 同 email 的管理員，列表上出現兩列。管理員分不出哪一列按下去會真的生效，
 * 而且兩列的資料還不一樣（展示那列有假的訂閱紀錄）。
 *
 * 比對不分大小寫：Email 本來就不分大小寫，後端存的跟展示資料寫的未必一致。
 */
export function dropDemoDuplicates(
  realRows: UserDirectoryRow[],
  demoRows: UserDirectoryRow[],
): UserDirectoryRow[] {
  const realEmails = new Set(realRows.map((row) => row.user.email.toLowerCase()))
  return demoRows.filter((row) => !realEmails.has(row.user.email.toLowerCase()))
}

/* -------------------- 排序 -------------------- */

export type UserSortKey = 'user' | 'role' | 'lastLogin' | 'status'
export type SortDir = 'asc' | 'desc'

/** 身分的排序依權限由小到大：租客、房東、管理員。 */
function roleRank(row: UserDirectoryRow): number {
  if (row.user.role === 'admin') return 2
  return row.user.role === 'landlord' ? 1 : 0
}

/** 停用的排在後面：升冪時先看到正常的，要找停用的就按一下改降冪。 */
function statusRank(row: UserDirectoryRow): number {
  return row.user.status === 'suspended' ? 1 : 0
}

function loginTime(row: UserDirectoryRow): number | null {
  const value = row.user.lastLoginAt
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * 回傳新陣列，不動原本的。
 *
 * 「沒有登入紀錄」不管升冪還是降冪都排在最後 —— 它不是「最久以前」，
 * 是「沒有資料」。把它當成時間最早的一端，按「最近登入」降冪時它會
 * 沉到底（對），按升冪時卻會浮到最上面，看起來像是最久沒登入的人。
 *
 * 平手時維持原本的順序（Array.prototype.sort 是穩定排序），
 * 所以同一個身分裡真實帳號仍然排在展示資料前面。
 */
export function sortUserRows(
  rows: UserDirectoryRow[],
  key: UserSortKey,
  dir: SortDir,
): UserDirectoryRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'lastLogin') {
      const ta = loginTime(a)
      const tb = loginTime(b)
      if (ta === null && tb === null) return 0
      if (ta === null) return 1
      if (tb === null) return -1
      return (ta - tb) * sign
    }
    if (key === 'role') return (roleRank(a) - roleRank(b)) * sign
    if (key === 'status') return (statusRank(a) - statusRank(b)) * sign
    return a.user.email.localeCompare(b.user.email, 'zh-Hant', { sensitivity: 'base' }) * sign
  })
}

/* -------------------- 分頁 -------------------- */

export const USER_PAGE_SIZE = 25

export interface Page<T> {
  items: T[]
  /** 夾過之後實際的頁碼（1 起算） */
  page: number
  pageCount: number
  total: number
  /** 畫面上的「第 from–to 筆」，沒有資料時兩個都是 0 */
  from: number
  to: number
}

/**
 * 頁碼超出範圍時夾回最後一頁，而不是回傳空頁。
 *
 * 會超出範圍的情況很常見：在第 3 頁套了一個篩選，結果只剩 1 頁。
 * 回傳空頁的話畫面會顯示「沒有符合的使用者」，但其實有 —— 只是在第 1 頁。
 */
export function paginate<T>(items: T[], page: number, size = USER_PAGE_SIZE): Page<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return {
    items: slice,
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  }
}

/* -------------------- 最後登入 -------------------- */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 「3 天前」這種相對時間。完整時間放在 title 裡，這裡只負責掃視用的那一句。
 *
 * 沒有值時寫「沒有登入紀錄」，**不寫「從未登入」**：last_login_at 是
 * 2026/09/09 的 migration 才加的欄位。在那之前註冊、之後一直沒重新登入的人
 * （session 是長效的）這欄會是 NULL —— 他們登入過，只是沒被記到。
 * 實測 8 個真實帳號裡有 4 個是這種情況，包括天天在用的帳號。
 *
 * 未來的時間（伺服器與瀏覽器時鐘不同步）一律當「剛剛」，
 * 不要顯示成「-2 分鐘前」這種讓人以為壞掉的字。
 */
export const NO_LOGIN_RECORD = '沒有登入紀錄'

/** 滑過「沒有登入紀錄」時的說明 */
export const NO_LOGIN_RECORD_HINT =
  '登入時間從 2026/09/09 才開始記錄；在那之前登入過、之後沒再重新登入的帳號不會有紀錄。'

export function lastLoginText(iso: string | null | undefined, now: Date): string {
  if (!iso) return NO_LOGIN_RECORD
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return NO_LOGIN_RECORD
  const diff = now.getTime() - time
  if (diff < MINUTE) return '剛剛'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分鐘前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小時前`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`
  if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 個月前`
  return `${Math.floor(diff / (365 * DAY))} 年前`
}

/* -------------------- 批次操作 -------------------- */

/**
 * 這一列能不能被勾選來做批次操作。
 *
 * 只有真實、非管理員的帳號：
 *
 * - 展示資料：列表對它們本來就不給任何操作。發通知給展示帳號會產生一筆
 *   「已送達給不存在的人」的紀錄，看起來跟真的一模一樣；停用它們也沒有
 *   意義，沒有人會用那個帳號登入。
 * - 管理員：單列操作時後端會擋「停用自己」與「停用最後一位管理員」，
 *   但批次一次動好幾個人，一個手滑就可能把後台的人鎖在外面。批次刻意
 *   比單列保守 —— 要停用管理員，一個一個來。
 */
export function isBulkSelectable(row: UserDirectoryRow): boolean {
  return row.realAccountId !== undefined && row.user.role !== 'admin'
}

export interface BulkStatusPlan {
  /** 勾選中、目前是正常的 —— 按「停用」會動到的人 */
  suspend: UserDirectoryRow[]
  /** 勾選中、目前是停用的 —— 按「啟用」會動到的人 */
  activate: UserDirectoryRow[]
}

/**
 * 把勾選的人依目前狀態分成兩組。
 *
 * 「停用」只對正常的人、「啟用」只對停用的人，按鈕上的數字就是這兩組的
 * 人數。不這樣分的話，勾了 5 個人按停用，其中 2 個本來就停用了 ——
 * 結果訊息寫「已停用 5 位」，但實際只動了 3 位。
 */
export function planBulkStatus(rows: UserDirectoryRow[]): BulkStatusPlan {
  const eligible = rows.filter(isBulkSelectable)
  return {
    suspend: eligible.filter((row) => row.user.status === 'active'),
    activate: eligible.filter((row) => row.user.status === 'suspended'),
  }
}

export interface BulkOutcome {
  row: UserDirectoryRow
  ok: boolean
  /** 失敗時後端給的理由，原樣保留 */
  reason?: string
}

/**
 * 一個一個套用，每一筆的成敗分開記。
 *
 * 後端沒有批次 API，而且會針對個別帳號拒絕（例如停用自己）。
 * 一筆失敗就整批中止的話，前面已經成功的那幾筆會被當成沒發生；
 * 全部送出只回報「完成」的話，失敗的那幾筆會被靜靜吞掉。兩種都會讓
 * 管理員以為畫面上的狀態就是實際狀態。
 *
 * 刻意逐筆 await 而不是 Promise.all：同時送出去時，後端「最後一位管理員」
 * 這類檢查是在各自的交易裡判斷的，並行會讓它們彼此看不到對方。
 */
export async function runBulkStatus(
  rows: UserDirectoryRow[],
  apply: (row: UserDirectoryRow) => Promise<void>,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = []
  for (const row of rows) {
    try {
      await apply(row)
      outcomes.push({ row, ok: true })
    } catch (error) {
      outcomes.push({
        row,
        ok: false,
        reason: error instanceof Error ? error.message : '操作失敗',
      })
    }
  }
  return outcomes
}

/** 「3 位成功、1 位失敗」—— 失敗的要列出是誰、為什麼。 */
export function summarizeBulk(outcomes: BulkOutcome[]): {
  succeeded: number
  failed: { name: string; reason: string }[]
} {
  return {
    succeeded: outcomes.filter((item) => item.ok).length,
    failed: outcomes
      .filter((item) => !item.ok)
      .map((item) => ({
        name: item.row.user.nickname?.trim() || item.row.user.email,
        reason: item.reason ?? '操作失敗',
      })),
  }
}
