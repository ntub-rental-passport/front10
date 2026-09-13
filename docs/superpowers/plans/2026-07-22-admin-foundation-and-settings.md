# 後台基礎建設與系統設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆分後台種子資料檔、為資料層加上欄位遷移能力、引入 vitest，並完成「系統設定」模組與「維護模式」前台連動。

**Architecture:** 沿用既有後台模式（seed 型別 + composable + page），資料存 localStorage。系統設定為單一物件而非陣列。維護模式透過 router guard 攔截 `/admin` 以外的所有路徑導向 `/maintenance`。

**Tech Stack:** Vue 3 (script setup) + TypeScript + Vite + Tailwind CSS 4 + reka-ui + vitest

**設計來源:** `docs/superpowers/specs/2026-07-22-admin-console-expansion-design.md`

**本計畫涵蓋 spec 實作順序的第 1–4 步。** 第 5–8 步（內容管理、RBAC、通知模板、既有模組整合）由後續計畫處理。

---

## 檔案結構

| 檔案 | 責任 |
|------|------|
| `src/mocks/admin/helpers.ts` | 種子資料共用的日期工具（`daysAgo` / `daysAhead`） |
| `src/mocks/admin/users.ts` | 使用者型別與種子資料 |
| `src/mocks/admin/review.ts` | 物件與評價審核型別與種子資料 |
| `src/mocks/admin/knowledge.ts` | 法規知識庫型別與種子資料 |
| `src/mocks/admin/ai-quality.ts` | AI 品質型別與種子資料 |
| `src/mocks/admin/subscription.ts` | 訂閱方案型別與種子資料 |
| `src/mocks/admin/audit.ts` | 稽核事件型別與種子資料 |
| `src/mocks/admin/settings.ts` | 系統設定型別與預設值 |
| `src/mocks/admin-seed.ts` | re-export barrel，維持既有 import 路徑相容 |
| `src/utils/settings-validate.ts` | 系統設定的欄位驗證純函式 |
| `src/composables/admin/useAdminStore.ts` | 既有資料層，本計畫加入 `migrate` 參數 |
| `src/composables/admin/useAdminSettings.ts` | 系統設定狀態與儲存邏輯 |
| `src/pages/admin/settings.vue` | 系統設定頁 |
| `src/pages/maintenance.vue` | 維護模式落地頁 |

---

## Task 1: 拆分 admin-seed.ts

這是純程式碼搬移，不改任何邏輯。完成後既有 7 個後台頁面必須完全正常。

**Files:**
- Create: `src/mocks/admin/helpers.ts`
- Create: `src/mocks/admin/users.ts`
- Create: `src/mocks/admin/review.ts`
- Create: `src/mocks/admin/knowledge.ts`
- Create: `src/mocks/admin/ai-quality.ts`
- Create: `src/mocks/admin/subscription.ts`
- Create: `src/mocks/admin/audit.ts`
- Modify: `src/mocks/admin-seed.ts`（全檔replace 為 barrel）

- [ ] **Step 1: 建立共用日期工具**

建立 `src/mocks/admin/helpers.ts`，內容取自現行 `admin-seed.ts:106-118`：

```ts
export function daysAgo(days: number, hour = 10): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function daysAhead(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}
```

- [ ] **Step 2: 建立 users.ts**

建立 `src/mocks/admin/users.ts`。型別取自 `admin-seed.ts:1-12`，`seedAdminUsers` 函式主體**逐字複製** `admin-seed.ts:120-131`：

```ts
import { daysAgo } from './helpers'

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

export function seedAdminUsers(): AdminUser[] {
  // 逐字複製 admin-seed.ts:121-130 的 return 陣列
}
```

- [ ] **Step 3: 建立 review.ts**

建立 `src/mocks/admin/review.ts`。型別取自 `admin-seed.ts:14-40`，`seedListings` 主體複製 `admin-seed.ts:133-141`，`seedRatings` 主體複製 `admin-seed.ts:143-186`：

```ts
import { daysAgo } from './helpers'

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

export function seedListings(): ListingSubmission[] {
  // 逐字複製 admin-seed.ts:134-140 的 return 陣列
}

export function seedRatings(): RatingSubmission[] {
  // 逐字複製 admin-seed.ts:144-185 的 return 陣列
}
```

