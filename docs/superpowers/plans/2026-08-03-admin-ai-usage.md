# AI 使用量與額度預警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `/admin/ai-usage`（AI 使用量與額度預警）取代 `/admin/ai-quality`，讓管理員在 Gemini 與 Google Vision 額度耗盡前收到警訊。

**Architecture:** 每日用量序列（`AiUsageDaily`）為唯一資料來源，本月累計、近 7 日平均、耗盡預估、門檻判定全部由純函式衍生。額度上限與門檻存於 `SystemSettings`，由系統設定頁維護。預警採兩條規則取嚴格者：用量百分比門檻，以及依消耗速度推算的耗盡預估。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、Tailwind、shadcn-vue（`components/ui/*`）、vue-chartjs、vitest（node 環境，僅測純函式）、localStorage 持久化（`createAdminCollection`）。

**設計依據：** `docs/superpowers/specs/2026-08-03-admin-ai-usage-design.md`

---

## 執行前必讀

**每個 Task 結束時工作樹都必須能編譯。** 因此舊的 `ai-quality` 三個檔案**留到 Task 8 才刪**，Task 1 只是「新增」ai-usage 的 export，不動舊的。若提前刪除，`ai-quality.vue` 仍從 `admin-seed` 匯入 `AiOutputRecord`，中途的 commit 會編譯失敗。

**驗證指令：**

```bash
npm test                          # vitest run，跑 src/**/*.test.ts
npx vue-tsc --noEmit              # 型別檢查（全專案）
```

**已知偏離 spec 的兩處（本計畫已修正，實作時照計畫走）：**

1. spec 寫「使用 `components/ui/progress` 進度條，依狀態上色」。實際上 `components/ui/progress/Progress.vue` 的 `ProgressIndicator` 寫死 `class="h-full w-full flex-1 bg-primary"`，沒有任何 props 可覆蓋顏色，而該元件已被 `src/pages/contract/index.vue`、`src/pages/contract/contract.vue`、`src/pages/admin/subscription.vue` 使用，改它會波及三個頁面。改用頁面內的兩層 `div` 自繪進度條（Task 5）。
2. spec 的移除清單涵蓋了 `src/pages/admin/index.vue:151`，但沒說明該處那張 `BarStatCard title="AI 產出品質"`（星等分佈長條圖）要換成什麼。Task 7 明確定義為「AI 額度用量」長條圖，兩根長條對應兩個供應商的用量百分比。

---

## File Structure

| 檔案 | 責任 | 動作 |
|---|---|---|
| `src/utils/admin-ai-usage.ts` | 純計算：本月累計、日均、耗盡預估、門檻判定 | 新增 |
| `src/utils/admin-ai-usage.test.ts` | 上者的測試 | 新增 |
| `src/mocks/admin/ai-usage.ts` | 型別與 seed 資料 | 新增 |
| `src/composables/admin/useAdminAiUsage.ts` | 綁定 collection 與 settings，輸出每個供應商的摘要 | 新增 |
| `src/components/admin/UsageTrendChart.vue` | 近 30 天雙線折線圖 | 新增 |
| `src/pages/admin/ai-usage.vue` | 使用量頁 | 新增 |
| `src/mocks/admin/settings.ts` | 新增四個額度欄位 | 修改 |
| `src/composables/admin/useAdminSettings.ts` | 補 `migrate` | 修改 |
| `src/utils/settings-validate.ts` | 新增額度驗證 | 修改 |
| `src/utils/settings-validate.test.ts` | 新增驗證測試 | 修改 |
| `src/mocks/admin-seed.ts` | export 切換 | 修改 |
| `src/utils/admin-rbac.ts` | 導覽項目改名改路徑 | 修改 |
| `src/utils/admin-rbac.test.ts` | 權限矩陣 key | 修改 |
| `src/composables/admin/useAdminRbac.ts` | 圖示 map | 修改 |
| `src/router/index.ts` | 路由 | 修改 |
| `src/pages/admin/index.vue` | 待辦佇列 + 圖表卡 | 修改 |
| `src/pages/admin/settings.vue` | 新增「AI 平台額度」卡片 | 修改 |
| `src/pages/admin/ai-quality.vue` / `src/mocks/admin/ai-quality.ts` / `src/composables/admin/useAdminAiQuality.ts` | — | 刪除（Task 8） |
| `docs/superpowers/specs/2026-08-02-admin-console-revamp-design.md` | 同步「AI 品質監控」字樣 | 修改（Task 8） |

---

## Task 1: mock 資料與型別

計算函式的測試需要 `AiUsageDaily` 型別，所以資料層必須先建立。

**Files:**
- Create: `src/mocks/admin/ai-usage.ts`
- Modify: `src/mocks/admin-seed.ts`

- [ ] **Step 1: 建立型別與 seed**

建立 `src/mocks/admin/ai-usage.ts`：

