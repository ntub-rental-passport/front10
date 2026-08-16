/**
 * 前台路由 → 功能 key 的對照。純函式，不依賴 Vue，讓 layout 用來判斷
 * 「目前這個路由算不算某項可維護關閉的功能」。
 *
 * 比對以路徑分段為單位，不是單純字串前綴：`/app/contract` 要能匹配
 * `/app/contract/editor` 這種子路由，但不能誤匹配到字面上長得像、
 * 實際無關的路徑（例如假想的 `/app/contracts-archive`）。
 *
 * `/app/contract-analysis` 刻意獨立列出：它在路由表裡是 `/app/contract`
 * 的兄弟路由而不是子路由（見 src/router/index.ts），單純用
 * `startsWith('/app/contract')` 會把它誤判成合約 OCR 的子頁，
 * 用 `startsWith('/app/contract/')` 又會完全漏掉它，所以兩個前綴都要列。
 */

import type { PlanFeatureKey } from './admin-entitlements'

const FEATURE_ROUTE_PREFIXES: ReadonlyArray<{ key: PlanFeatureKey; prefixes: string[] }> = [
  { key: 'contract-analysis', prefixes: ['/app/contract', '/app/contract-analysis'] },
  { key: 'subsidy', prefixes: ['/app/subsidy'] },
  { key: 'garbage', prefixes: ['/app/garbage'] },
  { key: 'handover', prefixes: ['/app/handover'] },
  { key: 'outage', prefixes: ['/app/outage'] },
  { key: 'notes', prefixes: ['/app/notes'] },
]

/** path 是否等於 prefix，或是 prefix 底下的子路徑（以 `/` 分隔，不是字串前綴）。 */
function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * 目前路徑對應到哪個可維護關閉的功能；不是任何一項就回 null。
 *
 * `/app`、`/app/notifications`、`/app/account` 一律回 null——首頁、通知中心、
 * 我的帳戶不是可關閉的功能，而且維護公告就登在通知中心，把它關掉等於
 * 把公告藏起來。
 */
export function featureKeyForPath(path: string): PlanFeatureKey | null {
  const matched = FEATURE_ROUTE_PREFIXES.find(({ prefixes }) =>
    prefixes.some((prefix) => matchesPrefix(path, prefix)),
  )
  return matched?.key ?? null
}
