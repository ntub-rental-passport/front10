import { computed, ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { seedMaintenanceTickets, type MaintenanceTicket } from '@/src/mocks/admin-seed'
import { discardLegacy } from '@/src/utils/admin-collection-migrate'
import { userDisplayName } from '@/src/utils/admin-user-directory'
import {
  canTransition,
  elapsedDays,
  maintenanceStatusLabels,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'

// 舊格式的 tenant 是顯示名字串，無法與使用者對接，直接丟棄重 seed。
export const adminMaintenanceCollection = createAdminCollection<MaintenanceTicket[]>(
  'maintenance-tickets',
  seedMaintenanceTickets,
  discardLegacy(seedMaintenanceTickets, 'tenantUserId'),
)
const tickets = adminMaintenanceCollection

/** 列表頁的狀態頁籤：pending 涵蓋送出／已通報，done 涵蓋完成／結案 */
export type MaintenanceStatusTab = 'all' | 'pending' | 'processing' | 'overdue' | 'disputed' | 'done'

export const maintenanceStatusTabs: { value: MaintenanceStatusTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待通報' },
  { value: 'processing', label: '處理中' },
  { value: 'overdue', label: '逾期' },
  { value: 'disputed', label: '爭議中' },
  { value: 'done', label: '已完成' },
]

function matchesStatusTab(status: MaintenanceStatus, tab: MaintenanceStatusTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'pending':
      return status === 'submitted' || status === 'notified'
    case 'processing':
      return status === 'in_progress'
    case 'overdue':
      return status === 'overdue'
    case 'disputed':
      return status === 'disputed'
    case 'done':
      return status === 'completed' || status === 'closed'
    default:
      return false
  }
}

export interface MaintenanceTicketView extends MaintenanceTicket {
  /** 從送出至今的天數，用 elapsedDays() 計算 */
  elapsed: number
  /** timeline 最後一筆時間，沒有 timeline 時退回 createdAt */
  lastUpdatedAt: string
  tenantName: string
  landlordName: string
}

export interface MaintenanceStats {
  total: number
  /** 已通報房東但尚未完成的件數（notified + in_progress） */
  processing: number
  overdue: number
  disputed: number
  byCategory: Record<MaintenanceCategory, number>
}

export function useAdminMaintenance() {
  const { logAction } = useAdminAudit()
  const error = ref('')

  const statusTab = ref<MaintenanceStatusTab>('all')
  const categoryFilter = ref<MaintenanceCategory | 'all'>('all')
  const keyword = ref('')
  /** 從使用者詳情跳轉過來時預選的使用者，空字串代表不限 */
  const userFilter = ref('')

  function nameOf(userId: string): string {
    const user = adminUsersCollection.value.find((item) => item.id === userId)
    return user ? userDisplayName(user) : userId
  }

  const ticketViews = computed<MaintenanceTicketView[]>(() =>
    tickets.value.map((ticket) => ({
      ...ticket,
      elapsed: elapsedDays(ticket.createdAt),
      lastUpdatedAt: ticket.timeline.at(-1)?.at ?? ticket.createdAt,
      tenantName: nameOf(ticket.tenantUserId),
      landlordName: nameOf(ticket.landlordUserId),
    })),
  )

  const filteredTickets = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return ticketViews.value
      .filter((ticket) => matchesStatusTab(ticket.status, statusTab.value))
      .filter((ticket) => categoryFilter.value === 'all' || ticket.category === categoryFilter.value)
      .filter((ticket) => {
        if (!userFilter.value) return true
        return (
          ticket.tenantUserId === userFilter.value || ticket.landlordUserId === userFilter.value
        )
      })
      .filter((ticket) => {
        if (!kw) return true
        return (
          ticket.id.toLowerCase().includes(kw) ||
          ticket.address.toLowerCase().includes(kw) ||
          ticket.tenantName.toLowerCase().includes(kw) ||
          ticket.landlordName.toLowerCase().includes(kw)
        )
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })

  const stats = computed<MaintenanceStats>(() => {
    const byCategory: Record<MaintenanceCategory, number> = {
      leak: 0,
      appliance: 0,
      lock: 0,
      pipe: 0,
      other: 0,
    }
    let processing = 0
    let overdue = 0
    let disputed = 0

    for (const ticket of tickets.value) {
      byCategory[ticket.category] += 1
      if (ticket.status === 'notified' || ticket.status === 'in_progress') processing += 1
      if (ticket.status === 'overdue') overdue += 1
      if (ticket.status === 'disputed') disputed += 1
    }

    return { total: tickets.value.length, processing, overdue, disputed, byCategory }
  })

  function advanceStatus(id: string, next: MaintenanceStatus, note: string): boolean {
    const ticket = tickets.value.find((item) => item.id === id)
    if (!ticket) {
      error.value = '找不到工單'
      return false
    }

    if (!canTransition(ticket.status, next)) {
      error.value = `無法從「${maintenanceStatusLabels[ticket.status]}」變更為「${maintenanceStatusLabels[next]}」`
      return false
    }

    const previous = ticket.status
    const now = new Date().toISOString()
    ticket.status = next
    if (next === 'notified' && ticket.notifiedAt === null) ticket.notifiedAt = now
    if (next === 'in_progress' && ticket.firstResponseAt === null) ticket.firstResponseAt = now
    if (next === 'completed' && ticket.completedAt === null) ticket.completedAt = now
    ticket.timeline.push({ at: now, actor: 'admin', from: previous, to: next, note })

    logAction(
      '報修工單',
      ticket.id,
      `狀態由「${maintenanceStatusLabels[previous]}」變更為「${maintenanceStatusLabels[next]}」${note ? `：${note}` : ''}`,
    )
    error.value = ''
    return true
  }

  function saveAdminNote(id: string, note: string): boolean {
    const ticket = tickets.value.find((item) => item.id === id)
    if (!ticket) {
      error.value = '找不到工單'
      return false
    }

    ticket.adminNote = note
    logAction('報修工單', ticket.id, '更新管理員註記')
    error.value = ''
    return true
  }

  return {
    tickets,
    ticketViews,
    statusTab,
    categoryFilter,
    keyword,
    userFilter,
    filteredTickets,
    stats,
    advanceStatus,
    saveAdminNote,
    error,
  }
}