```ts
export type AiProviderId = 'gemini' | 'vision'
export type AiUsageUnit = 'token' | 'page'

export interface AiProvider {
  id: AiProviderId
  label: string
  unit: AiUsageUnit
}

export interface AiUsageDaily {
  date: string // YYYY-MM-DD
  provider: AiProviderId
  units: number
  calls: number
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'gemini', label: 'Gemini API', unit: 'token' },
  { id: 'vision', label: 'Google Cloud Vision', unit: 'page' },
]

/** 以本地時區產生 YYYY-MM-DD。與 admin-ai-usage.ts 的 dateKey 同邏輯，
 *  但 mocks 不依賴 utils，避免 seed 與計算層互相 import。 */
function dayKey(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() - offsetDays)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 近 30 天、每個供應商每天一筆，相對「今天」產生。
 *
 * Gemini 最近 3 天刻意設為前期的兩倍，製造「用量未破門檻但消耗速度暴衝」
 * 的情境，否則預警的規則二在畫面上永遠不會被觸發。
 */
export function seedAiUsage(): AiUsageDaily[] {
  const records: AiUsageDaily[] = []

  for (let offset = 29; offset >= 0; offset -= 1) {
    const surge = offset <= 2 ? 2 : 1
    const wave = 1 + ((29 - offset) % 5) * 0.08

    records.push({
      date: dayKey(offset),
      provider: 'gemini',
      units: Math.round(26_000 * wave * surge),
      calls: Math.round(48 * wave * surge),
    })

    records.push({
      date: dayKey(offset),
      provider: 'vision',
      units: Math.round(42 * wave),
      calls: Math.round(14 * wave),
    })
  }

  return records
}
```

- [ ] **Step 2: 在 admin-seed 併入新 export**

修改 `src/mocks/admin-seed.ts`，在既有 `export * from './admin/ai-quality'` **下一行**加入（此時**不要**刪除舊行，Task 8 才刪；提前刪除會讓仍存在的 `ai-quality.vue` 編譯失敗）：

```ts
export * from './admin/ai-usage'
```

- [ ] **Step 3: 驗證型別與既有測試未被破壞**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤輸出

Run: `npm test`
Expected: 既有測試全數通過

- [ ] **Step 4: Commit**

```bash
git add src/mocks/admin/ai-usage.ts src/mocks/admin-seed.ts
git commit -m "feat: 新增 AI 用量 mock 資料與供應商定義"
```

---

## Task 2: 計算純函式

**Files:**
- Create: `src/utils/admin-ai-usage.ts`
- Test: `src/utils/admin-ai-usage.test.ts`

vitest 設定於 `vite.config.ts` 為 `environment: 'node'`、`include: ['src/**/*.test.ts']`，因此本檔只能測純函式，不可 import Vue 元件。

- [ ] **Step 1: 寫失敗的測試**

建立 `src/utils/admin-ai-usage.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  dailyAverage,
  dateKey,
  daysLeftInMonth,
  daysUntilExhausted,
  monthToDateUnits,
  quotaStatus,
} from './admin-ai-usage'
import type { AiUsageDaily } from '@/src/mocks/admin/ai-usage'

// 2026-08-10（週一）當作「今天」，當月共 31 天
const TODAY = new Date(2026, 7, 10)

function rec(date: string, units: number, provider: AiUsageDaily['provider'] = 'gemini'): AiUsageDaily {
  return { date, provider, units, calls: 1 }
}

describe('dateKey', () => {
  it('輸出本地時區的 YYYY-MM-DD，不受 UTC 位移影響', () => {
    expect(dateKey(new Date(2026, 7, 1))).toBe('2026-08-01')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('monthToDateUnits', () => {
  it('只加總當月且供應商相符的紀錄', () => {
    const records = [
      rec('2026-08-01', 100),
      rec('2026-08-10', 50),
      rec('2026-07-31', 999), // 上月，不計
      rec('2026-08-05', 777, 'vision'), // 別的供應商，不計
    ]
    expect(monthToDateUnits(records, 'gemini', TODAY)).toBe(150)
  })

  it('沒有資料時回 0', () => {
    expect(monthToDateUnits([], 'gemini', TODAY)).toBe(0)
  })
})

describe('dailyAverage', () => {
  it('預設取最近 7 天，除數為 7', () => {
    // 08-04 ~ 08-10 共 7 天，每天 70。日數需補零，否則會產出 '2026-08-010'
    const records = Array.from({ length: 7 }, (_, i) =>
      rec(`2026-08-${`${i + 4}`.padStart(2, '0')}`, 70),
    )
    expect(dailyAverage(records, 'gemini', TODAY)).toBe(70)
  })

  it('當月已過天數不足 7 天時，以實際天數為除數', () => {
    const earlyMonth = new Date(2026, 7, 3) // 8/3，當月只過了 3 天
    const records = [rec('2026-08-01', 30), rec('2026-08-02', 30), rec('2026-08-03', 30)]
    // 除數是 3 不是 7
    expect(dailyAverage(records, 'gemini', earlyMonth)).toBe(30)
  })

  it('沒有用量時回 0，不回 NaN', () => {
    expect(dailyAverage([], 'gemini', TODAY)).toBe(0)
  })
})

describe('daysUntilExhausted', () => {
  it('依剩餘量與日均推算，向下取整', () => {
    expect(daysUntilExhausted(100, 30)).toBe(3) // 3.33 -> 3
  })

  it('日均為 0 時回 null（永不耗盡）', () => {
    expect(daysUntilExhausted(100, 0)).toBeNull()
  })

  it('剩餘為 0 時回 0', () => {
    expect(daysUntilExhausted(0, 30)).toBe(0)
  })
})

describe('daysLeftInMonth', () => {
  it('包含今天在內', () => {
    expect(daysLeftInMonth(TODAY)).toBe(22) // 8/10 到 8/31
  })

  it('當月最後一天回 1', () => {
    expect(daysLeftInMonth(new Date(2026, 7, 31))).toBe(1)
  })
})

describe('quotaStatus', () => {
  const base = { today: TODAY, warnPercent: 80, criticalPercent: 95 }

  it('用量高、消耗慢時由百分比門檻決定', () => {
    // 用量 85%，日均 1 -> 剩 150 份可撐 150 天，規則二為 ok
    expect(quotaStatus({ ...base, usedUnits: 850, quota: 1000, dailyAvg: 1 })).toBe('warn')
    expect(quotaStatus({ ...base, usedUnits: 960, quota: 1000, dailyAvg: 1 })).toBe('critical')
  })

  it('用量低、消耗快時由耗盡預估決定（本設計核心）', () => {
    // 用量僅 40%，遠低於 80% 門檻，但日均 100 -> 剩 600 只能撐 6 天 < 本月剩餘 22 天
    expect(quotaStatus({ ...base, usedUnits: 400, quota: 1000, dailyAvg: 100 })).toBe('warn')
    // 日均 250 -> 只能撐 2 天，進入 critical
    expect(quotaStatus({ ...base, usedUnits: 400, quota: 1000, dailyAvg: 250 })).toBe('critical')
  })

  it('額度為 0 視為未設定，不預警', () => {
    expect(quotaStatus({ ...base, usedUnits: 999, quota: 0, dailyAvg: 500 })).toBe('ok')
  })

  it('已超量時為 critical', () => {
    expect(quotaStatus({ ...base, usedUnits: 1200, quota: 1000, dailyAvg: 10 })).toBe('critical')
  })

  it('用量低且消耗慢時為 ok', () => {
    expect(quotaStatus({ ...base, usedUnits: 100, quota: 1000, dailyAvg: 5 })).toBe('ok')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/utils/admin-ai-usage.test.ts`
