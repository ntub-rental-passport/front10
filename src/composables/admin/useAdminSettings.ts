/**
 * 後台「系統設定」頁的其餘欄位（網站名稱、維護模式、各種門檻），存在後端
 * （backend/admin/site_settings.py），所有管理員、所有裝置看同一份。稽核由後端記。
 *
 * 後台其他模組直接讀 adminSettings（例如報修逾期門檻、AI 額度），一開始是預設值，
 * AdminLayout 掛上去時向後端讀一次（loadAdminSettings）。
 */
import { computed, ref } from 'vue'
import { refreshPublicSettings } from '@/src/composables/usePublicSettings'
import { fetchAdminSiteSettings, updateAdminSiteSettings } from '@/src/services/platformSettingsApi'
import { seedSettings, type SystemSettings } from '@/src/mocks/admin/settings'

const settings = ref<SystemSettings>(seedSettings())
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let inflight: Promise<boolean> | null = null

/** 向後端讀一次。回傳是否成功；讀不到時沿用目前的值（一開始是預設值）。 */
export function loadAdminSettings(): Promise<boolean> {
  if (inflight) return inflight
  loadState.value = 'loading'
  inflight = fetchAdminSiteSettings()
    .then((result) => {
      if (!result) {
        loadState.value = 'error'
        return false
      }
      settings.value = { ...seedSettings(), ...result }
      loadState.value = 'ready'
      return true
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useAdminSettings() {
  const maintenanceMode = computed(() => settings.value.maintenanceMode)

  /**
   * 只送有改的欄位。失敗時丟出後端給的理由（例如「預警門檻需小於告急門檻」），
   * 畫面原樣顯示；這時本地的值不動，跟伺服器上的一致。
   */
  async function saveSettings(next: SystemSettings): Promise<void> {
    const changes = Object.fromEntries(
      (Object.keys(next) as (keyof SystemSettings)[])
        .filter((key) => next[key] !== settings.value[key])
        .map((key) => [key, next[key]]),
    ) as Partial<SystemSettings>
    if (Object.keys(changes).length === 0) return

    settings.value = { ...seedSettings(), ...(await updateAdminSiteSettings(changes)) }
    loadState.value = 'ready'
    // 維護模式、網站名稱會影響自己這台瀏覽器的一般頁面，不等公開設定的快取過期
    void refreshPublicSettings({ force: true })
  }

  return { settings, maintenanceMode, loadState, saveSettings }
}

export { settings as adminSettings }
