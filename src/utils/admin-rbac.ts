import type { AdminRole } from '@/src/mocks/admin/users'

export type { AdminRole }

export interface AdminNavItem {
  label: string
  path: string
  roles: AdminRole[]
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const ADMIN_ROLES: AdminRole[] = ['super', 'admin']

export const adminRoleLabels: Record<AdminRole, string> = {
  super: '超級管理員',
  admin: '一般管理員',
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: '營運管理',
    items: [
      { label: '後台總覽', path: '/admin', roles: ['super', 'admin'] },
      // 押金對帳與訂閱容量已整合進使用者管理，一般管理員可檢視，
      // 但改角色與停用帳號在詳情頁另外限超級管理員。
      { label: '使用者管理', path: '/admin/users', roles: ['super', 'admin'] },
      { label: '報修工單', path: '/admin/maintenance-tickets', roles: ['super', 'admin'] },
      { label: '租金補貼', path: '/admin/subsidy', roles: ['super', 'admin'] },
    ],
  },
  {
    label: '內容與通知',
    items: [
      { label: '內容與通知', path: '/admin/content', roles: ['super', 'admin'] },
    ],
  },
  {
    label: '系統',
    items: [
      // 監控是一般管理員也該看的，所以「系統」群組對他們不再是完全隱藏
      { label: '系統監控', path: '/admin/monitoring', roles: ['super', 'admin'] },
      { label: '稽核紀錄', path: '/admin/audit', roles: ['super'] },
      { label: '系統設定', path: '/admin/settings', roles: ['super'] },
    ],
  },
]

function normalizePath(path: string): string {
  const segments = path.split('/').filter(Boolean) // e.g. 'admin', 'users', 'detail'
  if (segments.length === 0) return '/'
  if (segments[0] !== 'admin') return `/${segments[0]}`
  if (segments.length === 1) return '/admin'
  return `/admin/${segments[1]}`
}

function findNavItem(path: string): AdminNavItem | undefined {
  const normalized = normalizePath(path)
  for (const group of adminNavGroups) {
    const found = group.items.find((item) => item.path === normalized)
    if (found) return found
  }
  return undefined
}

export function canAdminAccessPath(role: AdminRole, path: string): boolean {
  const item = findNavItem(path)
  if (!item) return true
  return item.roles.includes(role)
}

export function visibleNavGroupsFor(role: AdminRole): AdminNavGroup[] {
  return adminNavGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0)
}
