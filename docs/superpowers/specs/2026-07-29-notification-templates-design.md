# 通知模板 + 使用者通知中心 — 設計文件

日期：2026-07-29
狀態：已核准，待實作

## 背景與問題

專案目前**沒有集中的通知系統**：
- `src/pages/outage/notifications.vue` 只是停水停電的**開關設定**（使用者端偏好）
- `src/pages/account.vue` 只有一個「推播通知」開關
- 使用者端沒有任何「通知中心／收件匣」

本模組建立完整迴路：**後台維護通知模板 → 填變數發送給收件人 → 使用者在通知中心看到已套用變數的通知**。

## 需求（使用者已定案）

1. **範圍**：模板管理 + 使用者通知中心 + 發送（完整迴路）
2. **管道**：站內通知 + Email + 推播（模擬；每個模板可多選管道）
3. **變數插值**：`{{變數}}` 語法；**未提供的變數保留原樣**（便於看出遺漏）
4. **RBAC 定位**：「內容與知識」群組，`roles: ['super', 'content']`
5. **收件人**：依角色批量（全部租客／全部房東／全部使用者）+ 指定單一使用者

## 資料模型

新檔 `src/mocks/admin/notifications.ts`：

```ts
export type NotifChannel = 'inapp' | 'email' | 'push'
export type NotifCategory = '系統' | '租約' | '補貼' | '帳務'

export interface NotifTemplate {
  id: string
  name: string            // 模板名稱，如「租約到期提醒」
  category: NotifCategory
  channels: NotifChannel[]
  title: string           // 可含 {{變數}}
  body: string            // 可含 {{變數}}
  enabled: boolean
  updatedAt: string
}

export interface UserNotification {
  id: string
  userEmail: string
  title: string           // 已套用變數後的結果（快照）
  body: string            // 已套用變數後的結果（快照）
  category: NotifCategory
  channels: NotifChannel[]
  createdAt: string
  read: boolean
}
```

種子：
- `seedNotifTemplates()`：5 筆，涵蓋四個分類與不同管道組合，且含變數。例：
  - 「租約到期提醒」租約 / [inapp, email] / 標題 `您的租約將於 {{到期日}} 到期`
  - 「補貼審核通過」補貼 / [inapp, push] / 含 `{{姓名}}`、`{{金額}}`
  - 「帳單待繳提醒」帳務 / [inapp, email, push] / 含 `{{金額}}`、`{{應繳日}}`
  - 「系統維護預告」系統 / [inapp] / 含 `{{維護時間}}`
  - 「合約分析完成」系統 / [inapp] / 含 `{{檔名}}`（可設 `enabled: false` 示範停用）
- `seedUserNotifications()`：4 筆，收件人為 `amy.wang@example.com`（種子租客），含已讀與未讀混合，讓通知中心一開啟就有內容。

`src/mocks/admin-seed.ts` 以既有 `export * from './admin/notifications'` 慣例納入 barrel。

## 純函式層（TDD 核心）

新檔 `src/utils/notif-template.ts`，不 import Vue：

```ts
export function extractVariables(text: string): string[]
export function renderTemplate(text: string, vars: Record<string, string>): string
```

規則：
- 變數語法 `{{名稱}}`，**允許內側空白**（`{{ 姓名 }}` 等同 `{{姓名}}`），名稱以 trim 後為準
- `extractVariables`：回傳去重、保持首次出現順序的名稱陣列；無變數回空陣列
- `renderTemplate`：
  - 有提供的變數 → 換成值（同一變數多次出現全部換掉）
  - **未提供／值為 `undefined` → 原樣保留 `{{名稱}}`**（本模組明確需求）
  - 未閉合的 `{{abc` 不視為變數，原樣保留
  - 空字串輸入回空字串

測試 `src/utils/notif-template.test.ts` 涵蓋：多變數、重複變數、內側空白、未提供保留、部分提供、無變數、空字串、未閉合、值含特殊字元（如 `$&`，確保不被當替換樣式吃掉——實作須避免 `String.replace` 的 `$` 特殊語意）。

> 實作注意：用 replace 的 **函式型回呼**（`(_, name) => ...`）避免 `$&`/`$1` 被解讀為替換模式。這是本模組最容易踩的坑，測試須明確涵蓋。

## 執行期

