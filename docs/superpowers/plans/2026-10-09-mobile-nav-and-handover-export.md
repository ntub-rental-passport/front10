# 房東手機導覽改底部列、手機端功能收斂、點交匯出改產 PDF

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三件事。(1) 房東手機版把側邊抽屜改成底部導覽列，並把手機上不堪用的功能收掉。(2) 租客手機版補上頂部列（logo + 通知鈴），並把手機上不堪用的功能收掉。(3) 點交的兩個匯出改成前端產 PDF 下載，取代現在在 iOS Safari 上完全無效的 `window.print()`，並把 `checkout.vue` 那個只有 `window.alert` 的假匯出實作出來。

**Architecture:** 裝置判斷沿用既有的 `src/utils/device-policy.ts` + `src/composables/useDeviceGate.ts`（layout 層攔截、監聽 resize 與 pointer 變化），只新增各 surface 自己的門檻函式。擋板畫面沿用既有的 `DesktopOnlyNotice.vue`，改成接 props。PDF 產出新寫一支 handover 專用 util，沿用專案既有的「Canvas 用瀏覽器本機字型繪中文 → 轉圖 → pdf-lib 嵌入 → `a.download` 下載」管線，但修掉 `contract-report.ts` 把所有頁 canvas 留在陣列裡的記憶體寫法。

**Tech Stack:** Vue 3.5 + TypeScript + Tailwind v4、vitest 3、pdf-lib 1.17、FastAPI + SQLAlchemy（後端只改一處文案與 action_url）。

---

## 執行前必讀

### 這個專案的測試硬限制

1. **vitest 跑在 Node，沒有 DOM**（`vite.config.ts` 的 `test.environment` 是 `'node'`），`jsdom` / `happy-dom` 都沒安裝。
2. **`@vue/test-utils` 沒有安裝**，所以 **`.vue` 元件無法做單元測試**。
3. 測試只收 `src/**/*.test.ts` 與 `server/**/*.test.js`。

**後果**：所有新邏輯必須抽成 `src/utils/` 底下的純函式才測得到。canvas 繪製與 PDF 產出不測 —— 這是既有慣例，看 `src/utils/contract-report.test.ts`：它只測 `reportEvidenceLines`、`createDeidentifier`、`createReportId` 三個純函式，完全不碰 canvas。照辦。

`.vue` 的改動只能靠 `npm run lint:types` 加瀏覽器實測確認。

### 為什麼點交匯出在手機上壞掉（根因）

`baseline.vue:258` 的 `triggerPrint()` 呼叫 `window.print()`。**iOS Safari 的 `window.print()` 是 no-op** —— 使用者按下去完全沒有反應，不是版面爛，是根本沒觸發。已向使用者確認症狀為「完全沒反應，用 Safari」。

即使在能列印的瀏覽器上，現有實作也有三個問題，但**這些都不用修，因為整條 print 路線會被刪掉**：
- `@media print` 寫在 `baseline.vue` 的 `<style scoped>` 裡，只隱藏該元件內的 `.screen-only`。`AppLayout` 的 footer、`fixed` 底部列、側邊欄都沒被蓋到，會一起印出去。
- `AppLayout` 外框是 `h-[100dvh]`，內容在 `overflow-y-auto` 的 `<main>` 裡 —— 列印時會被裁成一頁。
- `checkout.vue:196` 的「匯出退租證據包」是 `window.alert('（示意）…')`，零實作。

### 已驗證可行的下載路徑

使用者已在 iPhone Safari 實測 `/app/subsidy` 的「下載準備清單（PDF）」—— **可以拿到 PDF**。那支用的機制是 `src/components/subsidy/SubsidyGuide.vue:249-253`：

```ts
const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
const a = document.createElement('a')
a.href = url
a.download = 'RentMate-租補準備清單.pdf'
a.click()
setTimeout(() => URL.revokeObjectURL(url), 1000)
```

所以前端產 PDF + `a.download` 的路線成立，**不需要後端產檔、不需要「存到我的空間」的 fallback**。

唯一要補的：現有兩處下載都是 detached anchor 直接 `click()`（沒有 `appendChild` 到 DOM）。那是運氣，新寫的 util 要補上 `appendChild` / `remove()`。

### 點交照片沒有 CORS 問題

`backend/routers/inspection.py:137` 回傳的 `url` 是 `data:image/jpeg;base64,...`（後端已用 `compress_image` 壓到 1280×1280 JPEG）。畫進 canvas 不會 taint，`canvas.toBlob()` 不會丟 SecurityError。

### 既有的裝置攔截機制（不要重新發明）

`src/utils/device-policy.ts`：

```ts
export const DESKTOP_MIN_WIDTH = 1280

export function isDesktopEnvironment(snapshot: DeviceSnapshot): boolean {
  return !snapshot.coarsePointer || snapshot.viewportWidth >= DESKTOP_MIN_WIDTH
}

export function shouldBlockAdminSurface(snapshot: DeviceSnapshot): boolean {
  return !isDesktopEnvironment(snapshot)
}
```

