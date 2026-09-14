import { computed, ref } from 'vue'
import { adminUsersCollection } from './useAdminUsers'
import { adminMaintenanceCollection } from './useAdminMaintenance'
import { adminDepositCollection } from './useAdminDeposits'
import { adminPlansCollection, adminSubscriptionCollection } from './useAdminSubscription'
import { adminSettings } from './useAdminSettings'
import { fetchAdminAccounts, updateAccountStatus } from '@/src/services/adminUsersApi'
import {
  adminRoleCounts,
  emptyUserDirectoryFilter,
  filterUserDirectory,
  isFilterActive,
  joinUserDirectory,
  planDistribution,
  realAccountToRow,
  type UserDirectoryFilter,
  type UserDirectoryRow,
} from '@/src/utils/admin-user-directory'

/**
 * 使用者管理的資料來源。
 *
 * 這裡接的是兩種性質完全不同的資料：
 *
 *   真實帳號  資料庫裡真的存在的人。停用會讓對方立刻登不進來。
 *             沒有訂閱／押金／工單，因為那些關聯資料只存在於展示資料集。
 *   展示資料  為了呈現各模組而生成的假資料，彼此以固定 id 互相指涉。
 *
 * 兩者併在同一張表裡，所以**每一列都必須看得出自己是哪一種** ——
 * 否則管理員會分不清按下去的「停用」是真的會生效的。
 * 這件事靠 UserDirectoryRow.realAccountId 表達（有值就是真的）。
 *
 * 篩選狀態與真實帳號都放在模組層級：從詳情頁按返回時
 * 回得到原本的篩選結果，也不必重打一次 API。
 */
const filter = ref<UserDirectoryFilter>({ ...emptyUserDirectoryFilter })

const realRows = ref<UserDirectoryRow[]>([])
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
    realRows.value = []
    realAccountsError.value =
      '讀不到真實帳號。請確認後端已啟動，且目前登入的是管理員帳號；以下僅為展示資料。'
  } else {
    realRows.value = accounts.map(realAccountToRow)
  }

  realAccountsLoading.value = false
  loadedOnce = true
}

export function useAdminDirectory() {
  // 第一次使用時才打 API；之後從詳情頁返回不重打
  if (!loadedOnce) {
    loadedOnce = true
    void loadRealAccounts()
  }

  const demoRows = computed<UserDirectoryRow[]>(() =>
    joinUserDirectory(
      {
        users: adminUsersCollection.value,
        tickets: adminMaintenanceCollection.value,
        deposits: adminDepositCollection.value,
        subscriptions: adminSubscriptionCollection.value,
        plans: adminPlansCollection.value,
      },
      adminSettings.value.subscriptionExpiringSoonDays,
    ).map((row) =>
      // 展示資料裡的管理員一律降為一般管理員。
      //
      // 「超級管理員」在這個系統有明確定義：由能登入伺服器的人用
      // manage_admin.py 授予的那幾位（實務上就是開發團隊自己）。
      // 讓假資料佔用這個身分，會讓「超級管理員有幾位」這個數字失去意義。
      //
      // ⚠️ adminRole 是 null 的也要改寫，不能只改 'super'：
      // adminRoleCounts 對 null 的處理是 `adminRole ?? 'super'`，
      // 放著不管的話，列表顯示「管理員」但統計卡把它算進超級管理員 ——
      // 畫面上兩個數字對不起來。2026-09-14 實測踩到。
      row.user.role === 'admin'
        ? { ...row, user: { ...row.user, adminRole: 'admin' as const } }
        : row,
    ),
  )

  // 真實帳號排在前面：它們是會真的影響到人的那些列
  const rows = computed<UserDirectoryRow[]>(() => [...realRows.value, ...demoRows.value])

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
  ): Promise<void> {
    if (row.realAccountId === undefined) {
      throw new Error('這是展示資料，沒有可以停用的真實帳號。')
    }
    const updated = await updateAccountStatus(row.realAccountId, status)
    realRows.value = realRows.value.map((item) =>
      item.realAccountId === updated.id ? realAccountToRow(updated) : item,
    )
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
    realAccountsLoading,
    realAccountsError,
    reloadRealAccounts: loadRealAccounts,
    setRealAccountStatus,
  }
}
