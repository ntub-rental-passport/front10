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
export function supportsFieldCapture<T extends Pick<DeviceSnapshot, 'coarsePointer'>>(snapshot: T): boolean {
  return snapshot.coarsePointer
}

export interface CameraUnavailable {
  /** 給提示畫面的標題，要讓人一眼知道是哪一類問題 */
  title: string
  /** 一句話說明原因與下一步 */
  detail: string
}

export interface CameraEnvironment extends Pick<DeviceSnapshot, 'coarsePointer'> {
  /** window.isSecureContext：HTTPS 或 localhost 才是 true */
  isSecureContext: boolean
  /** navigator.mediaDevices 是否存在 */
  hasMediaDevices: boolean
}

/*
 * 相機開不起來的三種原因，回傳人看得懂的說明；可以開就回 null。
 *
 * 會有這支是因為非 secure context 的失敗方式特別難懂：瀏覽器不是拒絕權限，而是
 * 把整個 navigator.mediaDevices 物件藏起來，所以程式碼讀 .getUserMedia 時丟的是
 * 「undefined is not an object」。那個原始 JS 錯誤直接顯示給使用者毫無意義 ——
 * 真正該講的是「這個網址不是 HTTPS」。
 *
 * 判斷順序是裝置優先：桌機使用者不該被告知去換 HTTPS 網址，他換了也還是桌機。
 */
export function cameraUnavailableReason(env: CameraEnvironment): CameraUnavailable | null {
  if (!supportsFieldCapture(env)) {
    return {
      title: '這台裝置請用上傳',
      detail: '請改用下方的「上傳」選擇照片，或改用手機開啟這個頁面當場拍攝。',
    }
  }
  if (!env.isSecureContext) {
    return {
      title: '這個網址不能開相機',
      detail:
        '瀏覽器只在 HTTPS（或 localhost）才開放相機，用區網 IP 開啟時會停用。請改用 https:// 的網址開啟這一頁，或先用下方的「上傳」選擇照片。',
    }
  }
  if (!env.hasMediaDevices) {
    return {
      title: '這個瀏覽器不支援相機',
      detail: '這個瀏覽器沒有提供相機介面，請改用下方的「上傳」選擇照片。',
    }
  }
  return null
}
