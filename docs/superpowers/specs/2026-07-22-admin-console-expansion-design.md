# 後台管理擴充設計：系統設定、內容管理、權限角色、通知模板

日期：2026-07-22
狀態：設計定案，待實作計畫

## 1. 背景與目標

RentMate 後台目前有 7 個模組（總覽、使用者管理、物件與評價審核、法規知識庫、AI 品質監控、訂閱與容量、稽核紀錄），全部以純前端 + localStorage 實作。

本次擴充新增 4 個模組，並讓其中 3 個對前台產生**實際連動**，使超級管理員能透過介面調整平台行為，不需修改程式碼或操作資料庫。

### 範圍決策

| 模組 | 版本 | 理由 |
|------|------|------|
| 系統設定 | 標準版 | 7 個設定欄位足以涵蓋 demo 需求 |
| 內容管理 CMS | 完整版 | 四種內容類型，展示單一 CMS 管理多型別的能力 |
| 權限與角色 RBAC | 完整版 | 可自訂新增角色才稱得上「介面化」 |
| 通知模板 | 完整版 | 變數插值與即時預覽是本模組的技術重點 |

### 架構決策：沿用現有模式（非 schema-driven）

四個新模組一律比照既有 7 個模組手刻：一份 seed 型別 + 一個 composable + 一個 page。

考慮過但未採用的替代方案：
- **schema-driven 系統設定**：以 schema 陣列自動渲染表單，未來加設定不必改頁面。捨棄原因是會在程式碼庫中引入第二種寫法，一致性成本高於收益。
- **通用 CRUD 引擎**：捨棄原因是 CMS、RBAC、通知模板的 UI 形態差異過大（二維矩陣、變數插值、排序拖拉），通用化會退化成大量例外處理。

此決策不影響本次目標：管理員仍可在介面上完成所有調整，只有「開發者新增設定欄位」需要改程式碼。

### 非目標

- 不做真實的檔案上傳（Banner 圖片以網址輸入取代）
- 不做後端 API 或資料庫串接，資料一律存 localStorage
- 不重寫既有 7 個模組
- 不做權限的讀寫兩級或動作級控制（僅頁面級）

## 2. 連動點

僅實作 3 個連動點，其餘模組為後台獨立 CRUD。

| # | 連動點 | 觸發 | 前台效果 |
|---|--------|------|---------|
| 1 | 公告 | CMS 新增並發布公告 | 使用者 dashboard 頂端出現橫幅 |
| 2 | 維護模式 | 系統設定開啟 maintenanceMode | 全站（除 `/admin`）導向維護頁 |
| 4 | 權限矩陣 | RBAC 調整角色可存取頁面 | 側邊欄項目減少，直連網址被擋 |

「開放註冊開關」與「通知模板連動前台」不在本次範圍。

### 哪些設定「只儲存、不連動」

為避免實作時誤判，以下明確列出各模組中不產生任何前台效果的項目。它們在後台可正常編輯與持久化，但沒有消費端。

| 模組 | 有連動 | 僅儲存 |
|------|-------|-------|
| 系統設定 | `maintenanceMode`、`maintenanceMessage` | `siteName`、`supportEmail`、`pageSize`、`maxUploadMb`、`defaultAiQuota` |
| 內容管理 | Announcement | FaqEntry、LegalDoc、Banner |
| 權限與角色 | 全部（側邊欄與路由） | 無 |
| 通知模板 | 無 | 全部（含 `enabled` 開關） |

若日後決定擴大連動範圍，這張表即是候選清單。

## 3. 檔案結構

`src/mocks/admin-seed.ts` 目前 241 行，新增 4 個模組後將超過 600 行。拆分為資料夾，並保留原檔為 re-export barrel，使既有 7 個頁面的 import 路徑完全不變。

```
src/mocks/
  admin-seed.ts          # 改為純 re-export，既有 import 不受影響
  admin/
    users.ts             # 既有內容搬移（純剪貼）
    review.ts            # 既有內容搬移
    knowledge.ts         # 既有內容搬移
    ai-quality.ts        # 既有內容搬移
    subscription.ts      # 既有內容搬移
    audit.ts             # 既有內容搬移
    settings.ts          # 新增
    content.ts           # 新增
    roles.ts             # 新增
    templates.ts         # 新增

src/composables/admin/
    useAdminSettings.ts      # 新增
    useAdminContent.ts       # 新增
    useAdminRoles.ts         # 新增
    useAdminTemplates.ts     # 新增
    useAdminAccess.ts        # 新增（權限判斷）

src/pages/admin/
    settings.vue         # 新增
    content.vue          # 新增
    roles.vue            # 新增
    notifications.vue    # 新增

src/pages/
    maintenance.vue      # 新增（維護模式落地頁）

src/components/
    AnnouncementBanner.vue   # 新增（前台公告橫幅）

src/utils/
    template-render.ts   # 新增（renderTemplate 純函式）
    announcement.ts      # 新增（isAnnouncementActive 純函式）
    admin-access.ts      # 新增（canAccess 純判斷邏輯，供 composable 包裝）
```

