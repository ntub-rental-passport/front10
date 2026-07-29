# 通知模板 + 通知中心 實作計畫

日期：2026-07-29
Spec：`docs/superpowers/specs/2026-07-29-notification-templates-design.md`
執行：Sonnet 5 子代理，每個 Task 一個 commit（無 Co-Authored-By）。

前置事實：
- 測試與程式同層：`src/utils/*.test.ts`（`npm test` = `vitest run`），目前 **62 測試**
- `@` alias = 專案根；`npm run lint:types`（vue-tsc）與 `npm run lint` 須無錯
- admin 集合慣例：`createAdminCollection(name, seed)`（`useAdminStore`）+ `useAdminAudit().logAction`
- `adminUsersCollection` 已由 `useAdminUsers.ts` 具名匯出（RBAC 模組加的），可共用

---

## N-Task1 — 型別 + 種子 + 變數插值純函式（TDD）

檔案：
- 新增 `src/mocks/admin/notifications.ts`：`NotifChannel`、`NotifCategory`、`NotifTemplate`、`UserNotification`、`seedNotifTemplates()`、`seedUserNotifications()`（依 spec 資料模型與種子內容；時間用既有 `./helpers` 的 `daysAgo`）
- `src/mocks/admin-seed.ts`：加 `export * from './admin/notifications'`
- **先寫測試** `src/utils/notif-template.test.ts`（紅）→ 再寫 `src/utils/notif-template.ts`（綠）

`notif-template.ts`：
- `extractVariables(text)`：regex `/\{\{\s*([^{}]+?)\s*\}\}/g`，收集 trim 後名稱，去重保序
- `renderTemplate(text, vars)`：同一 regex，用**函式型回呼**替換——`vars` 有該 key 且非 undefined 則回傳值，否則回傳原始比對字串（保留 `{{名稱}}`）
- ⚠️ 必須用回呼形式，避免值內 `$&`／`$1` 被當替換樣式

測試涵蓋 spec「純函式層」列出的全部案例（含 `$&` 特殊字元案例、未閉合 `{{abc`、內側空白）。

commit：`feat: add notification template types, seeds, and interpolation`

---

## N-Task2 — RBAC 納入 + 路由 + 佔位頁（含更新既有測試斷言）

檔案：
- `src/utils/admin-rbac.ts`：「內容與知識」群組**最後**加 `{ label: '通知模板', path: '/admin/notifications', roles: ['super', 'content'] }`
- `src/utils/admin-rbac.test.ts`：更新數量斷言 → super **10**、ops 5（不變）、content **6**、`adminNavGroups` 總數 **10**（測試名稱字串一併改，如「super 可看到全部 10 個項目」）。**額外新增**三個角色對 `/admin/notifications` 的存取斷言（super ✓、ops ✗、content ✓）
- `src/composables/admin/useAdminRbac.ts`：`navIcons` 加 `'/admin/notifications': Bell`，並從 lucide 匯入 `Bell`
- `src/router/index.ts`：`/admin` children 於 `content` 之後加 `{ path: 'notifications', component: () => import('@/src/pages/admin/notifications.vue') }`
- 新增佔位頁 `src/pages/admin/notifications.vue`（`<h1>通知模板</h1>` + 建置中，樣式比照當初 content 佔位頁）

驗證：`npm test` 全綠（數量斷言已更新）、`lint:types` 無錯。

commit：`feat: add notification templates page to RBAC and routing`

---

## N-Task3 — useAdminNotifications composable

新檔 `src/composables/admin/useAdminNotifications.ts`：
- 模組級集合（**具名匯出** `notifMessagesCollection` 供使用者端共用）：
  ```ts
  const templates = createAdminCollection<NotifTemplate[]>('notif-templates', seedNotifTemplates)
  export const notifMessagesCollection = createAdminCollection<UserNotification[]>('notif-messages', seedUserNotifications)
  ```
