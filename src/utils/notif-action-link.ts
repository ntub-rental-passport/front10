/**
 * 通知的操作按鈕連結。
 *
 * ## 為什麼要有這個檔案
 *
 * `actionUrl` 整條管線本來就是通的：notificationApi 收這個欄位，租客端的
 * notifications.vue 也真的會把它 render 成一顆 RouterLink 按鈕。但後台從來
 * 沒有地方可以填它，所以管理員送出的每一則通知都是死路。
 *
 * 而 seed 裡僅有的幾個範例有三個是壞的 —— `/app/maintenance` 與
 * `/app/contracts` 其實是**房東端**的路由，`/app/billing` 整個 router 裡
 * 根本不存在。
 *
 * 最糟的是 router 末端有 `{ path: '/:pathMatch(.*)*', redirect: '/' }`：
 * 死連結不會出現 404，而是**無聲無息把租客丟回首頁**。他按了「查看詳情」，
 * 看到儀表板，完全不知道發生什麼事，也不會有任何地方報錯。
 *
 * 所以這裡做兩件事：給一份真實存在的路由清單當下拉選單（防手打），
 * 以及一個執行時檢查（防路由改名 —— `repairs` 這頁顯然改過名，
 * seed 的 `/app/maintenance` 就是那時候留下來的）。
 */

export interface ActionLinkOption {
  url: string
  label: string
  /** 分組，下拉選單用 */
  group: string
}

/**
 * 可以放進通知的租客端頁面。
 *
 * 刻意是**白名單**而不是自由輸入。自由輸入的連結第一次就可能打錯，
 * 而且打錯了不會有任何徵兆（見上面的 catch-all）。
 *
 * 只收 /app 底下的租客頁面：通知是發給租客的，指向後台或房東端的路徑
 * 他們根本沒有權限進去（router 的 meta.roles 會把他們擋掉）。
 */
export const ACTION_LINK_OPTIONS: ActionLinkOption[] = [
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

export const ACTION_LINK_GROUPS = [...new Set(ACTION_LINK_OPTIONS.map((item) => item.group))]

/** 沒填按鈕文字時，租客端用的預設值（見 notifications.vue 的 `?? '查看詳情'`）。 */
export const DEFAULT_ACTION_LABEL = '查看詳情'

export function actionLinkLabel(url: string): string | null {
  return ACTION_LINK_OPTIONS.find((item) => item.url === url)?.label ?? null
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
 * 操作按鈕的驗證結果。回字串而不是 boolean：畫面要講出「為什麼不行」，
 * 「連結無效」這種話等於要管理員自己猜。
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