Expected: FAIL，錯誤訊息為找不到模組 `./admin-ai-usage`

- [ ] **Step 3: 實作**

建立 `src/utils/admin-ai-usage.ts`：

```ts
import type { AiProviderId, AiUsageDaily } from '@/src/mocks/admin/ai-usage'

export type QuotaLevel = 'ok' | 'warn' | 'critical'

const DEFAULT_AVERAGE_WINDOW = 7
const CRITICAL_DAYS_LEFT = 3

/** 以本地時區輸出 YYYY-MM-DD。不可用 toISOString，UTC 位移會讓日期跳掉一天。 */
export function dateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function monthPrefix(date: Date): string {
  return dateKey(date).slice(0, 7) // YYYY-MM
}

export function monthToDateUnits(
  records: AiUsageDaily[],
  provider: AiProviderId,
  today: Date,
): number {
  const prefix = monthPrefix(today)
  return records
    .filter((record) => record.provider === provider && record.date.startsWith(prefix))
    .reduce((sum, record) => sum + record.units, 0)
}

/**
 * 近 N 日平均。視窗不會跨到上個月：當月已過天數不足 N 天時，
 * 除數改為當月已過天數，否則月初會被大量的零稀釋成假的低消耗。
 */
export function dailyAverage(
  records: AiUsageDaily[],
  provider: AiProviderId,
  today: Date,
  days = DEFAULT_AVERAGE_WINDOW,
): number {
  const window = Math.min(days, today.getDate())
  if (window <= 0) return 0

  const keys = new Set<string>()
  for (let offset = 0; offset < window; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
    keys.add(dateKey(date))
  }

  const total = records
    .filter((record) => record.provider === provider && keys.has(record.date))
    .reduce((sum, record) => sum + record.units, 0)

  return total / window
}

/** 依剩餘量與日均推算還能撐幾天。向下取整：寧可低估也不要高估。 */
export function daysUntilExhausted(remaining: number, dailyAvg: number): number | null {
  if (dailyAvg <= 0) return null
  return Math.floor(remaining / dailyAvg)
}

/** 今天到當月最後一日的天數，今天算在內。 */
export function daysLeftInMonth(today: Date): number {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return lastDay - today.getDate() + 1
}

export interface QuotaStatusInput {
  usedUnits: number
  quota: number
  dailyAvg: number
  today: Date
  warnPercent: number
  criticalPercent: number
}

const SEVERITY: Record<QuotaLevel, number> = { ok: 0, warn: 1, critical: 2 }

function stricter(a: QuotaLevel, b: QuotaLevel): QuotaLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

/**
 * 兩條規則取嚴格者：
 * 規則一 用量百分比門檻；規則二 依消耗速度推算的耗盡預估。
 * 規則二是關鍵 —— 消耗速度翻倍時，等百分比門檻亮燈已來不及。
 */
export function quotaStatus(input: QuotaStatusInput): QuotaLevel {
  const { usedUnits, quota, dailyAvg, today, warnPercent, criticalPercent } = input

  // 額度為 0 視為未設定：不計算百分比，也避免除以零
  if (quota <= 0) return 'ok'
  if (usedUnits >= quota) return 'critical'

  const percent = (usedUnits / quota) * 100
  const byPercent: QuotaLevel =
    percent >= criticalPercent ? 'critical' : percent >= warnPercent ? 'warn' : 'ok'

  const remaining = Math.max(0, quota - usedUnits)
  const days = daysUntilExhausted(remaining, dailyAvg)
  const byForecast: QuotaLevel =
    days === null
      ? 'ok'
      : days <= CRITICAL_DAYS_LEFT
        ? 'critical'
        : days <= daysLeftInMonth(today)
          ? 'warn'
          : 'ok'

  return stricter(byPercent, byForecast)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/utils/admin-ai-usage.test.ts`
