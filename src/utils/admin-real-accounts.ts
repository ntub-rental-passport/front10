/**
 * 真實帳號的統計。純邏輯，不依賴 Vue。
 *
 * ## 為什麼要跟展示資料分開算
 *
 * 使用者管理頁同時列出兩種資料：資料庫裡真的存在的帳號，以及為了呈現
 * 訂閱、押金、工單等模組而生成的展示資料。這個檔案只處理前者。
 *
 * 頁面上那四格 KPI 講的是「這個平台實際上有幾個人」，把展示資料算進去
 * 會讓那個數字變成沒有意義的混合值 —— 而它看起來仍然像個正常的數字，
 * 不會有任何地方報錯。所以呼叫端必須只傳真實帳號進來。
 *
 * ## 為什麼不做趨勢
 *
 * 這些統計沒有歷史快照可以比，算不出「比上週多幾 %」。
 * 顯示一個永遠是 +0% 的趨勢，比不顯示更糟 —— 它看起來像資訊，其實不是。
 */

// 與 admin-overview.ts 共用同一個常數，不要各寫一份（先前兩邊連寫法都不同：
// 7 * 86400000 vs 7 * 24 * 60 * 60 * 1000）
import { WEEK_MS } from './time-window'

/** 只取統計用得到的欄位，避免這個檔案綁死在 API 的回傳型別上。 */
export interface RealAccountLike {
  status: string
  emailVerified: boolean
  hasPassword: boolean
  providers: string[]
  createdAt: string | null
}

export interface RealAccountStats {
  total: number
  /** 近 7 天註冊 */
  newThisWeek: number
  suspended: number
  /** 信箱尚未驗證 */
  unverified: number
}


export function realAccountStats(
  accounts: RealAccountLike[],
  now: Date = new Date(),
): RealAccountStats {
  const since = now.getTime() - WEEK_MS

  let newThisWeek = 0
  let suspended = 0
  let unverified = 0

  for (const account of accounts) {
    // createdAt 可能是 null（舊資料沒有這個欄位），解析失敗時不計入，
    // 不要當成「剛註冊」—— 那會讓數字在沒有新使用者時自己長大
    if (account.createdAt) {
      const at = Date.parse(account.createdAt)
      if (!Number.isNaN(at) && at >= since) newThisWeek += 1
    }
    if (account.status === 'suspended') suspended += 1
    if (!account.emailVerified) unverified += 1
  }

  return { total: accounts.length, newThisWeek, suspended, unverified }
}

export type RegistrationSourceKey = 'google' | 'password' | 'both' | 'none'

export interface RegistrationSourceSegment {
  key: RegistrationSourceKey
  label: string
  count: number
}

const SOURCE_LABELS: Record<RegistrationSourceKey, string> = {
  google: '僅 Google',
  password: '僅密碼',
  both: '兩者皆有',
  none: '尚未設定',
}

/**
 * 註冊來源分布。
 *
 * 「兩者皆有」是真的會發生的狀態（先用密碼註冊、之後綁定 Google），
 * 不能硬塞進其中一邊 —— 那會讓兩個數字都變成錯的。
 *
 * 「尚未設定」指的是既沒有密碼也沒有第三方綁定的帳號。理論上不該存在，
 * 但如果真的有，讓它現形比讓它消失好：那代表資料出了問題。
 */
export function registrationSources(
  accounts: RealAccountLike[],
): RegistrationSourceSegment[] {
  const counts: Record<RegistrationSourceKey, number> = {
    google: 0,
    password: 0,
    both: 0,
    none: 0,
  }

  for (const account of accounts) {
    const hasGoogle = account.providers.includes('google')
    if (hasGoogle && account.hasPassword) counts.both += 1
    else if (hasGoogle) counts.google += 1
    else if (account.hasPassword) counts.password += 1
    else counts.none += 1
  }

  // 數量是 0 的分類不顯示：一個永遠是 0 的區段只會佔位置，
  // 而且會讓圖例看起來比實際情況複雜
  return (Object.keys(counts) as RegistrationSourceKey[])
    .filter((key) => counts[key] > 0)
    .map((key) => ({ key, label: SOURCE_LABELS[key], count: counts[key] }))
}
