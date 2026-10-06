import { computed, ref, watch } from 'vue'
import { useNow } from '../useNow'
import { adminUsersCollection } from './useAdminUsers'
import { useAdminMaintenance } from './useAdminMaintenance'
import { useAdminDeposits } from './useAdminDeposits'
import { adminSubscriptionCollection } from './useAdminSubscription'
import { adminSettings } from './useAdminSettings'
import {
  fetchAdminAccounts,
  updateAccountStatus,
  type AdminAccount,
} from '@/src/services/adminUsersApi'
import {
  adminCount,
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  joinUserDirectory,
  planDistribution,
  joinRealUserDirectory,
  type UserDirectoryFilter,
  type UserDirectoryRow,
} from '@/src/utils/admin-user-directory'
import type { PlanRole } from '@/src/utils/subscription-plans'
import { dropDemoDuplicates } from '@/src/utils/admin-user-list'
import { seedAdminUsers } from '@/src/mocks/admin/users'
import { seedSubscriptions } from '@/src/mocks/admin/subscription'
import { seedAccountUsage } from '@/src/mocks/admin/usage'
import { isAdminDemoEnabled } from '@/src/utils/admin-demo'

// 用量不跟著展示帳號的停用、角色或方案操作重算，才能監控異動後是否超額。
const demoUsage = isAdminDemoEnabled() ? (() => {
  const usageUsers = seedAdminUsers()
  return seedAccountUsage(usageUsers, seedSubscriptions(usageUsers), new Date())
})() : {}

/**
 * 使用者管理的資料來源。
 *
 * 這裡接的是兩種性質完全不同的資料：
 *
 *   真實帳號  資料庫裡真的存在的人。停用會讓對方立刻登不進來。
 *             列表的押金與工單接全站 API；詳情頁的押金對帳與
 *             點交存證仍另外向後端讀（adminUserRecordsApi.ts）。
 *   展示資料  為了呈現各模組而生成的假資料，彼此以固定 id 互相指涉。
 *
 * 本地開發時兩者併在同一張表裡，正式站只有真實帳號。
 * 畫面不另外標示展示資料（見 src/utils/admin-data-marking.md）。
 * 列表頁的「停用」只給真實帳號，所以按得到的停用一定會生效。
 * 這件事靠 UserDirectoryRow.realAccountId 表達（有值就是真的）。
 *
 * 篩選狀態與真實帳號都放在模組層級：從詳情頁按返回時
 * 回得到原本的篩選結果，也不必重打一次 API。
 */
const filter = ref<UserDirectoryFilter>({ ...emptyUserDirectoryFilter })

/**
 * 後端回傳的原始帳號。
 *
 * realRows 是轉成「列表一列」之後的形狀，為了跟展示資料併排而丟掉了
 * providers 與 hasPassword —— 那兩個欄位在列表上沒地方放，但統計
 * 註冊來源時需要。與其讓 UserDirectoryRow 為了統計而長出用不到的欄位，
 * 不如把原始資料一起留著。
 */
const realAccounts = ref<AdminAccount[]>([])
const realAccountsLoading = ref(false)
/** 讀不到真實帳號時的說明。空字串代表沒有問題。 */
const realAccountsError = ref('')
let loadedOnce = false

async function loadRealAccounts(): Promise<void> {
  realAccountsLoading.value = true
  realAccountsError.value = ''

  const accounts = await fetchAdminAccounts()
  if (accounts === null) {
    // 讀不到就誠實說讀不到，不要用展示資料魚目混珠 ——
    // 管理員會以為畫面上這些就是全部的真實帳號。
    realAccounts.value = []
    realAccountsError.value =
      '讀不到帳號資料。請確認伺服器已啟動，且目前登入的是管理員帳號。'
  } else {
    realAccounts.value = accounts
  }

  realAccountsLoading.value = false
  loadedOnce = true
}

export function useAdminDirectory() {
  const now = useNow()
  const { realRecords: realDeposits, demoRecords: demoDeposits, loadState: depositsState, reload: reloadDeposits } = useAdminDeposits()
  const { ticketViews: realTickets, loadState: ticketsState, reload: reloadTickets } = useAdminMaintenance()
  const realRows = computed(() => joinRealUserDirectory(realAccounts.value, realDeposits.value, realTickets.value))
  // 第一次使用時才打 API；之後從詳情頁返回不重打
  if (!loadedOnce) {
    loadedOnce = true
    void loadRealAccounts()
  }

  const demoRows = computed<UserDirectoryRow[]>(() =>
    joinUserDirectory(
      {
        users: adminUsersCollection.value,
        // 展示工單來源已移除；真實工單只接到真實帳號。
        tickets: [],
        deposits: demoDeposits.value,
        subscriptions: adminSubscriptionCollection.value,
        usageByUserId: demoUsage,
      },
      adminSettings.value.subscriptionExpiringSoonDays,
      now.value,
    ),
  )

  // 真實帳號排在前面：它們是會真的影響到人的那些列。
  // 同 email 的展示資料拿掉 —— admin@rentmate.tw 曾經同時出現兩列（見 dropDemoDuplicates）
  const rows = computed<UserDirectoryRow[]>(() => [
    ...realRows.value,
    ...dropDemoDuplicates(realRows.value, demoRows.value),
  ])

  const filteredRows = computed(() => filterUserDirectory(rows.value, filter.value, now.value))

  // 圖表刻意吃全量 rows，不吃 filteredRows —— 見 planDistribution 的註解
  const planRole = ref<PlanRole>('landlord')
  watch(() => filter.value.role, (role) => {
    if (role === 'landlord' || role === 'user') planRole.value = role === 'landlord' ? 'landlord' : 'tenant'
  }, { immediate: true })
  const planSegments = computed(() => planDistribution(rows.value, planRole.value, now.value))
  const adminTotal = computed(() => adminCount(rows.value))

  const filterActive = computed(() => isFilterActive(filter.value))

  function clearFilter(): void {
    filter.value = { ...emptyUserDirectoryFilter }
  }

  function rowOf(userId: string): UserDirectoryRow | null {
    return rows.value.find((row) => row.user.id === userId) ?? null
  }

  /**
   * 停用或啟用一個真實帳號。
   *
   * 只換掉這一列，不重抓整份 —— 避免其他列的狀態在畫面上跳動。
   * 後端的拒絕理由（不能停用自己、這是最後一位管理員）原樣往上丟，
   * 靜靜失敗會讓操作者以為停用成功了。
   */
  async function setRealAccountStatus(
    row: UserDirectoryRow,
    status: 'active' | 'suspended',
    reason?: string,
  ): Promise<void> {
    if (row.realAccountId === undefined) {
      throw new Error('這個帳號無法停用。')
    }
    const updated = await updateAccountStatus(row.realAccountId, status, reason)
    // 原始帳號也要換掉，否則「停用中」那格 KPI 不會跟著動
    realAccounts.value = realAccounts.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
  }

  return {
    rows,
    filteredRows,
    filter,
    filterActive,
    clearFilter,
    rowOf,
    planRole,
    planSegments,
    adminTotal,
    realAccounts,
    depositsState,
    ticketsState,
    reloadDeposits,
    reloadTickets,
    realAccountsLoading,
    realAccountsError,
    reloadRealAccounts: loadRealAccounts,
    setRealAccountStatus,
  }
}
