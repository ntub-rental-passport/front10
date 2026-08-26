# A15 系統管理員後台 設計規格

日期：2026-07-14
狀態：暫定（使用者已口頭核准，標記為初版）

## 背景與目標

依「暑假第一次會議 - 專題文件修正建議討論」，評審要求補上 A15 系統管理員後台，包含六個子功能：使用者管理、物件與評價審核、法規知識庫維護、AI 產出品質監控、訂閱與容量管理、稽核紀錄查詢。

本規格描述在現有 Vue 3 前端（`frontend/frontend`）中建置完整可操作的管理者介面。資料採混合式：介面用假資料驅動，但資料存取抽成 composable 層，之後接後端 API 時只需改 composable 內部。

## 範圍

- 只做系統管理員後台（A15），不做房東介面（A12）與其他使用者端功能。
- 所有管理操作為完整互動：操作會改變畫面狀態並持久化於 localStorage。
- 不新增測試框架；驗證方式為 `npm run lint`（含 vue-tsc）與瀏覽器手動流程。

## 角色與登入調整

現況：`AuthRole = 'user' | 'admin'`，登入頁「房東登入」對應 `admin` 並導向 `/admin`。此與會議文件的角色定義衝突（房東與系統管理員是不同角色）。

調整：

1. `AuthRole` 擴充為 `'user' | 'landlord' | 'admin'`（`src/composables/useAuth.ts`）。
2. `src/constants/auth-identity.ts`：
   - 房東身分改對應 `landlord` 角色。
   - 新增第三個身分選項「管理員登入」，對應 `admin` 角色（僅登入頁顯示）。
   - 註冊頁維持只有租客/房東兩種身分；管理員不開放註冊，demo 時用管理員選項直接登入。
3. `resolveRoleHome`：`user`、`landlord` → `/app`（房東暫用租客工作區，待房東介面完成後再分流）；`admin` → `/admin`。
4. 路由守衛（`src/router/index.ts`）：`/app` 允許 `user` 與 `landlord`；`/admin` 僅允許 `admin`。
5. `needsNicknameSetup`：`admin` 跳過暱稱設定流程；`user` 與 `landlord` 維持現有行為。

## 路由結構

`/admin` 沿用現有 `AdminLayout`，children 擴充為：

```
/admin                → 後台總覽（升級現有 admin-dashboard）
/admin/users          → 15.1 使用者管理
/admin/review         → 15.2 物件與評價審核
/admin/knowledge      → 15.3 法規知識庫維護
/admin/ai-quality     → 15.4 AI 產出品質監控
/admin/subscription   → 15.5 訂閱與容量管理
/admin/audit          → 15.6 稽核紀錄查詢
```

## 檔案結構

```
src/pages/admin/
  index.vue            （總覽，取代現有 src/pages/admin-dashboard.vue）
  users.vue
  review.vue
  knowledge.vue
  ai-quality.vue
  subscription.vue
  audit.vue
src/mocks/admin-seed.ts        （六模組種子假資料）
src/composables/admin/
  useAdminStore.ts             （共用：localStorage 讀寫、播種、重置）
  useAdminUsers.ts
  useAdminReview.ts
  useAdminKnowledge.ts
  useAdminAiQuality.ts
  useAdminSubscription.ts
  useAdminAudit.ts
```

`src/components/admin-layout.vue` 側邊欄擴充為 7 個導覽項目（總覽＋六模組，各配 lucide 圖示），視覺沿用現有圓角卡片與 primary 色系。

## 資料層設計

- 每個 composable 對外只暴露「reactive 資料＋操作函式」（例如 `users`、`suspendUser()`、`approveListing()`），頁面不知道資料來源是假的。
- `useAdminStore.ts` 統一處理 localStorage（key 前綴 `rentmate-admin:`，如 `rentmate-admin:users`），首次進入或資料損毀時自 `admin-seed.ts` 播種；沿用現有 `readJson`/`writeJson` 的 try/catch 模式。
- 所有管理操作同步寫入一筆稽核紀錄（呼叫 `useAdminAudit` 的 `logAction()`），使 15.6 的內容隨操作即時增長。
- 之後接 FastAPI 時，只改 composable 內部實作，頁面零改動。

## 各模組頁面規格

### 後台總覽（/admin）

- 四張統計卡：待審核物件/評價數、使用者總數、AI 品質警示數、今日稽核事件數；點擊導向對應模組。
- 待辦佇列列表（彙整各模組待處理項目）。
- 「重置示範資料」按鈕：清除所有 `rentmate-admin:*` 並重新播種，附確認 Dialog。

### 15.1 使用者管理（/admin/users）

- 表格欄位：Email、暱稱、角色、狀態（正常/停用）、註冊日、Email 驗證。
- 搜尋（Email/暱稱）＋角色篩選＋狀態篩選。
- 操作：檢視詳情（Dialog）、停用/啟用、變更角色。

### 15.2 物件與評價審核（/admin/review）

- Tabs：「物件審核」與「評價審核」。
- 物件審核：房東提交的待審物件卡片（名稱、地址、房東、提交日），操作：通過／退回（退回需填理由）。
- 評價審核：評價列表附「去識別化檢查結果」——偵測到疑似個資的片段以紅色標示；操作：通過（公開）／退回（需填理由）。

### 15.3 法規知識庫維護（/admin/knowledge）

- 條目列表：標題、分類標籤（租賃專法／民法／定型化契約等）、版本、更新日、啟用狀態。
- Dialog 新增/編輯條目（標題、分類、內文）；可停用條目。
- 定位：RAG 契約分析的知識來源管理。

### 15.4 AI 產出品質監控（/admin/ai-quality）

- 統計卡：平均評分、重新生成率、低分率。
- 產出紀錄列表：類型（契約風險分析／AI 談判腳本）、使用者評分、重新生成次數、狀態。
- 低分項目自動標記「需人工複核」；管理員可標記已複核並填寫複核備註。

### 15.5 訂閱與容量管理（/admin/subscription）

- 方案總覽卡：免費/進階/專業，各含額度設定（AI 分析次數、儲存容量）。
- 訂閱使用者表格：方案、到期日、用量進度條；即將到期者顯示提醒標示。
- 操作：調整方案、取消訂閱。

### 15.6 稽核紀錄查詢（/admin/audit）

- 表格欄位：時間、操作者、動作類型、對象、詳情。
- 篩選：日期範圍、動作類型、關鍵字。
- 內容來源：種子系統事件（登入、資料存取、TTL 到期刪除）＋其他五模組操作的即時紀錄。

## 錯誤處理

- localStorage 解析失敗即移除該 key 並回退種子資料。
- 需理由的操作（退回審核）在理由為空時停用送出鈕。
- 重置示範資料需經確認 Dialog。

## 驗證

- `npm run lint`（vue-tsc 型別檢查＋oxlint＋eslint）通過。
- 瀏覽器手動流程：以管理員登入 → 走過六模組各至少一項操作 → 確認稽核紀錄有對應新增 → 重新整理後狀態仍在 → 重置示範資料成功。
- 以租客/房東登入確認無法進入 `/admin`。
