import { computed, ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { seedDepositRecords, type DepositRecord } from '@/src/mocks/admin-seed'
import { adminDepositToRecord, depositMatchOf } from '@/src/utils/admin-deposit'
import { ADMIN_DATASET_VERSION } from '@/src/utils/admin-collection-migrate'
import { getAuthSession } from '@/src/composables/useAuth'
import { fetchAdminDeposits } from '@/src/services/adminUserRecordsApi'

/**
 * 押金對帳記錄。
 *
 * 後台沒有獨立的押金頁，記錄只在使用者詳情裡以雙方聲明的形式呈現；
 * 平台不經手金流，因此這裡沒有任何寫入操作。
 */
export const adminDepositCollection = createAdminCollection<DepositRecord[]>(
  `deposit-records-${ADMIN_DATASET_VERSION}`,
  seedDepositRecords,
)
const realRecords = ref<DepositRecord[]>([])
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let owner = ''
let generation = 0
let inflight: Promise<void> | null = null

function sessionKey(): string {
  const session = getAuthSession()
  return session?.role === 'admin' ? `${session.userId}:${session.accessToken ?? ''}` : ''
}

function syncOwner(): void {
  const next = sessionKey()
  if (next === owner) return
  owner = next
  generation += 1
  realRecords.value = []
  loadState.value = 'idle'
  inflight = null
}

export function loadAdminDeposits(): Promise<void> {
  syncOwner()
  if (inflight) return inflight
  if (!owner) {
    loadState.value = 'error'
    return Promise.resolve()
  }
  const currentOwner = owner
  const currentGeneration = generation
  loadState.value = 'loading'
  const request = fetchAdminDeposits().then((result) => {
    if (currentOwner !== sessionKey() || currentGeneration !== generation) return
    realRecords.value = result?.deposits.map(adminDepositToRecord) ?? []
    loadState.value = result === null ? 'error' : 'ready'
  }).catch(() => {
    if (currentOwner !== sessionKey() || currentGeneration !== generation) return
    realRecords.value = []
    loadState.value = 'error'
  }).finally(() => {
    if (inflight === request) inflight = null
  })
  inflight = request
  return request
}

export interface DepositStats {
  /** 房東聲明已收金額的加總 */
  declaredTotal: number
  mismatchedCount: number
  pendingCount: number
}

export function useAdminDeposits() {
  syncOwner()
  if (loadState.value === 'idle') void loadAdminDeposits()
  // 兩個來源分開保留，列表只接自己的來源；總覽才合併。
  const records = computed(() => [...realRecords.value, ...adminDepositCollection.value])
  const stats = computed<DepositStats | null>(() => {
    if (loadState.value !== 'ready') return null
    let declaredTotal = 0
    let mismatchedCount = 0
    let pendingCount = 0

    for (const record of records.value) {
      declaredTotal += record.landlordDeclared
      const match = depositMatchOf(record.landlordDeclared, record.tenantDeclared)
      if (match === 'mismatched') mismatchedCount += 1
      if (match === 'pending') pendingCount += 1
    }

    return { declaredTotal, mismatchedCount, pendingCount }
  })

  return { records, realRecords, demoRecords: adminDepositCollection, stats, loadState, reload: loadAdminDeposits }
}
