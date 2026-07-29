import { computed, type Component } from 'vue'
import {
  BookOpen,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { getAuthSession } from '@/src/composables/useAuth'
import { adminUsersCollection } from './useAdminUsers'
import {
  visibleNavGroupsFor,
  canAdminAccessPath,
  type AdminRole,
  type AdminNavItem,
} from '@/src/utils/admin-rbac'

const navIcons: Record<string, Component> = {
  '/admin': LayoutDashboard,
  '/admin/users': Users,
  '/admin/review': ClipboardCheck,
  '/admin/subscription': CreditCard,
  '/admin/content': Megaphone,
  '/admin/knowledge': BookOpen,
  '/admin/ai-quality': Sparkles,
  '/admin/audit': ScrollText,
  '/admin/settings': Settings,
}

export function getCurrentAdminRole(): AdminRole {
  const session = getAuthSession()
  if (!session || session.role !== 'admin') return 'super'
  const user = adminUsersCollection.value.find((item) => item.email === session.email)
  return user?.adminRole ?? 'super'
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