Expected: PASS，16 個測試全綠

- [ ] **Step 5: Commit**

```bash
git add src/utils/admin-ai-usage.ts src/utils/admin-ai-usage.test.ts
git commit -m "feat: 新增 AI 用量計算與額度門檻判定純函式"
```

---

## Task 3: 系統設定新增額度欄位

**Files:**
- Modify: `src/mocks/admin/settings.ts`
- Modify: `src/composables/admin/useAdminSettings.ts`
- Modify: `src/utils/settings-validate.ts`
- Test: `src/utils/settings-validate.test.ts`

- [ ] **Step 1: 先寫失敗的驗證測試**

在 `src/utils/settings-validate.test.ts` 檔案最後追加：

```ts
describe('AI 平台額度驗證', () => {
  function baseSettings(): SystemSettings {
    return {
      siteName: 'RentMate 租隊友',
      supportEmail: 'support@rentmate.tw',
      maintenanceMode: false,
      maintenanceMessage: '維護中',
      pageSize: 20,
      maxUploadMb: 10,
      defaultAiQuota: 3,
      platformGeminiTokenQuota: 2_000_000,
      platformVisionPageQuota: 3_000,
      quotaWarnPercent: 80,
      quotaCriticalPercent: 95,
    }
  }

  it('合法設定沒有錯誤', () => {
    expect(validateSettings(baseSettings())).toEqual({})
  })

  it('額度為負數時報錯', () => {
    const errors = validateSettings({ ...baseSettings(), platformGeminiTokenQuota: -1 })
    expect(errors.platformGeminiTokenQuota).toBeTruthy()
  })

  it('門檻超出 1 到 100 時報錯', () => {
    expect(validateSettings({ ...baseSettings(), quotaWarnPercent: 0 }).quotaWarnPercent).toBeTruthy()
    expect(
      validateSettings({ ...baseSettings(), quotaCriticalPercent: 101 }).quotaCriticalPercent,
    ).toBeTruthy()
  })

  it('黃燈門檻不得大於等於紅燈門檻', () => {
    const errors = validateSettings({
      ...baseSettings(),
      quotaWarnPercent: 95,
      quotaCriticalPercent: 90,
    })
    expect(errors.quotaWarnPercent).toBeTruthy()
  })
})
```

若該測試檔尚未 import `SystemSettings`，在檔首補上：

```ts
import type { SystemSettings } from '@/src/mocks/admin/settings'
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/utils/settings-validate.test.ts`
Expected: FAIL，型別錯誤或 `expect(...).toBeTruthy()` 收到 `undefined`

- [ ] **Step 3: 新增設定欄位**

修改 `src/mocks/admin/settings.ts` 為：

```ts
export interface SystemSettings {
  siteName: string
  supportEmail: string
  maintenanceMode: boolean
  maintenanceMessage: string
  pageSize: number
  maxUploadMb: number
  defaultAiQuota: number
  // 以下為「平台向 AI 廠商購買的額度」，與上方 defaultAiQuota（單一使用者的
  // 每日配額）是不同的東西，命名刻意加 platform 前綴並帶單位以免混淆。
  platformGeminiTokenQuota: number
  platformVisionPageQuota: number
  quotaWarnPercent: number
  quotaCriticalPercent: number
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
    platformGeminiTokenQuota: 2_000_000,
    platformVisionPageQuota: 3_000,
    quotaWarnPercent: 80,
    quotaCriticalPercent: 95,
  }
}

/**
 * 舊版 localStorage 沒有新增的額度欄位，缺欄位會讓百分比算出 NaN 而整頁失效。
 * 寫成具名函式而非 inline 箭頭函式，才能在 node 環境下直接單元測試
 * （vitest 沒有 localStorage，無法測 createAdminCollection 本身）。
 */
export function migrateSettings(raw: Partial<SystemSettings>): SystemSettings {
  return { ...seedSettings(), ...raw }
}
```

- [ ] **Step 4: 補上 localStorage 遷移**

修改 `src/composables/admin/useAdminSettings.ts`：第 4 行的 import 加入 `migrateSettings`，第 6 行改為：

```ts
import { migrateSettings, seedSettings, type SystemSettings } from '@/src/mocks/admin-seed'

const settings = createAdminCollection<SystemSettings>('settings', seedSettings, migrateSettings)
```

`createAdminCollection` 的第三個參數簽章為 `migrate?: (raw: T) => T`，`migrateSettings` 接受 `Partial<SystemSettings>` 相容於此。

- [ ] **Step 4b: 補上遷移測試**

在 `src/utils/settings-validate.test.ts` 追加（`migrateSettings` 屬資料層，但它與設定欄位的增修是同一件事，放在同一個測試檔比為單一函式另開檔案好維護）：

```ts
describe('migrateSettings', () => {
  it('舊資料缺少額度欄位時補回預設值，不產生 NaN', () => {
    const legacy = {
      siteName: '舊站名',
      supportEmail: 'old@rentmate.tw',
      maintenanceMode: false,
      maintenanceMessage: '維護中',
      pageSize: 50,
      maxUploadMb: 20,
      defaultAiQuota: 5,
    }

    const migrated = migrateSettings(legacy)

    expect(migrated.platformGeminiTokenQuota).toBe(2_000_000)
    expect(migrated.platformVisionPageQuota).toBe(3_000)
    expect(migrated.quotaWarnPercent).toBe(80)
    expect(migrated.quotaCriticalPercent).toBe(95)
    // 使用者原本的設定不可被預設值覆蓋
    expect(migrated.siteName).toBe('舊站名')
    expect(migrated.pageSize).toBe(50)
  })
})
```

