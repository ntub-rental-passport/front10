# A15 系統管理員後台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有 Vue 3 前端建置 A15 系統管理員後台（六大模組＋總覽），並把角色模型擴充為 user / landlord / admin。

**Architecture:** 沿用現有 `/admin` 版面骨架，六模組各自為 `src/pages/admin/` 下的獨立頁面；資料層以 `createAdminCollection`（localStorage 持久化＋種子資料）驅動，每個模組一個 composable，所有管理操作即時寫入稽核紀錄。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、vue-router 4、Tailwind CSS 4、reka-ui（components/ui 下的 shadcn-vue 元件）、lucide-vue-next 圖示。

**規格來源:** `docs/superpowers/specs/2026-07-14-admin-console-design.md`

## Global Constraints

- 專案沒有測試框架，**不新增**。每個任務的驗證是 `npm run lint:types`（vue-tsc --noEmit）與瀏覽器手動確認。
- 路徑別名 `@` 指向專案根目錄：頁面用 `@/src/...`，UI 元件用 `@/components/ui/...`。
- UI 一律重用 `components/ui/` 現有元件（Card、Table、Dialog、Select、Tabs、Badge、Button、Input、Textarea、Switch、Progress），不新增 UI 元件。
- 文案使用繁體中文；程式碼識別字用英文。
- localStorage key 前綴固定為 `rentmate-admin:`。
- 需理由的操作（退回審核）在理由為空時停用送出鈕。
- commit 訊息用 conventional commits（feat/refactor/docs），結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 開發伺服器：`npm run dev`（http://localhost:3000）。管理員登入：登入頁選「管理員登入」，任意合法 Email＋任意符合規則的密碼即可（demo 假登入）。

---

### Task 1: 角色模型擴充（user / landlord / admin）

**Files:**
- Modify: `src/composables/useAuth.ts:1`（AuthRole）、`useAuth.ts:122-124`（needsNicknameSetup）
- Modify: `src/constants/auth-identity.ts`（整檔改寫）
- Modify: `src/router/index.ts:19-33`（meta 改 roles 陣列）、`index.ts:125-132`（守衛）

**Interfaces:**
- Consumes: 無（第一個任務）
- Produces:
  - `AuthRole = 'user' | 'landlord' | 'admin'`
  - `AuthIdentity = 'tenant' | 'landlord' | 'admin'`
  - `registerIdentityOptions: AuthIdentityOption[]`（不含 admin，註冊頁用）
  - route meta 改為 `roles: AuthRole[]`（原為單一 `role`）

- [ ] **Step 1: 修改 useAuth.ts 的角色型別與暱稱判斷**

`src/composables/useAuth.ts` 第 1 行：

```ts
export type AuthRole = 'user' | 'landlord' | 'admin'
```

`needsNicknameSetup`（約第 122 行）改為 admin 以外都需要暱稱：

```ts
export function needsNicknameSetup(session: AuthSession | null): boolean {
  return Boolean(session?.isAuthenticated && session.role !== 'admin' && !session.nickname)
}
```

`resolveRoleHome` 不用改（landlord 走 `/app` 分支本來就是 else 路徑）。

- [ ] **Step 2: 改寫 auth-identity.ts**

整檔改寫為：

```ts
import type { AuthRole } from '@/src/composables/useAuth'

export type AuthIdentity = 'tenant' | 'landlord' | 'admin'

export interface AuthIdentityOption {
  value: AuthIdentity
  label: string
  description: string
  helper: string
  authRole: AuthRole
  loginFooterNote: string
  registerFooterNote: string
  registerButtonLabel: string
}

export const authIdentityOptions: AuthIdentityOption[] = [
  {
    value: 'tenant',
    label: '租客登入',
    description: '管理我的租約與付款',
    helper: '適合查看租約、付款紀錄與租屋服務。',
    authRole: 'user',
    loginFooterNote: '登入後將進入租客專屬工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 帳號並進入租客工作區。',
    registerButtonLabel: '以租客身分建立帳號',
  },
  {
    value: 'landlord',
    label: '房東登入',
    description: '管理我的物件與租客',
    helper: '房東專屬工作區建置中，目前登入後會先進入一般工作區。',
    authRole: 'landlord',
    loginFooterNote: '房東專屬工作區建置中，登入後將先進入一般工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 房東帳號。',
    registerButtonLabel: '以房東身分建立帳號',
  },
  {
    value: 'admin',
    label: '管理員登入',
    description: '平台營運與後台管理',
    helper: '適合平台營運人員：使用者管理、內容審核與系統監控。',
    authRole: 'admin',
    loginFooterNote: '登入後將進入系統管理員後台。',
    registerFooterNote: '管理員帳號不開放註冊。',
    registerButtonLabel: '不開放註冊',
  },
]

export const registerIdentityOptions: AuthIdentityOption[] = authIdentityOptions.filter(
  (option) => option.value !== 'admin',
)

export function getAuthIdentity(value: unknown): AuthIdentity {
  if (value === 'landlord') return 'landlord'
  if (value === 'admin') return 'admin'
  return 'tenant'
}
```

- [ ] **Step 3: 路由 meta 改為 roles 陣列**

`src/router/index.ts`——`/welcome` 移除 role 限制、`/admin` 與 `/app` 改用 `roles` 陣列：

```ts
    {
      path: '/welcome',
      component: () => import('@/src/pages/auth/welcome.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true, roles: ['admin'] as AuthRole[] },
      children: [{ path: '', component: () => import('@/src/pages/admin-dashboard.vue') }],
    },
    {
      path: '/app',
      component: Layout,
      meta: { requiresAuth: true, roles: ['user', 'landlord'] as AuthRole[] },
      children: [
```

守衛（原 125-132 行）改為：

```ts
  const protectedRecord = [...to.matched]
    .reverse()
    .find((record) => Array.isArray(record.meta.roles))
  const requiredRoles = protectedRecord?.meta.roles as AuthRole[] | undefined

  if (requiredRoles && !requiredRoles.includes(session.role)) {
    return resolveRoleHome(session.role)
  }
```

- [ ] **Step 4: 型別檢查**

Run: `npm run lint:types`
Expected: 出現 register.vue／login.vue 相關錯誤則到 Task 2 修（若有引用 `role` meta 的殘留錯誤，回頭修 router）；useAuth／auth-identity／router 本身無錯誤。若全部通過更好。

- [ ] **Step 5: Commit**

```bash
git add src/composables/useAuth.ts src/constants/auth-identity.ts src/router/index.ts
git commit -m "feat: expand auth roles to user/landlord/admin"
```

---

### Task 2: 登入／註冊頁支援管理員身分

**Files:**
- Modify: `src/pages/auth/login.vue:9`（icon import）、`login.vue:151-152`（icon 分支）
- Modify: `src/pages/auth/login.css:56-60`（三欄）
- Modify: `src/pages/auth/register.vue:29-31`（import）、`register.vue:61-64`（identity 初始化）、`register.vue:248`（v-for）

**Interfaces:**
- Consumes: Task 1 的 `registerIdentityOptions`、`getAuthIdentity`、三值 `AuthIdentity`
- Produces: 登入頁三張身分卡（租客／房東／管理員）；註冊頁維持兩張（租客／房東）

- [ ] **Step 1: login.vue 加管理員圖示分支**

第 9 行 import 加入 `ShieldCheck`：

```ts
import { CircleAlert, CircleCheckBig, Eye, EyeOff, House, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-vue-next'
```

第 151-152 行圖示分支改為：

```vue
<UserRound v-if="option.value === 'tenant'" class="auth-role-card__icon" />
<ShieldCheck v-else-if="option.value === 'admin'" class="auth-role-card__icon" />
<House v-else class="auth-role-card__icon" />
```

- [ ] **Step 2: login.css 桌機三欄**

在 `login.css` 既有的 768px media query（52-60 行）後面加：

```css
@media (min-width: 1024px) {
  .auth-role-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

- [ ] **Step 3: register.vue 改用 registerIdentityOptions**

import（29-31 行）改為：

```ts
import {
  registerIdentityOptions,
  getAuthIdentity,
  type AuthIdentity,
} from '@/src/constants/auth-identity'
```

identity 初始化（約 61-64 行）改為（query 帶 admin 時退回 tenant）：

```ts
const initialIdentity = getAuthIdentity(route.query.role)
const selectedIdentity = ref<AuthIdentity>(initialIdentity === 'admin' ? 'tenant' : initialIdentity)

const selectedOption = computed(
  () =>
    registerIdentityOptions.find((option) => option.value === selectedIdentity.value) ??
    registerIdentityOptions[0],
)
```

模板 v-for（約 248 行）改為：

```vue
<button
  v-for="option in registerIdentityOptions"
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器（`npm run dev` → http://localhost:3000/login）：
1. 登入頁出現三張身分卡，選「管理員登入」→ 任意 Email/密碼登入 → 導向 `/admin`
2. 選「房東登入」→ 登入 → 導向 `/welcome`（首次）或 `/app`，**不再進 /admin**
3. `/register` 只有租客／房東兩張卡；`/register?role=admin` 顯示租客
4. 房東登入狀態下手動輸入網址 `/admin` → 被導回 `/app`

