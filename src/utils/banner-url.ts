/**
 * 輪播圖片網址驗證。只收 http/https 開頭的絕對網址——
 * <img src> 用相對路徑技術上也能動，但這裡沒有檔案上傳功能，
 * 使用者填的一定是外部圖床網址，用 URL() 順便擋掉打錯字、缺協定等常見錯誤。
 */
export function isValidImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
