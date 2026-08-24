import { computed } from 'vue'
import { createAdminCollection, newId } from './useAdminStore'
import { getAuthSession } from '@/src/composables/useAuth'
import { filterByRetention } from '@/src/utils/admin-audit-retention'
import {
  migrateSettings,
  seedAuditEvents,
  seedSettings,
  type AuditActionType,
  type AuditEvent,
  type SystemSettings,
} from '@/src/mocks/admin-seed'

const rawEvents = createAdminCollection<AuditEvent[]>('audit', seedAuditEvents)
// 用同一個 collection 名稱重新取得設定 ref，而不是 import useAdminSettings ——
// 那邊的 useAdminSettings() 又會呼叫 useAdminAudit()，兩個檔案互相 import 會形成循環依賴。
// createAdminCollection 本身有 registry 去重，重複呼叫拿到的是同一份 ref，不會重新 seed。
const settings = createAdminCollection<SystemSettings>('settings', seedSettings, migrateSettings)

export function useAdminAudit() {
  function logAction(action: AuditActionType, target: string, detail: string): void {
    rawEvents.value.unshift({
      id: newId('ev'),
      at: new Date().toISOString(),
      actor: getAuthSession()?.email ?? 'admin@rentmate.tw',
      action,
      target,
      detail,
    })
  }

  // 保留天數是視窗式篩選，不是刪除：原始紀錄仍在 rawEvents 裡，只是超過天數的不顯示
  const events = computed(() => filterByRetention(rawEvents.value, settings.value.auditRetentionDays))

  return { events, logAction }
}