新檔 `src/composables/admin/useAdminNotifications.ts`（沿用 `createAdminCollection` + `useAdminAudit` 慣例）：

- 集合：`notif-templates`、`notif-messages`
- 模板：`saveTemplate(input)`（有 id 更新、無 id 新增）、`removeTemplate(id)`、`toggleTemplate(id)`
- 發送：
  ```ts
  type Recipient = { kind: 'role'; role: 'user' | 'landlord' | 'all' } | { kind: 'user'; email: string }
  function sendFromTemplate(templateId: string, vars: Record<string, string>, recipient: Recipient): number
  ```
  解析收件人 → 取 `adminUsersCollection`（RBAC 模組已匯出的共用 ref）過濾出 email 清單（`role: 'all'` 指全部**非 admin** 使用者）→ 對每位收件人建立一筆 `UserNotification`（title/body 已 `renderTemplate` 套用變數）→ `logAction('通知管理', 模板名稱, '發送給 N 位使用者')` → 回傳送出筆數
- 稽核動作型別新增 `'通知管理'` 至 `AuditActionType`

新檔 `src/composables/useNotifications.ts`（使用者端）：
- 依 `getAuthSession()` 的 email 過濾 → `myNotifications`（新到舊排序）、`unreadCount`
- `markRead(id)`、`markAllRead()`
- 與後台共用同一個 `notif-messages` 集合（自 `useAdminNotifications` 具名匯出集合 ref，避免重複建立）

## 頁面與路由

### 後台 `/admin/notifications`（通知模板）
Tabs 兩個分頁：
1. **通知模板**：表格列出模板（名稱／分類／管道徽章／狀態／更新時間／操作）。操作：編輯、發送、啟用停用、刪除。
   - 編輯 Dialog：名稱、分類、管道多選、標題、內文、啟用；**下方即時顯示 `extractVariables` 偵測到的變數清單**
   - 發送 Dialog：依該模板偵測到的變數動態產生輸入欄 → 收件人選擇（角色批量／單一使用者）→ **即時預覽**套用變數後的標題與內文 → 送出
2. **發送紀錄**：列出已產生的 `UserNotification`（收件人／標題／分類／時間／已讀狀態），新到舊。

### 使用者 `/app/notifications`（通知中心）
- 列出自己的通知，未讀以左側色條＋粗體標示，右上顯示未讀數與「全部標為已讀」
- 點擊單則 → 標為已讀並展開內文
- 空狀態文案

### 接線
- `src/router/index.ts`：`/admin` children 加 `notifications`；`/app` children 加 `notifications`
- `src/utils/admin-rbac.ts`：「內容與知識」群組加 `{ label: '通知模板', path: '/admin/notifications', roles: ['super','content'] }`
- `src/composables/admin/useAdminRbac.ts`：`navIcons` 加 `/admin/notifications` → `Bell`
- `src/composables/useNavigation.ts`：`navItems` 加「通知中心」（`Bell`，`/app/notifications`）

> **重要**：`src/utils/admin-rbac.test.ts` 目前在 4 處斷言項目數（super 9、ops 5、content 5、群組總數 9）。新增第 10 項後須同步更新為 **super 10、ops 5（不變）、content 6、總數 10**，否則測試會紅。

## 範圍界線（本次不做）

- Email／推播為**模擬**：只記錄管道標記，不實際寄送或註冊推播
- 側邊欄未讀數徽章不做（`NavItem` 結構單純，加徽章需改動 layout 渲染邏輯，風險不成比例）；未讀數顯示在通知中心頁內
- 使用者端不能自訂通知偏好與模板的對應（既有 outage 開關維持原樣，不整併）
- 不做排程／自動觸發發送（僅後台手動發送）

## 驗證

- `npm test`：既有 62 + 新增 notif-template 測試全綠（RBAC 數量斷言同步更新後仍綠）
- `npm run lint:types`、`npm run lint` 無錯
- 實機：
  1. 以 super 進 `/admin/notifications`，編輯模板看變數偵測
  2. 對「全部租客」發送一則帶變數的通知，確認預覽正確、送出筆數合理
  3. 切租客 `amy.wang@example.com` 進 `/app/notifications`，確認收到剛才那則且變數已套用
  4. 標為已讀後未讀數下降
  5. 以 ops 登入確認側邊欄看不到「通知模板」，直接打網址被導回 `/admin`
