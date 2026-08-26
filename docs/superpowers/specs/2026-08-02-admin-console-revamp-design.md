# 管理後台改版設計 Spec

- 日期：2026-08-02
- 範圍：`Rentmate current/frontend/frontend` 的 `/admin` 管理後台，以及配套的 FastAPI 後端端點
- 前提：目前資料層是 localStorage 假資料。本次維持假資料可運作，但要把「切換到真後端」的路徑完整預留好

## 背景與動機

管理後台目前有 10 個功能模組，其中兩個不再需要；內容與通知本質上是同一件事卻分成兩頁；管理員角色分三種過於細碎；維護模式因為狀態存在 localStorage 而發生過管理員被鎖在站外的事故。

### 維護模式事故的根因

兩個獨立問題疊加：

1. **狀態來源錯誤。** `adminSettings` 由 `createAdminCollection('settings', …)` 建立，完全存在瀏覽器 localStorage。`localhost:5173` 與 `127.0.0.1:5173` 是不同 origin、不同 localStorage 儲存區，因此在其中一邊關閉維護模式，另一邊仍是開啟狀態。設定頁顯示「已關閉」與實際被攔截並不矛盾 —— 它們讀的是不同的儲存區。

2. **守衛放行清單不完整。** `router/index.ts` 的守衛只放行 `/admin` 與 `/maintenance`：

   ```ts
   if (maintenanceOn && !to.path.startsWith('/admin') && to.path !== '/maintenance') {
     return '/maintenance'
   }
   ```

   但管理員登入頁是 `/staff-login`。維護模式開啟後，未登入的管理員進 `/admin` → 被導向 `/staff-login` → 被維護守衛攔到 `/maintenance`，永遠無法登入後台把維護模式關掉。設定頁上「管理後台不受影響」的說明目前是錯的。

## 目標

1. 移除「物件與評價審核」與「法規知識庫」兩個模組
2. 「內容管理」與「通知」合併為單一頁面，採兩層分頁
3. 管理員角色由三種縮減為 `super`（超級管理員）與 `admin`（一般管理員）
4. 維護模式狀態改由後端 API 提供，並根治上述死鎖
5. 系統設定擴增「維護模式強化」與「安全性設定」兩區
6. 後台總覽補上「維護狀態」卡
7. 建立全模組 API adapter 層，使 mock 與 HTTP 實作可用環境變數切換

## 非目標

以下明確不在本次範圍，已知並接受：

- 後端密碼以明文儲存（`backend/routers/auth.py` 已 import passlib 但未使用）
- CORS `allow_origins=["*"]` 搭配 `allow_credentials=True`
- admin API 無任何身分驗證
- `/staff-login` 為純前端 mock，未接後端
- 管理員兩階段驗證

---

## 一、移除審核與知識庫模組

### 刪除

```
src/pages/admin/review.vue
src/pages/admin/knowledge.vue
src/composables/admin/useAdminReview.ts
src/composables/admin/useAdminKnowledge.ts
src/mocks/admin/review.ts
src/mocks/admin/knowledge.ts
```

### 連帶修改

| 檔案 | 修改 |
|---|---|
| `src/utils/admin-rbac.ts` | 移除兩個 nav item |
| `src/composables/admin/useAdminRbac.ts` | 移除 `navIcons` 的 `ClipboardCheck`、`BookOpen` 對應與 import |
| `src/router/index.ts` | 移除兩條 child route |
| `src/mocks/admin-seed.ts` | 移除兩行 re-export |
| `src/utils/admin-rbac.test.ts` | 移除對應測試案例 |
| `src/pages/admin/index.vue` | 移除「待審核項目」甜甜圈卡、`reviewSegments`、`pendingTotal`、`useAdminReview` import，以及待辦佇列中的物件／評價項目 |

`resetAdminData()` 會移除所有 `rentmate-admin:` 前綴但未註冊的 key，因此使用者瀏覽器中殘留的 `rentmate-admin:review`、`rentmate-admin:knowledge` 會在下次重置時自動清掉，不需額外處理。

