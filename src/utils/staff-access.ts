import type { AdminUser } from '@/src/mocks/admin/users'

/**
 * 內部人員登入的帳號查核。
 *
 * 原本登入頁讓人自己按「系統管理員／資料審核人員」來決定身分，email 只是原封不動
 * 存進 session、完全不參與判斷——等於任何人打任何信箱都進得了後台。權限本來就該
 * 由帳號決定，所以改成拿 email 去使用者名冊裡查，查不到或不是管理員就擋下來。
 */
export type StaffAccessDenialReason = 'not-found' | 'not-staff' | 'disabled'

/**
 * 刻意用扁平結構而不是 { ok: true } | { ok: false } 的判別式聯集：
 * 本專案 tsconfig 沒有開 strictNullChecks，那種聯集在呼叫端收窄不了，
 * 存取 reason 會直接變成型別錯誤。
 */
export interface StaffAccessResult {
  /** 通過時是該帳號，被擋下時為 null */
  user: AdminUser | null
  /** null 代表通過 */
  reason: StaffAccessDenialReason | null
}

/** 使用者輸入的大小寫與前後空白不該影響比對結果 */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function resolveStaffAccess(users: AdminUser[], email: string): StaffAccessResult {
  const target = normalizeEmail(email)
  const user = users.find((item) => normalizeEmail(item.email) === target)

  if (!user) return { user: null, reason: 'not-found' }
  if (user.role !== 'admin') return { user: null, reason: 'not-staff' }
  // 停用中的管理員帳號仍留在名冊裡供稽核，但不該還能登入
  if (user.status !== 'active') return { user: null, reason: 'disabled' }

  return { user, reason: null }
}

/**
 * 「查無此帳號」與「這不是內部帳號」對外用同一句話：對未授權的人來說，
 * 能區分這兩者就等於可以拿登入頁當帳號探測器。
 */
export const staffAccessMessages: Record<StaffAccessDenialReason, string> = {
  'not-found': '這組信箱不是內部人員帳號。',
  'not-staff': '這組信箱不是內部人員帳號。',
  disabled: '此帳號已停用，請聯絡系統管理員。',
}