- [ ] **Step 4: 建立 knowledge.ts**

型別取自 `admin-seed.ts:42-52`，`seedKnowledge` 主體複製 `admin-seed.ts:188-196`：

```ts
import { daysAgo } from './helpers'

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

export function seedKnowledge(): KnowledgeEntry[] {
  // 逐字複製 admin-seed.ts:189-195 的 return 陣列
}
```

- [ ] **Step 5: 建立 ai-quality.ts**

型別取自 `admin-seed.ts:54-65`，`seedAiOutputs` 主體複製 `admin-seed.ts:198-209`：

```ts
import { daysAgo } from './helpers'

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

export function seedAiOutputs(): AiOutputRecord[] {
  // 逐字複製 admin-seed.ts:199-208 的 return 陣列
}
```

- [ ] **Step 6: 建立 subscription.ts**

型別取自 `admin-seed.ts:67-85`，`seedPlans` 複製 `admin-seed.ts:211-217`，`seedSubscriptions` 複製 `admin-seed.ts:219-228`：

```ts
import { daysAgo, daysAhead } from './helpers'

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

export function seedPlans(): SubscriptionPlan[] {
  // 逐字複製 admin-seed.ts:212-216 的 return 陣列
}

export function seedSubscriptions(): Subscription[] {
  // 逐字複製 admin-seed.ts:220-227 的 return 陣列
}
```

- [ ] **Step 7: 建立 audit.ts**

型別取自 `admin-seed.ts:87-104`，`seedAuditEvents` 複製 `admin-seed.ts:230-241`。注意 `AuditActionType` **新增四個值**（spec 第 8 節要求），供後續模組使用：

```ts
import { daysAgo } from './helpers'

export type AuditActionType =
  | '登入'
  | '使用者管理'
  | '審核'
  | '知識庫'
  | 'AI品質'
  | '訂閱'
  | '系統'
  | '資料存取'
  | '系統設定'
  | '內容管理'
  | '權限'
  | '通知模板'

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: AuditActionType
  target: string
  detail: string
}

export function seedAuditEvents(): AuditEvent[] {
  // 逐字複製 admin-seed.ts:231-240 的 return 陣列
}
```

- [ ] **Step 8: 將 admin-seed.ts 改為 barrel**

`src/mocks/admin-seed.ts` 全檔替換為：

```ts
export * from './admin/users'
export * from './admin/review'
export * from './admin/knowledge'
export * from './admin/ai-quality'
export * from './admin/subscription'
export * from './admin/audit'
```

`daysAgo` / `daysAhead` 不 re-export——它們原本就未被外部使用（僅 `admin-seed.ts` 內部使用）。

- [ ] **Step 9: 型別檢查**

Run: `npm run lint:types`
Expected: 無錯誤。若出現 `has no exported member` 表示某個型別漏搬。

- [ ] **Step 10: 手動驗證既有 7 頁**

Run: `npm run dev`

依序開啟並確認畫面正常、資料有顯示：
`/admin`、`/admin/users`、`/admin/review`、`/admin/knowledge`、`/admin/ai-quality`、`/admin/subscription`、`/admin/audit`

Expected: 七頁皆正常，內容與拆分前相同。

- [ ] **Step 11: Commit**

```bash
git add src/mocks/admin src/mocks/admin-seed.ts
git commit -m "refactor: split admin seed data into per-module files"
```

---

## Task 2: createAdminCollection 加入 migrate 參數

後續 RBAC 會為 `AdminUser` 新增 `adminRoleId` 欄位，但使用者瀏覽器中已存的舊資料沒有該欄位。資料層需要在讀取後補齊欄位的能力。

**Files:**
- Modify: `src/composables/admin/useAdminStore.ts:35-45`

- [ ] **Step 1: 修改 createAdminCollection**

將 `src/composables/admin/useAdminStore.ts:35-45` 的函式替換為：