**雙條件設計是刻意的**：必須「觸控指標」**且**「小螢幕」才算手機。只看寬度會誤擋縮小視窗的桌機使用者；只看 User-Agent 擋不準（iPadOS Safari 回報桌面 UA）而且使用者無法自救。看該檔案開頭的註解。

`src/composables/useDeviceGate.ts:38` 的註解也明說：攔截**刻意放在 layout 層而不是 router guard**，因為 guard 只在導覽那一刻跑一次，使用者轉螢幕或拉視窗都不會重新判斷。

### 既有的手機入口慣例

手機上沒有導覽入口的功能，慣例是**在總覽頁放一張 `sm:hidden` 的卡片**。看 `src/pages/dashboard.vue:589` 的停電通報橫幅，註解寫得很清楚：

> 手機版：簡單橫幅連結（sm 以下顯示）。這是停電通報在手機上的唯一入口 —— 手機沒有側邊欄，底部導航也只有六格放不下它。下面那張桌機版卡片維持關閉，因為桌機側邊欄已經有入口了。

本計畫**不需要新增任何這種卡片**（停電通報已有、補助文件經決策不做），但改到附近時不要破壞它。

### 已經實作好、不要重做的東西

- **房東報修通知**：`backend/routers/repairs.py:646` 的 `_notify_landlord_of_new_ticket`，新報修時送站內通知給房東，帶 `action_url="/landlord/maintenance"`，受 `settings.repair_notifications` 控制，並依 `email_notifications` 一併發 Email。所以底部列**不掛** badge。
- **房東登出**：`src/pages/landlord/settings-detail.vue:289` 的「登入與安全」頁已有「登出帳號」按鈕。側邊抽屜在手機上移除後，登出路徑是 設定 → 登入與安全。
- **房東方案入口**：`src/pages/landlord/settings.vue` 的 `items` 已有 `plan` 項目 →「方案權益與功能」→ `/landlord/settings/plan`。
- **租客方案入口**：`src/pages/account.vue:148-152` 已有「查看我的權益」→ `/app/account/plan` 與「比較訂閱方案」→ `/app/subscription`。
- **補助文件到期通知**：`backend/routers/subsidy_files.py:172`，提前 14 天送站內通知。只缺文案與 `action_url`（Task 14）。

---

## 決策總表

這份表是 45 輪問答的結論。**不要自行推翻或「順手改良」任何一條**；有疑義就停下來問，不要猜。

### 房東手機導覽

| 項目 | 決定 |
| --- | --- |
| 底部列項目 | 5 項：總覽 / 房務 / 租客 / 修繕 / 設定 |
| 底部列斷點 | `lg:`（< 1024px 顯示底部列） |
| 側邊抽屜 | 手機不再渲染。移除 `mobileOpen` 狀態、漢堡按鈕、遮罩 |
| Header（手機） | 只留 logo + 通知鈴，移除漢堡按鈕 |
| 配色 | 沿用房東米色主題，自己寫一份 markup，**不要**抽成跟租客共用的元件 |
| 工作區切換 | 手機不處理（使用者只有一個工作區） |
| 修繕未處理數 badge | **不掛**（報修通知已走站內通知） |
| 擱置提醒 | **不做**（獨立題目，不在本輪範圍） |

### 房東手機功能收斂

| 項目 | 決定 |
| --- | --- |
| 手機不提供 | 財務管理 `/landlord/finance`、合約管理 `/landlord/contracts` |
| 方案與訂閱 | **不擋**，入口走設定頁（已存在） |
| `PlanBenefitsPage` | **不擋**（唯讀的方案說明，手機看沒問題） |
| `SubscriptionPage` | **不擋**（兩個角色一致，見下方租客段） |
| 擋法 | 掛 `DesktopOnlyNotice`，**不 redirect** |
| 總覽頁上通往被擋頁的連結 | **全部留著可點**。點進去看到擋板，動線完整。不要改成不可點、不要隱藏、不要改導向 |
| 擋板門檻 | 1024px，跟底部列斷點對齊 |
| 手機版面修理範圍 | 只修手機保留的 5 頁：總覽、房務、租客、修繕、設定。財務與合約**不修**（已掛擋板） |

### 租客手機

| 項目 | 決定 |
| --- | --- |
| 頂部列 | 新增，只手機（`sm:hidden`），`sticky top-0` 放在 `<main>` 內最上方。內容：logo + 通知鈴 |
| 通知鈴 | **不做 dropdown**。一顆 icon + 未讀數字，點了直接跳 `/app/notifications`。只用 `useNotifications('tenant')` 的 `unreadCount`，**不要動 `LandlordNotificationBell.vue`** |
| 底部列 | **完全不改**，維持現有 6 項含「我的帳戶」 |
| 手機不提供 | 合約 AI 工具 5 個路由 + 租補 7 個路由（見 Task 7 名單） |
| 教學文章 | **不擋**（`/app/contract`、`/app/contract/air-conditioner-repair`、`/app/contract/electricity-fee`、`/app/tenant-guide`） |
| 停電通報 | **不擋**（唯一做過手機版的，而且總覽頁已有 `sm:hidden` 入口） |
| 方案與訂閱 | **不擋**（帳戶頁已有入口） |
| 補助文件 | **不拉獨立路由**、**不加總覽卡片**。手機上就是沒有，靠到期通知提醒 |
| 擋板門檻 | 640px，跟底部列斷點對齊 |
| 手機版面修理範圍 | 只修 `notifications.vue` 與 `baseline.vue`。`account.vue`、`garbage`、`notes` **不在本輪範圍** |