---

## 二、內容與通知合併

保留路由 `/admin/content`，標題改為「內容與通知」。刪除 `src/pages/admin/notifications.vue`，並在 router 加上 `/admin/notifications` → `/admin/content` 的 redirect，避免舊書籤 404。

### 分頁結構

```
內容  →  公告 / 常見問題 / 法律文件 / 首頁輪播
通知  →  通知模板 / 發送紀錄
```

六個既有 Tab 元件（`src/components/admin/content/*.vue`、`src/components/admin/notifications/*.vue`）內容不變，只重組 `content.vue` 外層。

上層與下層 Tab 必須有明顯的視覺層級差異（上層較大、下層較輕），否則兩排外觀相同的分頁難以閱讀。

### RBAC

原本 `/admin/content` 與 `/admin/notifications` 權限相同，合併後不變。

---

## 三、管理員角色縮減

```ts
export type AdminRole = 'super' | 'admin'

export const adminRoleLabels: Record<AdminRole, string> = {
  super: '超級管理員',
  admin: '一般管理員',
}
```

### Migration（必要）

既有使用者的 localStorage 中 `rentmate-admin:users` 存的是 `'ops'` / `'content'`。`createAdminCollection` 的第三個參數 `migrate` 用於此處：

```
adminRole === 'super'  → 'super'
adminRole == null      → null
其餘任何值             → 'admin'
```

缺少這段的話，舊資料的角色欄位會顯示為空白，且 `getCurrentAdminRole()` 會回退成 `'super'`，等於默默給了過高權限。

抽成 `src/utils/admin-role-migrate.ts` 的純函式以便測試。

### Seed 調整

`src/mocks/admin/users.ts` 的三個管理員帳號改為兩個：

| email | adminRole |
|---|---|
| `admin@rentmate.tw` | `super` |
| `staff@rentmate.tw` | `admin` |

刪除 `content@rentmate.tw`。

### 權限矩陣

| 頁面 | path | super | admin |
|---|---|:---:|:---:|
| 後台總覽 | `/admin` | ✅ | ✅ |
| 訂閱與容量 | `/admin/subscription` | ✅ | ✅ |
| 內容與通知 | `/admin/content` | ✅ | ✅ |
| AI 使用量 | `/admin/ai-usage` | ✅ | ✅ |
| 使用者管理 | `/admin/users` | ✅ | — |
| 稽核紀錄 | `/admin/audit` | ✅ | — |
| 系統設定 | `/admin/settings` | ✅ | — |

### 導覽群組

```
營運管理    後台總覽 · 使用者管理 · 訂閱與容量
內容與通知  內容與通知 · AI 使用量
系統        稽核紀錄 · 系統設定
```

一般管理員登入後「系統」群組整組消失。`visibleNavGroupsFor` 既有的空群組過濾邏輯已涵蓋此情形，不需修改。

### 動作層級限制

「變更他人管理員角色」（`setAdminRole`）僅 super 可用。因為使用者管理頁本身已限 super，此限制在 UI 上自然成立；`useAdminUsers.setAdminRole` 仍應加防禦性檢查，避免日後權限放寬時漏掉。

---

## 四、維護模式後端化

### 後端資料模型

`backend/models.py` 新增單列表 `system_settings`（id 固定為 1）：

| 分區 | 欄位 |
|---|---|
| 基本 | `site_name`, `support_email` |
| 維護 | `maintenance_mode`, `maintenance_message`, `maintenance_starts_at`, `maintenance_ends_at`, `maintenance_allowlist`（換行分隔 email） |
| 限制 | `page_size`, `max_upload_mb`, `default_ai_quota` |
| 安全 | `login_max_attempts`, `login_lockout_minutes`, `session_timeout_minutes`, `password_min_length` |
| 稽核 | `updated_at` |

### 端點

| 端點 | 說明 |
|---|---|
| `GET /api/settings/public` | 免驗證。只回站名、維護開關、維護訊息、排程起訖 |
| `GET /api/admin/settings` | 全欄位 |
| `PUT /api/admin/settings` | 更新全欄位 |

