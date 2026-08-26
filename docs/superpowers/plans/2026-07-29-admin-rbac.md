# Admin RBAC 實作計畫

日期：2026-07-29
Spec：`docs/superpowers/specs/2026-07-29-admin-rbac-design.md`
執行：Sonnet 5 子代理，每個 Task 一個 commit（無 Co-Authored-By）。

前置事實：
- 測試與程式同層：`src/utils/*.test.ts`（vitest，`npm test` = `vitest run`）
- `@` alias = 專案根；`AuthRole`/session 在 `src/composables/useAuth.ts`
- 既有 23 測試須維持綠燈；`npm run lint:types` 須無錯

---

## R-Task1 — 型別 + 種子 + 權限純函式（TDD）

檔案：
- `src/mocks/admin/users.ts`：新增 `export type AdminRole = 'super' | 'ops' | 'content'`；`AdminUser` 加 `adminRole: AdminRole | null`。種子：`u-admin-1` → `adminRole:'super'`；新增 `u-admin-2`（ops@rentmate.tw，陳營運，role:'admin', adminRole:'ops'）、`u-admin-3`（content@rentmate.tw，李內容，role:'admin', adminRole:'content'）；其餘使用者補 `adminRole: null`。
- `src/mocks/admin-seed.ts`：確認 `AdminRole` 有被 barrel re-export（`export * from './admin/users'` 若已存在則自動涵蓋，否則補）。
- **先寫測試** `src/utils/admin-rbac.test.ts`（紅）→ 再寫 `src/utils/admin-rbac.ts`（綠）。

`admin-rbac.ts` 內容（純資料 + 純函式，不 import Vue / lucide）：
- `ADMIN_ROLES: AdminRole[] = ['super','ops','content']`
- `adminRoleLabels: Record<AdminRole,string> = { super:'超級管理員', ops:'營運管理員', content:'內容審核員' }`
- `interface AdminNavItem { label: string; path: string; roles: AdminRole[] }`
- `interface AdminNavGroup { label: string; items: AdminNavItem[] }`
- `adminNavGroups: AdminNavGroup[]`：完全依 spec 權限矩陣（3 群 9 項，每項標 roles）
- `canAdminAccessPath(role, path)`：取 `/admin` 後第一段正規化；`/admin` 本身與查無對應 item 的路徑 → true；否則回傳該 item.roles.includes(role)
- `visibleNavGroupsFor(role)`：map 各群組、filter items 到 `item.roles.includes(role)`、再濾掉 items 為空的群組

測試涵蓋 spec「測試」段全部案例。

commit：`feat: add admin RBAC roles, seed, and permission matrix`

---

## R-Task2 — useAdminRbac composable + 同步取角色

檔案 `src/composables/admin/useAdminRbac.ts`：
- import `getAuthSession` from `@/src/composables/useAuth`；`createAdminCollection`/或直接讀 users 集合。注意：users 集合 key 是 `createAdminCollection('users', seedAdminUsers)`（見 `useAdminUsers.ts`）。為避免重複建立集合，從 `useAdminUsers` 匯出 `users` ref，或在此 import 同一個模組級集合。**做法**：在 `useAdminUsers.ts` 把模組級 `const users = createAdminCollection(...)` 額外 `export`（具名匯出 `adminUsersCollection`），供本檔與 guard 共用同一 ref。
- `getCurrentAdminRole(): AdminRole`：讀 `getAuthSession()`；非 admin 或查無 → `'super'` 預設；否則以 `session.email` 在 `adminUsersCollection.value` 找 user，回傳 `user.adminRole ?? 'super'`。
- `useAdminRbac()`：
  - `currentAdminRole = computed(() => getCurrentAdminRole())`
  - icon map：`const navIcons: Record<string, Component>`（path → lucide 元件，沿用 admin-layout 既有 icon 對應）
  - `visibleNavGroups = computed(() => visibleNavGroupsFor(currentAdminRole.value).map(疊加 icon))`
  - `canAccessPath = (path) => canAdminAccessPath(currentAdminRole.value, path)`
  - 回傳上述三者

lint:types 綠、`npm test` 仍 23+RBAC 綠。

commit：`feat: add useAdminRbac composable`

---

## R-Task3 — 側邊欄分群 + 依角色過濾

檔案 `src/components/admin-layout.vue`：
- 移除扁平 `adminNavItems`，改 `const { visibleNavGroups } = useAdminRbac()`。
- 模板 `<nav>` 改為 `v-for` 群組：群組標題（`text-xs font-semibold uppercase text-muted-foreground px-3 pt-4 pb-1`，第一個群組可去掉多餘上邊距），其下 `v-for` item 沿用既有 RouterLink active 樣式。
- `isActive` 邏輯不變。
- icon 由 composable 的 `visibleNavGroups` item 帶入（`:is="item.icon"`）。

lint:types 綠。

commit：`feat: group admin sidebar and filter by role`

---

## R-Task4 — Router guard 第二層

檔案 `src/router/index.ts`：
- import `canAdminAccessPath` from `@/src/utils/admin-rbac`、`getCurrentAdminRole` from `@/src/composables/admin/useAdminRbac`。
- 在既有 `requiredRoles` 檢查通過之後、nickname 檢查之前，加入：
  ```ts
  if (to.path.startsWith('/admin') && !canAdminAccessPath(getCurrentAdminRole(), to.path)) {
    return '/admin'
  }
  ```
- 確認不影響非 admin 路由。

lint:types 綠、`npm test` 綠。

commit：`feat: enforce admin RBAC in router guard`

---

## R-Task5 — 使用者管理指派 UI

檔案：
- `src/composables/admin/useAdminUsers.ts`：新增 `setAdminRole(id, adminRole: AdminRole)`：找 user、`role==='admin'` 才可設、更新 `adminRole`、`logAction('使用者管理', user.email, \`權限角色變更為「${adminRoleLabels[adminRole]}」\`)`（此 `adminRoleLabels` 為 RBAC 的，from `@/src/utils/admin-rbac`；注意與既有 `adminRoleLabels`（租客/房東/管理員）命名衝突 → 以 `adminRoleLabels as rbacRoleLabels` 別名匯入）。回傳新增 `setAdminRole`。
- `src/pages/admin/users.vue`：
  - import `ADMIN_ROLES`、`adminRoleLabels as rbacRoleLabels` from `@/src/utils/admin-rbac`；`setAdminRole` from composable。
  - 表格新增「權限角色」`TableHead`（放在「角色」後）。
  - 對應 `TableCell`：`v-if="user.role === 'admin'"` 顯示 `Select`（options = ADMIN_ROLES，label = rbacRoleLabels），`:model-value="user.adminRole ?? 'super'"`，`@update:model-value` → `setAdminRole(user.id, value)`；否則顯示「—」。
  - 綁定寫法對齊既有 `handleRoleChange` 模式（`(value: unknown)` cast）。

lint:types 綠、`npm test` 綠。

commit：`feat: assign admin permission role in user management`

---

## 完成後（我親自做）

實機驗證：以三個 admin（super/ops/content）分別設定 session 登入 `/admin`，確認：
1. 側邊欄項目數與分群（super 9 / ops 5 / content 5）
2. 直接打受限網址（如 content 打 `/admin/settings`）被導回 `/admin`
3. 使用者管理指派下拉可改並即時反映側邊欄

最後彙整、（若使用者要）push。
```
