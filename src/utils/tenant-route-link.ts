/**
 * 租客端頁面的連結白名單，給通知的操作按鈕與首頁輪播共用。
 *
 * ## 為什麼要有這個檔案
 *
 * 兩條管線都一樣：欄位收得到自由輸入的網址，但從來沒有人在送出前真的確認
 * 過那個網址活著。通知的 `actionUrl` 是這樣，輪播的 `linkUrl` 也是這樣
 * （原本是一個 `<Input placeholder="/app/...">`，打錯字沒有任何提示）。
 *
 * 最糟的是 router 末端有 `{ path: '/:pathMatch(.*)*', redirect: '/' }`：
 * 死連結不會出現 404，而是**無聲無息把使用者丟回首頁**。通知是這樣，輪播
 * 更糟——輪播同時出現在未登入的公開首頁，訪客點了會莫名其妙回到首頁，
 * 完全不知道發生什麼事。
 *
 * 所以這裡做兩件事：給一份真實存在的路由清單當下拉選單（防手打），
 * 以及一個執行時檢查（防路由改名——`repairs` 這頁顯然改過名，
 * 通知 seed 的 `/app/maintenance` 就是那時候留下來的）。
 *
 * 這個檔案原本叫 `notif-action-link.ts`，只服務通知。輪播加入白名單驗證後
 * 兩邊都要用同一份「哪些頁面可以連」的清單，所以搬來這裡、改了中性一點的
 * 名字。`actionLinkError` / `actionLinkLabel` / `DEFAULT_ACTION_LABEL` 這幾個
 * 還是留著「action」這個字——它們描述的是通知操作按鈕特有的語意（可以不填、
 * 沒填按鈕文字就用預設值），輪播的連結是必填的、沒有對應的按鈕文字欄位，
 * 用不到這幾個，不需要跟著改名。
 */

export interface TenantRouteOption {
  url: string
  label: string
  /** 分組，下拉選單用 */
  group: string
}

/**
 * 可以連過去的租客端頁面。
 *
 * 刻意是**白名單**而不是自由輸入。自由輸入的連結第一次就可能打錯，
 * 而且打錯了不會有任何徵兆（見上面的 catch-all）。
 *
 * 只收 /app 底下的租客頁面：通知是發給租客的，輪播（含公開首頁的訪客導向
 * 註冊後）最終也是指向租客工作區，指向後台或房東端的路徑他們根本沒有權限
 * 進去（router 的 meta.roles 會把他們擋掉）。
 */
export const TENANT_ROUTE_OPTIONS: TenantRouteOption[] = [
  { url: '/app', label: '我的首頁', group: '總覽' },
  { url: '/app/notifications', label: '通知中心', group: '總覽' },

  { url: '/app/contract', label: '租客攻防指南', group: '合約' },
  { url: '/app/contract/scanner', label: '合約掃描上傳', group: '合約' },
  { url: '/app/contract-analysis', label: 'AI 合約分析結果', group: '合約' },

  { url: '/app/subsidy', label: '租屋補貼總覽', group: '補貼' },
  { url: '/app/subsidy/apply', label: '補貼申請', group: '補貼' },
  { url: '/app/subsidy/upload', label: '補貼文件補件', group: '補貼' },
  { url: '/app/subsidy/progress', label: '補貼進度查詢', group: '補貼' },

  { url: '/app/repairs', label: '報修工單', group: '居住' },
  { url: '/app/handover', label: '交屋點交', group: '居住' },
  { url: '/app/garbage', label: '垃圾清運', group: '居住' },
  { url: '/app/outage', label: '停水停電', group: '居住' },
  { url: '/app/notes', label: '室友記事', group: '居住' },

  { url: '/app/account', label: '帳號設定', group: '其他' },
]

export const TENANT_ROUTE_GROUPS = [...new Set(TENANT_ROUTE_OPTIONS.map((item) => item.group))]

/** 沒填按鈕文字時，租客端用的預設值（見 notifications.vue 的 `?? '查看詳情'`）。 */
export const DEFAULT_ACTION_LABEL = '查看詳情'

export function actionLinkLabel(url: string): string | null {
  return TENANT_ROUTE_OPTIONS.find((item) => item.url === url)?.label ?? null
}

/**
 * 這個路徑是不是死的。
 *
 * 傳進來的是 `router.resolve(url).matched.map(r => r.path)` ——
 * 刻意不直接吃 router 實例，這樣測試不用架一個路由器，
 * 而且「怎麼判斷」跟「去哪裡問」分開之後，catch-all 的樣子改了只要改這裡。
 *
 * 兩種死法：
 *   1. 完全沒有匹配（理論上不會發生，因為有 catch-all，但別假設它永遠在）
 *   2. 匹配到 catch-all —— 那代表沒有任何真正的頁面認領這個路徑
 */
export function isDeadRoute(matchedPaths: string[]): boolean {
  if (matchedPaths.length === 0) return true
  return matchedPaths.some((path) => path.includes(':pathMatch'))
}

/**
 * 通知操作按鈕的驗證結果。回字串而不是 boolean：畫面要講出「為什麼不行」，
 * 「連結無效」這種話等於要管理員自己猜。
 *
 * 只給通知用——輪播的連結是必填欄位、沒有獨立的按鈕文字，驗證邏輯比這裡
 * 單純（見 BannersTab 自己的 linkIssue），沒有共用的必要。
 */
export function actionLinkError(
  url: string,
  label: string,
  matchedPaths: string[],
): string | null {
  const trimmedUrl = url.trim()
  const trimmedLabel = label.trim()

  if (trimmedUrl === '') {
    // 只填了文字沒填連結 —— 租客端只看 actionUrl，這顆按鈕不會出現
    return trimmedLabel === '' ? null : '填了按鈕文字就要選一個頁面，否則按鈕不會出現。'
  }
  if (!trimmedUrl.startsWith('/app')) {
    return '通知是發給租客的，只能連到 /app 底下的頁面。'
  }
  if (isDeadRoute(matchedPaths)) {
    return `「${trimmedUrl}」在目前的路由表裡不存在，點下去會被丟回首頁。`
  }
  return null
}
