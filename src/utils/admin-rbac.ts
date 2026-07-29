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

export const ADMIN_ROLES: AdminRole[] = ['super', 'ops', 'content']

export const adminRoleLabels: Record<AdminRole, string> = {
  super: '超級管理員',
  ops: '營運管理員',
  content: '內容審核員',
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: '營運管理',
    items: [
      { label: '後台總覽', path: '/admin', roles: ['super', 'ops', 'content'] },
      { label: '使用者管理', path: '/admin/users', roles: ['super', 'ops'] },
      { label: '物件與評價審核', path: '/admin/review', roles: ['super', 'ops', 'content'] },
      { label: '訂閱與容量', path: '/admin/subscription', roles: ['super', 'ops'] },
    ],
  },
  {
    label: '內容與知識',
    items: [
      { label: '內容管理', path: '/admin/content', roles: ['super', 'content'] },
      { label: '法規知識庫', path: '/admin/knowledge', roles: ['super', 'content'] },
      { label: 'AI 品質監控', path: '/admin/ai-quality', roles: ['super', 'content'] },
    ],
  },
  {
    label: '系統',
    items: [
      { label: '稽核紀錄', path: '/admin/audit', roles: ['super', 'ops'] },
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