### 擋板畫面

| 項目 | 決定 |
| --- | --- |
| 元件 | 改造既有 `DesktopOnlyNotice.vue` 接 props，**不要**新寫一個 |
| admin 行為 | 零改動。props 的 default 值就是現有文案 |
| 標題（租客／房東） | `這一頁請用電腦開` |
| 說明段（租客／房東） | **不要**。使用者明確要求不過度解釋 |
| 結尾句 | `請在電腦上開啟同一個網址。` |
| 按鈕 | 「複製目前網址」+「返回首頁」（租客 `/app`、房東 `/landlord`）。**不放登出** |
| admin 按鈕 | 維持「複製目前網址」+「登出」 |

### 點交匯出

| 項目 | 決定 |
| --- | --- |
| 技術路線 | 統一前端產 PDF 下載。**桌機也一樣**，不保留 `window.print()` 分支 |
| print CSS 與 print-only template | **整段刪除**（`baseline.vue` 約 200 行）。不留任何 `@media print` 防護 |
| 照片處理 | 整頁畫進 canvas，輸出 JPEG 後 `embedJpg`。**不要**分層把原圖塞進 PDF（檔案會變大） |
| 記憶體 | 新寫 handover 專用 util。每畫完一頁立刻 `embedJpg` 進 PDF，然後把 canvas 設成 `width = height = 0` 釋放，同時存活的 canvas 永遠只有一張。**不要**照抄 `contract-report.ts:216` 把所有 canvas 留在陣列裡的寫法 |
| `contract-report.ts` | **不動**（已上線、頁數少、風險低） |
| baseline 匯出項目 | 兩種都留（條列清單、完整證據包），手機桌機都給 |
| baseline 完整證據包版面 | 照抄原本的 `full-item` 比例（左邊照片、右邊 meta，一頁多項），30 項約 6–8 頁 |
| checkout 證據包版面 | 每項一頁，搬入照／退租照並排 + diff 結論 + 時間戳 |
| 未拍退租照的項目 | **也各佔一頁**，另一半留白。文案用中性的「本項無退租存證」，**不要**猜原因、**不要**新增標記欄位 |
| 工具列 | 手機分層：搜尋獨佔一行、「新增」主要按鈕、兩個匯出收進一顆「匯出 ▾」下拉、篩選變 icon 切換 |
| 測試 | 分頁計算、房間分組、diff 結論文字、檔名組裝、納入範圍篩選 → 全部抽純函式並寫測試。canvas 不測 |

### 通知

| 項目 | 決定 |
| --- | --- |
| 補助文件到期提醒 | 沿用現有 14 天機制，**不新增**「申請後提醒」 |
| 到期通知文案 | 補一句要用電腦下載 + 補 `action_url` |

---

## Task 1 — `device-policy.ts` 新增各 surface 的門檻

- [ ] 把 `isDesktopEnvironment` 改成可以帶門檻：`isDesktopEnvironment(snapshot, minWidth = DESKTOP_MIN_WIDTH)`。保持原本單參數呼叫的行為不變。
- [ ] 新增兩個常數與兩個判斷函式：

```ts
/** 房東底部列在 lg（1024px）以下出現，擋板必須用同一個數字，否則 1024–1280 的
 *  觸控平板會看到「側邊欄有入口、點進去被擋」。 */
export const LANDLORD_DESKTOP_MIN_WIDTH = 1024

/** 租客底部列在 sm（640px）以下出現，同上。 */
export const TENANT_DESKTOP_MIN_WIDTH = 640

export function shouldBlockLandlordSurface(snapshot: DeviceSnapshot): boolean
export function shouldBlockTenantSurface(snapshot: DeviceSnapshot): boolean
```

- [ ] `shouldBlockAdminSurface` 維持用 `DESKTOP_MIN_WIDTH`（1280），行為完全不變。
- [ ] 在 `src/utils/device-policy.test.ts` 補測試，每個 surface 至少涵蓋四種組合：粗指標+窄、粗指標+寬、細指標+窄、細指標+寬。特別要測「1024px 的觸控裝置」對房東是**不擋**、對租客是**不擋**、對 admin 是**擋**，這組邊界就是 Task 1 存在的理由。
- [ ] `src/composables/useDeviceGate.ts` 新增 `useLandlordDeviceGate()` 與 `useTenantDeviceGate()`，照 `useAdminDeviceGate()` 的樣子寫（`createDeviceGate` + `onUnmounted(gate.stop)`），但 `evaluate()` 要用對應的 `shouldBlockXxxSurface`。

  注意 `createDeviceGate` 目前把 `blocked.value = shouldBlockAdminSurface(snapshot)` 寫死在 `evaluate` 裡。改成讓 `createDeviceGate` 接一個 `shouldBlock: (s: DeviceSnapshot) => boolean` 參數，預設 `shouldBlockAdminSurface` 以免動到既有呼叫點。

