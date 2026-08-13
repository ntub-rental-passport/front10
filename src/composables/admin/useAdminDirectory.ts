import { computed, ref } from 'vue'
import { adminUsersCollection } from './useAdminUsers'
import { adminMaintenanceCollection } from './useAdminMaintenance'
import { adminDepositCollection } from './useAdminDeposits'
import { adminPlansCollection, adminSubscriptionCollection } from './useAdminSubscription'
import {
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  joinUserDirectory,
  type UserDirectoryFilter,
  type UserDirectoryRow,
} from '@/src/utils/admin-user-directory'

/**
 * 使用者管理的資料來源：把四個 collection 接成一列一列的使用者。
 *
 * 篩選狀態刻意放在模組層級，從詳情頁按返回時能回到原本的篩選結果。
 */
const filter = ref<UserDirectoryFilter>({ ...emptyUserDirectoryFilter })

export function useAdminDirectory() {
  const rows = computed<UserDirectoryRow[]>(() =>
    joinUserDirectory({
      users: adminUsersCollection.value,
      tickets: adminMaintenanceCollection.value,
      deposits: adminDepositCollection.value,
      subscriptions: adminSubscriptionCollection.value,
      plans: adminPlansCollection.value,
    }),
  )

  const filteredRows = computed(() => filterUserDirectory(rows.value, filter.value))

  const filterActive = computed(() => isFilterActive(filter.value))

  function clearFilter(): void {
    filter.value = { ...emptyUserDirectoryFilter }
  }

  function rowOf(userId: string): UserDirectoryRow | null {
    return rows.value.find((row) => row.user.id === userId) ?? null
  }

  return { rows, filteredRows, filter, filterActive, clearFilter, rowOf }
}
