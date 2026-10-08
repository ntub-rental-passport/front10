/**
 * 公開設定（/api/settings/public）的共用快取：維護模式、停用中的功能、網站名稱。
 *
 * router 首次載入會等設定，之後換頁先用快取，過期才在背景重讀，避免每分鐘卡一次換頁。
 * 背景讀完會重新檢查當下所在的路徑，讓維護模式仍能擋住訪客；沒有換頁就不會主動重讀。
 * 只擋畫面、不擋 API 是 2026-09-30 的決定（見 backend/admin/site_settings.py）。
 *
 * 讀不到後端時沿用上一次的值（一開始是「沒有維護、沒有停用」），而且一分鐘內
 * 不再重試：後端掛了的時候，不能讓每次換頁都卡在等設定。
 */
import { computed, ref } from 'vue'
import {
  DEFAULT_PUBLIC_SETTINGS,
  fetchPublicSettings,
  type PublicSettings,
} from '@/src/services/platformSettingsApi'
import { isMaintenanceActive } from '@/src/utils/maintenance'

const MAX_AGE_MS = 60_000

const state = ref<PublicSettings>({ ...DEFAULT_PUBLIC_SETTINGS })
let loadedAt = 0
let inflight: Promise<void> | null = null

export const publicSettings = computed(() => state.value)

export function hasLoadedPublicSettings(): boolean {
  return loadedAt !== 0
}

/** 只讓發起背景讀取的守衛處理完成後的跳轉，避免同一個請求掛上多次跳轉。 */
export function refreshPublicSettingsInBackground(): Promise<void> | null {
  if (!hasLoadedPublicSettings() || inflight || Date.now() - loadedAt < MAX_AGE_MS) return null
  return refreshPublicSettings()
}

/**
 * force：管理員剛改完維護或功能停用，自己的畫面要馬上反映，不等快取過期。
 * 正在讀的那一次可能是改之前發出的，所以 force 會等它結束再重讀一次。
 */
export function refreshPublicSettings(options: { force?: boolean } = {}): Promise<void> {
  if (inflight) {
    return options.force ? inflight.then(() => refreshPublicSettings(options)) : inflight
  }
  if (!options.force && loadedAt !== 0 && Date.now() - loadedAt < MAX_AGE_MS) return Promise.resolve()

  inflight = (async () => {
    const result = await fetchPublicSettings()
    if (result) state.value = result
    loadedAt = Date.now()
  })().finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * 維護模式此刻是否擋住這位訪客。白名單由後端判斷（maintenanceBypass），
 * 排程時段照原本的規則在瀏覽器判斷：時間是管理員照本地時間填的。
 */
export function isMaintenanceBlocking(settings: PublicSettings, now: Date = new Date()): boolean {
  if (settings.maintenanceBypass) return false
  return isMaintenanceActive(
    {
      maintenanceMode: settings.maintenance.mode,
      maintenanceStartsAt: settings.maintenance.startsAt,
      maintenanceEndsAt: settings.maintenance.endsAt,
      maintenanceAllowlist: '',
    },
    now,
  )
}
