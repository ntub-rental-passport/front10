/**
 * 後台頁面標題。純邏輯，不依賴 Vue。
 *
 * ## 為什麼標題離開了頁面
 *
 * 標題原本是每一頁自己的 <h1>。現在導覽在左側欄、標題在頂部列，所以標題
 * 必須由 layout 來畫 —— layout 只知道路由，不知道頁面內容，因此需要這份
 * 路由到標題的對照表。
 *
 * 代價要講清楚：這裡變成頁名的**單一來源**。之後要改頁名是改這個檔案，
 * 不是改頁面。好處是頂部列與側欄不會各說各話，壞處是多一層間接。
 *
 * 文字沿用各頁原本的 <h1>，而不是側欄的導覽標籤。有兩頁不一樣：
 *
 *     稽核紀錄查詢 / 稽核紀錄     報修工單追蹤 / 報修工單
 *
 * 側欄已經在講導覽標籤了，頂部列再重複一次沒有新資訊；用各頁自己的說法
 * 至少多說了「這頁是來查的、來追蹤的」。
 */

export interface PageTitle {
  /** 麵包屑的前段，靜態頁是空陣列 */
  crumbs: string[]
  title: string
}

const PAGE_TITLES: Record<string, string> = {
  '/admin': '後台總覽',
  '/admin/users': '使用者管理',
  '/admin/maintenance-tickets': '報修工單追蹤',
  '/admin/content': '內容管理',
  '/admin/notifications': '通知管理',
  '/admin/notification-center': '通知中心',
  '/admin/monitoring': '系統監控',
  '/admin/audit': '稽核紀錄查詢',
  '/admin/settings': '系統設定',
}

/**
 * 詳情頁：父層路徑 → [父層標題, 還沒載入時的暫代標題]。
 *
 * 暫代標題存在是因為詳情頁的真正標題是資料（使用者暱稱、批次名稱），
 * 資料還在讀的時候頂部列不能是空的——空標題會讓人以為頁面壞了。
 */
const DETAIL_PARENTS: Record<string, readonly [string, string]> = {
  '/admin/users': ['使用者管理', '使用者詳情'],
  '/admin/notifications': ['通知管理', '通知批次'],
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * @param path        目前路由（不含 query）
 * @param overrideTitle 詳情頁載入完資料後回報的真標題；沒有就用暫代的
 */
export function resolvePageTitle(path: string, overrideTitle?: string | null): PageTitle {
  const clean = trimTrailingSlash(path)

  const exact = PAGE_TITLES[clean]
  if (exact) return { crumbs: [], title: exact }

  // 詳情頁：/admin/users/123 的父層是 /admin/users
  const parentPath = clean.slice(0, clean.lastIndexOf('/'))
  const parent = DETAIL_PARENTS[parentPath]
  if (parent) {
    const [crumb, fallback] = parent
    // 空字串與空白都視為「還沒拿到」，否則頂部列會出現一片空白
    const resolved = overrideTitle?.trim()
    return { crumbs: [crumb], title: resolved || fallback }
  }

  // 認不得的路由不要顯示路徑本身——那對使用者沒有意義，而且會洩漏內部結構
  return { crumbs: [], title: '管理後台' }
}
