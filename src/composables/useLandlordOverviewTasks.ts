import { onMounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { fetchOverviewTasks, type OverviewTask } from '@/src/services/landlordWorkspaceApi'
import { LANDLORD_WORKSPACE_CHANGED_EVENT } from '@/src/services/landlordApiClient'
import { LANDLORD_WORKSPACE_UPDATED_EVENT } from '@/src/composables/useLandlordWorkspace'

export function useLandlordOverviewTasks() {
  const tasks = ref<OverviewTask[]>([])
  const loading = ref(false)
  const loadError = ref('')

  async function refresh(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      tasks.value = (await fetchOverviewTasks()).items
    } catch (cause) {
      loadError.value = cause instanceof Error ? cause.message : '待辦讀取失敗'
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)
  // 頂部列會跨頁保留，租務資料或工作區變動時也要同步待辦數。
  if (typeof window !== 'undefined') {
    useEventListener(window, LANDLORD_WORKSPACE_UPDATED_EVENT, () => void refresh())
    useEventListener(window, LANDLORD_WORKSPACE_CHANGED_EVENT, () => void refresh())
  }

  return { tasks, loading, loadError, refresh }
}