```ts
export function createAdminCollection<T>(
  name: string,
  seed: () => T,
  migrate?: (raw: T) => T,
): Ref<T> {
  const existing = registry.get(name)
  if (existing) return existing.target as Ref<T>

  const key = `${STORAGE_PREFIX}${name}`
  const stored = readJson<T>(key)
  const initial = stored === null ? seed() : (migrate ? migrate(stored) : stored)
  const target = ref(initial) as Ref<T>
  writeJson(key, target.value)
  watch(target, (value) => writeJson(key, value), { deep: true })
  registry.set(name, { target: target as Ref<unknown>, seed })
  return target
}
```

行為差異：`migrate` 只在「有讀到既有資料」時執行；種子資料本身已是最新結構，不需遷移。未傳 `migrate` 的既有 6 個呼叫端行為完全不變。

- [ ] **Step 2: 型別檢查**

Run: `npm run lint:types`
Expected: 無錯誤。

- [ ] **Step 3: 手動驗證**

Run: `npm run dev`，開啟 `/admin`，確認統計卡與待辦佇列正常顯示（代表既有 collection 讀寫未受影響）。

- [ ] **Step 4: Commit**

```bash
git add src/composables/admin/useAdminStore.ts
git commit -m "feat: add optional migrate hook to createAdminCollection"
```

---

## Task 3: 引入 vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: 安裝 vitest**

Run: `npm install -D vitest@^3.2.4`
Expected: 安裝成功，`package.json` 的 `devDependencies` 出現 `vitest`。

- [ ] **Step 2: 加入 test scripts**

在 `package.json` 的 `scripts` 中，於 `"preview": "vite preview",` 之後加入兩行：

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: 設定 vitest**

修改 `vite.config.ts`。第 4 行的 import 改為從 `vitest/config` 匯入，並在回傳物件中加入 `test` 區塊。

將 `import { defineConfig, loadEnv } from 'vite';` 改為：

```ts
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
```

並在回傳物件的 `server` 區塊之後加入：

```ts
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
```

環境用 `node` 而非 `jsdom`——本計畫與後續計畫的測試對象都是純函式，不需要 DOM。

- [ ] **Step 4: 驗證 vitest 可執行**

Run: `npm test`
Expected: 顯示 `No test files found`（尚未寫測試），指令本身正常結束、不報設定錯誤。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "chore: add vitest for unit testing pure functions"
```

---

## Task 4: 系統設定的驗證函式（TDD）

**Files:**
- Create: `src/utils/settings-validate.ts`
- Test: `src/utils/settings-validate.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `src/utils/settings-validate.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { validateSettings } from './settings-validate'
import type { SystemSettings } from '@/src/mocks/admin/settings'

function baseSettings(): SystemSettings {
  return {
    siteName: 'RentMate',
    supportEmail: 'support@rentmate.tw',
    maintenanceMode: false,
    maintenanceMessage: '系統維護中，請稍後再試。',
    pageSize: 20,
    maxUploadMb: 10,
    defaultAiQuota: 3,
  }
}

describe('validateSettings', () => {
  it('正常設定沒有錯誤', () => {
    expect(validateSettings(baseSettings())).toEqual({})
  })

  it('網站名稱不可空白', () => {
    const result = validateSettings({ ...baseSettings(), siteName: '   ' })
    expect(result.siteName).toBe('請輸入網站名稱')
  })

  it('客服信箱格式錯誤', () => {
    const result = validateSettings({ ...baseSettings(), supportEmail: 'not-an-email' })
    expect(result.supportEmail).toBe('請輸入有效的 Email')
  })

  it('客服信箱不可空白', () => {
    const result = validateSettings({ ...baseSettings(), supportEmail: '' })
    expect(result.supportEmail).toBe('請輸入客服信箱')
  })

  it('每頁筆數低於下限', () => {
    const result = validateSettings({ ...baseSettings(), pageSize: 0 })
    expect(result.pageSize).toBe('每頁筆數需介於 1 到 100')
  })

  it('每頁筆數高於上限', () => {
    const result = validateSettings({ ...baseSettings(), pageSize: 101 })
    expect(result.pageSize).toBe('每頁筆數需介於 1 到 100')
  })

  it('每頁筆數邊界值可通過', () => {
    expect(validateSettings({ ...baseSettings(), pageSize: 1 }).pageSize).toBeUndefined()
    expect(validateSettings({ ...baseSettings(), pageSize: 100 }).pageSize).toBeUndefined()
  })

  it('上傳上限超出範圍', () => {
    const result = validateSettings({ ...baseSettings(), maxUploadMb: 51 })
    expect(result.maxUploadMb).toBe('上傳上限需介於 1 到 50 MB')
  })

  it('AI 配額不可為負數', () => {
    const result = validateSettings({ ...baseSettings(), defaultAiQuota: -1 })
    expect(result.defaultAiQuota).toBe('AI 配額不可為負數')
  })

  it('開啟維護模式時維護文字不可空白', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceMode: true,
      maintenanceMessage: '  ',
    })
    expect(result.maintenanceMessage).toBe('開啟維護模式時必須填寫維護說明')
  })

  it('未開啟維護模式時維護文字可空白', () => {
    const result = validateSettings({
      ...baseSettings(),
      maintenanceMode: false,
      maintenanceMessage: '',
    })
    expect(result.maintenanceMessage).toBeUndefined()
  })

  it('同時回報多個錯誤', () => {
    const result = validateSettings({
      ...baseSettings(),
      siteName: '',
      pageSize: 999,
    })
    expect(Object.keys(result).sort()).toEqual(['pageSize', 'siteName'])
  })
})
```

