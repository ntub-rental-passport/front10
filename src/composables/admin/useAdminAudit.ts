import { computed } from 'vue'
import { createAdminCollection, newId } from './useAdminStore'
import { adminSettings as settings } from './useAdminSettings'
import { getAuthSession } from '@/src/composables/useAuth'
import { filterByRetention } from '@/src/utils/admin-audit-retention'
import { seedAuditEvents, type AuditActionType, type AuditEvent } from '@/src/mocks/admin-seed'

const rawEvents = createAdminCollection<AuditEvent[]>('audit', seedAuditEvents)

export function useAdminAudit() {
  /**
   * `actor` 不給就是目前登入的管理員。系統自己做的事（例如依門檻自動把工單標成逾期）
   * 要傳 `'system'` —— 不然稽核紀錄會寫成「剛好開著頁面的那位管理員」做的。
   */
  function logAction(action: AuditActionType, target: string, detail: string, actor?: string): void {
    rawEvents.value.unshift({
      id: newId('ev'),
      at: new Date().toISOString(),
      actor: actor ?? getAuthSession()?.email ?? 'admin@rentmate.tw',
      action,
      target,
      detail,
    })
  }

  // 保留天數是視窗式篩選，不是刪除：原始紀錄仍在 rawEvents 裡，只是超過天數的不顯示
  const events = computed(() => filterByRetention(rawEvents.value, settings.value.auditRetentionDays))
  // 稽核頁把後端的紀錄併進來時要用同一個天數篩（見 useAuditLog）
  const retentionDays = computed(() => settings.value.auditRetentionDays)

  return { events, retentionDays, logAction }
}