並在該檔 import 區加入：

```ts
import { migrateSettings } from '@/src/mocks/admin/settings'
```

- [ ] **Step 5: 新增驗證規則**

修改 `src/utils/settings-validate.ts`，在 `defaultAiQuota` 的檢查之後、`maintenanceMode` 的檢查之前插入：

```ts
  if (!Number.isFinite(settings.platformGeminiTokenQuota) || settings.platformGeminiTokenQuota < 0) {
    errors.platformGeminiTokenQuota = 'Gemini token 額度不可為負數'
  }

  if (!Number.isFinite(settings.platformVisionPageQuota) || settings.platformVisionPageQuota < 0) {
    errors.platformVisionPageQuota = 'Vision 頁數額度不可為負數'
  }

  if (
    !Number.isFinite(settings.quotaWarnPercent) ||
    settings.quotaWarnPercent < PERCENT_MIN ||
    settings.quotaWarnPercent > PERCENT_MAX
  ) {
    errors.quotaWarnPercent = '預警門檻需介於 1 到 100'
  } else if (
    Number.isFinite(settings.quotaCriticalPercent) &&
    settings.quotaWarnPercent >= settings.quotaCriticalPercent
  ) {
    // 黃燈門檻若不低於紅燈，狀態判定將永遠跳不到 warn
    errors.quotaWarnPercent = '預警門檻需小於告急門檻'
  }

  if (
    !Number.isFinite(settings.quotaCriticalPercent) ||
    settings.quotaCriticalPercent < PERCENT_MIN ||
    settings.quotaCriticalPercent > PERCENT_MAX
  ) {
    errors.quotaCriticalPercent = '告急門檻需介於 1 到 100'
  }
```

並在檔首常數區（`MAX_UPLOAD_MB_MAX` 那行之後）加入：

```ts
const PERCENT_MIN = 1
const PERCENT_MAX = 100
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npx vitest run src/utils/settings-validate.test.ts`
Expected: PASS

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 7: Commit**

```bash
git add src/mocks/admin/settings.ts src/composables/admin/useAdminSettings.ts src/utils/settings-validate.ts src/utils/settings-validate.test.ts
git commit -m "feat: 系統設定新增 AI 平台額度與預警門檻"
```

---

## Task 4: useAdminAiUsage composable

**Files:**
- Create: `src/composables/admin/useAdminAiUsage.ts`

- [ ] **Step 1: 實作 composable**

建立 `src/composables/admin/useAdminAiUsage.ts`：

```ts
import { computed } from 'vue'
import { createAdminCollection } from './useAdminStore'
import { adminSettings } from './useAdminSettings'
import {
  AI_PROVIDERS,
  seedAiUsage,
  type AiProvider,
  type AiProviderId,
  type AiUsageDaily,
} from '@/src/mocks/admin-seed'
import {
  dailyAverage,
  dateKey,
  daysUntilExhausted,
  monthToDateUnits,
  quotaStatus,
  type QuotaLevel,
} from '@/src/utils/admin-ai-usage'

const records = createAdminCollection<AiUsageDaily[]>('ai-usage', seedAiUsage)

export const quotaLevelLabels: Record<QuotaLevel, string> = {
  ok: '正常',
  warn: '注意',
  critical: '告急',
}

export interface ProviderUsage {
  provider: AiProvider
  used: number
  quota: number
  remaining: number
  percent: number
  dailyAvg: number
  daysLeft: number | null
  level: QuotaLevel
  /** 額度為 0 代表尚未設定，畫面顯示「未設定額度」而非百分比 */
  unset: boolean
}

function quotaFor(provider: AiProviderId): number {
  return provider === 'gemini'
    ? adminSettings.value.platformGeminiTokenQuota
    : adminSettings.value.platformVisionPageQuota
}

export function useAdminAiUsage() {
  const usages = computed<ProviderUsage[]>(() => {
    const today = new Date()

    return AI_PROVIDERS.map((provider) => {
      const quota = quotaFor(provider.id)
      const used = monthToDateUnits(records.value, provider.id, today)
      const dailyAvg = dailyAverage(records.value, provider.id, today)
      const remaining = Math.max(0, quota - used)

      return {
        provider,
        used,
        quota,
        remaining,
        percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0,
        dailyAvg: Math.round(dailyAvg),
        daysLeft: daysUntilExhausted(remaining, dailyAvg),
        level: quotaStatus({
          usedUnits: used,
          quota,
          dailyAvg,
          today,
          warnPercent: adminSettings.value.quotaWarnPercent,
          criticalPercent: adminSettings.value.quotaCriticalPercent,
        }),
        unset: quota <= 0,
      }
    })
  })

  const alerts = computed(() => usages.value.filter((usage) => usage.level !== 'ok'))
  const alertCount = computed(() => alerts.value.length)

  /** 近 30 天、由舊到新的日期序列，供趨勢圖使用 */
  const trendDates = computed(() => {
    const today = new Date()
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (29 - index))
      return dateKey(date)
    })
  })

  function seriesFor(provider: AiProviderId): number[] {
    return trendDates.value.map((date) => {
      const found = records.value.find(
        (record) => record.date === date && record.provider === provider,
      )
      return found?.units ?? 0
    })
  }

  return { records, usages, alerts, alertCount, trendDates, seriesFor }
}
```