- [ ] `npm run test` 全綠、`npm run lint:types` 無錯。

## Task 2 — `DesktopOnlyNotice.vue` 改成接 props

- [ ] 加上 props，**全部給 default 等於現在的 admin 文案與行為**，這樣 `AdminLayout.vue:144` 與 `staff-login.vue:136` 一行都不用改、渲染結果完全相同：

```ts
const props = withDefaults(defineProps<{
  title?: string
  description?: string
  showSignOut?: boolean
  homePath?: string
}>(), {
  title: '後台僅支援桌面瀏覽器',
  description: '管理後台可以變更使用者狀態、審核補助申請與查閱稽核紀錄，這些操作只在桌面環境進行。',
  showSignOut: true,
  homePath: '',
})
```

- [ ] `description` 用 `v-if="description"` 包起來 —— 租客／房東會傳空字串，那一段就不渲染。
- [ ] 「請在電腦上開啟同一個網址。」這句**保留給所有情境**，不受 props 影響。
- [ ] 「登出」按鈕用 `v-if="showSignOut"` 包起來。
- [ ] 新增「返回首頁」按鈕，`v-if="homePath"`，樣式跟「複製目前網址」一致（`border border-border bg-card`）。排在「複製目前網址」下面。

  **不要用 `router.back()`** —— 使用者可能是從通知的 `action_url` 或外部連結直接進來，history 裡沒有上一頁，按了不會有反應或跳出站外。

- [ ] 「複製目前網址」的邏輯與 `copyFailed` fallback 完全保留不動。
- [ ] 更新檔頭註解：現在它同時服務 admin（整個 surface 都不給手機）與租客／房東（只有某幾頁不給手機），兩者的按鈕組不同，原因寫進註解。
- [ ] `npm run lint:types` 無錯。手動確認 `/admin` 在手機寬度下的畫面與改動前一致。

## Task 3 — 房東底部列

- [ ] `src/components/layouts/LandlordLayout.vue`：把現有 `navItems`（8 項）保留給桌機側邊欄不變，另外新增手機底部列用的 5 項：

```ts
// 手機底部列：5 格。財務管理與合約管理手機不提供（見 Task 4），
// 方案與訂閱走設定頁（settings.vue 已有 plan 項目）。
const mobileNavItems = [
  { label: '總覽', path: '/landlord', icon: Home },
  { label: '房務', path: '/landlord/properties', icon: Building2 },
  { label: '租客', path: '/landlord/tenants', icon: Users },
  { label: '修繕', path: '/landlord/maintenance', icon: Wrench },
  { label: '設定', path: '/landlord/settings', icon: Settings },
]
```

- [ ] 新增底部列 markup，**沿用房東米色主題**，不要用 shadcn token。active 用 `#5b8263`（跟側邊欄一致），未選用 `#526057`。結構參考 `AppLayout.vue:160` 的租客底部列，但配色與 class 自己寫一份。
- [ ] 底部列只在 `lg` 以下顯示（`lg:hidden`），`fixed bottom-0 left-0 right-0 z-50`，高度 `h-[calc(4rem+env(safe-area-inset-bottom))]`，`pb-[env(safe-area-inset-bottom)]`。
- [ ] `isActive()` 沿用現有那支（`/landlord` 要精確比對，其他用 `startsWith`）。
- [ ] `<main>` 補底部內距讓內容不被底部列蓋住：`pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8` 之類，數字自己對齊現有 `p-4 sm:p-6 lg:p-8 xl:p-10` 的節奏。
- [ ] 移除漢堡按鈕（header 裡那顆 `@click="mobileOpen = !mobileOpen"`）、移除 `mobileOpen` ref、移除遮罩 `<div v-if="mobileOpen" ...>`。
- [ ] `<aside>` 改成 `lg` 以下不渲染（或 `hidden lg:flex`），並移除它 class 裡所有 `mobileOpen` 相關的 `translate-x` 邏輯。
- [ ] `<aside>` 上的 `@click="mobileOpen = false"` 全部移除。
- [ ] Header 在手機維持 logo + `LandlordNotificationBell`，確認移除漢堡後排版不塌。
- [ ] `npm run lint:types` 無錯。瀏覽器在 375px、768px、1024px、1280px 四個寬度確認：< 1024 看到底部列沒有側邊欄；>= 1024 看到側邊欄沒有底部列。

## Task 4 — 房東擋板

- [ ] `LandlordLayout.vue` 引入 `useLandlordDeviceGate()`，並定義手機不提供的路由名單：