## 4. 路由

新增 4 條 admin 子路由，並為全部 11 條子路由加上 `meta.pageKey` 供權限判斷。

| 路由 | pageKey | 頁面 |
|------|---------|------|
| `/admin` | `dashboard` | index.vue（既有）|
| `/admin/users` | `users` | users.vue（既有）|
| `/admin/roles` | `roles` | roles.vue（新）|
| `/admin/review` | `review` | review.vue（既有）|
| `/admin/content` | `content` | content.vue（新）|
| `/admin/notifications` | `notifications` | notifications.vue（新）|
| `/admin/knowledge` | `knowledge` | knowledge.vue（既有）|
| `/admin/ai-quality` | `ai-quality` | ai-quality.vue（既有）|
| `/admin/subscription` | `subscription` | subscription.vue（既有）|
| `/admin/audit` | `audit` | audit.vue（既有）|
| `/admin/settings` | `settings` | settings.vue（新）|

`/maintenance` 為頂層路由，不需登入。

側邊欄由 7 項擴為 11 項，分三群顯示：

- **營運**：後台總覽、使用者管理、權限與角色、物件與評價審核
- **內容**：內容管理、通知模板、法規知識庫
- **系統**：AI 品質監控、訂閱與容量、稽核紀錄、系統設定

## 5. 資料模型

### 5.1 系統設定

單一物件，非陣列。

```ts
interface SystemSettings {
  siteName: string           // 網站名稱
  supportEmail: string       // 客服信箱
  maintenanceMode: boolean   // 維護模式（連動點 2）
  maintenanceMessage: string // 維護頁顯示文字
  pageSize: number           // 表格每頁筆數（10 / 20 / 50）
  maxUploadMb: number        // 上傳檔案大小上限
  defaultAiQuota: number     // AI 每日配額預設值
}
```

頁面分三張 Card：基本資訊、系統維護、使用限制。

採**明確送出**（按「儲存變更」）而非即時儲存，因為維護模式為破壞性操作。按下儲存後跳確認 Dialog；若本次變更包含開啟維護模式，Dialog 額外顯示紅色警示。

### 5.2 內容管理

四種內容類型，頁面以 `components/ui/tabs` 分頁。

```ts
interface Announcement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'urgent'
  published: boolean
  startAt: string           // ISO 字串
  endAt: string | null      // null 表示永久有效
  updatedAt: string
}

interface FaqEntry {
  id: string
  question: string
  answer: string
  category: '租屋流程' | '契約分析' | '租金補貼' | '帳號問題'
  order: number
  published: boolean
  updatedAt: string
}

interface LegalDoc {
  id: string
  slug: 'terms' | 'privacy'
  title: string
  body: string
  version: number           // 每次儲存自動 +1
  updatedAt: string
}

interface Banner {
  id: string
  title: string
  imageUrl: string          // 外部網址，非上傳
  linkUrl: string
  order: number
  published: boolean
  updatedAt: string
}
```

各分頁操作：

- **公告**：表格 + 新增/編輯 Dialog，可設定生效期間與發布開關
- **FAQ**：依 category 分組列表，以上下箭頭調整 order
- **法律文件**：固定兩筆（terms、privacy），大 textarea 編輯，儲存時 version 遞增
- **Banner**：卡片式列表附縮圖預覽，以上下箭頭調整 order

### 5.3 權限與角色

```ts
type AdminPageKey =
  | 'dashboard' | 'users' | 'roles' | 'review'
  | 'content' | 'notifications' | 'knowledge'
  | 'ai-quality' | 'subscription' | 'audit' | 'settings'

interface AdminRole {
  id: string
  name: string
  description: string
  builtIn: boolean          // 內建角色不可刪除
  enabled: boolean          // 停用後該角色無法存取任何頁面
  pages: AdminPageKey[]
  updatedAt: string
}
```

`AdminUser` 新增欄位：`adminRoleId: string | null`（僅 `role === 'admin'` 時有意義）。

四個內建角色種子資料：

| 角色 | pages |
|------|-------|
| 超級管理員 | 全部 11 項（不可編輯） |
| 審核專員 | dashboard, review |
| 內容編輯 | dashboard, content, notifications, knowledge |
| 客服 | dashboard, users |

