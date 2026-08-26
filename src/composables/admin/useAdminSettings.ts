import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { migrateSettings, seedSettings, type SystemSettings } from '@/src/mocks/admin-seed'

const settings = createAdminCollection<SystemSettings>('settings', seedSettings, migrateSettings)

export function useAdminSettings() {
  const { logAction } = useAdminAudit()

  const maintenanceMode = computed(() => settings.value.maintenanceMode)

  function saveSettings(next: SystemSettings): void {
    const previous = { ...settings.value }
    settings.value = { ...next }

    const changed = (Object.keys(next) as (keyof SystemSettings)[]).filter(
      (key) => previous[key] !== next[key],
    )
    if (changed.length === 0) return

    if (previous.maintenanceMode !== next.maintenanceMode) {
      logAction(
        '系統設定',
        '維護模式',
        next.maintenanceMode ? '開啟維護模式' : '關閉維護模式',
      )
    }

    const others = changed.filter((key) => key !== 'maintenanceMode')
    if (others.length > 0) {
      logAction('系統設定', '平台設定', `更新欄位：${others.join('、')}`)
    }
  }

  return { settings, maintenanceMode, saveSettings }
}

export { settings as adminSettings }