- [ ] **Step 5: Commit**

```bash
git add src/pages/auth/login.vue src/pages/auth/login.css src/pages/auth/register.vue
git commit -m "feat: add admin identity to login and restrict register identities"
```

---

### Task 3: 管理端種子資料（admin-seed.ts）

**Files:**
- Create: `src/mocks/admin-seed.ts`

**Interfaces:**
- Consumes: 無
- Produces（後續所有任務都依賴這些型別與工廠函式）:
  - 型別：`AdminUser`、`ListingSubmission`、`RatingSubmission`、`PiiFlag`、`ReviewStatus`、`KnowledgeEntry`、`KnowledgeCategory`、`AiOutputRecord`、`AiOutputType`、`SubscriptionPlan`、`PlanId`、`Subscription`、`AuditEvent`、`AuditActionType`
  - 工廠：`seedAdminUsers()`、`seedListings()`、`seedRatings()`、`seedKnowledge()`、`seedAiOutputs()`、`seedPlans()`、`seedSubscriptions()`、`seedAuditEvents()`（皆回傳新陣列）

- [ ] **Step 1: 建立 src/mocks/admin-seed.ts**

```ts
export type AdminUserRole = 'user' | 'landlord' | 'admin'
export type AdminUserStatus = 'active' | 'suspended'

export interface AdminUser {
  id: string
  email: string
  nickname: string | null
  role: AdminUserRole
  status: AdminUserStatus
  emailVerified: boolean
  registeredAt: string
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ListingSubmission {
  id: string
  title: string
  address: string
  landlordEmail: string
  submittedAt: string
  status: ReviewStatus
  rejectReason: string | null
}

export interface PiiFlag {
  text: string
  kind: '姓名' | '電話' | '地址' | '證號'
}

export interface RatingSubmission {
  id: string
  listingTitle: string
  authorNickname: string
  content: string
  piiFlags: PiiFlag[]
  submittedAt: string
  status: ReviewStatus
  rejectReason: string | null
}

export type KnowledgeCategory = '租賃專法' | '民法' | '定型化契約' | '補助法規'

export interface KnowledgeEntry {
  id: string
  title: string
  category: KnowledgeCategory
  content: string
  version: number
  updatedAt: string
  enabled: boolean
}

export type AiOutputType = 'contract-analysis' | 'negotiation-script'

export interface AiOutputRecord {
  id: string
  type: AiOutputType
  userEmail: string
  rating: number | null
  regenerations: number
  createdAt: string
  reviewed: boolean
  reviewNote: string | null
}

export type PlanId = 'free' | 'plus' | 'pro'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  priceLabel: string
  aiQuota: number
  storageMb: number
}

export interface Subscription {
  id: string
  userEmail: string
  planId: PlanId
  expiresAt: string
  aiUsed: number
  storageUsedMb: number
  active: boolean
}

export type AuditActionType =
  | '登入'
  | '使用者管理'
  | '審核'
  | '知識庫'
  | 'AI品質'
  | '訂閱'
  | '系統'
  | '資料存取'

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: AuditActionType
  target: string
  detail: string
}

function daysAgo(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function daysAhead(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}

export function seedAdminUsers(): AdminUser[] {
  return [
    { id: 'u-admin-1', email: 'admin@rentmate.tw', nickname: '系統管理員', role: 'admin', status: 'active', emailVerified: true, registeredAt: daysAgo(180) },
    { id: 'u-landlord-1', email: 'chen.landlord@example.com', nickname: '陳房東', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(120) },
    { id: 'u-landlord-2', email: 'lin.house@example.com', nickname: '林太太', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(75) },
    { id: 'u-tenant-1', email: 'amy.wang@example.com', nickname: '小艾', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(90) },
    { id: 'u-tenant-2', email: 'ben.liu@example.com', nickname: '阿賓', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(60) },
    { id: 'u-tenant-3', email: 'cindy.chang@example.com', nickname: null, role: 'user', status: 'active', emailVerified: false, registeredAt: daysAgo(14) },
    { id: 'u-tenant-4', email: 'derek.wu@example.com', nickname: '小德', role: 'user', status: 'suspended', emailVerified: true, registeredAt: daysAgo(200) },
    { id: 'u-tenant-5', email: 'elaine.ho@example.com', nickname: '伊蓮', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(30) },
  ]
}

export function seedListings(): ListingSubmission[] {
  return [
    { id: 'ls-1', title: '大安區溫馨兩房', address: '台北市大安區和平東路二段 96 號', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(1, 14), status: 'pending', rejectReason: null },
    { id: 'ls-2', title: '中山北路採光套房', address: '台北市中山區中山北路三段 22 號', landlordEmail: 'lin.house@example.com', submittedAt: daysAgo(2, 9), status: 'pending', rejectReason: null },
    { id: 'ls-3', title: '文山區靜巷雅房', address: '台北市文山區木柵路一段 8 巷', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(3, 16), status: 'pending', rejectReason: null },
    { id: 'ls-4', title: '信義區電梯三房', address: '台北市信義區松德路 168 號', landlordEmail: 'lin.house@example.com', submittedAt: daysAgo(10), status: 'approved', rejectReason: null },
    { id: 'ls-5', title: '北投溫泉套房', address: '台北市北投區光明路 240 號', landlordEmail: 'chen.landlord@example.com', submittedAt: daysAgo(12), status: 'rejected', rejectReason: '照片與實際格局不符，請重新上傳。' },
  ]
}

export function seedRatings(): RatingSubmission[] {
  return [
    {
      id: 'rt-1',
      listingTitle: '信義區電梯三房',
      authorNickname: '小艾',
      content: '房東王小明人很好，修繕都很快處理，隔音也不錯。',
      piiFlags: [{ text: '王小明', kind: '姓名' }],
      submittedAt: daysAgo(1, 11),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-2',
      listingTitle: '大安區溫馨兩房',
      authorNickname: '阿賓',
      content: '有問題可以打 0912-345-678 找房東，回覆很快，整體滿意。',
      piiFlags: [{ text: '0912-345-678', kind: '電話' }],
      submittedAt: daysAgo(2, 15),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-3',
      listingTitle: '中山北路採光套房',
      authorNickname: '伊蓮',
      content: '採光真的很好，樓下就有超商，通勤方便。',
      piiFlags: [],
      submittedAt: daysAgo(3, 10),
      status: 'pending',
      rejectReason: null,
    },
    {
      id: 'rt-4',
      listingTitle: '北投溫泉套房',
      authorNickname: '小德',
      content: '冬天泡湯很方便，就是房間偏小。',
      piiFlags: [],
      submittedAt: daysAgo(8),
      status: 'approved',
      rejectReason: null,
    },
  ]
}

export function seedKnowledge(): KnowledgeEntry[] {
  return [
    { id: 'kb-1', title: '租賃住宅市場發展及管理條例第 8 條－押金上限', category: '租賃專法', content: '押金不得逾二個月之租金總額。超收部分承租人得主張抵付租金。', version: 3, updatedAt: daysAgo(20), enabled: true },
    { id: 'kb-2', title: '民法第 429 條－出租人修繕義務', category: '民法', content: '租賃物之修繕，除契約另有訂定或另有習慣外，由出租人負擔。', version: 2, updatedAt: daysAgo(35), enabled: true },
    { id: 'kb-3', title: '定型化契約應記載事項－電費計價上限', category: '定型化契約', content: '每度電費不得超過台電夏季用電量最高級距價格。', version: 4, updatedAt: daysAgo(15), enabled: true },
    { id: 'kb-4', title: '定型化契約不得記載事項－拋棄審閱期', category: '定型化契約', content: '不得約定拋棄契約審閱期間；承租人應有至少三日之審閱期。', version: 1, updatedAt: daysAgo(50), enabled: true },
    { id: 'kb-5', title: '300 億元中央擴大租金補貼專案', category: '補助法規', content: '申請資格、每月補貼金額級距與應備文件說明（舊版，待更新）。', version: 1, updatedAt: daysAgo(120), enabled: false },
  ]
}

export function seedAiOutputs(): AiOutputRecord[] {
  return [
    { id: 'ai-1', type: 'contract-analysis', userEmail: 'amy.wang@example.com', rating: 5, regenerations: 0, createdAt: daysAgo(1, 9), reviewed: false, reviewNote: null },
    { id: 'ai-2', type: 'contract-analysis', userEmail: 'ben.liu@example.com', rating: 2, regenerations: 2, createdAt: daysAgo(1, 16), reviewed: false, reviewNote: null },
    { id: 'ai-3', type: 'negotiation-script', userEmail: 'amy.wang@example.com', rating: 4, regenerations: 1, createdAt: daysAgo(2, 10), reviewed: false, reviewNote: null },
    { id: 'ai-4', type: 'contract-analysis', userEmail: 'elaine.ho@example.com', rating: null, regenerations: 0, createdAt: daysAgo(2, 14), reviewed: false, reviewNote: null },
    { id: 'ai-5', type: 'negotiation-script', userEmail: 'cindy.chang@example.com', rating: 1, regenerations: 3, createdAt: daysAgo(3, 11), reviewed: false, reviewNote: null },
    { id: 'ai-6', type: 'contract-analysis', userEmail: 'derek.wu@example.com', rating: 2, regenerations: 1, createdAt: daysAgo(6), reviewed: true, reviewNote: '條款頁碼辨識錯誤，已回報模型調整提示詞。' },
    { id: 'ai-7', type: 'contract-analysis', userEmail: 'ben.liu@example.com', rating: 5, regenerations: 0, createdAt: daysAgo(7), reviewed: false, reviewNote: null },
    { id: 'ai-8', type: 'negotiation-script', userEmail: 'elaine.ho@example.com', rating: 4, regenerations: 0, createdAt: daysAgo(9), reviewed: false, reviewNote: null },
  ]
}

export function seedPlans(): SubscriptionPlan[] {
  return [
    { id: 'free', name: '免費方案', priceLabel: 'NT$0', aiQuota: 3, storageMb: 200 },
    { id: 'plus', name: '進階方案', priceLabel: 'NT$99／月', aiQuota: 20, storageMb: 2048 },
    { id: 'pro', name: '專業方案', priceLabel: 'NT$299／月', aiQuota: 100, storageMb: 10240 },
  ]
}

export function seedSubscriptions(): Subscription[] {
  return [
    { id: 'sub-1', userEmail: 'amy.wang@example.com', planId: 'plus', expiresAt: daysAhead(25), aiUsed: 12, storageUsedMb: 860, active: true },
    { id: 'sub-2', userEmail: 'ben.liu@example.com', planId: 'free', expiresAt: daysAhead(365), aiUsed: 3, storageUsedMb: 150, active: true },
    { id: 'sub-3', userEmail: 'chen.landlord@example.com', planId: 'pro', expiresAt: daysAhead(5), aiUsed: 64, storageUsedMb: 6300, active: true },
    { id: 'sub-4', userEmail: 'elaine.ho@example.com', planId: 'plus', expiresAt: daysAhead(11), aiUsed: 19, storageUsedMb: 1900, active: true },
    { id: 'sub-5', userEmail: 'lin.house@example.com', planId: 'plus', expiresAt: daysAhead(80), aiUsed: 5, storageUsedMb: 400, active: true },
    { id: 'sub-6', userEmail: 'derek.wu@example.com', planId: 'free', expiresAt: daysAgo(10), aiUsed: 3, storageUsedMb: 90, active: false },
  ]
}

export function seedAuditEvents(): AuditEvent[] {
  return [
    { id: 'ev-1', at: daysAgo(0, 8), actor: 'admin@rentmate.tw', action: '登入', target: 'admin@rentmate.tw', detail: '管理員登入後台' },
    { id: 'ev-2', at: daysAgo(1, 17), actor: 'system', action: '系統', target: '點交照片批次', detail: 'TTL 到期，自動刪除 3 筆退租滿一年的點交照片' },
    { id: 'ev-3', at: daysAgo(1, 15), actor: 'admin@rentmate.tw', action: '審核', target: '北投溫泉套房', detail: '退回物件：照片與實際格局不符' },
    { id: 'ev-4', at: daysAgo(1, 10), actor: 'amy.wang@example.com', action: '資料存取', target: '契約分析報告 #A102', detail: '使用者下載自己的契約分析 PDF' },
    { id: 'ev-5', at: daysAgo(2, 14), actor: 'admin@rentmate.tw', action: '知識庫', target: '定型化契約應記載事項－電費計價上限', detail: '更新條目（v4）' },
    { id: 'ev-6', at: daysAgo(2, 9), actor: 'system', action: '訂閱', target: 'chen.landlord@example.com', detail: '訂閱將於 7 日內到期，已寄送提醒' },
    { id: 'ev-7', at: daysAgo(3, 13), actor: 'admin@rentmate.tw', action: '使用者管理', target: 'derek.wu@example.com', detail: '停用帳號：多次發布不當內容' },
    { id: 'ev-8', at: daysAgo(4, 11), actor: 'ben.liu@example.com', action: '登入', target: 'ben.liu@example.com', detail: '使用者登入' },
  ]
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run lint:types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/mocks/admin-seed.ts
git commit -m "feat: add admin console seed data and types"
```

