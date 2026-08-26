/** 報修工單的分類、狀態機與衍生計算。純邏輯，不依賴 Vue。 */

export type MaintenanceCategory = 'leak' | 'appliance' | 'lock' | 'pipe' | 'other'

export const maintenanceCategoryLabels: Record<MaintenanceCategory, string> = {
  leak: '漏水',
  appliance: '電器',
  lock: '門鎖',
  pipe: '管線',
  other: '其他',
}

export type MaintenanceStatus =
  | 'submitted'
  | 'notified'
  | 'in_progress'
  | 'overdue'
  | 'disputed'
  | 'completed'
  | 'closed'

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  submitted: '租客送出',
  notified: '已通報房東',
  in_progress: '房東處理中',
  overdue: '逾期未回應',
  disputed: '爭議中',
  completed: '已完成',
  closed: '已關閉',
}

/** 通報房東後超過幾天未獲回應視為逾期 */
export const overdueThresholdDays = 7

/**
 * 合法的狀態轉換。
 * 詳情面板的推進按鈕依此表產生，表以外的轉換一律拒絕。
 */
export const maintenanceTransitions: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  submitted: ['notified'],
  notified: ['in_progress', 'overdue', 'disputed'],
  in_progress: ['completed', 'disputed'],
  overdue: ['in_progress', 'disputed'],
  disputed: ['in_progress', 'completed'],
  completed: ['closed'],
  closed: [],
}

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return maintenanceTransitions[from].includes(to)
}

/**
 * 報修工單的日常流程本來就該由租客與房東自己走完，管理員不是每一單都要介入。
 * 「待管理者處理」佇列圈出真正需要管理員動手的工單，只有這裡面的工單才能被推進狀態。
 *
 * 佇列成員資格是衍生計算，不額外存欄位 —— 否則欄位跟三個來源條件會不同步。
 */
export type AdminQueueTicket = {
  status: MaintenanceStatus
  interventionRequested: boolean
  manuallyQueued: boolean
}

export function isInAdminQueue(ticket: AdminQueueTicket): boolean {
  return (
    ticket.status === 'disputed' ||
    ticket.status === 'overdue' ||
    ticket.interventionRequested ||
    ticket.manuallyQueued
  )
}

/** 進入待處理佇列的原因，用於畫面上的 Badge 顯示 */
export type AdminQueueReason =
  | 'disputed'
  | 'overdue'
  | 'intervention_requested'
  | 'manually_queued'

export const adminQueueReasonLabels: Record<AdminQueueReason, string> = {
  disputed: '爭議中',
  overdue: '逾期未回應',
  intervention_requested: '使用者要求介入',
  manually_queued: '手動加入',
}

/**
 * 由狀態本身決定的進入原因（爭議中、逾期未回應）沒辦法用「移出待處理」撥掉——
 * dequeue 只清得掉兩個旗標、動不了 status。要離開佇列就得真的把工單往前推。
 */
export function isStatusDrivenQueueReason(reason: AdminQueueReason | null): boolean {
  return reason === 'disputed' || reason === 'overdue'
}

/**
 * 一張工單可能同時符合多個進入佇列的條件，取畫面上最該優先呈現的那一個：
 * 爭議中最急迫，其次是房東已讀不回（逾期），再來是使用者主動求助，
 * 最後才是管理員自己標記的。不在佇列內回傳 null。
 */
export function adminQueueReason(ticket: AdminQueueTicket): AdminQueueReason | null {
  if (ticket.status === 'disputed') return 'disputed'
  if (ticket.status === 'overdue') return 'overdue'
  if (ticket.interventionRequested) return 'intervention_requested'
  if (ticket.manuallyQueued) return 'manually_queued'
  return null
}

/** 取得某個時間點到今天相差幾個整天，結果可能為負數 */
export function elapsedDays(fromIso: string, now = new Date()): number {
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) return 0

  const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startOfNow.getTime() - startOfFrom.getTime()) / 86400000)
}

/**
 * 舊資料沒有佇列旗標，載入時逐筆補 false —— 沒被標記過的工單本來就不該冒出來，
 * 跟 discardLegacy 那種整批重 seed 不同，這裡欄位本身不影響既有資料的可信度。
 */
export function migrateMaintenanceQueueFlags<
  T extends { interventionRequested?: boolean; manuallyQueued?: boolean },
>(tickets: T[]): T[] {
  return tickets.map((ticket) => ({
    ...ticket,
    interventionRequested: ticket.interventionRequested ?? false,
    manuallyQueued: ticket.manuallyQueued ?? false,
  }))
}
