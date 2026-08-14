import { computed, type Component } from 'vue'
import {
  Banknote,
  Gauge,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Users,
  Wrench,
} from 'lucide-vue-next'
import { getCurrentAdminRole } from './useAdminUsers'
import {
  visibleNavGroupsFor,
  canAdminAccessPath,
  type AdminNavItem,
} from '@/src/utils/admin-rbac'

export { getCurrentAdminRole }

const navIcons: Record<string, Component> = {
  '/admin': LayoutDashboard,
  '/admin/users': Users,
  '/admin/maintenance-tickets': Wrench,
  '/admin/subsidy': Banknote,
  '/admin/content': Megaphone,
  '/admin/monitoring': Gauge,
  '/admin/audit': ScrollText,
  '/admin/settings': Settings,
}

export interface AdminNavGroupWithIcons {
  label: string
  items: Array<AdminNavItem & { icon: Component }>
}

export function useAdminRbac() {
  const currentAdminRole = computed(() => getCurrentAdminRole())

  const visibleNavGroups = computed<AdminNavGroupWithIcons[]>(() =>
    visibleNavGroupsFor(currentAdminRole.value).map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({ ...item, icon: navIcons[item.path] })),
    })),
  )

  const canAccessPath = (path: string): boolean =>
    canAdminAccessPath(currentAdminRole.value, path)

  return { currentAdminRole, visibleNavGroups, canAccessPath }
}
