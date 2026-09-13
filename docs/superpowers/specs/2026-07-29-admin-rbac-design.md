# Admin RBAC 權限角色 + 側邊欄分群 — 設計文件

日期：2026-07-29
狀態：已核准，待實作

## 背景與問題

目前 `AuthRole` 只有 `'user' | 'landlord' | 'admin'`，**admin 內部不分級**：任何 admin 都能存取全部 9 個後台頁面。側邊欄 `adminNavItems` 是扁平 9 項，無分群、無依角色隱藏。

本模組新增 **admin 子角色（RBAC）**，依子角色控制側邊欄可見項目與路由存取，並把側邊欄重整為有標題的群組。

## 需求（使用者已定案）

1. **三級子角色**：超級管理員 / 營運管理員 / 內容審核員
2. **指派方式**：在「使用者管理」頁內指派；登入後依 session email 對應到 `AdminUser` 取得子角色
3. **強制深度**：側邊欄隱藏 + 路由 guard 雙重（直接打網址也擋）
4. **側邊欄分群**：分成有標題的群組

## 資料模型

於 `src/mocks/admin/users.ts`：

```ts
export type AdminRole = 'super' | 'ops' | 'content'
// AdminUser 新增欄位（僅對 role === 'admin' 有意義；其餘為 null）
adminRole: AdminRole | null
```

種子調整：
- 現有 `u-admin-1`（admin@rentmate.tw）→ `adminRole: 'super'`
- 新增 `ops@rentmate.tw`（陳營運，`role: 'admin'`, `adminRole: 'ops'`）
- 新增 `content@rentmate.tw`（李內容，`role: 'admin'`, `adminRole: 'content'`）
- 其餘非 admin 使用者 `adminRole: null`

## 權限矩陣

| 群組 | 頁面 path | super | ops | content |
|------|------|:---:|:---:|:---:|
| **營運管理** | `/admin` 後台總覽 | ✅ | ✅ | ✅ |
| | `/admin/users` 使用者管理 | ✅ | ✅ | — |
| | `/admin/review` 物件與評價審核 | ✅ | ✅ | ✅ |
| | `/admin/subscription` 訂閱與容量 | ✅ | ✅ | — |
| **內容與知識** | `/admin/content` 內容管理 | ✅ | — | ✅ |
| | `/admin/knowledge` 法規知識庫 | ✅ | — | ✅ |
| | `/admin/ai-quality` AI 品質監控 | ✅ | — | ✅ |
| **系統** | `/admin/audit` 稽核紀錄 | ✅ | ✅ | — |
| | `/admin/settings` 系統設定 | ✅ | — | — |

- super：9 項全開
- ops：後台總覽、使用者管理、物件審核、訂閱、稽核紀錄（5）
- content：後台總覽、物件審核、內容管理、法規知識庫、AI 品質（5）
- `後台總覽` 為所有 admin 的安全落地頁；`系統設定`（含維護模式等敏感設定）僅 super

## 架構

### 純函式層 `src/utils/admin-rbac.ts`（可單元測試，TDD 核心）

```ts
export type AdminRole = 'super' | 'ops' | 'content'   // re-export from mocks or define; 單一來源
export const ADMIN_ROLES: AdminRole[]
export const adminRoleLabels: Record<AdminRole, string>  // 超級管理員 / 營運管理員 / 內容審核員

// 側邊欄群組結構（不含 icon，純資料，可測）：
export interface AdminNavItem { label: string; path: string; roles: AdminRole[] }
export interface AdminNavGroup { label: string; items: AdminNavItem[] }
export const adminNavGroups: AdminNavGroup[]   // 上表的完整結構

// 純函式
export function canAdminAccessPath(role: AdminRole, path: string): boolean
export function visibleNavGroupsFor(role: AdminRole): AdminNavGroup[]  // 過濾掉沒權限的 item / 空群組
```

`canAdminAccessPath` 規則：把 `path` 正規化到 `/admin/*` 的第一段，查 `adminNavGroups` 找對應 item 的 `roles` 是否含 `role`；`/admin` 與未知子路徑一律允許（避免誤擋，後台總覽為安全頁）。

### 執行期橋接 `src/composables/admin/useAdminRbac.ts`

- `getCurrentAdminRole(): AdminRole` — 同步讀 `getAuthSession()`，若 `role==='admin'` 則在 users 集合（localStorage）以 email 找 `AdminUser.adminRole`；查無或未設 → 預設 `'super'`（向後相容，讓既有單一 admin 維持全權）。可供 router guard 同步呼叫。
- `useAdminRbac()` — 回傳 reactive `currentAdminRole`（computed）、`visibleNavGroups`（computed，帶 icon，供側邊欄）、`canAccessPath`。
  - icon 對應：在 composable 內以 `path → LucideComponent` 的 map 疊加到 `visibleNavGroupsFor(role)` 結果上。

### 側邊欄 `admin-layout.vue`

- 改用 `useAdminRbac().visibleNavGroups` 渲染：每個群組一個標題（小字灰色），其下為該群組中該角色可見的項目。
- 群組內若無可見項目則整組不顯示。

### Router guard（`src/router/index.ts`）

於既有 role 檢查之後追加第二層：

```ts
// 通過 requiredRoles（即已是 admin 進 /admin）後：
if (to.path.startsWith('/admin') && !canAdminAccessPath(getCurrentAdminRole(), to.path)) {
  return '/admin'
}
```

### 指派 UI（`使用者管理`）

- `useAdminUsers` 新增 `setAdminRole(id, adminRole)`：更新 `AdminUser.adminRole`，並 `logAction('使用者管理', email, '權限角色變更為…')`。
- `users.vue`：新增「權限角色」欄。`role === 'admin'` 的列顯示可選 `Select`（超管/營運/內容審核）；非 admin 列顯示「—」。

## 測試（TDD）

`src/utils/admin-rbac.test.ts`（vitest，與既有測試同層），涵蓋：
- 權限矩陣逐格：三個角色 × 代表性路徑，`canAdminAccessPath` 結果符合上表
- `/admin`（後台總覽）三角色皆 true
- `系統設定` 僅 super true
- `visibleNavGroupsFor`：super 得 9 項、ops 得 5 項、content 得 5 項；空群組被濾除
- 未知路徑（如 `/admin/unknown`）預設允許

## 範圍界線（本次不做）

- 後台總覽（`/admin/index.vue`）內的模組卡片不依角色隱藏——guard 已擋直接存取，卡片點擊被導回即可（可日後再做）。
- 不改 `AuthRole` / 登入流程；子角色純粹疊加於 admin 之上。
- 不做角色的新增/刪除（固定三級）。

## 驗證

- `npm test`：既有 23 + 新增 RBAC 測試全綠
- `npm run lint:types`：無錯
- 實機：分別以 super / ops / content 三個 admin 登入，確認側邊欄項目數與分群正確、直接打受限網址被導回 `/admin`、使用者管理可指派並即時反映。
```
