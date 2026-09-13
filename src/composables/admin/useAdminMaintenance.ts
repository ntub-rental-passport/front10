import { computed, ref } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { adminUsersCollection } from './useAdminUsers'
import { adminSettings } from './useAdminSettings'
import { seedMaintenanceTickets, type MaintenanceTicket } from '@/src/mocks/admin-seed'
import { ADMIN_DATASET_VERSION, discardLegacy } from '@/src/utils/admin-collection-migrate'
import { userDisplayName } from '@/src/utils/admin-user-directory'
import {
  canTransition,
  elapsedDays,
  isInAdminQueue,
  maintenanceStatusLabels,
  migrateMaintenanceQueueFlags,
  shouldAutoMarkOverdue,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'

// 舊格式的 tenant 是顯示名字串，無法與使用者對接，直接丟棄重 seed；
// 丟棄重 seed 之後仍要跑一次欄位補值，涵蓋「格式沒變但少了佇列旗標」的舊資料。
function migrateTickets(raw: MaintenanceTicket[]): MaintenanceTicket[] {
  return migrateMaintenanceQueueFlags(discardLegacy(seedMaintenanceTickets, 'tenantUserId')(raw))
}

export const adminMaintenanceCollection = createAdminCollection<MaintenanceTicket[]>(
  `maintenance-tickets-${ADMIN_DATASET_VERSION}`,
  seedMaintenanceTickets,
  migrateTickets,
)
const tickets = adminMaintenanceCollection

/** 列表頁的狀態頁籤：pending 涵蓋送出／已通報，done 涵蓋完成／結案 */
export type MaintenanceStatusTab =
  | 'queue'
  | 'all'
  | 'pending'
  | 'processing'
  | 'overdue'
  | 'disputed'
  | 'done'

export const maintenanceStatusTabs: { value: MaintenanceStatusTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待通報' },
  { value: 'processing', label: '處理中' },
  { value: 'overdue', label: '逾期' },
  { value: 'disputed', label: '爭議中' },
  { value: 'done', label: '已完成' },
]

/**
 * 「待處理」不是工單狀態，是衍生的佇列成員資格，跟 maintenanceStatusTabs 分開匯出 ——
 * 頁面才能刻意把它跟狀態頁籤用間距或分隔線隔開，不讓人誤以為它是第八種狀態。
 */
export const maintenanceQueueTab: { value: 'queue'; label: string } = {
  value: 'queue',
  label: '待處理',
}

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

/**
 * 掃一次 tickets，把符合門檻的 notified 工單真的轉成 overdue，並寫入 timeline 與稽核紀錄。
 *
 * 執行時機：在 useAdminMaintenance() 初始化時呼叫一次（每次有元件掛載並呼叫這個
 * composable 時跑一輪），刻意不放進 computed 或 watchEffect ——
 * ticketViews 是 computed，如果在它的 getter 裡順手把符合條件的工單改成 overdue，
 * 等於在計算 tickets.value 的過程中又寫回 tickets.value，
 * 這個 computed 依賴的來源被自己的計算過程弄髒，下一次任何人存取 ticketViews.value
 * 都會重新觸發、再檢查一次「該轉換嗎」，形成讀取觸發寫入、寫入又觸發下一輪讀取的
 * 反應式迴圈。改成呼叫 useAdminMaintenance() 時同步跑一次的一般函式，
 * 不建立任何反應式相依，就不會有這個問題。
 *
 * 冪等性：shouldAutoMarkOverdue 只會放行「目前仍是 notified 且超過門檻」的工單。
 * 一轉成 overdue，狀態就不再是 notified，之後不管同一個分頁重新掛載元件、
 * 還是別的分頁呼叫 useAdminMaintenance()，這張工單都會被 shouldAutoMarkOverdue
 * 擋掉，不會重複 push timeline 事件，也不會重複呼叫 logAction。
 */
function applyAutoOverdueTransitions(logAction: ReturnType<typeof useAdminAudit>['logAction']): void {
  const now = new Date()
  for (const ticket of tickets.value) {
    if (
      !shouldAutoMarkOverdue(
        ticket.status,
        ticket.notifiedAt,
        adminSettings.value.maintenanceOverdueDays,
        now,
      )
    ) {
      continue
    }

    const previous = ticket.status
    ticket.status = 'overdue'
    ticket.timeline.push({
      at: now.toISOString(),
      actor: 'system',
      from: previous,
      to: 'overdue',
      note: '超過設定頁的逾期門檻仍未獲房東回應，系統自動標記為逾期',
    })

    logAction(
      '報修工單',
      ticket.id,
      `狀態由「${maintenanceStatusLabels[previous]}」自動變更為「${maintenanceStatusLabels.overdue}」（系統依逾期門檻判定）`,
    )
  }
}

export function useAdminMaintenance() {
  const { logAction } = useAdminAudit()
  const error = ref('')

  // 讀取工單前先讓系統把逾期未回應的工單真的轉成 overdue 狀態，
  // 這樣底下的 ticketViews／isInAdminQueue／adminQueueReason 才看得到最新狀態。
  applyAutoOverdueTransitions(logAction)

  // 預設落在待處理佇列 —— 管理員打開這頁該先看到自己要處理的事，不是全部工單
  const statusTab = ref<MaintenanceStatusTab>('queue')
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

  /** 待處理佇列不是狀態，成員資格用 isInAdminQueue 衍生判斷，不查狀態表 */
  const queueCount = computed(
    () => ticketViews.value.filter((ticket) => isInAdminQueue(ticket)).length,
  )

  const filteredTickets = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    return ticketViews.value
      .filter((ticket) =>
        statusTab.value === 'queue'
          ? isInAdminQueue(ticket)
          : matchesStatusTab(ticket.status, statusTab.value),
      )
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

    // 日常流程本來就該由租客與房東自己走完，不在待處理佇列裡的工單不能被管理員推進。
    // 這一關擋在資料層，不能只靠 UI 藏按鈕。
    if (!isInAdminQueue(ticket)) {
      error.value = '工單不在待處理佇列中，請先將工單加入待處理'
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
    // 結案代表這張工單已經處理完畢，不該繼續留在待辦佇列裡
    if (next === 'closed') {
      ticket.interventionRequested = false
      ticket.manuallyQueued = false
    }
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

  /** 管理員手動把工單拉進待處理佇列 —— 用於分流時判斷這單需要人工介入，但租客房東都沒主動求助的情況 */
  function queueTicket(id: string): boolean {
    const ticket = tickets.value.find((item) => item.id === id)
    if (!ticket) {
      error.value = '找不到工單'
      return false
    }

    ticket.manuallyQueued = true
    logAction('報修工單', ticket.id, '手動加入待處理佇列')
    error.value = ''
    return true
  }

  /**
   * 把工單移出待處理佇列。
   * 兩個旗標都要清，只清 manuallyQueued 的話，原本用 interventionRequested 進來的工單移不出去。
   */
  function dequeueTicket(id: string): boolean {
    const ticket = tickets.value.find((item) => item.id === id)
    if (!ticket) {
      error.value = '找不到工單'
      return false
    }

    ticket.interventionRequested = false
    ticket.manuallyQueued = false
    logAction('報修工單', ticket.id, '移出待處理佇列')
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
    queueCount,
    advanceStatus,
    saveAdminNote,
    queueTicket,
    dequeueTicket,
    error,
  }
}
