import { computed } from 'vue'
import { getCurrentAdminRole } from './useAdminUsers'
import {
  visibleNavGroupsFor,
  canAdminAccessPath,
  type AdminNavGroup,
} from '@/src/utils/admin-rbac'

export { getCurrentAdminRole }

/**
 * 這裡原本還掛了一份 navIcons，把圖示元件併進每個導覽項目。已經移除：
 * 這是權限模組，「誰能看到什麼」跟「長什麼樣」混在一起之後很難只改一邊。
 *
 * 圖示現在只有一份，在 src/components/admin/nav-icons.ts，由側欄與行動抽屜
 * 共用。移除前兩份對照表已經有 4 個路徑不一樣了（subsidy、content、
 * notifications、monitoring）—— 正是兩份對照表必然的下場。
 */

export function useAdminRbac() {
  const currentAdminRole = computed(() => getCurrentAdminRole())

  const visibleNavGroups = computed<AdminNavGroup[]>(() =>
    visibleNavGroupsFor(currentAdminRole.value),
  )

  const canAccessPath = (path: string): boolean =>
    canAdminAccessPath(currentAdminRole.value, path)

  return { currentAdminRole, visibleNavGroups, canAccessPath }
}
