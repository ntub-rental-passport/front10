import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { getAuthSession } from '@/src/composables/useAuth'
import { migrateLastLoginAt } from '@/src/utils/admin-activity'
import {
  seedAdminUsers,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/src/mocks/admin-seed'
import { adminRoleLabels as rbacRoleLabels, type AdminRole } from '@/src/utils/admin-rbac'
import { migrateAdminRoleInUsers } from '@/src/utils/admin-role-migrate'
import { ADMIN_DATASET_VERSION } from '@/src/utils/admin-collection-migrate'

// 舊資料的 adminRole 可能是已淘汰的 'ops' / 'content'，載入時轉成新的兩種角色。
// 兩次欄位擴充（adminRole、lastLoginAt）都要能升級同一份舊資料，所以串起來跑
function migrateUsers(list: AdminUser[]): AdminUser[] {
  return migrateLastLoginAt(migrateAdminRoleInUsers(list))
}

export const adminUsersCollection = createAdminCollection<AdminUser[]>(
  `users-${ADMIN_DATASET_VERSION}`,
  seedAdminUsers,
  migrateUsers,
)
const users = adminUsersCollection

export const adminRoleLabels: Record<AdminUserRole, string> = {
  user: '租客',
  landlord: '房東',
  admin: '管理員',
}

/**
 * 目前登入者的管理員權限角色。
 *
 * 定義在這裡而非 useAdminRbac，是為了避免與 useAdminRbac 形成循環相依
 * （useAdminRbac 需要 adminUsersCollection 才能查角色）。
 */
export function getCurrentAdminRole(): AdminRole {
  const session = getAuthSession()
  if (!session || session.role !== 'admin') return 'super'
  const user = adminUsersCollection.value.find((item) => item.email === session.email)
  return user?.adminRole ?? 'super'
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

  function setStatus(id: string, status: AdminUserStatus): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.status === status) return
    user.status = status
    logAction('使用者管理', user.email, status === 'suspended' ? '停用帳號' : '啟用帳號')
  }

  function setRole(id: string, role: AdminUserRole): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.role === role) return
    const previous = adminRoleLabels[user.role]
    user.role = role
    logAction('使用者管理', user.email, `角色由「${previous}」變更為「${adminRoleLabels[role]}」`)
  }

  function setAdminRole(id: string, adminRole: AdminRole): void {
    // 使用者管理頁本身已限 super，這裡再擋一次，避免日後權限放寬時漏掉。
    if (getCurrentAdminRole() !== 'super') return
    const user = users.value.find((item) => item.id === id)
    if (!user || user.role !== 'admin' || user.adminRole === adminRole) return
    user.adminRole = adminRole
    logAction('使用者管理', user.email, `權限角色變更為「${rbacRoleLabels[adminRole]}」`)
  }

  return { users, setStatus, setRole, setAdminRole }
}
