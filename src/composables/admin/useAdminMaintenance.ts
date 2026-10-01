import { computed, ref } from 'vue'
import { adminSettings } from './useAdminSettings'
import { getAuthSession } from '@/src/composables/useAuth'
import { fetchAdminRepairs, patchAdminRepair, type AdminRepairRecord } from '@/src/services/adminRepairApi'
import { repairMatchesTab, repairToMaintenance, type RealMaintenanceTicket, type RepairAdminTab } from '@/src/utils/admin-repair'
import { isInAdminQueue, type MaintenanceCategory } from '@/src/utils/admin-maintenance'

const records = ref<AdminRepairRecord[]>([])
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
  records.value = []
  loadState.value = 'idle'
  inflight = null
}

/** 不讀取舊 localStorage；原內容先保留，避免把曾經輸入的備註當成假資料刪除。 */
export const adminMaintenanceCollection = computed(() =>
  records.value.map((record) => repairToMaintenance(record, adminSettings.value.maintenanceOverdueDays)),
)

export function loadAdminRepairs(): Promise<void> {
  syncOwner()
  if (inflight) return inflight
  if (!owner) {
    loadState.value = 'error'
    return Promise.resolve()
  }
  const currentOwner = owner
  const currentGeneration = generation
  loadState.value = 'loading'
  const request = fetchAdminRepairs().then((result) => {
    if (currentOwner !== sessionKey() || currentGeneration !== generation) return
    records.value = result.items
    loadState.value = 'ready'
  }).catch(() => {
    if (currentOwner !== sessionKey() || currentGeneration !== generation) return
    loadState.value = 'error'
  }).finally(() => {
    if (inflight === request) inflight = null
  })
  inflight = request
  return request
}

export type MaintenanceStatusTab = RepairAdminTab
export type MaintenanceTicketView = RealMaintenanceTicket
export const maintenanceStatusTabs: { value: MaintenanceStatusTab; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'pending', label: '待回應' },
  { value: 'processing', label: '處理中' }, { value: 'overdue', label: '逾期' },
  { value: 'disputed', label: '爭議中' }, { value: 'done', label: '已完成' },
]
export const maintenanceQueueTab: { value: 'queue'; label: string } = { value: 'queue', label: '待處理' }

export function useAdminMaintenance() {
  syncOwner()
  void loadAdminRepairs()
  const error = ref('')
  const saving = ref(false)
  const statusTab = ref<MaintenanceStatusTab>('queue')
  const categoryFilter = ref<MaintenanceCategory | 'all'>('all')
  const keyword = ref('')
  const userFilter = ref('')
  const ticketViews = adminMaintenanceCollection
  const queueCount = computed(() => ticketViews.value.filter(isInAdminQueue).length)
  const filteredTickets = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    const user = userFilter.value.replace(/^real-/, '')
    return ticketViews.value.filter((ticket) => repairMatchesTab(ticket, statusTab.value))
      .filter((ticket) => categoryFilter.value === 'all' || ticket.category === categoryFilter.value)
      .filter((ticket) => !user || ticket.tenantUserId === user || ticket.landlordUserId === user)
      .filter((ticket) => !kw || [ticket.id, ticket.address, ticket.tenantName, ticket.landlordName].some((text) => text.toLowerCase().includes(kw)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })
  const stats = computed(() => {
    const byCategory: Record<MaintenanceCategory, number> = { leak: 0, appliance: 0, lock: 0, pipe: 0, other: 0 }
    for (const ticket of ticketViews.value) byCategory[ticket.category] += 1
    return {
      total: ticketViews.value.length,
      processing: ticketViews.value.filter((ticket) => repairMatchesTab(ticket, 'processing')).length,
      overdue: ticketViews.value.filter((ticket) => ticket.overdue).length,
      disputed: ticketViews.value.filter((ticket) => ticket.disputed).length, byCategory,
    }
  })

  async function mutate(id: string, updates: Parameters<typeof patchAdminRepair>[1]): Promise<boolean> {
    if (saving.value) return false
    syncOwner()
    const currentOwner = owner
    saving.value = true
    error.value = ''
    // 先等讀取完成，避免稍晚回來的舊列表覆蓋剛儲存的備註。
    if (inflight) await inflight
    try {
      const result = await patchAdminRepair(id, updates)
      if (currentOwner !== sessionKey()) return false
      const index = records.value.findIndex((item) => item.id === result.id)
      if (index >= 0) records.value.splice(index, 1, result)
      else records.value.unshift(result)
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '操作失敗，請稍後再試。'
      return false
    } finally { saving.value = false }
  }
  return {
    tickets: ticketViews, ticketViews, statusTab, categoryFilter, keyword, userFilter,
    filteredTickets, stats, queueCount, error, saving, loadState, reload: loadAdminRepairs,
    saveAdminNote: (id: string, note: string) => mutate(id, { adminNote: note }),
    queueTicket: (id: string) => mutate(id, { manuallyQueued: true }),
    dequeueTicket: (id: string) => mutate(id, { manuallyQueued: false, interventionRequested: false }),
    setIntervention: (id: string, value: boolean) => mutate(id, { interventionRequested: value }),
  }
}