```ts
// 手機不提供：這兩頁都是寬表格，要對照收款明細與合約條款。
const MOBILE_UNSUPPORTED_PREFIXES = ['/landlord/finance', '/landlord/contracts']
const mobileUnsupported = computed(() =>
  deviceBlocked.value && MOBILE_UNSUPPORTED_PREFIXES.some((p) => route.path.startsWith(p)),
)
```

- [ ] 在 `<main>` 裡把 `<RouterView />` 換成條件渲染：

```vue
<DesktopOnlyNotice
  v-if="mobileUnsupported"
  title="這一頁請用電腦開"
  description=""
  :show-sign-out="false"
  home-path="/landlord"
/>
<RouterView v-else />
```

- [ ] **不要 redirect**，網址要留在原地（這樣「複製目前網址」才有意義）。
- [ ] **不要改 `src/pages/landlord/dashboard.vue` 上任何連往 `/landlord/finance` 或 `/landlord/contracts` 的 RouterLink**。它們全部留著可點：`:110` 的月份鈕、`:151` 的「查看收款明細」、`:186`、`:86` 的「待收款」待辦、`:88` 的「合約提醒」待辦。點進去會看到擋板，這是刻意的。
- [ ] `src/components/landlord/LandlordNotificationBell.vue` 的待辦用動態 `task.route`。**實作時 grep 一次確認它產生的路由裡有沒有 `/landlord/finance` 或 `/landlord/contracts`** —— 目前 grep 不到硬編碼字串，但要確認它不是從別處組出來的。有的話一樣留著不動。
- [ ] 瀏覽器確認：375px 寬打開 `/landlord/finance` 看到擋板、網址沒變、「返回首頁」回到 `/landlord`、沒有登出按鈕；1280px 寬打開同一個網址看到正常頁面。

## Task 5 — 房東手機版面（只修保留的 5 頁）

- [ ] 範圍嚴格限制在 `dashboard.vue`、`properties.vue`、`tenants.vue`、`maintenance.vue`、`settings.vue` + `settings-detail.vue`。**不要碰** `finance.vue`、`contracts.vue`（已掛擋板）。
- [ ] 把這些檔案裡**沒有 responsive prefix 的 `grid-cols-2` / `grid-cols-3` / `grid-cols-5`** 改成手機單欄、斷點後恢復。例如 `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`。
- [ ] 逐頁在 375px 寬實測，找出橫向溢出（內容超出視窗寬度）並修掉。`tenants.vue`、`maintenance.vue`、`properties.vue` 有 `<table>` 或 `min-w-[...]`，確認它們包在 `overflow-x-auto` 裡而不是撐爆頁面。
- [ ] **不要**為了版面重構元件結構或改資料流，只調 class。
- [ ] `npm run lint:types` 無錯。

## Task 6 — 租客頂部列與通知鈴

- [ ] 新增 `src/components/TenantNotificationBell.vue`（或放 `src/components/navigation/`，照專案習慣選）：
  - 用 `useNotifications('tenant')` 取 `unreadCount`
  - 用 `notificationBadge(unreadCount)`（`src/utils/notification-bell.ts` 已有）格式化數字
  - 渲染一顆 `Bell` icon + 未讀 badge，整顆是 `<RouterLink to="/app/notifications">`
  - **不要 dropdown**。不要引入 `DropdownMenu`、不要抓 `inboxItems`
  - 用 shadcn token 配色（`text-foreground`、`bg-primary` 等），**不要**抄 `LandlordNotificationBell` 的硬編碼色
- [ ] **不要修改 `src/components/landlord/LandlordNotificationBell.vue`**。
- [ ] `src/components/layouts/AppLayout.vue`：在 `<main>` 內、`<div :class="isWideContentRoute ? ...">` 之前，插入手機專用頂部列：

```vue
<!-- 手機頂部列：桌機側邊欄已有「通知中心」入口，所以只在 sm 以下顯示。
     用 sticky 而不是 fixed —— main 本身就是 overflow-y-auto 的滾動容器，
     sticky 跟著它走，不用改 main 既有的 pt-[env(safe-area-inset-top)]，
     也不會跟底部列的 fixed 打架。 -->
<header class="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 sm:hidden">
  <RouterLink to="/app" class="flex items-center gap-2">
    <img :src="brandLogoIcon" alt="RentMate Logo" class="h-6 w-6 object-contain" />
    <span class="text-sm font-bold text-primary">租隊友 RentMate</span>
  </RouterLink>
  <TenantNotificationBell />
</header>
```

- [ ] **底部列完全不改**，6 項含「我的帳戶」全部保留。
- [ ] 確認頂部列在 `hidesDesktopSidebar` 的路由（教學文章、`/app/contract-analysis`）上也正常顯示 —— 那些路由隱藏的是桌機側邊欄，跟手機頂部列無關。
- [ ] 瀏覽器在 375px 確認：頂部列黏在上緣、滾動時不消失、未讀數字正確、點了跳 `/app/notifications`；640px 以上頂部列消失。