安全參數不出現在 public 端點。即使目前沒有身分驗證機制，這個切分仍然有意義 —— 它讓「哪些欄位是公開的」成為一個明確的設計決定，之後加上驗證時不必重新盤點。

### 前端啟動流程

```
main.ts（改為 async）
  └─ await bootstrapSettings()        逾時 2 秒
       ├─ 成功 → 寫入 settings ref，來源標記 'api'
       └─ 失敗 → maintenanceMode 視為 false，來源標記 'offline'，console.warn
  └─ app.mount()
```

`router.beforeEach` 維持同步讀取 ref，不需改成 async。

**fail-open 是刻意的設計。** 後端未啟動時必須仍能進站開發，否則等於用另一種方式重現同樣的鎖死。代價是後端故障期間維護模式會失效，這個取捨在本專案的情境下是正確的。

bootstrap 時執行 `localStorage.removeItem('rentmate-admin:settings')` 清除舊 key，避免殘留狀態造成混淆。

### 守衛修正

新增純函式 `src/utils/maintenance.ts`：

```ts
isMaintenanceActive(settings, now, userEmail): boolean
```

判斷順序：

1. `maintenanceMode` 為 false → `false`
2. 有設定排程區間且 `now` 不在區間內 → `false`
3. `userEmail` 命中白名單 → `false`
4. 其餘 → `true`

未設排程區間時，維護模式開啟即持續生效。

守衛放行清單由「只有 `/admin`」擴充為：

```
/admin/*      /staff-login      /maintenance
```

`/staff-login` 是關鍵。少了它就是背景章節描述的死鎖。

### 維護頁強化

`src/pages/maintenance.vue` 增加：

- 「我是管理員 →」連結，指向 `/staff-login`
- 狀態來源徽章：`後端 API` / `離線（暫視為正常）`

狀態來源徽章的用途是除錯 —— 下次再發生類似狀況時，一眼就能判斷問題出在後端還是前端。

---

## 五、系統設定擴增

`/admin/settings` 分為四張卡：

1. **基本資訊** —— 網站名稱、客服信箱（不變）
2. **系統維護** —— 維護開關、說明文字、排程起訖時間、白名單 email（textarea，一行一個）、狀態來源徽章；維護中時顯示紅色「立即解除維護」按鈕，跳過確認對話框直接生效
3. **安全性設定** —— 登入失敗鎖定次數、鎖定分鐘數、Session 逾時分鐘數、密碼最短長度
4. **使用限制** —— 表格每頁筆數、上傳上限、AI 每日配額（不變）

### 安全性設定的實際效力

必須在 UI 上或文件中誠實反映，避免做出看得到卻沒有作用的開關：

| 設定 | 生效層級 |
|---|---|
| 密碼最短長度 | 前端 `register.vue` 驗證。真的擋得住 |
| Session 逾時分鐘 | `useAuth` session 加 `expiresAt`，守衛檢查過期後導回登入。真的會登出 |
| 登入失敗鎖定次數／分鐘 | **僅前端層級**（localStorage 計數）。擋得住誠實使用者，擋不住繞過。後端 endpoint 已預留，接上後才是真正的鎖定 |

---

## 六、後台總覽維護狀態卡

新增 `src/components/admin/StatusCard.vue`，與既有的 `BarStatCard.vue`、`DonutStatCard.vue` 同層級。

顯示內容：

- 大字 `運作正常` / `維護中`，搭配綠／紅狀態點
- 狀態來源徽章
- 有排程時顯示區間
- super 可點擊進入系統設定；一般管理員為唯讀，不可點擊

移除「待審核項目」卡後，總覽維持四張卡的版面。

---

## 七、全模組 API adapter 層

### 問題

現行 composable 直接同步改動 ref：

```ts
function setStatus(id: string, status: AdminUserStatus): void {
  const user = users.value.find((item) => item.id === id)
  user.status = status
}
```

