/*
 * 後台能改使用者狀態、審補助、看稽核日誌，這些操作只在桌面環境進行。
 *
 * 判斷用「觸控指標」加「視窗寬度」兩個條件同時成立，不用 User-Agent：
 *   - 只看寬度，會誤擋把瀏覽器視窗縮小的桌機使用者，而他們看不出被擋的原因。
 *   - 只看 User-Agent，擋不準（iPadOS Safari 預設回報桌面 UA），而且使用者無法
 *     自救 —— 他改不了 UA。
 *   - 觸控裝置的 pointer 是 coarse，桌機縮窗仍然是 fine，所以兩者同時成立才真的
 *     代表「人在小螢幕觸控裝置上」。
 */

/**
 * 沿用 AdminLayout 既有的 xl 斷點：AdminSidebar 在 xl 以下本來就會收成抽屜
 * （見 components/admin/AdminSidebar.vue 的 `hidden ... xl:flex`）。
 * 不另外發明一個數字，省掉兩套斷點不一致的 bug。
 */
export const DESKTOP_MIN_WIDTH = 1280

export interface DeviceSnapshot {
  coarsePointer: boolean
  viewportWidth: number
}

export function isDesktopEnvironment(snapshot: DeviceSnapshot): boolean {
  return !snapshot.coarsePointer || snapshot.viewportWidth >= DESKTOP_MIN_WIDTH
}

export function shouldBlockAdminSurface(snapshot: DeviceSnapshot): boolean {
  return !isDesktopEnvironment(snapshot)
}

/**
 * 現場拍攝（開後鏡頭）只在觸控裝置上提供。
 *
 * 筆電的 webcam 技術上也能通過 getUserMedia，但它拍不到房間角落，而且傾角偵測
 * 靠 DeviceOrientation，桌機永遠測不到角度 —— 一張畫質差又沒有水平資訊的照片，
 * 存證效力比使用者自己用手機拍完再上傳更低。寬度不納入判斷：平板橫向仍然該用
 * 鏡頭拍。
 */
export function supportsFieldCapture(snapshot: DeviceSnapshot): boolean {
  return snapshot.coarsePointer
}