## Task 7 — 租客擋板

- [ ] `AppLayout.vue` 引入 `useTenantDeviceGate()`，定義名單：

```ts
/*
 * 手機不提供的租客頁面。
 *
 * 合約 AI 工具：要同時看契約原文與逐條分析，contract/index.vue 有 1040 行且
 * 沒有任何 responsive prefix。
 * 租補：整個流程是把資料逐欄貼到政府網站，兩個視窗來回對照手機做不來。
 *
 * 刻意不含：教學文章（tenant-defense-guide，純閱讀而且已有手機版面）、
 * 停電通報（唯一做過手機版的，總覽頁已有 sm:hidden 入口）、
 * 方案與訂閱（帳戶頁已有入口）。
 */
const MOBILE_UNSUPPORTED_PATHS = [
  '/app/contract/scanner',
  '/app/contract-analysis',
  '/app/contract/editor',
  '/app/contract/combined',
  '/app/contract/document',
  '/app/subsidy',
]
```

- [ ] 比對規則要小心：`/app/contract` 是**教學文章**，不能被 `/app/contract/scanner` 的前綴比對誤傷，也不能用 `startsWith('/app/contract')` 把教學文章一起擋掉。`/app/subsidy` 則要連子路由一起擋（`housing`、`recovery`、`calculator`、`apply`、`progress`、`upload` 七個路由都是同一個 `SubsidyGuide` 元件的 wrapper）。

  建議寫法：精確比對那 5 個 contract 路由，`/app/subsidy` 用 `startsWith`。**寫成純函式放 `src/utils/`** 並補測試 —— 這個比對規則有踩雷空間，而且是純邏輯，測得到：

```ts
// src/utils/mobile-surface.ts
export function isMobileUnsupportedTenantPath(path: string): boolean
export function isMobileUnsupportedLandlordPath(path: string): boolean
```

  測試一定要涵蓋：`/app/contract` **不**擋、`/app/contract/scanner` 擋、`/app/contract/air-conditioner-repair` **不**擋、`/app/contract/electricity-fee` **不**擋、`/app/tenant-guide` **不**擋、`/app/subsidy` 擋、`/app/subsidy/upload` 擋、`/app/outage` **不**擋、`/app/subscription` **不**擋。Task 4 的房東名單也搬進這支一起測。

- [ ] 擋板跟維護攔截的優先順序：現有的 `FeatureMaintenanceNotice`（`blocked && outage`）是後端控制的維護模式，裝置擋板是前端政策，兩者獨立。**維護優先** —— 如果一頁同時維護中又手機不支援，顯示維護提示。
- [ ] 渲染：

```vue
<FeatureMaintenanceNotice v-if="blocked && outage" :outage="outage" />
<DesktopOnlyNotice
  v-else-if="mobileUnsupported"
  title="這一頁請用電腦開"
  description=""
  :show-sign-out="false"
  home-path="/app"
/>
<RouterView v-else />
```

- [ ] **不要 redirect**。
- [ ] **不要改** `dashboard.vue:251` 連往 `/app/contract/scanner` 的 RouterLink，留著可點。
- [ ] 瀏覽器在 375px 逐一確認上面那九條比對規則的實際行為。

## Task 8 — `notifications.vue` 手機版面

- [ ] `src/pages/notifications.vue` 目前 182 行、0 處 responsive prefix。它是 Task 6 新增鈴鐺的目標頁，不修就是交付一個壞掉的入口。
- [ ] 在 375px 寬實測，修掉橫向溢出、過小的點擊區（目標 44×44pt 以上）、擠在一起的欄位。
- [ ] 範圍只有這一頁。**不要**順手改 `account.vue`、`garbage`、`notes` —— 它們的手機版面債另案處理。
- [ ] `npm run lint:types` 無錯。

## Task 9 — 匯出的純邏輯 util（先寫測試）

- [ ] 新增 `src/utils/handover-export.ts`，把所有可測的判斷抽成純函式。**這支不碰 canvas、不碰 DOM、不碰 pdf-lib。**
- [ ] 至少要有：

```ts
/** 把 diff 結果翻成 PDF 上要印的結論文字。
 *  沒有 checkout 存證時回「本項無退租存證」—— 中性陳述，不猜是遺失還是沒拍。 */
export function checkoutConclusion(item: HandoverItem): string

/** 完整證據包／退租證據包要納入哪些項目、以什麼順序。 */
export function baselineExportItems(items: HandoverItem[]): Grouped[]
export function checkoutExportItems(items: HandoverItem[]): HandoverItem[]

/** 一頁放得下幾項（baseline 的一頁多項版面），回傳分頁後的結構。 */
export function paginateBaselineGroups(groups: Grouped[], itemsPerPage: number): BaselinePage[]

/** 檔名。沿用專案慣例 RentMate-xxx.pdf，別名要過濾掉 \ / : * ? " < > | */
export function handoverPdfFileName(kind: 'checklist' | 'baseline' | 'checkout', alias: string): string
```

