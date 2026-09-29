/**
 * 放在 public/banners/ 的內建輪播圖。後台編輯輪播時可以直接點選，
 * 種子資料也只用這幾張——正式站的安全設定（CSP img-src）擋掉大部分外部圖床，
 * 網站自己提供的圖才保證顯示得出來。
 */
export const BUILTIN_BANNER_IMAGES = [
  { label: '租補試算', url: '/banners/subsidy.webp' },
  { label: '契約分析', url: '/banners/contract.webp' },
  { label: '點交存證', url: '/banners/handover.webp' },
] as const

/** 只拿來判斷站內路徑解析後是不是還在同一個網站，不會真的連線。 */
const SITE_ORIGIN = 'https://site.invalid'

/**
 * 輪播圖片網址驗證。收兩種：
 * - http/https 開頭的絕對網址（外部圖床），用 URL() 順便擋掉打錯字、缺協定等常見錯誤。
 * - 「/」開頭的站內路徑（上面的內建圖片）。解析後必須還是同一個網站：
 *   //example.com、/\example.com 這種瀏覽器會當成外部網站的寫法不算。
 */
export function isValidImageUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  try {
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, SITE_ORIGIN).origin === SITE_ORIGIN
    }
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