- [ ] **Step 2: 驗證型別**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 3: Commit**

```bash
git add src/composables/admin/useAdminAiUsage.ts
git commit -m "feat: 新增 useAdminAiUsage composable"
```

---

## Task 5: 使用量頁與趨勢圖

**Files:**
- Create: `src/components/admin/UsageTrendChart.vue`
- Create: `src/pages/admin/ai-usage.vue`

- [ ] **Step 1: 建立趨勢圖元件**

建立 `src/components/admin/UsageTrendChart.vue`。註冊的 chart.js 模組與 `BarStatCard.vue` 不同（折線需要 `LineElement` 與 `PointElement`）：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Legend, Tooltip)

const props = defineProps<{
  labels: string[]
  series: Array<{ label: string; values: number[]; color: string }>
}>()

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: props.series.map((item) => ({
    label: item.label,
    data: item.values,
    borderColor: item.color,
    backgroundColor: item.color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.3,
  })),
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748B', font: { size: 10 }, maxTicksLimit: 10 },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(100, 116, 139, 0.12)' },
      ticks: { color: '#64748B', font: { size: 11 }, precision: 0 },
    },
  },
}))
</script>

<template>
  <div class="h-[16rem]">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
```

- [ ] **Step 2: 建立使用量頁**

建立 `src/pages/admin/ai-usage.vue`。進度條使用自繪的兩層 `div` 而非 `components/ui/progress`：後者的 `ProgressIndicator` 寫死 `bg-primary` 且無 props 可覆蓋顏色，而它已被三個既有頁面使用，改它會波及其他畫面。

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import UsageTrendChart from '@/src/components/admin/UsageTrendChart.vue'
import { quotaLevelLabels, useAdminAiUsage, type ProviderUsage } from '@/src/composables/admin/useAdminAiUsage'

const CHART_INDIGO = '#5660D6'
const CHART_TEAL = '#0E9488'

const { records, usages, trendDates, seriesFor } = useAdminAiUsage()

const showAllDays = ref(false)

const unitLabels = { token: 'tokens', page: '頁' } as const

const levelVariants = {
  ok: 'secondary',
  warn: 'outline',
  critical: 'destructive',
} as const

const barClasses = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  critical: 'bg-destructive',
} as const

const chartSeries = computed(() => [
  { label: 'Gemini API（tokens）', values: seriesFor('gemini'), color: CHART_INDIGO },
  { label: 'Google Vision（頁）', values: seriesFor('vision'), color: CHART_TEAL },
])

const chartLabels = computed(() => trendDates.value.map((date) => date.slice(5).replace('-', '/')))

const visibleRecords = computed(() => {
  const sorted = [...records.value].sort((a, b) => b.date.localeCompare(a.date))
  if (showAllDays.value) return sorted
  const cutoff = new Set(trendDates.value.slice(-7))
  return sorted.filter((record) => cutoff.has(record.date))
})

const providerLabels = computed(() =>
  Object.fromEntries(usages.value.map((usage) => [usage.provider.id, usage.provider.label])),
)

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW')
}

function daysLeftText(usage: ProviderUsage): string {
  if (usage.unset) return '—'
  if (usage.daysLeft === null) return '目前無消耗'
  return `${usage.daysLeft} 天`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">AI 使用量與額度</h1>
      <p class="mt-1 text-muted-foreground">
        監控平台向 AI 廠商購買的額度，並在耗盡前提出預警。額度上限與門檻於系統設定頁調整。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <Card v-for="usage in usages" :key="usage.provider.id" class="rounded-[1.5rem]">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-base">{{ usage.provider.label }}</CardTitle>
          <Badge :variant="levelVariants[usage.level]">{{ quotaLevelLabels[usage.level] }}</Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <p v-if="usage.unset" class="text-2xl font-black text-muted-foreground">未設定額度</p>
          <p v-else class="text-2xl font-black">
            {{ formatNumber(usage.used) }}
            <span class="text-base font-medium text-muted-foreground">
              / {{ formatNumber(usage.quota) }} {{ unitLabels[usage.provider.unit] }}
            </span>
          </p>

          <div v-if="!usage.unset" class="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full rounded-full transition-all"
              :class="barClasses[usage.level]"
              :style="{ width: `${usage.percent}%` }"
            />
          </div>

          <div class="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p class="text-muted-foreground">剩餘</p>
              <p class="font-semibold">{{ usage.unset ? '—' : formatNumber(usage.remaining) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">近 7 日平均</p>
              <p class="font-semibold">{{ formatNumber(usage.dailyAvg) }} / 日</p>
            </div>
            <div>
              <p class="text-muted-foreground">預估可撐</p>
              <p class="font-semibold">{{ daysLeftText(usage) }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>近 30 天用量趨勢</CardTitle>
        <CardDescription>兩個供應商的計量單位不同，僅供觀察各自的消耗速度變化。</CardDescription>
      </CardHeader>
      <CardContent>
        <UsageTrendChart :labels="chartLabels" :series="chartSeries" />
      </CardContent>
    </Card>

    <Card class="rounded-[1.5rem]">
      <CardHeader class="flex flex-row items-center justify-between space-y-0">
        <CardTitle>每日明細</CardTitle>
        <Button variant="outline" size="sm" @click="showAllDays = !showAllDays">
          {{ showAllDays ? '只顯示近 7 天' : '顯示全部 30 天' }}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="whitespace-nowrap">日期</TableHead>
              <TableHead class="whitespace-nowrap">供應商</TableHead>
              <TableHead class="whitespace-nowrap text-right">用量</TableHead>
              <TableHead class="whitespace-nowrap text-right">呼叫次數</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="record in visibleRecords" :key="`${record.date}-${record.provider}`">
              <TableCell class="whitespace-nowrap">{{ record.date }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ providerLabels[record.provider] }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(record.units) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(record.calls) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 3: 驗證型別**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/UsageTrendChart.vue src/pages/admin/ai-usage.vue
git commit -m "feat: 新增 AI 使用量頁與 30 天趨勢圖"
```