---

### Task 4: 資料層核心（useAdminStore＋useAdminAudit＋格式工具）

**Files:**
- Create: `src/composables/admin/useAdminStore.ts`
- Create: `src/composables/admin/useAdminAudit.ts`
- Create: `src/utils/admin-format.ts`

**Interfaces:**
- Consumes: Task 3 的 `seedAuditEvents`、`AuditEvent`、`AuditActionType`
- Produces:
  - `createAdminCollection<T>(name: string, seed: () => T): Ref<T>`（單例、localStorage 持久化）
  - `resetAdminData(): void`（所有已註冊集合重播種子）
  - `newId(prefix: string): string`
  - `useAdminAudit(): { events: Ref<AuditEvent[]>, logAction(action, target, detail): void }`
  - `formatDate(iso: string): string`、`formatDateTime(iso: string): string`

- [ ] **Step 1: 建立 useAdminStore.ts**

```ts
import { ref, watch, type Ref } from 'vue'

const STORAGE_PREFIX = 'rentmate-admin:'

interface RegistryEntry {
  target: Ref<unknown>
  seed: () => unknown
}

const registry = new Map<string, RegistryEntry>()

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function createAdminCollection<T>(name: string, seed: () => T): Ref<T> {
  const existing = registry.get(name)
  if (existing) return existing.target as Ref<T>

  const key = `${STORAGE_PREFIX}${name}`
  const target = ref(readJson<T>(key) ?? seed()) as Ref<T>
  writeJson(key, target.value)
  watch(target, (value) => writeJson(key, value), { deep: true })
  registry.set(name, { target: target as Ref<unknown>, seed })
  return target
}

export function resetAdminData(): void {
  for (const entry of registry.values()) {
    entry.target.value = entry.seed()
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
```

- [ ] **Step 2: 建立 useAdminAudit.ts**

```ts
import { createAdminCollection, newId } from './useAdminStore'
import { getAuthSession } from '@/src/composables/useAuth'
import {
  seedAuditEvents,
  type AuditActionType,
  type AuditEvent,
} from '@/src/mocks/admin-seed'

const events = createAdminCollection<AuditEvent[]>('audit', seedAuditEvents)

export function useAdminAudit() {
  function logAction(action: AuditActionType, target: string, detail: string): void {
    events.value.unshift({
      id: newId('ev'),
      at: new Date().toISOString(),
      actor: getAuthSession()?.email ?? 'admin@rentmate.tw',
      action,
      target,
      detail,
    })
  }

  return { events, logAction }
}
```

- [ ] **Step 3: 建立 admin-format.ts**

```ts
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
```

- [ ] **Step 4: 型別檢查**

Run: `npm run lint:types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminStore.ts src/composables/admin/useAdminAudit.ts src/utils/admin-format.ts
git commit -m "feat: add admin data layer with localStorage persistence and audit logging"
```

---

### Task 5: Admin 版面導覽與頁面搬遷

**Files:**
- Modify: `src/components/admin-layout.vue:3`（icon import）、`admin-layout.vue:8`（nav 項目）
- Create: `src/pages/admin/index.vue`（先沿用現有總覽內容，Task 12 再升級）
- Delete: `src/pages/admin-dashboard.vue`
- Modify: `src/router/index.ts:28`（admin child 改指到新路徑）

**Interfaces:**
- Consumes: 無
- Produces: `/admin` 側邊欄 7 個導覽項目；`src/pages/admin/index.vue` 為總覽頁路徑（後續任務的路由都加在 `/admin` children）

- [ ] **Step 1: 搬遷總覽頁**

```bash
mkdir -p src/pages/admin
git mv src/pages/admin-dashboard.vue src/pages/admin/index.vue
```

- [ ] **Step 2: router 更新 admin child**

`src/router/index.ts` 的 `/admin` children 改為：

```ts
      children: [{ path: '', component: () => import('@/src/pages/admin/index.vue') }],
```

- [ ] **Step 3: admin-layout.vue 擴充導覽**

第 3 行 import 改為：

```ts
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-vue-next'
```

第 8 行 nav 項目改為：