- `useAdminNotifications()` 回傳 `templates`、`messages`、`saveTemplate`、`removeTemplate`、`toggleTemplate`、`sendFromTemplate`
- `saveTemplate(input)`：有 `id` → `Object.assign` 更新 + `updatedAt`；無 → `unshift` 新增（`newId('nt')`）。稽核 `logAction('通知管理', '模板', ...)`
- `removeTemplate` / `toggleTemplate`：比照 content 模組寫法，均寫稽核
- `sendFromTemplate(templateId, vars, recipient)`：
  - 找模板；找不到回 0
  - 解析收件人 → email 清單：`{kind:'role', role:'all'}` = 全部 `role !== 'admin'` 的使用者；`'user'`／`'landlord'` 依該角色過濾；`{kind:'user', email}` = 單一
  - 對每位建立 `UserNotification`：`title/body` 經 `renderTemplate` 套變數、`read: false`、`createdAt: new Date().toISOString()`、`id: newId('nm')`、沿用模板的 `category`/`channels`
  - `unshift` 進 messages（新的在前）
  - `logAction('通知管理', template.name, \`發送給 ${n} 位使用者\`)`；回傳 n
- `src/mocks/admin/audit.ts`：`AuditActionType` 加 `'通知管理'`

驗證：`lint:types` 無錯、`npm test` 維持綠。

commit：`feat: add admin notifications composable`

---

## N-Task4 — 後台通知模板頁（模板管理 + 發送）

改寫 `src/pages/admin/notifications.vue`，Tabs 兩個分頁（比照 `src/pages/admin/content.vue` 的 Tabs 寫法）：

**分頁一「通知模板」**
- 表格：名稱／分類／管道（徽章群，`inapp`→站內、`email`→Email、`push`→推播）／狀態（已啟用/已停用 Badge）／更新時間（`formatDateTime`）／操作
- 操作按鈕：發送、編輯、啟用停用、刪除（刪除走確認 Dialog，比照 content 模組）
- 編輯 Dialog：名稱 Input、分類 Select、管道三個 Checkbox 或 Switch、標題 Input、內文 Textarea、啟用 Switch；底部顯示 `extractVariables(title + ' ' + body)` 偵測到的變數 Badge 清單（無變數顯示「未使用變數」）
- 發送 Dialog：
  - 依模板變數動態產生 Input（`v-for` 變數名）
  - 收件人：Select 選「全部使用者／全部租客／全部房東／指定使用者」；選「指定使用者」時再出現一個使用者 Select（來源 `useAdminUsers().users` 過濾非 admin）
  - **即時預覽區**：顯示 `renderTemplate` 後的標題與內文
  - 送出 → 呼叫 `sendFromTemplate`，成功後關閉 Dialog（可用簡單的成功提示文字顯示送出筆數）

**分頁二「發送紀錄」**
- 表格列出 `messages`：收件人 email／標題／分類／管道／時間／已讀狀態
- 空狀態文案

驗證：`lint:types`、`npm run lint`、`npm test` 全綠。

commit：`feat: build notification template management page`

---

## N-Task5 — 使用者通知中心（連動點）

檔案：
- 新檔 `src/composables/useNotifications.ts`：import `notifMessagesCollection`、`getAuthSession`；`myNotifications`（computed：過濾 email、`createdAt` 新到舊）、`unreadCount`（computed）、`markRead(id)`、`markAllRead()`
- 新檔 `src/pages/notifications.vue`（使用者端；放在 `src/pages/` 下與 `dashboard.vue` 同層）：
  - 標題「通知中心」＋副標；右上顯示未讀數與「全部標為已讀」按鈕（`unreadCount === 0` 時 disabled）
  - 卡片列表：未讀左側 `border-l-4 border-primary` ＋標題粗體；已讀較淡
  - 每張卡：標題、分類 Badge、管道徽章、時間（`formatDateTime`）、內文
  - 點卡片 → `markRead(item.id)`
  - 空狀態：「目前沒有任何通知。」
- `src/router/index.ts`：`/app` children 加 `{ path: 'notifications', component: () => import('@/src/pages/notifications.vue') }`
- `src/composables/useNavigation.ts`：`navItems` 於「備忘錄」之後加 `{ icon: Bell, label: '通知中心', path: '/app/notifications' }`，並從 lucide 匯入 `Bell`

驗證：`lint:types`、`npm run lint`、`npm test` 全綠。

commit：`feat: add user notification center`

---

## 完成後（我親自做）

實機驗證（依 spec「驗證」段）：
1. super 進 `/admin/notifications`，編輯模板看變數偵測
2. 對「全部租客」發送帶變數通知，確認預覽與送出筆數
3. 切 `amy.wang@example.com` 進 `/app/notifications`，確認收到且變數已套用
4. 標為已讀後未讀數下降
5. ops 登入確認側邊欄無「通知模板」、直接打網址被導回 `/admin`

最後彙整並（經使用者同意）push。
