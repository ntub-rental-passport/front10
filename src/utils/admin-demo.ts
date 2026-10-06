/** 展示資料只供本地看畫面，正式站的帳號與統計必須來自真實來源。 */
export function isAdminDemoEnabled(): boolean {
  return import.meta.env.DEV
}