```ts
const adminNavItems = [
  { label: '後台總覽', path: '/admin', icon: LayoutDashboard },
  { label: '使用者管理', path: '/admin/users', icon: Users },
  { label: '物件與評價審核', path: '/admin/review', icon: ClipboardCheck },
  { label: '法規知識庫', path: '/admin/knowledge', icon: BookOpen },
  { label: 'AI 品質監控', path: '/admin/ai-quality', icon: Sparkles },
  { label: '訂閱與容量', path: '/admin/subscription', icon: CreditCard },
  { label: '稽核紀錄', path: '/admin/audit', icon: ScrollText },
]
```

（尚未建立的頁面點擊會被 catch-all 導回首頁，屬暫時現象，Task 6-11 逐一補上。）

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器：管理員登入 → `/admin` 顯示 7 個側欄項目，總覽內容如舊。

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/admin src/pages/admin-dashboard.vue src/components/admin-layout.vue src/router/index.ts
git commit -m "feat: expand admin layout navigation and relocate overview page"
```

---

### Task 6: 15.1 使用者管理

**Files:**
- Create: `src/composables/admin/useAdminUsers.ts`
- Create: `src/pages/admin/users.vue`
- Modify: `src/router/index.ts`（`/admin` children 加 `users`）

**Interfaces:**
- Consumes: `createAdminCollection`、`useAdminAudit().logAction`、`seedAdminUsers`、`AdminUser`、`AdminUserRole`、`AdminUserStatus`、`formatDate`
- Produces: `useAdminUsers(): { users: Ref<AdminUser[]>, setStatus(id, status): void, setRole(id, role): void }`（Task 12 總覽會用 `users`）

- [ ] **Step 1: 建立 useAdminUsers.ts**

```ts
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedAdminUsers,
  type AdminUser,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/src/mocks/admin-seed'

const users = createAdminCollection<AdminUser[]>('users', seedAdminUsers)

export const adminRoleLabels: Record<AdminUserRole, string> = {
  user: '租客',
  landlord: '房東',
  admin: '管理員',
}

export function useAdminUsers() {
  const { logAction } = useAdminAudit()

  function setStatus(id: string, status: AdminUserStatus): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.status === status) return
    user.status = status
    logAction('使用者管理', user.email, status === 'suspended' ? '停用帳號' : '啟用帳號')
  }

  function setRole(id: string, role: AdminUserRole): void {
    const user = users.value.find((item) => item.id === id)
    if (!user || user.role === role) return
    const previous = adminRoleLabels[user.role]
    user.role = role
    logAction('使用者管理', user.email, `角色由「${previous}」變更為「${adminRoleLabels[role]}」`)
  }

  return { users, setStatus, setRole }
}
```

- [ ] **Step 2: 建立 users.vue**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Search } from 'lucide-vue-next'
import { adminRoleLabels, useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { formatDate } from '@/src/utils/admin-format'
import type { AdminUser, AdminUserRole } from '@/src/mocks/admin-seed'

const { users, setStatus, setRole } = useAdminUsers()

const keyword = ref('')
const roleFilter = ref<'all' | AdminUserRole>('all')
const statusFilter = ref<'all' | 'active' | 'suspended'>('all')
const detailUser = ref<AdminUser | null>(null)

const filteredUsers = computed(() =>
  users.value.filter((user) => {
    const text = keyword.value.trim().toLowerCase()
    if (
      text &&
      !user.email.toLowerCase().includes(text) &&
      !(user.nickname ?? '').toLowerCase().includes(text)
    ) {
      return false
    }
    if (roleFilter.value !== 'all' && user.role !== roleFilter.value) return false
    if (statusFilter.value !== 'all' && user.status !== statusFilter.value) return false
    return true
  }),
)

function toggleStatus(user: AdminUser): void {
  setStatus(user.id, user.status === 'active' ? 'suspended' : 'active')
}

function handleRoleChange(user: AdminUser, value: unknown): void {
  setRole(user.id, value as AdminUserRole)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">使用者管理</h1>
      <p class="mt-1 text-muted-foreground">檢視與管理平台帳號的狀態與角色。</p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="space-y-4 pt-6">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋 Email 或暱稱" class="pl-9" />
          </div>
          <Select v-model="roleFilter">
            <SelectTrigger class="w-36">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="user">租客</SelectItem>
              <SelectItem value="landlord">房東</SelectItem>
              <SelectItem value="admin">管理員</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="statusFilter">
            <SelectTrigger class="w-36">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="suspended">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>暱稱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>註冊日</TableHead>
              <TableHead>Email 驗證</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="user in filteredUsers" :key="user.id">
              <TableCell class="font-medium">{{ user.email }}</TableCell>
              <TableCell>{{ user.nickname ?? '—' }}</TableCell>
              <TableCell>{{ adminRoleLabels[user.role] }}</TableCell>
              <TableCell>
                <Badge :variant="user.status === 'active' ? 'default' : 'destructive'">
                  {{ user.status === 'active' ? '正常' : '停用' }}
                </Badge>
              </TableCell>
              <TableCell>{{ formatDate(user.registeredAt) }}</TableCell>
              <TableCell>{{ user.emailVerified ? '已驗證' : '未驗證' }}</TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="detailUser = user">詳情</Button>
                  <Button
                    :variant="user.status === 'active' ? 'destructive' : 'default'"
                    size="sm"
                    @click="toggleStatus(user)"
                  >
                    {{ user.status === 'active' ? '停用' : '啟用' }}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredUsers.length === 0">
              <TableCell colspan="7" class="py-8 text-center text-muted-foreground">
                沒有符合條件的使用者。
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog
      :open="detailUser !== null"
      @update:open="(open: boolean) => { if (!open) detailUser = null }"
    >
      <DialogContent v-if="detailUser">
        <DialogHeader>
          <DialogTitle>使用者詳情</DialogTitle>
          <DialogDescription>{{ detailUser.email }}</DialogDescription>
        </DialogHeader>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-muted-foreground">暱稱</span><span>{{ detailUser.nickname ?? '—' }}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">註冊日</span><span>{{ formatDate(detailUser.registeredAt) }}</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">Email 驗證</span><span>{{ detailUser.emailVerified ? '已驗證' : '未驗證' }}</span></div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">角色</span>
            <Select
              :model-value="detailUser.role"
              @update:model-value="(value) => handleRoleChange(detailUser!, value)"
            >
              <SelectTrigger class="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">租客</SelectItem>
                <SelectItem value="landlord">房東</SelectItem>
                <SelectItem value="admin">管理員</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            :variant="detailUser.status === 'active' ? 'destructive' : 'default'"
            @click="toggleStatus(detailUser)"
          >
            {{ detailUser.status === 'active' ? '停用帳號' : '啟用帳號' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 3: 加路由**

`/admin` children 加：

```ts
        { path: 'users', component: () => import('@/src/pages/admin/users.vue') },
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/users`：
1. 表格顯示 8 筆種子使用者；搜尋「amy」剩 1 筆；角色篩「房東」剩 2 筆
2. 停用「小艾」→ Badge 變紅「停用」；重新整理後狀態仍在
3. 詳情內把角色改為「房東」→ 表格同步更新

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminUsers.ts src/pages/admin/users.vue src/router/index.ts
git commit -m "feat: add admin user management module"
```

---

### Task 7: 15.2 物件與評價審核

**Files:**
- Create: `src/composables/admin/useAdminReview.ts`
- Create: `src/pages/admin/review.vue`
- Modify: `src/router/index.ts`（加 `review`）

**Interfaces:**
- Consumes: `createAdminCollection`、`logAction`、`seedListings`、`seedRatings`、相關型別、`formatDateTime`
- Produces: `useAdminReview(): { listings, ratings, pendingListings, pendingRatings, approveListing(id), rejectListing(id, reason), approveRating(id), rejectRating(id, reason) }`（Task 12 用 `pendingListings`、`pendingRatings`）

- [ ] **Step 1: 建立 useAdminReview.ts**

```ts
import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedListings,
  seedRatings,
  type ListingSubmission,
  type RatingSubmission,
} from '@/src/mocks/admin-seed'

const listings = createAdminCollection<ListingSubmission[]>('listings', seedListings)
const ratings = createAdminCollection<RatingSubmission[]>('ratings', seedRatings)

export function useAdminReview() {
  const { logAction } = useAdminAudit()

  const pendingListings = computed(() =>
    listings.value.filter((item) => item.status === 'pending'),
  )
  const pendingRatings = computed(() => ratings.value.filter((item) => item.status === 'pending'))

  function approveListing(id: string): void {
    const listing = listings.value.find((item) => item.id === id)
    if (!listing) return
    listing.status = 'approved'
    listing.rejectReason = null
    logAction('審核', listing.title, '物件審核通過')
  }

  function rejectListing(id: string, reason: string): void {
    const listing = listings.value.find((item) => item.id === id)
    if (!listing) return
    listing.status = 'rejected'
    listing.rejectReason = reason
    logAction('審核', listing.title, `退回物件：${reason}`)
  }

  function approveRating(id: string): void {
    const rating = ratings.value.find((item) => item.id === id)
    if (!rating) return
    rating.status = 'approved'
    rating.rejectReason = null
    logAction('審核', `${rating.listingTitle} 的評價`, '評價審核通過並公開')
  }

  function rejectRating(id: string, reason: string): void {
    const rating = ratings.value.find((item) => item.id === id)
    if (!rating) return
    rating.status = 'rejected'
    rating.rejectReason = reason
    logAction('審核', `${rating.listingTitle} 的評價`, `退回評價：${reason}`)
  }

  return {
    listings,
    ratings,
    pendingListings,
    pendingRatings,
    approveListing,
    rejectListing,
    approveRating,
    rejectRating,
  }
}
```