頁面配置：左側角色清單（新增 / 複製 / 停用 / 刪除），右側為選中角色的權限矩陣——11 個 checkbox，依側邊欄三群分組。

防呆規則：

1. 刪除角色前檢查是否有使用者的 `adminRoleId` 指向它；有則擋下，提示佔用人數
2. `builtIn` 角色不可刪除
3. 超級管理員的 `pages` 與 `enabled` 皆不可編輯
4. `dashboard` 對所有角色強制勾選且不可取消（否則登入後無處可去）

### 5.4 通知模板

```ts
type TemplateKey =
  | 'rent-due' | 'contract-expiry' | 'subsidy-supplement'
  | 'utility-outage' | 'handover-reminder'

interface NotificationTemplate {
  id: string
  key: TemplateKey
  name: string
  channel: 'push' | 'email' | 'inapp'
  subject: string
  body: string
  variables: string[]                    // 如 ['userName', 'amount', 'dueDate']
  sampleValues: Record<string, string>   // 預覽用假資料
  enabled: boolean
  updatedAt: string
}
```

頁面配置：左側 5 個模板清單（各帶啟用開關），右側編輯區——主旨 input + 內容 textarea，下方「可用變數」以可點擊 chip 呈現（點擊插入游標處），最下方即時預覽卡片。

模板為固定 5 筆，不可新增或刪除（`key` 對應系統既有的通知情境）。

## 6. 核心邏輯

### 6.1 renderTemplate

`src/utils/template-render.ts`

```ts
export function renderTemplate(
  body: string,
  values: Record<string, string>
): string
```

行為：

- 將 `{{varName}}` 替換為 `values[varName]`
- 變數名稱前後允許空白：`{{ varName }}` 等同 `{{varName}}`
- `values` 中不存在的變數**保留原樣**（含大括號），使打錯字在預覽中可見
- 同一變數出現多次全部替換
- `values` 中的值不做 HTML 逸出（預覽以純文字呈現，不使用 `v-html`）

### 6.2 useAdminAccess

```ts
currentAdminRole: ComputedRef<AdminRole | null>
canAccess(pageKey: AdminPageKey): boolean
viewAsRoleId: Ref<string | null>   // demo 用的檢視身分 override
```

`currentAdminRole` 解析順序：

1. 若 `viewAsRoleId` 有值，取該角色
2. 否則以 `getAuthSession().email` 查 `AdminUser`，取其 `adminRoleId` 對應的角色
3. 查無對應時回傳 `null`

`canAccess(pageKey)` 規則：

- `pageKey === 'dashboard'` → 恆為 `true`
- `currentAdminRole` 為 `null` → `false`
- 角色 `enabled === false` → `false`
- 否則回傳 `role.pages.includes(pageKey)`

「檢視身分」切換器位於 admin header，**本身不受權限控制**，永遠可用，使管理員不會把自己鎖在外面。預設值為「依登入帳號」。

### 6.3 isAnnouncementActive

`src/utils/announcement.ts`

```ts
export function isAnnouncementActive(a: Announcement, now: Date): boolean
```

- `published === false` → `false`
- `now < startAt` → `false`
- `endAt !== null && now > endAt` → `false`
- 否則 `true`

## 7. 連動點實作

### 連動點 1：公告 → 使用者 dashboard

`useAdminContent()` 導出 `activeAnnouncements` computed，以 `isAnnouncementActive` 過濾。

新增 `components/AnnouncementBanner.vue`，依 `level` 給三種配色（info 藍 / warning 琥珀 / urgent 紅）。

`pages/dashboard.vue` 僅新增一個 import 與一個標籤。

### 連動點 2：維護模式 → router guard

於 `router.beforeEach` 最前端插入：

```ts
const maintenanceOn = settings.value.maintenanceMode
if (maintenanceOn && !to.path.startsWith('/admin') && to.path !== '/maintenance') {
  return '/maintenance'
}
if (!maintenanceOn && to.path === '/maintenance') {
  return '/'
}
```

`/admin` 路徑必須豁免，否則開啟維護模式後將無法進入後台關閉它。

`createAdminCollection` 回傳 module 層級的 ref，可直接於 router 檔案 import 並讀取 `.value`，無需額外的讀取函式。

### 連動點 4：權限矩陣 → 側邊欄與路由

- `admin-layout.vue`：nav 清單以 `canAccess(item.pageKey)` 過濾；header 加入「檢視身分」切換器
- `router.beforeEach`：讀取 `to.meta.pageKey`，`canAccess` 未通過則導回 `/admin`

