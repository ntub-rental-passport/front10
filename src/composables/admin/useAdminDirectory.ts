import { computed, ref } from 'vue'
import { adminUsersCollection } from './useAdminUsers'
import { adminMaintenanceCollection } from './useAdminMaintenance'
import { adminDepositCollection } from './useAdminDeposits'
import { adminPlansCollection, adminSubscriptionCollection } from './useAdminSubscription'
<<<<<<< HEAD
import { adminSettings } from './useAdminSettings'
=======
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
import {
  adminRoleCounts,
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  joinUserDirectory,
  planDistribution,
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
<<<<<<< HEAD
    joinUserDirectory(
      {
        users: adminUsersCollection.value,
        tickets: adminMaintenanceCollection.value,
        deposits: adminDepositCollection.value,
        subscriptions: adminSubscriptionCollection.value,
        plans: adminPlansCollection.value,
      },
      adminSettings.value.subscriptionExpiringSoonDays,
    ),
=======
    joinUserDirectory({
      users: adminUsersCollection.value,
      tickets: adminMaintenanceCollection.value,
      deposits: adminDepositCollection.value,
      subscriptions: adminSubscriptionCollection.value,
      plans: adminPlansCollection.value,
    }),
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
  )

  const filteredRows = computed(() => filterUserDirectory(rows.value, filter.value))

  // 圖表刻意吃全量 rows，不吃 filteredRows —— 見 planDistribution 的註解
  const planSegments = computed(() => planDistribution(rows.value, adminPlansCollection.value))
  const adminCounts = computed(() => adminRoleCounts(rows.value))

  const filterActive = computed(() => isFilterActive(filter.value))

  function clearFilter(): void {
    filter.value = { ...emptyUserDirectoryFilter }
  }

  function rowOf(userId: string): UserDirectoryRow | null {
    return rows.value.find((row) => row.user.id === userId) ?? null
  }

  return {
    rows,
    filteredRows,
    filter,
    filterActive,
    clearFilter,
    rowOf,
    planSegments,
    adminCounts,
  }
}