- [ ] **Step 2: 建立 review.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import { Textarea } from '@/components/ui/textarea/index'
import { ShieldAlert } from 'lucide-vue-next'
import { useAdminReview } from '@/src/composables/admin/useAdminReview'
import { formatDateTime } from '@/src/utils/admin-format'
import type { RatingSubmission, ReviewStatus } from '@/src/mocks/admin-seed'

const {
  listings,
  ratings,
  pendingListings,
  pendingRatings,
  approveListing,
  rejectListing,
  approveRating,
  rejectRating,
} = useAdminReview()

const rejectTarget = ref<{ kind: 'listing' | 'rating'; id: string; title: string } | null>(null)
const rejectReason = ref('')

const statusLabels: Record<ReviewStatus, string> = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已退回',
}

function statusVariant(status: ReviewStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'approved') return 'default'
  if (status === 'rejected') return 'destructive'
  return 'secondary'
}

function openReject(kind: 'listing' | 'rating', id: string, title: string): void {
  rejectTarget.value = { kind, id, title }
  rejectReason.value = ''
}

function submitReject(): void {
  if (!rejectTarget.value || !rejectReason.value.trim()) return
  const reason = rejectReason.value.trim()
  if (rejectTarget.value.kind === 'listing') rejectListing(rejectTarget.value.id, reason)
  else rejectRating(rejectTarget.value.id, reason)
  rejectTarget.value = null
  rejectReason.value = ''
}

function splitContent(rating: RatingSubmission): Array<{ text: string; flagged: boolean }> {
  let segments: Array<{ text: string; flagged: boolean }> = [
    { text: rating.content, flagged: false },
  ]
  for (const flag of rating.piiFlags) {
    segments = segments.flatMap((segment) => {
      if (segment.flagged || !segment.text.includes(flag.text)) return [segment]
      const parts = segment.text.split(flag.text)
      const result: Array<{ text: string; flagged: boolean }> = []
      parts.forEach((part, index) => {
        if (part) result.push({ text: part, flagged: false })
        if (index < parts.length - 1) result.push({ text: flag.text, flagged: true })
      })
      return result
    })
  }
  return segments
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">物件與評價審核</h1>
      <p class="mt-1 text-muted-foreground">
        審核房東提交的物件與租客評價；評價已先經去識別化檢查，紅色片段為疑似個資。
      </p>
    </div>

    <Tabs default-value="listings" class="space-y-4">
      <TabsList>
        <TabsTrigger value="listings">物件審核（{{ pendingListings.length }} 待審）</TabsTrigger>
        <TabsTrigger value="ratings">評價審核（{{ pendingRatings.length }} 待審）</TabsTrigger>
      </TabsList>

      <TabsContent value="listings" class="space-y-4">
        <Card v-for="listing in listings" :key="listing.id" class="rounded-[1.5rem]">
          <CardHeader class="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle class="text-lg">{{ listing.title }}</CardTitle>
              <CardDescription>
                {{ listing.address }}｜{{ listing.landlordEmail }}｜提交於
                {{ formatDateTime(listing.submittedAt) }}
              </CardDescription>
            </div>
            <Badge :variant="statusVariant(listing.status)">{{ statusLabels[listing.status] }}</Badge>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="listing.rejectReason" class="text-sm text-destructive">
              退回理由：{{ listing.rejectReason }}
            </p>
            <div v-if="listing.status === 'pending'" class="flex gap-2">
              <Button size="sm" @click="approveListing(listing.id)">通過</Button>
              <Button
                size="sm"
                variant="outline"
                @click="openReject('listing', listing.id, listing.title)"
              >
                退回
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ratings" class="space-y-4">
        <Card v-for="rating in ratings" :key="rating.id" class="rounded-[1.5rem]">
          <CardHeader class="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle class="text-lg">{{ rating.listingTitle }}</CardTitle>
              <CardDescription>
                {{ rating.authorNickname }}｜提交於 {{ formatDateTime(rating.submittedAt) }}
              </CardDescription>
            </div>
            <Badge :variant="statusVariant(rating.status)">{{ statusLabels[rating.status] }}</Badge>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-sm leading-relaxed">
              <span
                v-for="(segment, index) in splitContent(rating)"
                :key="index"
                :class="segment.flagged ? 'rounded bg-red-100 px-1 font-medium text-red-700' : ''"
              >{{ segment.text }}</span>
            </p>
            <div
              v-if="rating.piiFlags.length > 0"
              class="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <ShieldAlert class="h-4 w-4 shrink-0" />
              去識別化檢查：偵測到
              {{ rating.piiFlags.map((flag) => `疑似${flag.kind}「${flag.text}」`).join('、') }}
            </div>
            <p v-if="rating.rejectReason" class="text-sm text-destructive">
              退回理由：{{ rating.rejectReason }}
            </p>
            <div v-if="rating.status === 'pending'" class="flex gap-2">
              <Button size="sm" @click="approveRating(rating.id)">通過並公開</Button>
              <Button
                size="sm"
                variant="outline"
                @click="openReject('rating', rating.id, `${rating.listingTitle} 的評價`)"
              >
                退回
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog
      :open="rejectTarget !== null"
      @update:open="(open: boolean) => { if (!open) rejectTarget = null }"
    >
      <DialogContent v-if="rejectTarget">
        <DialogHeader>
          <DialogTitle>退回{{ rejectTarget.kind === 'listing' ? '物件' : '評價' }}</DialogTitle>
          <DialogDescription>{{ rejectTarget.title }}｜退回理由會通知提交者。</DialogDescription>
        </DialogHeader>
        <Textarea v-model="rejectReason" placeholder="請填寫退回理由" rows="4" />
        <DialogFooter>
          <Button variant="outline" @click="rejectTarget = null">取消</Button>
          <Button variant="destructive" :disabled="!rejectReason.trim()" @click="submitReject">
            確認退回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 3: 加路由**

```ts
        { path: 'review', component: () => import('@/src/pages/admin/review.vue') },
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/review`：
1. 物件 tab 有 3 筆待審；「通過」後 Badge 變「已通過」且操作鈕消失
2. 「退回」開 Dialog，理由空白時「確認退回」為 disabled；填理由後退回成功
3. 評價 tab：「王小明」「0912-345-678」紅底標示，卡片顯示去識別化警示
4. 到 `/admin/audit`（Task 11 完成前可先看 localStorage `rentmate-admin:audit`）確認審核動作有寫入

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminReview.ts src/pages/admin/review.vue src/router/index.ts
git commit -m "feat: add listing and rating review module with PII highlighting"
```

---

### Task 8: 15.3 法規知識庫維護

**Files:**
- Create: `src/composables/admin/useAdminKnowledge.ts`
- Create: `src/pages/admin/knowledge.vue`
- Modify: `src/router/index.ts`（加 `knowledge`）

**Interfaces:**
- Consumes: `createAdminCollection`、`newId`、`logAction`、`seedKnowledge`、`KnowledgeEntry`、`KnowledgeCategory`、`formatDate`
- Produces: `useAdminKnowledge(): { entries, saveEntry(input: { id?: string; title: string; category: KnowledgeCategory; content: string }), toggleEnabled(id) }`

- [ ] **Step 1: 建立 useAdminKnowledge.ts**

```ts
import { createAdminCollection, newId } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedKnowledge,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from '@/src/mocks/admin-seed'

const entries = createAdminCollection<KnowledgeEntry[]>('knowledge', seedKnowledge)

export const knowledgeCategories: KnowledgeCategory[] = [
  '租賃專法',
  '民法',
  '定型化契約',
  '補助法規',
]

export function useAdminKnowledge() {
  const { logAction } = useAdminAudit()

  function saveEntry(input: {
    id?: string
    title: string
    category: KnowledgeCategory
    content: string
  }): void {
    if (input.id) {
      const entry = entries.value.find((item) => item.id === input.id)
      if (!entry) return
      entry.title = input.title
      entry.category = input.category
      entry.content = input.content
      entry.version += 1
      entry.updatedAt = new Date().toISOString()
      logAction('知識庫', entry.title, `更新條目（v${entry.version}）`)
      return
    }

    entries.value.unshift({
      id: newId('kb'),
      title: input.title,
      category: input.category,
      content: input.content,
      version: 1,
      updatedAt: new Date().toISOString(),
      enabled: true,
    })
    logAction('知識庫', input.title, '新增條目')
  }

  function toggleEnabled(id: string): void {
    const entry = entries.value.find((item) => item.id === id)
    if (!entry) return
    entry.enabled = !entry.enabled
    logAction('知識庫', entry.title, entry.enabled ? '啟用條目' : '停用條目')
  }

  return { entries, saveEntry, toggleEnabled }
}
```

- [ ] **Step 2: 建立 knowledge.vue**

```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Switch } from '@/components/ui/switch/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Plus } from 'lucide-vue-next'
import {
  knowledgeCategories,
  useAdminKnowledge,
} from '@/src/composables/admin/useAdminKnowledge'
import { formatDate } from '@/src/utils/admin-format'
import type { KnowledgeCategory, KnowledgeEntry } from '@/src/mocks/admin-seed'

