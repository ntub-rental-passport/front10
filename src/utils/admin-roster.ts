/**
 * 系統設定頁的管理員名單（唯讀）。純邏輯。
 *
 * 回答的問題是「現在誰能進後台」。新增或移除管理員刻意不開放從網頁做：
 * 要在伺服器上用 backend/manage_admin.py —— 網頁被攻破也拿不到管理員。
 */

import type { StatusDotTone } from '@/src/components/admin/status-dot'
import type { AdminAccount } from '@/src/services/adminUsersApi'
import { lastLoginText } from './admin-user-list'

/** 超過這麼久沒登入的管理員帳號，建議移除：沒人在用的高權限帳號是最好的攻擊目標 */
export const ADMIN_DORMANT_DAYS = 90

export interface AdminRosterFlag {
  tone: StatusDotTone
  label: string
}

export interface AdminRosterRow {
  id: number
  email: string
  name: string
  lastLoginAt: string | null
  lastLoginLabel: string
  flag: AdminRosterFlag | null
}

function flagOf(account: AdminAccount, now: Date): AdminRosterFlag | null {
  if (account.status === 'suspended') return { tone: 'idle', label: '已停用' }
  if (!account.lastLoginAt) return null
  const days = (now.getTime() - new Date(account.lastLoginAt).getTime()) / 86_400_000
  // 「沒有登入紀錄」不標：登入時間是 2026/09/09 才開始記的，沒紀錄不代表沒在用
  return days > ADMIN_DORMANT_DAYS ? { tone: 'warn', label: `超過 ${ADMIN_DORMANT_DAYS} 天沒登入` } : null
}

/** 只留有管理員身分的帳號；啟用中的在前，其中最近登入的在前 */
export function adminRoster(accounts: AdminAccount[], now: Date = new Date()): AdminRosterRow[] {
  const loginTime = (account: AdminAccount) => (account.lastLoginAt ? new Date(account.lastLoginAt).getTime() : 0)
  return accounts
    .filter((account) => account.roles.includes('admin'))
    .sort(
      (a, b) =>
        Number(a.status === 'suspended') - Number(b.status === 'suspended') || loginTime(b) - loginTime(a),
    )
    .map((account) => ({
      id: account.id,
      email: account.email,
      name: account.displayName?.trim() || account.email,
      lastLoginAt: account.lastLoginAt,
      lastLoginLabel: lastLoginText(account.lastLoginAt, now),
      flag: flagOf(account, now),
    }))
}
