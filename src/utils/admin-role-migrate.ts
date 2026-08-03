import type { AdminRole } from '@/src/mocks/admin/users'

/**
 * 管理員角色曾經有三種（super / ops / content），現已縮減為 super / admin。
 * 使用者瀏覽器的 localStorage 仍可能存著舊值，載入時需轉換。
 *
 * 未知值一律降為 admin 而非 super：權限判斷寧可保守，
 * 否則舊資料在型別對不上時會被 getCurrentAdminRole() 回退成 super。
 */
export function migrateAdminRole(raw: unknown): AdminRole | null {
  if (raw == null) return null
  return raw === 'super' ? 'super' : 'admin'
}

export function migrateAdminRoleInUsers<T extends { adminRole?: unknown }>(users: T[]): T[] {
  return users.map((user) => ({ ...user, adminRole: migrateAdminRole(user.adminRole) }))
}