const { entries, saveEntry, toggleEnabled } = useAdminKnowledge()

const editorOpen = ref(false)
const form = reactive({
  id: undefined as string | undefined,
  title: '',
  category: '租賃專法' as KnowledgeCategory,
  content: '',
})

function openCreate(): void {
  form.id = undefined
  form.title = ''
  form.category = '租賃專法'
  form.content = ''
  editorOpen.value = true
}

function openEdit(entry: KnowledgeEntry): void {
  form.id = entry.id
  form.title = entry.title
  form.category = entry.category
  form.content = entry.content
  editorOpen.value = true
}

function submit(): void {
  if (!form.title.trim() || !form.content.trim()) return
  saveEntry({
    id: form.id,
    title: form.title.trim(),
    category: form.category,
    content: form.content.trim(),
  })
  editorOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl font-black tracking-tight">法規知識庫維護</h1>
        <p class="mt-1 text-muted-foreground">
          管理 RAG 契約分析引用的法規條目；停用的條目不會進入檢索。
        </p>
      </div>
      <Button @click="openCreate">
        <Plus class="mr-1 h-4 w-4" />
        新增條目
      </Button>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>標題</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>更新日</TableHead>
              <TableHead>啟用</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="entry in entries" :key="entry.id">
              <TableCell class="max-w-96 font-medium">{{ entry.title }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{ entry.category }}</Badge>
              </TableCell>
              <TableCell>v{{ entry.version }}</TableCell>
              <TableCell>{{ formatDate(entry.updatedAt) }}</TableCell>
              <TableCell>
                <Switch
                  :model-value="entry.enabled"
                  @update:model-value="toggleEnabled(entry.id)"
                />
              </TableCell>
              <TableCell class="text-right">
                <Button variant="outline" size="sm" @click="openEdit(entry)">編輯</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog v-model:open="editorOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ form.id ? '編輯條目' : '新增條目' }}</DialogTitle>
          <DialogDescription>
            {{ form.id ? '儲存後版本號會加一。' : '新條目建立後預設為啟用。' }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="kb-title">標題</Label>
            <Input id="kb-title" v-model="form.title" placeholder="例如：民法第 429 條－出租人修繕義務" />
          </div>
          <div class="space-y-2">
            <Label>分類</Label>
            <Select v-model="form.category">
              <SelectTrigger class="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="category in knowledgeCategories" :key="category" :value="category">
                  {{ category }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="kb-content">內文</Label>
            <Textarea id="kb-content" v-model="form.content" rows="6" placeholder="條文內容或白話說明" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editorOpen = false">取消</Button>
          <Button :disabled="!form.title.trim() || !form.content.trim()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 3: 加路由**

```ts
        { path: 'knowledge', component: () => import('@/src/pages/admin/knowledge.vue') },
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/knowledge`：
1. 5 筆種子條目；「300 億元租金補貼」Switch 為關
2. 新增條目 → 出現在列表最上方、v1、啟用
3. 編輯既有條目儲存 → 版本 +1、更新日變今天
4. 標題或內文空白時「儲存」disabled

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminKnowledge.ts src/pages/admin/knowledge.vue src/router/index.ts
git commit -m "feat: add legal knowledge base management module"
```

---

### Task 9: 15.4 AI 產出品質監控

**Files:**
- Create: `src/composables/admin/useAdminAiQuality.ts`
- Create: `src/pages/admin/ai-quality.vue`
- Modify: `src/router/index.ts`（加 `ai-quality`）

**Interfaces:**
- Consumes: `createAdminCollection`、`logAction`、`seedAiOutputs`、`AiOutputRecord`、`AiOutputType`、`formatDateTime`
- Produces: `useAdminAiQuality(): { records, stats: ComputedRef<{ avgRating: string; regenRate: string; lowRate: string }>, needsReview(record): boolean, needsReviewCount: ComputedRef<number>, markReviewed(id, note) }`（Task 12 用 `needsReviewCount`）

- [ ] **Step 1: 建立 useAdminAiQuality.ts**

```ts
import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { seedAiOutputs, type AiOutputRecord, type AiOutputType } from '@/src/mocks/admin-seed'

const records = createAdminCollection<AiOutputRecord[]>('ai-outputs', seedAiOutputs)

export const aiTypeLabels: Record<AiOutputType, string> = {
  'contract-analysis': '契約風險分析',
  'negotiation-script': 'AI 談判腳本',
}

export function needsReview(record: AiOutputRecord): boolean {
  return record.rating !== null && record.rating <= 2 && !record.reviewed
}

export function useAdminAiQuality() {
  const { logAction } = useAdminAudit()

  const stats = computed(() => {
    const rated = records.value.filter((record) => record.rating !== null)
    const total = records.value.length
    const avg =
      rated.length > 0
        ? rated.reduce((sum, record) => sum + (record.rating ?? 0), 0) / rated.length
        : 0
    const regenerated = records.value.filter((record) => record.regenerations > 0).length
    const low = rated.filter((record) => (record.rating ?? 0) <= 2).length

    return {
      avgRating: avg.toFixed(1),
      regenRate: total > 0 ? `${Math.round((regenerated / total) * 100)}%` : '0%',
      lowRate: rated.length > 0 ? `${Math.round((low / rated.length) * 100)}%` : '0%',
    }
  })

  const needsReviewCount = computed(() => records.value.filter(needsReview).length)

  function markReviewed(id: string, note: string): void {
    const record = records.value.find((item) => item.id === id)
    if (!record) return
    record.reviewed = true
    record.reviewNote = note.trim() || null
    logAction('AI品質', `${aiTypeLabels[record.type]}（${record.userEmail}）`, '完成人工複核')
  }

  return { records, stats, needsReview, needsReviewCount, markReviewed }
}
```

- [ ] **Step 2: 建立 ai-quality.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Star } from 'lucide-vue-next'
import {
  aiTypeLabels,
  needsReview,
  useAdminAiQuality,
} from '@/src/composables/admin/useAdminAiQuality'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AiOutputRecord } from '@/src/mocks/admin-seed'

const { records, stats, markReviewed } = useAdminAiQuality()

const reviewTarget = ref<AiOutputRecord | null>(null)
const reviewNote = ref('')

function openReview(record: AiOutputRecord): void {
  reviewTarget.value = record
  reviewNote.value = ''
}

function submitReview(): void {
  if (!reviewTarget.value) return
  markReviewed(reviewTarget.value.id, reviewNote.value)
  reviewTarget.value = null
  reviewNote.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">AI 產出品質監控</h1>
      <p class="mt-1 text-muted-foreground">
        追蹤契約分析與談判腳本的使用者評分；評分 2 分以下自動列為需人工複核。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">平均評分</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.avgRating }} / 5</CardContent>
      </Card>
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">重新生成率</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.regenRate }}</CardContent>
      </Card>
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">低分率（≤2 分）</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.lowRate }}</CardContent>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>類型</TableHead>
              <TableHead>使用者</TableHead>
              <TableHead>評分</TableHead>
              <TableHead>重新生成</TableHead>
              <TableHead>建立時間</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="record in records" :key="record.id">
              <TableCell class="font-medium">{{ aiTypeLabels[record.type] }}</TableCell>
              <TableCell>{{ record.userEmail }}</TableCell>
              <TableCell>
                <span v-if="record.rating !== null" class="inline-flex items-center gap-1">
                  <Star class="h-4 w-4 fill-amber-400 text-amber-400" />
                  {{ record.rating }}
                </span>
                <span v-else class="text-muted-foreground">未評分</span>
              </TableCell>
              <TableCell>{{ record.regenerations }} 次</TableCell>
              <TableCell>{{ formatDateTime(record.createdAt) }}</TableCell>
              <TableCell>
                <Badge v-if="needsReview(record)" variant="destructive">需人工複核</Badge>
                <Badge v-else-if="record.reviewed" variant="default">已複核</Badge>
                <Badge v-else variant="secondary">正常</Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  v-if="needsReview(record)"
                  variant="outline"
                  size="sm"
                  @click="openReview(record)"
                >
                  複核
                </Button>
                <span
                  v-else-if="record.reviewNote"
                  class="text-xs text-muted-foreground"
                  :title="record.reviewNote"
                >
                  備註：{{ record.reviewNote }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog
      :open="reviewTarget !== null"
      @update:open="(open: boolean) => { if (!open) reviewTarget = null }"
    >
      <DialogContent v-if="reviewTarget">
        <DialogHeader>
          <DialogTitle>人工複核</DialogTitle>
          <DialogDescription>
            {{ aiTypeLabels[reviewTarget.type] }}｜{{ reviewTarget.userEmail }}｜評分
            {{ reviewTarget.rating }}
          </DialogDescription>
        </DialogHeader>
        <Textarea v-model="reviewNote" rows="4" placeholder="複核備註（選填）：問題原因、後續處理" />
        <DialogFooter>
          <Button variant="outline" @click="reviewTarget = null">取消</Button>
          <Button @click="submitReview">標記已複核</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 3: 加路由**

```ts
        { path: 'ai-quality', component: () => import('@/src/pages/admin/ai-quality.vue') },
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/ai-quality`：
1. 三張統計卡有數字；ai-2 與 ai-5 顯示紅色「需人工複核」
2. 複核 ai-2 填備註 → Badge 變「已複核」，統計卡低分率不變（複核不改評分）、需複核數 -1（Task 12 總覽可見）

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminAiQuality.ts src/pages/admin/ai-quality.vue src/router/index.ts
git commit -m "feat: add AI output quality monitoring module"
```

---

### Task 10: 15.5 訂閱與容量管理

**Files:**
- Create: `src/composables/admin/useAdminSubscription.ts`
- Create: `src/pages/admin/subscription.vue`
- Modify: `src/router/index.ts`（加 `subscription`）

**Interfaces:**
- Consumes: `createAdminCollection`、`logAction`、`seedPlans`、`seedSubscriptions`、`SubscriptionPlan`、`Subscription`、`PlanId`、`formatDate`
- Produces: `useAdminSubscription(): { plans, subscriptions, planOf(sub): SubscriptionPlan, changePlan(id, planId), cancelSubscription(id), isExpiringSoon(sub): boolean }`

- [ ] **Step 1: 建立 useAdminSubscription.ts**

```ts
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import {
  seedPlans,
  seedSubscriptions,
  type PlanId,
  type Subscription,
  type SubscriptionPlan,
} from '@/src/mocks/admin-seed'

const plans = createAdminCollection<SubscriptionPlan[]>('plans', seedPlans)
const subscriptions = createAdminCollection<Subscription[]>('subscriptions', seedSubscriptions)

const EXPIRING_SOON_DAYS = 14

export function useAdminSubscription() {
  const { logAction } = useAdminAudit()

  function planOf(subscription: Subscription): SubscriptionPlan {
    return plans.value.find((plan) => plan.id === subscription.planId) ?? plans.value[0]
  }

  function changePlan(id: string, planId: PlanId): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || subscription.planId === planId) return
    const nextPlan = plans.value.find((plan) => plan.id === planId)
    if (!nextPlan) return
    subscription.planId = planId
    logAction('訂閱', subscription.userEmail, `方案調整為「${nextPlan.name}」`)
  }

  function cancelSubscription(id: string): void {
    const subscription = subscriptions.value.find((item) => item.id === id)
    if (!subscription || !subscription.active) return
    subscription.active = false
    logAction('訂閱', subscription.userEmail, '取消訂閱')
  }

  function isExpiringSoon(subscription: Subscription): boolean {
    if (!subscription.active) return false
    const remainingMs = new Date(subscription.expiresAt).getTime() - Date.now()
    return remainingMs > 0 && remainingMs <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  }

  return { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon }
}
```

- [ ] **Step 2: 建立 subscription.vue**

```vue
<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Progress } from '@/components/ui/progress/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { useAdminSubscription } from '@/src/composables/admin/useAdminSubscription'
import { formatDate } from '@/src/utils/admin-format'
import type { PlanId, Subscription } from '@/src/mocks/admin-seed'

const { plans, subscriptions, planOf, changePlan, cancelSubscription, isExpiringSoon } =
  useAdminSubscription()

function storageLabel(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`
}

function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0
  return Math.min(100, Math.round((used / quota) * 100))
}

function handlePlanChange(subscription: Subscription, value: unknown): void {
  changePlan(subscription.id, value as PlanId)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">訂閱與容量管理</h1>
      <p class="mt-1 text-muted-foreground">
        管理方案額度與使用者訂閱；到期前 14 天會標示提醒。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Card v-for="plan in plans" :key="plan.id" class="rounded-[1.5rem]">
        <CardHeader>
          <CardTitle class="flex items-baseline justify-between">
            {{ plan.name }}
            <span class="text-base font-semibold text-primary">{{ plan.priceLabel }}</span>
          </CardTitle>
          <CardDescription>
            AI 分析 {{ plan.aiQuota }} 次／月｜儲存空間 {{ storageLabel(plan.storageMb) }}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>使用者</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead class="min-w-40">AI 用量</TableHead>
              <TableHead class="min-w-40">儲存用量</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="subscription in subscriptions" :key="subscription.id">
              <TableCell class="font-medium">{{ subscription.userEmail }}</TableCell>
              <TableCell>
                <Select
                  :model-value="subscription.planId"
                  :disabled="!subscription.active"
                  @update:model-value="(value) => handlePlanChange(subscription, value)"
                >
                  <SelectTrigger class="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="plan in plans" :key="plan.id" :value="plan.id">
                      {{ plan.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  {{ formatDate(subscription.expiresAt) }}
                  <Badge v-if="isExpiringSoon(subscription)" variant="destructive">即將到期</Badge>
                </div>
              </TableCell>
              <TableCell>
                <div class="space-y-1">
                  <Progress
                    :model-value="usagePercent(subscription.aiUsed, planOf(subscription).aiQuota)"
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ subscription.aiUsed }} / {{ planOf(subscription).aiQuota }} 次
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <div class="space-y-1">
                  <Progress
                    :model-value="
                      usagePercent(subscription.storageUsedMb, planOf(subscription).storageMb)
                    "
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ storageLabel(subscription.storageUsedMb) }} /
                    {{ storageLabel(planOf(subscription).storageMb) }}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="subscription.active ? 'default' : 'secondary'">
                  {{ subscription.active ? '有效' : '已取消' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  v-if="subscription.active"
                  variant="outline"
                  size="sm"
                  @click="cancelSubscription(subscription.id)"
                >
                  取消訂閱
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 3: 加路由**

```ts
        { path: 'subscription', component: () => import('@/src/pages/admin/subscription.vue') },
```

- [ ] **Step 4: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/subscription`：
1. 三張方案卡；sub-3（5 天後到期）與 sub-4（11 天後到期）顯示「即將到期」
2. 把 sub-2 從免費改進階 → AI 用量分母變 20
3. 取消 sub-1 → Badge 變「已取消」、Select 變 disabled、取消鈕消失

- [ ] **Step 5: Commit**

```bash
git add src/composables/admin/useAdminSubscription.ts src/pages/admin/subscription.vue src/router/index.ts
git commit -m "feat: add subscription and quota management module"
```

---

### Task 11: 15.6 稽核紀錄查詢

**Files:**
- Create: `src/pages/admin/audit.vue`
- Modify: `src/router/index.ts`（加 `audit`）

**Interfaces:**
- Consumes: `useAdminAudit().events`、`AuditActionType`、`formatDateTime`
- Produces: `/admin/audit` 頁面（無新 composable，audit 已在 Task 4 建立）

- [ ] **Step 1: 建立 audit.vue**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Search } from 'lucide-vue-next'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AuditActionType } from '@/src/mocks/admin-seed'

const { events } = useAdminAudit()

const keyword = ref('')
const actionFilter = ref<'all' | AuditActionType>('all')
const fromDate = ref('')
const toDate = ref('')

const actionTypes: AuditActionType[] = [
  '登入',
  '使用者管理',
  '審核',
  '知識庫',
  'AI品質',
  '訂閱',
  '系統',
  '資料存取',
]

const filteredEvents = computed(() =>
  events.value.filter((event) => {
    if (actionFilter.value !== 'all' && event.action !== actionFilter.value) return false

    const text = keyword.value.trim()
    if (text && !`${event.actor} ${event.target} ${event.detail}`.includes(text)) return false

    if (fromDate.value && event.at < new Date(`${fromDate.value}T00:00:00`).toISOString()) {
      return false
    }
    if (toDate.value && event.at > new Date(`${toDate.value}T23:59:59`).toISOString()) {
      return false
    }
    return true
  }),
)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">稽核紀錄查詢</h1>
      <p class="mt-1 text-muted-foreground">
        所有管理操作、系統事件與資料存取紀錄；後台操作會即時寫入。
      </p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="space-y-4 pt-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋操作者、對象或詳情" class="pl-9" />
          </div>
          <Select v-model="actionFilter">
            <SelectTrigger class="w-40">
              <SelectValue placeholder="動作類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部動作</SelectItem>
              <SelectItem v-for="action in actionTypes" :key="action" :value="action">
                {{ action }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="space-y-1">
            <Label for="audit-from" class="text-xs text-muted-foreground">起始日</Label>
            <Input id="audit-from" v-model="fromDate" type="date" class="w-40" />
          </div>
          <div class="space-y-1">
            <Label for="audit-to" class="text-xs text-muted-foreground">結束日</Label>
            <Input id="audit-to" v-model="toDate" type="date" class="w-40" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-44">時間</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>動作</TableHead>
              <TableHead>對象</TableHead>
              <TableHead>詳情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="event in filteredEvents" :key="event.id">
              <TableCell class="text-muted-foreground">{{ formatDateTime(event.at) }}</TableCell>
              <TableCell class="font-medium">{{ event.actor }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{ event.action }}</Badge>
              </TableCell>
              <TableCell>{{ event.target }}</TableCell>
              <TableCell class="text-muted-foreground">{{ event.detail }}</TableCell>
            </TableRow>
            <TableRow v-if="filteredEvents.length === 0">
              <TableCell colspan="5" class="py-8 text-center text-muted-foreground">
                沒有符合條件的紀錄。
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: 加路由**

```ts
        { path: 'audit', component: () => import('@/src/pages/admin/audit.vue') },
```

- [ ] **Step 3: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin/audit`：
1. 種子 8 筆＋先前任務操作寫入的紀錄，時間新的在上
2. 動作篩「審核」只剩審核事件；關鍵字「derek」找得到停用帳號事件
3. 起始日設今天 → 只剩今天的事件
4. 去 `/admin/users` 停用任一帳號 → 回來看到新紀錄在最上方

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/audit.vue src/router/index.ts
git commit -m "feat: add audit log query module"
```

---

### Task 12: 後台總覽升級（統計卡＋待辦佇列＋重置示範資料）

**Files:**
- Modify: `src/pages/admin/index.vue`（整檔改寫）

**Interfaces:**
- Consumes: `useAdminUsers().users`、`useAdminReview().pendingListings/pendingRatings`、`useAdminAiQuality().needsReviewCount`、`useAdminAudit().events/logAction`、`resetAdminData`、`formatDateTime`
- Produces: `/admin` 總覽頁最終版

- [ ] **Step 1: 改寫 index.vue**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { ClipboardCheck, RotateCcw, ScrollText, Sparkles, Users } from 'lucide-vue-next'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiQuality } from '@/src/composables/admin/useAdminAiQuality'
import { useAdminReview } from '@/src/composables/admin/useAdminReview'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { formatDateTime } from '@/src/utils/admin-format'

const { users } = useAdminUsers()
const { pendingListings, pendingRatings } = useAdminReview()
const { needsReviewCount } = useAdminAiQuality()
const { events, logAction } = useAdminAudit()

const resetOpen = ref(false)

const todayEventCount = computed(() => {
  const today = new Date().toDateString()
  return events.value.filter((event) => new Date(event.at).toDateString() === today).length
})

const statCards = computed(() => [
  {
    title: '待審核項目',
    value: pendingListings.value.length + pendingRatings.value.length,
    note: `物件 ${pendingListings.value.length} 筆、評價 ${pendingRatings.value.length} 筆`,
    icon: ClipboardCheck,
    to: '/admin/review',
  },
  {
    title: '使用者總數',
    value: users.value.length,
    note: `停用中 ${users.value.filter((user) => user.status === 'suspended').length} 筆`,
    icon: Users,
    to: '/admin/users',
  },
  {
    title: 'AI 品質警示',
    value: needsReviewCount.value,
    note: '低分產出待人工複核',
    icon: Sparkles,
    to: '/admin/ai-quality',
  },
  {
    title: '今日稽核事件',
    value: todayEventCount.value,
    note: '含管理操作與系統事件',
    icon: ScrollText,
    to: '/admin/audit',
  },
])

const queueItems = computed(() => [
  ...pendingListings.value.map((listing) => ({
    id: listing.id,
    label: `物件審核：${listing.title}`,
    to: '/admin/review',
    tag: '審核',
  })),
  ...pendingRatings.value.map((rating) => ({
    id: rating.id,
    label: `評價審核：${rating.listingTitle}`,
    to: '/admin/review',
    tag: '審核',
  })),
  ...(needsReviewCount.value > 0
    ? [
        {
          id: 'ai-review',
          label: `AI 低分產出人工複核（${needsReviewCount.value} 筆）`,
          to: '/admin/ai-quality',
          tag: 'AI品質',
        },
      ]
    : []),
])

function confirmReset(): void {
  resetAdminData()
  logAction('系統', '示範資料', '重置所有後台示範資料')
  resetOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-3">
        <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary">
          Admin Console
        </Badge>
        <div>
          <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
          <p class="mt-2 text-muted-foreground">
            集中掌握審核佇列、使用者狀態、AI 品質與稽核事件。
          </p>
        </div>
      </div>
      <Button variant="outline" @click="resetOpen = true">
        <RotateCcw class="mr-1 h-4 w-4" />
        重置示範資料
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <RouterLink v-for="item in statCards" :key="item.title" :to="item.to" class="block">
        <Card class="h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">{{ item.title }}</CardTitle>
            <component :is="item.icon" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent class="space-y-1">
            <div class="text-3xl font-black">{{ item.value }}</div>
            <p class="text-sm text-muted-foreground">{{ item.note }}</p>
          </CardContent>
        </Card>
      </RouterLink>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>待辦佇列</CardTitle>
          <CardDescription>需要管理員處理的項目，點擊前往對應模組。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="item in queueItems"
            :key="item.id"
            :to="item.to"
            class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4 text-sm transition-colors hover:bg-muted/40"
          >
            <span>{{ item.label }}</span>
            <Badge variant="outline">{{ item.tag }}</Badge>
          </RouterLink>
          <p v-if="queueItems.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            目前沒有待辦事項 🎉
          </p>
        </CardContent>
      </Card>

      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 5 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div v-for="event in events.slice(0, 5)" :key="event.id" class="rounded-2xl border bg-muted/20 p-3">
            <p class="font-medium">{{ event.detail }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatDateTime(event.at) }}｜{{ event.actor }}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料？</DialogTitle>
          <DialogDescription>
            所有後台模組的資料會還原成種子狀態，先前的操作紀錄將被清除。此動作無法復原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="resetOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmReset">確認重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 2: 型別檢查＋瀏覽器驗證**

Run: `npm run lint:types`
Expected: PASS

瀏覽器 `/admin`：
1. 四張統計卡數字與各模組一致；點卡片跳對應模組
2. 待辦佇列列出待審物件/評價與 AI 複核項
3. 重置示範資料 → 確認 Dialog → 重置後統計回到種子狀態，且稽核最上方出現「重置所有後台示範資料」

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/index.vue
git commit -m "feat: upgrade admin overview with live stats, queue, and data reset"
```

---

### Task 13: 整體驗證

**Files:**
- 無新檔案（只驗證與修正）

- [ ] **Step 1: 完整 lint**

Run: `npm run lint`
Expected: `lint:types`、`lint:oxlint`、`lint:eslint` 全部通過；如有自動修正產生 diff，檢視後納入 commit。

- [ ] **Step 2: 手動流程驗證清單**

`npm run dev` 後逐項確認：

1. 「管理員登入」→ `/admin`，7 個側欄項目全部可達
2. 六模組各做一次操作（停用使用者、通過物件、退回評價、編輯法規條目、複核 AI 產出、取消訂閱）
3. `/admin/audit` 出現上述 6 筆對應紀錄
4. 重新整理頁面 → 所有操作結果仍在（localStorage 持久化）
5. `/admin` 總覽 → 重置示範資料 → 各模組回到種子狀態
6. 租客登入 → 進 `/app`，手動輸入 `/admin` 被導回 `/app`
7. 房東登入 → 進 `/welcome`（首次）或 `/app`，**不進 /admin**；手動輸入 `/admin` 被導回 `/app`
8. 登出後直接開 `/admin/users` → 被導到 `/login?redirect=/admin/users`

- [ ] **Step 3: 修正發現的問題並 commit**

發現問題就修，修完重跑對應驗證項。全部通過後：

```bash
git add -A
git commit -m "chore: fix issues found during admin console verification"
```

（若無任何修正則略過此 commit。）
