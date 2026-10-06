import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { migrateLastLoginAt } from '@/src/utils/admin-activity'
import {
  seedAdminUsers,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION } from '@/src/utils/admin-collection-migrate'

export const adminUsersCollection = createAdminCollection<AdminUser[]>(
  `users-${ADMIN_DATASET_VERSION}`,
  seedAdminUsers,
  migrateLastLoginAt,
)
const users = adminUsersCollection

export const adminRoleLabels: Record<AdminUserRole, string> = {
  user: '租客',
  landlord: '房東',
  admin: '管理員',
}

/**
 * 登入成功時蓋上時間戳。總覽頁的「近期活躍」就是數這個欄位，
 * 沒有這一步的話那個數字永遠只會是 seed 的靜態值。
 */
export function recordLogin(email: string): void {
  const target = email.trim().toLowerCase()
  const user = adminUsersCollection.value.find((item) => item.email.toLowerCase() === target)
  if (!user) return
  user.lastLoginAt = new Date().toISOString()
}

export function useAdminUsers() {
  const { logAction } = useAdminAudit()

  /** `reason` 只在停用時有意義，寫進稽核紀錄（跟後端的真實帳號同一種寫法） */
  function setStatus(id: string, status: AdminUserStatus, reason?: string): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.status === status) return
    user.status = status
    const trimmed = reason?.trim()
    const detail = status === 'suspended' ? (trimmed ? `停用帳號：${trimmed}` : '停用帳號') : '啟用帳號'
    logAction('使用者管理', user.email, detail)
  }

  function setRole(id: string, role: AdminUserRole): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.role === role) return
    const previous = adminRoleLabels[user.role]
    user.role = role
    logAction('使用者管理', user.email, `角色由「${previous}」變更為「${adminRoleLabels[role]}」`)
  }

  return { users, setStatus, setRole }
}