---

## Task 6: 路由與權限

**Files:**
- Modify: `src/router/index.ts:55`
- Modify: `src/utils/admin-rbac.ts:36`
- Modify: `src/utils/admin-rbac.test.ts:16`
- Modify: `src/composables/admin/useAdminRbac.ts`

- [ ] **Step 1: 先改測試的權限矩陣**

修改 `src/utils/admin-rbac.test.ts` 第 16 行：

```ts
  '/admin/ai-usage': { super: true, admin: true },
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/utils/admin-rbac.test.ts`
Expected: FAIL，`/admin/ai-usage` 在導覽設定中不存在

- [ ] **Step 3: 改導覽項目**

修改 `src/utils/admin-rbac.ts` 第 36 行：

```ts
      { label: 'AI 使用量', path: '/admin/ai-usage', roles: ['super', 'admin'] },
```

- [ ] **Step 4: 改圖示 map**

修改 `src/composables/admin/useAdminRbac.ts`：import 區塊把 `Sparkles` 換成 `Gauge`（計量語意較貼切），並把 map 中該行改為：

```ts
  '/admin/ai-usage': Gauge,
```

import 區塊改為：

```ts
import {
  CreditCard,
  Gauge,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Users,
} from 'lucide-vue-next'
```

- [ ] **Step 5: 改路由**

修改 `src/router/index.ts` 第 55 行：

```ts
        { path: 'ai-usage', component: () => import('@/src/pages/admin/ai-usage.vue') },
```

在其下一行加入舊路徑轉址，避免既有書籤直接落到 404 轉址（此檔第 54 行已有 `notifications` 的相同寫法可參照）：

```ts
        { path: 'ai-quality', redirect: '/admin/ai-usage' },
```

- [ ] **Step 6: 執行測試確認通過**

Run: `npx vitest run src/utils/admin-rbac.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/router/index.ts src/utils/admin-rbac.ts src/utils/admin-rbac.test.ts src/composables/admin/useAdminRbac.ts
git commit -m "feat: 導覽與路由改指向 AI 使用量頁"
```

---

## Task 7: 總覽頁改接用量資料

**Files:**
- Modify: `src/pages/admin/index.vue`

此步驟後 `useAdminAiQuality` 才會失去最後一個使用者，Task 8 才刪得掉。

- [ ] **Step 1: 換 import 與資料來源**

修改 `src/pages/admin/index.vue` 第 19 行，把

```ts
import { useAdminAiQuality } from '@/src/composables/admin/useAdminAiQuality'
```

改為

```ts
import { useAdminAiUsage } from '@/src/composables/admin/useAdminAiUsage'
```

第 32 行

```ts
const { records, needsReviewCount } = useAdminAiQuality()
```

改為

```ts
const { usages, alerts, alertCount } = useAdminAiUsage()
```

- [ ] **Step 2: 換圖表資料**

刪除 `ratingLabels`、`ratingColors`、`ratingValues` 三個宣告（原第 61-72 行），改為：

```ts
const usageLabels = computed(() => usages.value.map((usage) => usage.provider.label))

const usageValues = computed(() => usages.value.map((usage) => usage.percent))

const usageColors = computed(() =>
  usages.value.map((usage) =>
    usage.level === 'critical' ? CHART_RED : usage.level === 'warn' ? CHART_AMBER : CHART_INDIGO,
  ),
)
```

`CHART_RED`、`CHART_AMBER`、`CHART_INDIGO` 已定義於檔首第 25-28 行，不需新增。若 `CHART_INDIGO_MUTED` 因此不再被使用，一併刪除其宣告，否則 oxlint 會報未使用變數。

- [ ] **Step 3: 換待辦佇列**

把 `queueItems`（原第 100-112 行）改為：

```ts
const queueItems = computed(() =>
  alerts.value.map((usage) => ({
    id: `quota-${usage.provider.id}`,
    label:
      usage.daysLeft === null
        ? `${usage.provider.label} 額度告急（已用 ${usage.percent}%）`
        : `${usage.provider.label} 額度告急（預估 ${usage.daysLeft} 天後用盡）`,
    to: '/admin/ai-usage',
    tag: 'AI額度',
  })),
)
```

- [ ] **Step 4: 換圖表卡**

把 template 中的 `BarStatCard`（原第 148-156 行）改為：

```vue
      <BarStatCard
        title="AI 額度用量"
        to="/admin/ai-usage"
        :labels="usageLabels"
        :values="usageValues"
        :colors="usageColors"
        :corner-text="alertCount > 0 ? `${alertCount} 項告急` : '額度充足'"
        :corner-variant="alertCount > 0 ? 'destructive' : 'secondary'"
      />
```