## 8. 既有模組的整合改動

| 檔案 | 改動 |
|------|------|
| `pages/admin/index.vue` | 新增 2 張統計卡（生效中公告數、維護模式狀態）；待辦佇列加入「未發布公告」項 |
| `pages/admin/users.vue` | 詳情 Dialog 加「管理角色」下拉，僅 `role === 'admin'` 時顯示 |
| `mocks/admin/audit.ts` | `AuditActionType` 新增 `'系統設定'`、`'內容管理'`、`'權限'`、`'通知模板'` |
| `components/admin-layout.vue` | 11 項導覽 + 三群分組 + 檢視身分切換器 |
| `router/index.ts` | 4 條新路由 + 全部子路由加 `meta.pageKey` + 2 個 guard |
| `pages/dashboard.vue` | 公告橫幅 |
| `composables/admin/useAdminStore.ts` | 新增選用的 `migrate` 參數（見 9.1） |

四個新模組的所有寫入操作一律呼叫 `logAction`，與既有模組一致。

## 9. 錯誤處理

### 9.1 舊 localStorage 資料的向後相容

既有使用者瀏覽器中已存有 `rentmate-admin:users`，其中不含 `adminRoleId` 欄位。`createAdminCollection` 讀到舊資料會直接沿用，不會補齊新欄位，導致 RBAC 無法解析角色。

解法：`createAdminCollection` 新增選用的第三個參數 `migrate?: (raw: T) => T`，於讀取後、寫回前執行一次。既有 7 個模組不傳此參數，行為完全不變。

```ts
export function createAdminCollection<T>(
  name: string,
  seed: () => T,
  migrate?: (raw: T) => T,
): Ref<T>
```

`users` 的 migrate 補上 `adminRoleId: adminRoleId ?? null`。

### 9.2 其餘

| 情況 | 處理 |
|------|------|
| localStorage JSON 損毀 | 既有 `readJson` 已 try/catch 並 `removeItem`，新模組自動受惠 |
| 表單必填未填 | 欄位下方顯示錯誤訊息，儲存鈕 disable |
| Email 格式錯誤 | 同上 |
| `pageSize` 超出 1–100 | 同上 |
| `maxUploadMb` 超出 1–50 | 同上 |
| 刪除任何項目 | 一律跳確認 Dialog，沿用既有 `resetOpen` 模式 |
| 刪除仍被使用的角色 | 擋下並顯示佔用人數 |
| 模板變數名稱打錯 | `renderTemplate` 保留原樣，於預覽中可見 |
| 開啟維護模式 | 確認 Dialog 顯示紅色警示，並說明 `/admin` 不受影響 |

## 10. 測試

專案目前無測試框架，本次引入 vitest，僅針對三個純函式撰寫單元測試。這三者的共通點是邏輯含多重分支、但以人工點擊難以窮舉驗證。

| 檔案 | 測試對象 | 涵蓋案例 |
|------|---------|---------|
| `src/utils/template-render.test.ts` | `renderTemplate` | 單一變數替換、多變數、重複變數、未定義變數保留、變數名前後含空白、空字串 body |
| `src/utils/admin-access.test.ts` | `canAccess` | `dashboard` 恆通過、角色為 null、角色停用、pages 不含目標、pages 含目標 |
| `src/utils/announcement.test.ts` | `isAnnouncementActive` | 未發布、尚未生效、已過期、`endAt` 為 null、正好落在邊界 |

`canAccess` 與 `isAnnouncementActive` 需能脫離 Vue 元件環境呼叫，因此純判斷邏輯放在 `src/utils/` 下並獨立匯出，composable 只負責注入 reactive 狀態後包一層。`useAdminAccess` 中的 override 優先序屬 composable 層邏輯，以手動驗證確認。

`package.json` 新增 `"test": "vitest run"` 與 `"test:watch": "vitest"`。

UI 行為（側邊欄過濾、維護模式導向、公告橫幅顯示）不寫自動化測試，以手動驗證確認。

## 11. 實作順序建議

1. 拆分 `admin-seed.ts` 為 `mocks/admin/`（純搬移，先確認既有 7 頁無異常）
2. `createAdminCollection` 加 `migrate` 參數
3. 引入 vitest
4. 系統設定模組 + 連動點 2（維護模式）
5. 內容管理模組 + 連動點 1（公告橫幅）
6. 權限與角色模組 + 連動點 4（側邊欄與路由）
7. 通知模板模組 + `renderTemplate`
8. 既有模組整合（總覽卡片、使用者管理角色下拉、側邊欄重排）

步驟 1 完成後應立即驗證既有 7 個頁面功能無損，再往下進行。
