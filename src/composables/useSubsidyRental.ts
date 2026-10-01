/**
 * 租補頁面使用的存檔租約。
 *
 * 不保存任何東西（2026-10-01 決定）：不寫 localStorage、不寫資料庫，
 * 也不在模組層級快取 —— 每次打開頁面都向後端重新讀取解密後的欄位。
 * 不做模組快取還有一個原因：換帳號登入時，不會殘留上一個人的租約。
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  listStoredContracts,
  readStoredContract,
  type StoredContractSummary,
} from '@/src/services/contractApi'
import type { StoredRental } from '@/src/utils/subsidy-rental'

export function useSubsidyRental() {
  const summaries = ref<StoredContractSummary[]>([])
  const selectedId = ref<number | null>(null)
  const rental = ref<StoredRental | null>(null)
  const loading = ref(true)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      summaries.value = await listStoredContracts()
      selectedId.value = summaries.value[0]?.rental_id ?? null
    } catch (cause) {
      // 讀不到就退回手動輸入，不影響教學與試算
      error.value = cause instanceof Error ? cause.message : '無法讀取已存檔的租約。'
      summaries.value = []
    } finally {
      loading.value = false
    }
  }

  watch(selectedId, async (id) => {
    rental.value = null
    if (id === null) return
    try {
      rental.value = (await readStoredContract(id)).rental
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '無法讀取租約內容。'
    }
  })

  onMounted(load)

  return {
    summaries: computed(() => summaries.value),
    selectedId,
    rental: computed(() => rental.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
  }
}