- [ ] **`checkoutConclusion` 的測試是這個 Task 最重要的部分。** 這份 PDF 要拿去爭押金，把「未比對」印成「無差異」是會害到使用者的錯誤，而肉眼看 30 頁 PDF 不會發現。必須涵蓋全部五種 `HandoverDiff.type`（`unchanged` / `new_damage` / `missing` / `degraded` / `uncertain`）、加上「有搬入照但沒退租照」、「有退租照但還沒跑比對」這兩種 `diff` 為 undefined 的情境。
- [ ] `paginateBaselineGroups` 要測：空清單、剛好一頁、剛好多一項、單一房間項目數超過一頁。
- [ ] 先寫測試再寫實作（TDD）。`npm run test` 全綠。

## Task 10 — handover PDF 產出 util

- [ ] 新增 `src/utils/handover-pdf.ts`。沿用 `contract-report.ts` 的 canvas 繪字手法（`ctx.font` 用 `"Microsoft JhengHei", "PingFang TC", sans-serif`，`await document.fonts.ready`），但**記憶體寫法必須不同**。
- [ ] 頁面尺寸沿用 `contract-report.ts`：canvas `1240 × 1754`，PDF 頁面 `[595.28, 841.89]`（A4 pt）。
- [ ] **逐頁釋放是這個 Task 的核心要求**：

```ts
// contract-report.ts:216 把所有頁的 canvas 推進陣列，最後才一次 embed。
// 合約報告頁數少所以沒事，但退租證據包是「每項一頁」—— 30 項就是 30 張
// 1240×1754 的 canvas，每張約 8.7MB backing store，加起來 260MB，
// iOS Safari 會直接 reload tab。所以這裡畫完一頁就 embed 並釋放，
// 同時存活的 canvas 永遠只有一張。
async function flushPage(canvas: HTMLCanvasElement, pdf: PDFDocument): Promise<void> {
  const blob = await canvasToJpegBlob(canvas, 0.82)
  const image = await pdf.embedJpg(await blob.arrayBuffer())
  pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
  canvas.width = 0
  canvas.height = 0
}
```

- [ ] 用 `canvas.toBlob(cb, 'image/jpeg', 0.82)` + `pdf.embedJpg`，**不要** `toBlob` 預設的 PNG + `embedPng`（照片類內容的 PNG 每頁 2–3MB）。
- [ ] 三種版面：
  - **條列清單**：每項一行的表格，含空白勾選框與空白備註欄，依房間分組，結尾有租客／房東簽名與日期欄。照抄現有 `baseline.vue:627-676` 的 print-only 版面內容與欄位。
  - **入住完整證據包**：照抄現有 `full-item` 比例 —— 左邊照片（canvas 上約 140:100 的框）、右邊物品名／AI 信心／時間／備註，一頁多項，依房間分組並印房間標題。
  - **退租證據包**：每項一頁。上半並排搬入照與退租照（各約頁寬的 45%），下半印物品名、房間、`checkoutConclusion()` 的結論、兩張照片的時間戳。沒有退租照時右邊留白並印「本項無退租存證」。
- [ ] 每頁都要有頁眉（標題、租屋處別名與地址、匯出時間）與頁碼（`第 n／N 頁`）。頁碼要等頁數確定後才知道 —— 用 `contract-report.ts:344` 的做法（繪完後回頭補）不行，因為我們已經釋放 canvas 了。改成**先算好總頁數再開始繪製**（Task 9 的 `paginate*` 函式就是為此存在），退租證據包的頁數等於納入項目數。
- [ ] 下載函式：

```ts
export function downloadHandoverPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  // 既有兩處下載都是 detached anchor 直接 click，那是運氣。掛進 DOM 再點。
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
```

- [ ] **這支不寫單元測試**（canvas 在 Node 環境沒有實作），照 `contract-report.ts` 的慣例。驗證靠 Task 11、12 的實機測試。

## Task 11 — `baseline.vue` 接上新匯出、刪 print、重排工具列