- [ ] **Step 5: 驗證**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

Run: `grep -rn "useAdminAiQuality" src/pages src/components`
Expected: 無輸出（只剩 composable 檔本身尚未刪除）

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/index.vue
git commit -m "feat: 後台總覽改顯示 AI 額度用量與告急佇列"
```

---

## Task 8: 移除 ai-quality 與系統設定表單

**Files:**
- Delete: `src/pages/admin/ai-quality.vue`
- Delete: `src/mocks/admin/ai-quality.ts`
- Delete: `src/composables/admin/useAdminAiQuality.ts`
- Modify: `src/mocks/admin-seed.ts`
- Modify: `src/pages/admin/settings.vue`
- Modify: `docs/superpowers/specs/2026-08-02-admin-console-revamp-design.md`

- [ ] **Step 1: 在系統設定頁加入額度表單**

修改 `src/pages/admin/settings.vue`，在「使用限制」`</Card>` 之後、`<div class="flex items-center justify-end gap-3">` 之前插入：

```vue
    <Card class="rounded-[1.5rem]">
      <CardHeader>
        <CardTitle>AI 平台額度</CardTitle>
        <CardDescription>
          平台向 AI 廠商購買的每月額度與預警門檻，用於 AI 使用量頁的告急判定。
          與上方「AI 每日配額預設值」（單一使用者的額度）無關。
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <Label for="platformGeminiTokenQuota">Gemini 每月 token 上限</Label>
          <Input
            id="platformGeminiTokenQuota"
            v-model.number="draft.platformGeminiTokenQuota"
            type="number"
            min="0"
          />
          <p v-if="errors.platformGeminiTokenQuota" class="text-sm text-destructive">
            {{ errors.platformGeminiTokenQuota }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="platformVisionPageQuota">Vision 每月頁數上限</Label>
          <Input
            id="platformVisionPageQuota"
            v-model.number="draft.platformVisionPageQuota"
            type="number"
            min="0"
          />
          <p v-if="errors.platformVisionPageQuota" class="text-sm text-destructive">
            {{ errors.platformVisionPageQuota }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="quotaWarnPercent">預警門檻（%）</Label>
          <Input
            id="quotaWarnPercent"
            v-model.number="draft.quotaWarnPercent"
            type="number"
            min="1"
            max="100"
          />
          <p v-if="errors.quotaWarnPercent" class="text-sm text-destructive">
            {{ errors.quotaWarnPercent }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="quotaCriticalPercent">告急門檻（%）</Label>
          <Input
            id="quotaCriticalPercent"
            v-model.number="draft.quotaCriticalPercent"
            type="number"
            min="1"
            max="100"
          />
          <p v-if="errors.quotaCriticalPercent" class="text-sm text-destructive">
            {{ errors.quotaCriticalPercent }}
          </p>
        </div>
      </CardContent>
    </Card>
```

- [ ] **Step 2: 刪除舊檔並移除 export**

```bash
git rm src/pages/admin/ai-quality.vue src/mocks/admin/ai-quality.ts src/composables/admin/useAdminAiQuality.ts
```

修改 `src/mocks/admin-seed.ts`，刪除該行：

```ts
export * from './admin/ai-quality'
```

- [ ] **Step 3: 同步改版設計文件**

修改 `docs/superpowers/specs/2026-08-02-admin-console-revamp-design.md`：

- 第 141 行：`| AI 品質監控 | \`/admin/ai-quality\` | ✅ | ✅ |` → `| AI 使用量 | \`/admin/ai-usage\` | ✅ | ✅ |`
- 第 150 行：`內容與通知  內容與通知 · AI 品質監控` → `內容與通知  內容與通知 · AI 使用量`
- 第 300 行：模組清單中的 `aiQuality` → `aiUsage`
- 第 325-326 行：`GET /api/admin/ai-quality` → `GET /api/admin/ai-usage`；刪除 `PATCH /api/admin/ai-quality/{id}/review`（用量頁沒有複核動作），改為 `GET /api/admin/ai-usage/daily`

- [ ] **Step 4: 全面驗證**

Run: `grep -rn "ai-quality\|AiQuality\|AiOutputRecord\|seedAiOutputs" src docs`
Expected: 僅剩 `src/router/index.ts` 的轉址那一行

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

Run: `npm test`
Expected: 全數通過

Run: `npx oxlint .`
Expected: 無錯誤

- [ ] **Step 5: 瀏覽器驗證**

啟動 `npm run dev`，於 1280px 與 1440px 檢查：

1. `/admin/ai-usage` 兩張供應商卡片正常顯示，Gemini 因 seed 的暴衝情境應呈現「注意」或「告急」
2. 趨勢圖兩條線正常繪製，最近 3 天 Gemini 明顯上揚
3. 「顯示全部 30 天」切換後表格為 60 列
4. `/admin` 待辦佇列出現「Gemini API 額度告急（預估 N 天後用盡）」，點擊可到用量頁
5. `/admin/settings` 調低 Gemini 額度並儲存後，用量頁狀態立即變為告急
6. 直接輸入 `/admin/ai-quality` 應轉址到 `/admin/ai-usage`
7. 瀏覽器 console 無錯誤

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 以 AI 使用量取代 AI 品質監控並補上額度設定表單"
```