HTTP 是非同步的。不重構就無法切換到真後端。

### 結構

```
src/api/admin/
├── client.ts        API_BASE（VITE_API_BASE_URL）、apiFetch、ApiError
├── contracts.ts     所有 Repo 介面與 endpoint 路徑常數（單一事實來源）
├── mock/            × 7，讀寫 localStorage，內部同步、對外包成 Promise
├── http/            × 7，fetch 實作
└── index.ts         依 VITE_USE_MOCK_API 組裝並匯出 adminApi
```

七個模組：`users`、`content`、`notifications`、`aiUsage`、`audit`、`subscription`、`settings`。

**所有方法一律 async，mock 也不例外。** composable 只寫一次，兩種實作都能運作，切換時前端零改動。

### Endpoint 契約

寫入 `docs/admin-api.md`，並標明每支的實作狀態。

```
GET    /api/admin/users
PATCH  /api/admin/users/{id}

GET    /api/admin/content/{資源}
POST   /api/admin/content/{資源}
PUT    /api/admin/content/{資源}/{id}
DELETE /api/admin/content/{資源}/{id}
       資源 = announcements | faqs | legal-docs | banners

GET    /api/admin/notifications/templates
POST   /api/admin/notifications/templates
PUT    /api/admin/notifications/templates/{id}
DELETE /api/admin/notifications/templates/{id}
POST   /api/admin/notifications/send
GET    /api/admin/notifications/logs

GET    /api/admin/ai-usage
GET    /api/admin/ai-usage/daily

GET    /api/admin/subscription
PATCH  /api/admin/subscription/{id}

GET    /api/admin/audit
POST   /api/admin/audit

GET    /api/settings/public
GET    /api/admin/settings
PUT    /api/admin/settings
```

### 後端骨架

新增 `backend/routers/admin.py`，每支端點帶完整 Pydantic request／response 型別，回應 `501 Not Implemented`。只有 settings 三支真正實作。

這樣「端口已預留」是可驗證的事實：路徑打得到、OpenAPI 文件生得出來、前後端型別對得上。

### 減少樣板

- `src/composables/admin/useAdminResource.ts` —— 統一 `loading`、`error`、`refresh`、`mutate`
- `src/components/admin/AdminAsyncSection.vue` —— 統一 loading skeleton 與錯誤重試 UI

否則七個模組會產生七份幾乎相同的狀態管理程式碼。

---

## 測試

| 測試 | 涵蓋 |
|---|---|
| `src/utils/admin-rbac.test.ts`（更新） | 新的兩角色權限矩陣、移除的路徑 |
| `src/utils/admin-role-migrate.test.ts`（新增） | `ops`／`content` → `admin`、`super` 不變、`null` 不變、未知值 → `admin` |
| `src/utils/maintenance.test.ts`（新增） | 關閉／開啟／排程區間內外／白名單命中／未設排程 |
| `src/utils/settings-validate.test.ts`（擴充） | 新欄位範圍、排程起訖順序、白名單 email 格式 |

### 手動驗收

- 後端未啟動時能正常進站（fail-open）
- 維護模式開啟中，仍能從 `/staff-login` 登入後台並關閉維護模式
- 一般管理員看不到使用者管理、稽核紀錄、系統設定
- 舊 localStorage（含 `ops`／`content` 角色）載入後角色顯示正確

---

## 執行順序

規模約：新增 25 檔、修改 15 檔、刪除 8 檔。切成三輪，每輪各自可驗收、可回退。

| 輪次 | 內容 | 風險 |
|---|---|---|
| 1 | 一、二、三（移除模組、合併頁面、角色縮減） | 低。純前端，不動啟動流程 |
| 2 | 四、五、六（維護後端化、設定擴增、狀態卡） | 中。動到 `main.ts` 啟動流程與後端 |
| 3 | 七（全模組 adapter 與後端骨架） | 高。七個後台頁面都要改為非同步 |

第三輪單獨執行 —— 它會碰到每一個後台頁面，混在其他改動裡難以判斷回歸來源。
