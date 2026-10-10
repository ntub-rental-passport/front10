import { computed, ref } from 'vue'
import { useAdminAudit } from './useAdminAudit'
import { fetchAdminAudit, type ServerAuditEvent } from '@/src/services/adminAuditApi'
import { fetchMonitorEvents } from '@/src/services/adminMetricsApi'
import { filterByRetention } from '@/src/utils/admin-audit-retention'
import {
  AUDIT_MONITOR_KINDS,
  fromLocalEvent,
  fromMonitorEvent,
  fromServerEvent,
  mergeAuditRows,
  type AuditRow,
} from '@/src/utils/admin-audit-sources'
import type { MonitorEvent } from '@/src/utils/admin-monitoring-report'
import { isAdminDemoEnabled } from '@/src/utils/admin-demo'

/**
 * 稽核頁與總覽的資料：後端操作紀錄 ＋ 後端的斷線事件，本地開發再疊加瀏覽器紀錄
 * （三個來源的差別見 admin-audit-sources.ts）。
 *
 * 後端讀不到時，開發環境的本機那份照樣顯示，但 `serverFailed` 要讓畫面說出來 ——
 * 只剩本機的紀錄又不講，看起來會像後端從來沒有任何紀錄。
 */
export function useAuditLog() {
  const { events: localEvents, retentionDays } = useAdminAudit()

  const serverEvents = ref<ServerAuditEvent[] | null>(null)
  const outageEvents = ref<MonitorEvent[] | null>(null)
  const loading = ref(true)
  const serverFailed = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    const [audit, outages] = await Promise.all([
      fetchAdminAudit({ limit: 2000 }),
      fetchMonitorEvents(undefined, { limit: 500, kinds: AUDIT_MONITOR_KINDS }),
    ])
    serverEvents.value = audit
    outageEvents.value = outages
    serverFailed.value = audit === null || outages === null
    loading.value = false
  }

  void load()

  const rows = computed<AuditRow[]>(() =>
    // 保留天數對三個來源一視同仁；斷線事件後端本來就只留 30 天
    filterByRetention(
      mergeAuditRows(
        (serverEvents.value ?? []).map(fromServerEvent),
        (outageEvents.value ?? []).flatMap((event) => {
          const row = fromMonitorEvent(event)
          return row ? [row] : []
        }),
        isAdminDemoEnabled() ? localEvents.value.map(fromLocalEvent) : [],
      ),
      retentionDays.value,
    ),
  )

  return { rows, loading, serverFailed, reload: load }
}
