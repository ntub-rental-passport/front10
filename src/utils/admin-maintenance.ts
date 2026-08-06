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

/** 取得某個時間點到今天相差幾個整天，結果可能為負數 */
export function elapsedDays(fromIso: string, now = new Date()): number {
  const from = new Date(fromIso)
  if (Number.isNaN(from.getTime())) return 0

  const startOfFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((startOfNow.getTime() - startOfFrom.getTime()) / 86400000)
}