- [ ] **Step 2: 建立型別（讓測試能編譯）**

建立 `src/mocks/admin/settings.ts`：

```ts
export interface SystemSettings {
  siteName: string
  supportEmail: string
  maintenanceMode: boolean
  maintenanceMessage: string
  pageSize: number
  maxUploadMb: number
  defaultAiQuota: number
}

export function seedSettings(): SystemSettings {
  return {
    siteName: 'RentMate 租隊友',
    supportEmail: 'support@rentmate.tw',
    maintenanceMode: false,
    maintenanceMessage: '系統維護中，預計 30 分鐘後恢復，造成不便敬請見諒。',
    pageSize: 20,
    maxUploadMb: 10,
    defaultAiQuota: 3,
  }
}
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，錯誤訊息為找不到 `./settings-validate` 模組。

- [ ] **Step 4: 實作 validateSettings**

建立 `src/utils/settings-validate.ts`：

```ts
import type { SystemSettings } from '@/src/mocks/admin/settings'

export type SettingsErrors = Partial<Record<keyof SystemSettings, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSettings(settings: SystemSettings): SettingsErrors {
  const errors: SettingsErrors = {}

  if (settings.siteName.trim() === '') {
    errors.siteName = '請輸入網站名稱'
  }

  if (settings.supportEmail.trim() === '') {
    errors.supportEmail = '請輸入客服信箱'
  } else if (!EMAIL_PATTERN.test(settings.supportEmail.trim())) {
    errors.supportEmail = '請輸入有效的 Email'
  }

  if (settings.pageSize < 1 || settings.pageSize > 100) {
    errors.pageSize = '每頁筆數需介於 1 到 100'
  }

  if (settings.maxUploadMb < 1 || settings.maxUploadMb > 50) {
    errors.maxUploadMb = '上傳上限需介於 1 到 50 MB'
  }

  if (settings.defaultAiQuota < 0) {
    errors.defaultAiQuota = 'AI 配額不可為負數'
  }

  if (settings.maintenanceMode && settings.maintenanceMessage.trim() === '') {
    errors.maintenanceMessage = '開啟維護模式時必須填寫維護說明'
  }

  return errors
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test`
Expected: PASS，13 個測試全部通過。

- [ ] **Step 6: Commit**

```bash
git add src/utils/settings-validate.ts src/utils/settings-validate.test.ts src/mocks/admin/settings.ts
git commit -m "feat: add system settings type and validation"
```

---

## Task 5: 系統設定 composable

**Files:**
- Create: `src/composables/admin/useAdminSettings.ts`
- Modify: `src/mocks/admin-seed.ts`（barrel 加一行）

- [ ] **Step 1: barrel 加入 settings**

在 `src/mocks/admin-seed.ts` 最後加一行：

```ts
export * from './admin/settings'
```

- [ ] **Step 2: 建立 composable**

建立 `src/composables/admin/useAdminSettings.ts`：

```ts
import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { useAdminAudit } from './useAdminAudit'
import { seedSettings, type SystemSettings } from '@/src/mocks/admin/settings'

const settings = createAdminCollection<SystemSettings>('settings', seedSettings)

export function useAdminSettings() {
  const { logAction } = useAdminAudit()

  const maintenanceMode = computed(() => settings.value.maintenanceMode)

  function saveSettings(next: SystemSettings): void {
    const previous = { ...settings.value }
    settings.value = { ...next }

    const changed = (Object.keys(next) as (keyof SystemSettings)[]).filter(
      (key) => previous[key] !== next[key],
    )
    if (changed.length === 0) return

    if (previous.maintenanceMode !== next.maintenanceMode) {
      logAction(
        '系統設定',
        '維護模式',
        next.maintenanceMode ? '開啟維護模式' : '關閉維護模式',
      )
    }

    const others = changed.filter((key) => key !== 'maintenanceMode')
    if (others.length > 0) {
      logAction('系統設定', '平台設定', `更新欄位：${others.join('、')}`)
    }
  }

  return { settings, maintenanceMode, saveSettings }
}

export { settings as adminSettings }
```

`adminSettings` 具名匯出供 router guard 使用——guard 執行於元件 setup 之外，不能呼叫 composable，但可直接讀取 module 層級的 ref。

- [ ] **Step 3: 型別檢查**

Run: `npm run lint:types`
Expected: 無錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/composables/admin/useAdminSettings.ts src/mocks/admin-seed.ts
git commit -m "feat: add admin settings composable with audit logging"
```

---

## Task 6: 系統設定頁面

**Files:**
- Create: `src/pages/admin/settings.vue`

- [ ] **Step 1: 建立頁面**

建立 `src/pages/admin/settings.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Switch } from '@/components/ui/switch/index'
import { Textarea } from '@/components/ui/textarea/index'
import { AlertTriangle } from 'lucide-vue-next'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { validateSettings } from '@/src/utils/settings-validate'
import type { SystemSettings } from '@/src/mocks/admin/settings'

const { settings, saveSettings } = useAdminSettings()

const draft = ref<SystemSettings>({ ...settings.value })
const confirmOpen = ref(false)
const savedAt = ref<string | null>(null)

const errors = computed(() => validateSettings(draft.value))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)

const isDirty = computed(() =>
  (Object.keys(draft.value) as (keyof SystemSettings)[]).some(
    (key) => draft.value[key] !== settings.value[key],
  ),
)

const turningOnMaintenance = computed(
  () => draft.value.maintenanceMode && !settings.value.maintenanceMode,
)

function confirmSave(): void {
  saveSettings(draft.value)
  confirmOpen.value = false
  savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

function resetDraft(): void {
  draft.value = { ...settings.value }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">系統設定</h1>
      <p class="mt-1 text-muted-foreground">調整平台的基本資訊、維護狀態與使用限制。</p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>基本資訊</CardTitle>
        <CardDescription>顯示於平台各處的識別資訊。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="siteName">網站名稱</Label>
          <Input id="siteName" v-model="draft.siteName" />
          <p v-if="errors.siteName" class="text-sm text-destructive">{{ errors.siteName }}</p>
        </div>
        <div class="space-y-2">
          <Label for="supportEmail">客服信箱</Label>
          <Input id="supportEmail" v-model="draft.supportEmail" type="email" />
          <p v-if="errors.supportEmail" class="text-sm text-destructive">{{ errors.supportEmail }}</p>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>系統維護</CardTitle>
        <CardDescription>開啟後，一般使用者將無法使用平台，管理後台不受影響。</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4">
          <div>
            <p class="font-medium">維護模式</p>
            <p class="text-sm text-muted-foreground">
              {{ draft.maintenanceMode ? '已開啟：使用者會看到維護頁' : '已關閉：平台正常運作' }}
            </p>
          </div>
          <Switch v-model="draft.maintenanceMode" />
        </div>

        <div v-if="draft.maintenanceMode" class="space-y-2">
          <Label for="maintenanceMessage">維護說明文字</Label>
          <Textarea id="maintenanceMessage" v-model="draft.maintenanceMessage" rows="3" />
          <p v-if="errors.maintenanceMessage" class="text-sm text-destructive">
            {{ errors.maintenanceMessage }}
          </p>
        </div>
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>使用限制</CardTitle>
        <CardDescription>影響資料呈現與檔案上傳的預設值。</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-3">
        <div class="space-y-2">
          <Label for="pageSize">表格每頁筆數</Label>
          <Input id="pageSize" v-model.number="draft.pageSize" type="number" min="1" max="100" />
          <p v-if="errors.pageSize" class="text-sm text-destructive">{{ errors.pageSize }}</p>
        </div>
        <div class="space-y-2">
          <Label for="maxUploadMb">上傳上限（MB）</Label>
          <Input id="maxUploadMb" v-model.number="draft.maxUploadMb" type="number" min="1" max="50" />
          <p v-if="errors.maxUploadMb" class="text-sm text-destructive">{{ errors.maxUploadMb }}</p>
        </div>
        <div class="space-y-2">
          <Label for="defaultAiQuota">AI 每日配額預設值</Label>
          <Input id="defaultAiQuota" v-model.number="draft.defaultAiQuota" type="number" min="0" />
          <p v-if="errors.defaultAiQuota" class="text-sm text-destructive">
            {{ errors.defaultAiQuota }}
          </p>
        </div>
      </CardContent>
    </Card>

    <div class="flex items-center justify-end gap-3">
      <p v-if="savedAt" class="text-sm text-muted-foreground">已於 {{ savedAt }} 儲存</p>
      <Button variant="outline" :disabled="!isDirty" @click="resetDraft">還原變更</Button>
      <Button :disabled="!isDirty || hasErrors" @click="confirmOpen = true">儲存變更</Button>
    </div>

    <Dialog v-model:open="confirmOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認儲存設定？</DialogTitle>
          <DialogDescription>變更會立即生效。</DialogDescription>
        </DialogHeader>

        <div
          v-if="turningOnMaintenance"
          class="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p class="font-medium text-destructive">你正要開啟維護模式</p>
            <p class="mt-1 text-muted-foreground">
              一般使用者將被導向維護頁面。管理後台（/admin）不受影響，你可以隨時回到這裡關閉。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button @click="confirmSave">確認儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 2: 型別檢查**

Run: `npm run lint:types`
Expected: 無錯誤。若 `Switch` 的 `v-model` 型別報錯，檢查 `components/ui/switch/index.ts` 匯出的 prop 名稱是否為 `modelValue`。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/settings.vue
git commit -m "feat: add system settings admin page"
```

---

## Task 7: 維護頁面

**Files:**
- Create: `src/pages/maintenance.vue`

- [ ] **Step 1: 建立頁面**

建立 `src/pages/maintenance.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'
import { adminSettings } from '@/src/composables/admin/useAdminSettings'

const message = computed(() => adminSettings.value.maintenanceMessage)
const siteName = computed(() => adminSettings.value.siteName)
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f7f8fc,_#f3f5fb)] px-6">
    <div class="max-w-md space-y-6 text-center">
      <div class="mx-auto w-fit rounded-3xl bg-primary/10 p-5 text-primary">
        <Wrench class="h-10 w-10" />
      </div>
      <div class="space-y-2">
        <h1 class="text-3xl font-black tracking-tight">{{ siteName }} 維護中</h1>
        <p class="text-muted-foreground">{{ message }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/maintenance.vue
git commit -m "feat: add maintenance landing page"
```

---

## Task 8: 路由與側邊欄接線（連動點 2）

**Files:**
- Modify: `src/router/index.ts:15`（新增 `/maintenance` 路由）
- Modify: `src/router/index.ts:28-36`（新增 `settings` 子路由）
- Modify: `src/router/index.ts:115-151`（guard 加維護模式攔截）
- Modify: `src/components/admin-layout.vue:18-26`（側邊欄加項目）

- [ ] **Step 1: 新增 /maintenance 路由**

在 `src/router/index.ts` 的 `routes` 陣列中，`{ path: '/', ... }` 那一行之後插入：

```ts
    { path: '/maintenance', component: () => import('@/src/pages/maintenance.vue') },
```

此路由**不加** `meta.requiresAuth`——未登入的使用者也必須看得到維護頁。

- [ ] **Step 2: 新增 settings 子路由**

在 `/admin` 的 `children` 陣列末端（`audit` 那一行之後）加入：

```ts
        { path: 'settings', component: () => import('@/src/pages/admin/settings.vue') },
```

- [ ] **Step 3: 匯入 settings ref**

在 `src/router/index.ts` 的 import 區塊末端加入：

```ts
import { adminSettings } from '@/src/composables/admin/useAdminSettings'
```

- [ ] **Step 4: 在 guard 加入維護模式攔截**

在 `router.beforeEach((to) => {` 的**第一行**（即 `const session = getAuthSession()` 之前）插入：

```ts
  const maintenanceOn = adminSettings.value.maintenanceMode
  if (maintenanceOn && !to.path.startsWith('/admin') && to.path !== '/maintenance') {
    return '/maintenance'
  }
  if (!maintenanceOn && to.path === '/maintenance') {
    return '/'
  }
```

放在最前面是必要的：若放在登入檢查之後，未登入的使用者會先被導去 `/login` 而看不到維護頁。

- [ ] **Step 5: 側邊欄加入系統設定**

在 `src/components/admin-layout.vue` 的 import 中加入 `Settings` 圖示：

```ts
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-vue-next'
```

並在 `adminNavItems` 陣列末端加入：

```ts
  { label: '系統設定', path: '/admin/settings', icon: Settings },
```

（側邊欄的三群分組留待 RBAC 計畫一併處理，該計畫會重寫這個陣列。）

- [ ] **Step 6: 型別檢查與測試**

Run: `npm run lint:types && npm test`
Expected: 型別無錯誤，12 個測試通過。

- [ ] **Step 7: 手動驗證連動點 2**

Run: `npm run dev`

依序執行並確認：

1. 以管理員帳號登入，開啟 `/admin/settings` → 頁面正常顯示
2. 把「網站名稱」清空 → 出現紅字錯誤，「儲存變更」變灰
3. 填回名稱，開啟「維護模式」開關 → 下方展開維護說明 textarea
4. 按「儲存變更」→ 確認 Dialog 出現**紅色警示區塊**
5. 按「確認儲存」
6. 開新分頁前往 `/app` → **被導向 `/maintenance`**，顯示剛才填的維護文字
7. 回到 `/admin/settings` → **仍可正常進入**（這是關鍵，`/admin` 必須豁免）
8. 關閉維護模式並儲存 → `/app` 恢復正常，手動打 `/maintenance` 會被導回 `/`
9. 前往 `/admin/audit` → 看到「開啟維護模式」與「關閉維護模式」兩筆稽核紀錄

Expected: 九項全部符合。第 7 項若失敗代表 guard 的 `/admin` 豁免條件寫錯，必須先修好——否則會把自己鎖在後台外面。

- [ ] **Step 8: Commit**

```bash
git add src/router/index.ts src/components/admin-layout.vue
git commit -m "feat: wire maintenance mode guard and settings route"
```

---

## 完成標準

- [ ] `npm run lint:types` 無錯誤
- [ ] `npm test` 12 個測試通過
- [ ] 既有 7 個後台頁面功能與拆分前一致
- [ ] `/admin/settings` 可編輯、驗證、儲存，並寫入稽核紀錄
- [ ] 維護模式開啟時 `/app` 被攔截、`/admin` 不受影響
- [ ] `src/mocks/admin-seed.ts` 已成為 barrel，既有 import 路徑未變動

## 後續計畫

1. **內容管理 + 公告連動**（spec 第 5 步）
2. **權限與角色 RBAC + 側邊欄分群**（spec 第 6 步）
3. **通知模板 + renderTemplate**（spec 第 7 步）
4. **既有模組整合**（spec 第 8 步）