- [ ] 刪除 `triggerPrint()`、`printMode` ref、`resetPrintMode()`、`afterprint` 的 `addEventListener` / `removeEventListener`。
- [ ] 刪除兩大塊 print-only template（`v-if="printMode === 'checklist'"` 與 `v-if="printMode === 'full'"`，約 `:627` 到 `:730`）。
- [ ] 刪除 `<style scoped>` 裡整個 `@media print` 區塊，以及 `.print-only`、`.print-checklist`、`.print-full`、`.print-header`、`.print-signature`、`.print-integrity` 等所有只服務列印的規則。
- [ ] 刪除主內容外層的 `screen-only` class（它存在的唯一理由是被 `@media print` 隱藏）。
- [ ] 兩顆匯出按鈕改成呼叫新 util，加上 `exporting` 狀態（照 `SubsidyGuide.vue` 的慣例顯示「產生 PDF 中…」）與失敗訊息。
- [ ] 工具列重排。目前 `:366` 是 `flex flex-wrap items-end gap-3` 塞 5 個控件，375px 寬會 wrap 成 2–3 行且基線對不齊（只有搜尋框有 `<Label>`，配上 `items-end` 就歪）。改成：
  - 手機：搜尋框獨佔一行（移除 `min-w-[200px]`，改 `w-full`）；下一行放「新增點交項目」（主要）、「匯出 ▾」下拉、篩選 icon 切換
  - 桌機：維持單行，但移除 `items-end` 改 `items-center`，並把搜尋框的 `<Label>` 拿掉（它是工具列裡唯一有 label 的，造成對齊問題；placeholder 已經說明用途）
  - 「匯出 ▾」用 `components/ui/dropdown-menu`（已存在），兩個項目「匯出條列清單」、「匯出完整證據包」
  - 篩選（`onlyDone`）變 icon 切換時**狀態必須看得出來** —— 用 active 底色或 `aria-pressed`，不要只換 icon。保留 `aria-label` 說明當前狀態
- [ ] 整頁在 375px 實測（這頁只有 2 處 responsive prefix，工具列以外的地方大概也有問題，一併修掉橫向溢出）。
- [ ] `npm run lint:types` 無錯。檔案行數應該會從 852 掉到 650 上下。

## Task 12 — `checkout.vue` 實作真的匯出

- [ ] 刪除 `exportPdf()` 裡的 `window.alert`，改成呼叫 Task 10 的退租證據包產出 + `downloadHandoverPdf`。
- [ ] 加 `exporting` 狀態與失敗訊息，照 `SubsidyGuide.vue` 慣例。
- [ ] 納入項目用 Task 9 的 `checkoutExportItems()`：**所有** `itemsWithBaseline`，包含還沒拍退租照的（它們也各佔一頁、右邊留白）。按鈕的 `:disabled="stats.diffDone === 0"` 可以保留（至少要跑過一次比對才有意義），但不要加「沒拍完不給匯出」的限制。
- [ ] 把檔頭註解 `:7` 的「匯出 PDF 證據包」描述更新成實際行為。
- [ ] 整頁在 375px 實測。
- [ ] **實機驗證（必做，不能只在桌機確認）**：在 iPhone Safari 上實際匯出一次退租證據包，項目數至少 20 項，確認：拿到 PDF 檔、沒有 tab reload、PDF 頁數等於納入項目數、中文正常顯示、照片沒有破圖、沒拍退租照的項目顯示「本項無退租存證」。

## Task 13 — checkout 頁加「拍空位」提示

- [ ] `checkout.vue` 的頁面說明文字加一句：**東西不見了也請拍下原本的位置，AI 會判定為遺失。**
- [ ] 理由寫進註解：`HandoverDiff.type` 已經有 `'missing'`，但 `runAutoDiff` 的 candidates 條件（`useHandover.ts:240`）要求同時有 baseline 與 checkout evidence，所以不拍就永遠拿不到 `missing` 判定。拍空位會得到 AI 判定的遺失證據，效力比一頁空白強得多。
- [ ] 純文案改動，不改邏輯。

## Task 14 — 補助文件到期通知補文案與 action_url

- [ ] `backend/routers/subsidy_files.py:172` 的 `notify_user` 呼叫：
  - `body` 結尾的「請在到期前下載以保留副本。」改成「請在到期前於電腦上登入下載以保留副本。」
  - 補 `action_url='/app/subsidy'` 與 `action_label='前往補助文件'`
- [ ] 理由寫進註解：其他通知都有 `action_url`（對照 `repairs.py:666`），只有這則沒有，桌機使用者收到通知沒有一鍵前往的路徑。手機點到會看到 Task 7 的擋板，那是正確行為 —— 擋板會說明要用電腦，動線完整。
- [ ] 這是整個手機擋板決策裡**唯一會主動把使用者推向被擋頁面**的地方，所以文案必須先講清楚要用電腦。
- [ ] 後端若有對應測試，跑一次確認沒壞。

---

## 驗收

- [ ] `npm run test` 全綠。
- [ ] `npm run lint:types` 無錯。
- [ ] `npm run lint` 無錯。
- [ ] 房東：375 / 768 / 1024 / 1280 四個寬度確認底部列與側邊欄的切換、擋板只在 < 1024 的觸控裝置出現。
- [ ] 租客：375 / 640 / 1280 三個寬度確認頂部列出現與消失、擋板比對規則九條全部正確。
- [ ] 桌機瀏覽器把視窗縮到 375px（細指標）確認**不會**被擋 —— 這是 `device-policy` 雙條件設計要守住的行為。
- [ ] iPhone Safari 實機匯出退租證據包（至少 20 項）成功，且沒有 tab reload。
- [ ] iPhone Safari 實機匯出入住完整證據包與條列清單成功。
- [ ] `grep -rn "window.print" src/` 在 `pages/handover/` 底下沒有殘留。
- [ ] `grep -rn "screen-only\|print-only" src/pages/handover/` 沒有殘留。
