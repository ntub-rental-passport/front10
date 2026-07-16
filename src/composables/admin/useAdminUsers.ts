import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedAdminUsers,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/src/mocks/admin-seed'

const users = createAdminCollection<AdminUser[]>('users', seedAdminUsers)

export const adminRoleLabels: Record<AdminUserRole, string> = {
  user: '租客',
  landlord: '房東',
  admin: '管理員',
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

  return { users, setStatus, setRole }
}
