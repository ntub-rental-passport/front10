# 裝置策略實作計畫（手機／桌機邊界 + 點交存證可信度）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「哪些介面在手機上、哪些只在電腦上」這條線實作出來，並修掉點交存證「看起來有品質把關、實際沒有」的可信度漏洞。

**Architecture:** 四個互相獨立的 Phase，每個 Phase 自己就能跑、能測、能交付。Phase 1 建立一個純函式的裝置判斷工具（`src/utils/device-policy.ts`），Phase 2 會重複使用它。判斷依據是 `(pointer: coarse)` + 視窗寬度兩者同時成立，不用 User-Agent。Phase 2 跨前後端：前端停止編造品質分數並改為上報照片來源，後端把來源與品質落地並在存證資料裡標示可信度。

**Tech Stack:** Vue 3.5 + TypeScript + Tailwind v4 + vue-router 4（前端）、FastAPI + SQLAlchemy + MySQL（後端）、vitest 3（前端測試）、unittest + FastAPI TestClient + in-memory SQLite（後端測試）。

---

## 執行前必讀：這個專案的測試硬限制

這些不是建議，是事實。寫測試前先讀完，否則你會寫出跑不起來的測試。

1. **vitest 跑在 Node，沒有 DOM。** `vite.config.ts` 的 `test.environment` 是 `'node'`，而且 `jsdom` / `happy-dom` **都沒有安裝**。
2. **`@vue/test-utils` 沒有安裝。** 所以 **`.vue` 元件無法做單元測試**。任何需要測的邏輯都必須抽到 `.ts` 檔案裡再測。`.vue` 的修改靠型別檢查 + 瀏覽器實際確認。
3. **測試瀏覽器 API 的既有作法**是 `vi.stubGlobal` 餵假的 `window`，範本看 `src/composables/useTheme.test.ts`（它就是這樣測 `matchMedia`）。
4. **測試服務層的既有作法**是 `vi.mock`，範本看 `src/composables/useHandover.test.ts`。它也 mock 掉 `onMounted`，因為 composable 在測試裡沒有元件實例。
5. **測試檔只會從 `src/**/*.test.ts` 和 `server/**/*.test.js` 被收集**（見 `vite.config.ts` 的 `test.include`）。放在別處的測試不會被跑。

### 已驗證的指令與基準

```bash
npm run test
```
開工前的基準：**97 個測試檔、1162 passed、1 skipped、約 3.3 秒**。開始前先跑一次確認是綠的。

```bash
npm run lint:types
```
型別檢查（`vue-tsc --noEmit`），改完 `.vue` 一定要跑。

```bash
cd backend && ../.venv/bin/python -m unittest tests.test_inspection -v
```
後端點交測試，已驗證可跑：**7 tests OK**。注意三件事：必須從 `backend/` 目錄執行（`import` 是 `from db import database` 這種相對 backend 根目錄的寫法）、必須用專案的 `.venv`（系統 python3 沒有 fastapi）、會噴一堆 `datetime.utcnow()` 的 DeprecationWarning，那是既有狀況不是你弄壞的。

---

## 這份計畫的來源：已確認的決策

這些是和使用者逐題確認過的結論，**不要在實作時重新發明**：

| # | 決策 | 來源 |
|---|---|---|
| D1 | 手機與桌機的「可用頁面集合」和「底部導航格子」是兩件不同的事。不在導航裡的頁面仍然可以從首頁連結進入 | Q7 |
| D2 | 後台 `/admin/*` **全部**在手機上攔截，包含 `/staff-login`。不做按頁例外 | Q3、Q11 |
| D3 | 攔截依據：`(pointer: coarse)` **且** 視窗寬度 < 1280px，兩者同時成立才擋。不用 User-Agent | Q11 |
| D4 | 攔截實作在 layout 層，不是 `router.beforeEach`（guard 只在導覽時跑一次，轉向與縮放不會重算） | Q11 |
| D5 | 被攔截時顯示全畫面說明 + 複製網址 + 登出，**不 redirect**，保留 session | Q12 |
| D6 | 房東端維持現狀：不新增攔截，也不再投資把 finance／contracts／properties／maintenance 的寬表格卡片化 | Q2 |
| D7 | 整條合約流程（掃描、校對、存檔、分析）桌機優先。合約 OCR 從底部導航移除 | Q9(a) |
| D8 | 報修留在手機清單（它是全站手機適配最好的一頁，且上週才接上後端） | Q8 |
| D9 | 底部導航 6 格：首頁、點交、清運、報修、備忘、帳戶。字級從 `text-[9px]` 提到 `text-[11px]` | Q16 |
| D10 | 桌機的點交頁可以進入，但**只給上傳既有照片，不開 webcam** | Q4 |
| D11 | 檔案上傳**不加** `capture` 屬性強制當場拍 | Q6 |
| D12 | 改為記錄照片來源（`camera` / `file`）+ 把真實品質分數落地，低於門檻在存證資料上標示。**檔案上傳的品質一律為 null，不編造** | Q14(c) |

### 明確不做的事

- **不要**替合約頁、補助頁、備忘錄、分析頁加裝置攔截。D2 只涵蓋後台。D7 的「桌機優先」意思是不投資手機適配，**不是**擋住。
- **不要**重寫 `notes.css`、`SubsidyGuide.vue`、`contract/analysis.vue` 的桌機優先 CSS。那是 5000+ 行，明確排除在範圍外。
- **不要**動 `contract/analysis.vue` 那個 `resize:both` 的浮動法律諮詢面板。
- **不要**為房東建立點交審閱頁或放寬 inspection 的後端權限。見文末「擱置的決策」。
- **不要**新增 `capture="environment"`。
- **不要**在租客端新增 header（詳見 Phase 3 的說明）。

---

## 檔案結構

**新增**

| 檔案 | 責任 |
|---|---|
| `src/utils/device-policy.ts` | 純函式：從一組裝置快照判斷是否為桌面環境、是否該攔截後台、是否支援現場拍攝。無副作用、不碰 `window` |
| `src/utils/device-policy.test.ts` | 上述純函式的測試 |
| `src/composables/useDeviceGate.ts` | 把 `device-policy` 接上真實的 `matchMedia` / `resize`，提供 reactive 的 `blocked`。工廠函式 `createDeviceGate(win)` 可注入假 window 以供測試 |
| `src/composables/useDeviceGate.test.ts` | 上述的測試，用 `vi.stubGlobal` 模式 |
| `src/components/DesktopOnlyNotice.vue` | 被攔截時的全畫面說明（說明 + 複製網址 + 登出） |
| `src/composables/useNavigation.test.ts` | 底部導航組成的測試 |
| `backend/migrations/20261002_inspection_capture_provenance.sql` | 為 `inspection_records` 增加 `capture_source` 與 `capture_quality` |

**修改**

| 檔案 | 改什麼 |
|---|---|
| `src/components/layouts/AdminLayout.vue:142` | 外層加裝置攔截 |
| `src/pages/auth/staff-login.vue:133` | 同上（它用 AuthLayout，不在 AdminLayout 底下） |
| `src/components/handover/SmartCaptureCamera.vue` | `CapturePayload` 加 `source`、`quality` 改為可為 null；檔案路徑停止回報假滿分；桌機不啟動 webcam |
| `src/composables/useHandover.ts:14,148` | `HandoverEvidence` 加來源與品質欄位；`addEvidence` 參數與請求 body 加上來源與品質 |
| `src/pages/handover/baseline.vue:149,160` | 兩條上傳路徑都要標來源 |
| `src/pages/handover/checkout.vue:107` | 唯一的上傳路徑要標來源 |
| `backend/db/models.py:245` | `InspectionRecord` 加兩個欄位 |
| `backend/routers/inspection.py:81,215` | `PhotoRequest` 收來源與品質、`upload_photo` 落地、`evidence_json` 輸出可信度 |
| `backend/tests/test_inspection.py` | 新增來源與品質的測試 |
| `src/composables/useNavigation.ts:37` | 底部導航移除合約 OCR |
| `src/components/layouts/AppLayout.vue:55,149,158` | `h-screen` → `h-[100dvh]`、導航字級、safe-area |
| `src/pages/garbage/garbage.css:735` | 站點詳情的 z-index 與底部距離 |
| `src/pages/account.vue:1138` | toast 的底部距離 |

---

## Phase 1：後台桌面限定攔截

**獨立交付物：** 在手機或窄螢幕觸控裝置上開 `/admin/*` 或 `/staff-login`，看到一張說明畫面而不是壞掉的表格；在桌機上（含把視窗縮小）行為完全不變。

### Task 1.1：裝置判斷的純函式

**Files:**
- Create: `src/utils/device-policy.ts`
- Test: `src/utils/device-policy.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `src/utils/device-policy.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_MIN_WIDTH,
  isDesktopEnvironment,
  shouldBlockAdminSurface,
  supportsFieldCapture,
} from './device-policy'

describe('isDesktopEnvironment', () => {
  it('treats a narrow touch device as not desktop', () => {
    expect(isDesktopEnvironment({ coarsePointer: true, viewportWidth: 390 })).toBe(false)
  })

  it('treats a wide touch device as desktop so landscape tablets keep working', () => {
    expect(isDesktopEnvironment({ coarsePointer: true, viewportWidth: 1366 })).toBe(true)
  })

  it('treats a narrow mouse-driven window as desktop so a shrunk browser is not misjudged', () => {
    expect(isDesktopEnvironment({ coarsePointer: false, viewportWidth: 800 })).toBe(true)
  })

  it('uses 1280 as the boundary, inclusive', () => {
    expect(DESKTOP_MIN_WIDTH).toBe(1280)
    expect(isDesktopEnvironment({ coarsePointer: true, viewportWidth: 1280 })).toBe(true)
    expect(isDesktopEnvironment({ coarsePointer: true, viewportWidth: 1279 })).toBe(false)
  })
})

describe('shouldBlockAdminSurface', () => {
  it('blocks exactly when the environment is not desktop', () => {
    expect(shouldBlockAdminSurface({ coarsePointer: true, viewportWidth: 390 })).toBe(true)
    expect(shouldBlockAdminSurface({ coarsePointer: false, viewportWidth: 390 })).toBe(false)
  })
})

describe('supportsFieldCapture', () => {
  it('offers the live camera only on touch devices, regardless of width', () => {
    expect(supportsFieldCapture({ coarsePointer: true, viewportWidth: 390 })).toBe(true)
    expect(supportsFieldCapture({ coarsePointer: true, viewportWidth: 1366 })).toBe(true)
    expect(supportsFieldCapture({ coarsePointer: false, viewportWidth: 1920 })).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `npx vitest run src/utils/device-policy.test.ts`
Expected: FAIL，錯誤訊息是找不到模組 `./device-policy`

- [ ] **Step 3: 寫最小實作**

建立 `src/utils/device-policy.ts`：

```ts
/*
 * 後台能改使用者狀態、審補助、看稽核日誌，這些操作只在桌面環境進行。
 *
 * 判斷用「觸控指標」加「視窗寬度」兩個條件同時成立，不用 User-Agent：
 *   - 只看寬度，會誤擋把瀏覽器視窗縮小的桌機使用者，而他們看不出被擋的原因。
 *   - 只看 User-Agent，擋不準（iPadOS Safari 預設回報桌面 UA），而且使用者
 *     無法自救 —— 他改不了 UA。
 *   - 觸控裝置的 pointer 是 coarse，桌機縮窗仍然是 fine，所以兩者同時成立
 *     才真的代表「人在小螢幕觸控裝置上」。
 */

/**
 * 沿用 AdminLayout 既有的 xl 斷點：AdminSidebar 在 xl 以下本來就會收成抽屜
 * （見 components/admin/AdminSidebar.vue 的 `hidden ... xl:flex`）。
 * 不另外發明一個數字，省掉兩套斷點不一致的 bug。
 */
export const DESKTOP_MIN_WIDTH = 1280

export interface DeviceSnapshot {
  /** `(pointer: coarse)` 是否成立，也就是主要指標裝置是手指而非滑鼠 */
  coarsePointer: boolean
  viewportWidth: number
}

export function isDesktopEnvironment(snapshot: DeviceSnapshot): boolean {
  if (!snapshot.coarsePointer) return true
  return snapshot.viewportWidth >= DESKTOP_MIN_WIDTH
}

export function shouldBlockAdminSurface(snapshot: DeviceSnapshot): boolean {
  return !isDesktopEnvironment(snapshot)
}

/**
 * 現場拍攝（開後鏡頭）只在觸控裝置上提供。
 *
 * 筆電的 webcam 技術上也能通過 getUserMedia，但它拍不到房間角落，而且
 * SmartCaptureCamera 的傾角偵測靠 DeviceOrientation，桌機永遠測不到角度 ——
 * 一張畫質差又沒有水平資訊的照片，存證效力比使用者自己用手機拍完上傳更低。
 * 所以桌機走上傳，不開鏡頭。寬度不納入判斷：平板橫向仍然該用鏡頭拍。
 */
export function supportsFieldCapture(snapshot: DeviceSnapshot): boolean {
  return snapshot.coarsePointer
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `npx vitest run src/utils/device-policy.test.ts`
Expected: PASS，11 個 assertion 全綠

- [ ] **Step 5: Commit**

```bash
git add src/utils/device-policy.ts src/utils/device-policy.test.ts
git commit -m "feat: 新增裝置判斷純函式，後台限桌面的依據"
```

### Task 1.2：把判斷接上真實的 matchMedia

**Files:**
- Create: `src/composables/useDeviceGate.ts`
- Test: `src/composables/useDeviceGate.test.ts`

設計重點：核心是 `createDeviceGate(win)` 這個**接受注入 window 的工廠函式**，所以測試不需要 Vue 的元件實例，也不需要 DOM。`useAdminDeviceGate()` 只是薄薄一層把它接上真實 `window` 並在卸載時清理。

- [ ] **Step 1: 寫失敗的測試**

建立 `src/composables/useDeviceGate.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDeviceGate } from './useDeviceGate'

type Listener = (event: { matches: boolean }) => void

/**
 * 假的 window：只實作 createDeviceGate 真正會碰的東西。
 * 作法對齊 useTheme.test.ts —— vitest 跑在 Node，沒有真的 window。
 */
function fakeWindow(options: { coarse: boolean; width: number }) {
  const pointerListeners: Listener[] = []
  const resizeListeners: (() => void)[] = []
  const state = { coarse: options.coarse, width: options.width }
  return {
    win: {
      innerWidth: state.width,
      matchMedia: (query: string) => ({
        matches: query === '(pointer: coarse)' ? state.coarse : false,
        addEventListener: (_type: string, listener: Listener) => pointerListeners.push(listener),
        removeEventListener: vi.fn(),
      }),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'resize') resizeListeners.push(listener)
      },
      removeEventListener: vi.fn(),
    },
    resizeTo(width: number) {
      state.width = width
      this.win.innerWidth = width
      resizeListeners.forEach((listener) => listener())
    },
    changePointer(coarse: boolean) {
      state.coarse = coarse
      pointerListeners.forEach((listener) => listener({ matches: coarse }))
    },
  }
}

describe('createDeviceGate', () => {
  it('blocks immediately on a narrow touch device', () => {
    const browser = fakeWindow({ coarse: true, width: 390 })
    const gate = createDeviceGate(browser.win)
    expect(gate.blocked.value).toBe(true)
    gate.stop()
  })

  it('does not block a desktop browser, even a narrow one', () => {
    const browser = fakeWindow({ coarse: false, width: 700 })
    const gate = createDeviceGate(browser.win)
    expect(gate.blocked.value).toBe(false)
    gate.stop()
  })

  it('re-evaluates on resize, so rotating a tablet unblocks it', () => {
    const browser = fakeWindow({ coarse: true, width: 1024 })
    const gate = createDeviceGate(browser.win)
    expect(gate.blocked.value).toBe(true)
    browser.resizeTo(1366)
    expect(gate.blocked.value).toBe(false)
    gate.stop()
  })

  it('re-evaluates when the pointer type changes', () => {
    const browser = fakeWindow({ coarse: true, width: 800 })
    const gate = createDeviceGate(browser.win)
    expect(gate.blocked.value).toBe(true)
    browser.changePointer(false)
    expect(gate.blocked.value).toBe(false)
    gate.stop()
  })

  it('never blocks when there is no window at all', () => {
    const gate = createDeviceGate(undefined)
    expect(gate.blocked.value).toBe(false)
    gate.stop()
  })
})
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `npx vitest run src/composables/useDeviceGate.test.ts`
Expected: FAIL，找不到模組 `./useDeviceGate`

- [ ] **Step 3: 寫最小實作**

建立 `src/composables/useDeviceGate.ts`：

```ts
import { onUnmounted, ref, type Ref } from 'vue'
import { shouldBlockAdminSurface, supportsFieldCapture, type DeviceSnapshot } from '@/src/utils/device-policy'

const POINTER_QUERY = '(pointer: coarse)'

/** createDeviceGate 真正需要 window 提供的能力，只列這些方便測試時替換 */
export interface GateWindow {
  innerWidth: number
  matchMedia?: (query: string) => {
    matches: boolean
    addEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void
    removeEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void
  }
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export interface DeviceGate {
  blocked: Ref<boolean>
  fieldCapture: Ref<boolean>
  stop: () => void
}

export function readSnapshot(win: GateWindow | undefined): DeviceSnapshot {
  if (!win) return { coarsePointer: false, viewportWidth: Number.MAX_SAFE_INTEGER }
  return {
    coarsePointer: win.matchMedia ? win.matchMedia(POINTER_QUERY).matches : false,
    viewportWidth: win.innerWidth,
  }
}

/**
 * 攔截放在 layout 層而不是 router guard：guard 只在導覽那一刻跑一次，
 * 使用者把平板轉成橫向、或把桌機視窗拉大，都不會重新判斷。
 */
export function createDeviceGate(win: GateWindow | undefined): DeviceGate {
  const blocked = ref(false)
  const fieldCapture = ref(false)

  function evaluate(): void {
    const snapshot = readSnapshot(win)
    blocked.value = shouldBlockAdminSurface(snapshot)
    fieldCapture.value = supportsFieldCapture(snapshot)
  }

  evaluate()

  if (!win) return { blocked, fieldCapture, stop: () => {} }

  const query = win.matchMedia?.(POINTER_QUERY)
  query?.addEventListener?.('change', evaluate)
  win.addEventListener('resize', evaluate)

  return {
    blocked,
    fieldCapture,
    stop: () => {
      query?.removeEventListener?.('change', evaluate)
      win.removeEventListener('resize', evaluate)
    },
  }
}

/** 後台與員工登入頁用的版本：接上真實 window，元件卸載時自動清掉監聽 */
export function useAdminDeviceGate(): Pick<DeviceGate, 'blocked'> {
  const gate = createDeviceGate(typeof window === 'undefined' ? undefined : (window as unknown as GateWindow))
  onUnmounted(gate.stop)
  return { blocked: gate.blocked }
}

/** 點交頁用的版本：只關心這台裝置該不該開現場鏡頭 */
export function useFieldCaptureSupport(): Pick<DeviceGate, 'fieldCapture'> {
  const gate = createDeviceGate(typeof window === 'undefined' ? undefined : (window as unknown as GateWindow))
  onUnmounted(gate.stop)
  return { fieldCapture: gate.fieldCapture }
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `npx vitest run src/composables/useDeviceGate.test.ts`
Expected: PASS，5 個測試全綠

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDeviceGate.ts src/composables/useDeviceGate.test.ts
git commit -m "feat: 新增 reactive 裝置判斷 composable，resize 與指標變化都會重算"
```

### Task 1.3：被攔截時的說明畫面

**Files:**
- Create: `src/components/DesktopOnlyNotice.vue`

這支沒有單元測試 —— `@vue/test-utils` 沒安裝，`.vue` 測不了。靠 `npm run lint:types` 與瀏覽器確認。

- [ ] **Step 1: 建立元件**

建立 `src/components/DesktopOnlyNotice.vue`：

```vue
<script setup lang="ts">
/*
 * 後台只在桌面環境操作。這裡刻意不 redirect 到首頁：
 * 使用者要找的東西就在這個網址底下，把他丟走只會讓他以為系統壞了。
 * session 也刻意保留 —— 他在電腦上開同一個網址就能直接接上。
 */
import { ref } from 'vue'
import { Monitor, Copy, Check, LogOut } from 'lucide-vue-next'
import { signOut } from '@/src/composables/useAuth'

const copied = ref(false)
const copyFailed = ref(false)

async function copyCurrentUrl(): Promise<void> {
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    // 非 HTTPS 或使用者拒絕權限時 clipboard 會丟錯，讓他自己複製網址列
    copyFailed.value = true
  }
}
</script>

<template>
  <div class="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12">
    <div class="w-full max-w-md text-center">
      <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Monitor class="h-7 w-7 text-muted-foreground" />
      </div>

      <h1 class="mb-3 text-xl font-semibold text-foreground">後台僅支援桌面瀏覽器</h1>

      <p class="mb-2 text-sm leading-relaxed text-muted-foreground">
        管理後台可以變更使用者狀態、審核補助申請與查閱稽核紀錄，這些操作只在桌面環境進行。
      </p>
      <p class="mb-8 text-sm leading-relaxed text-muted-foreground">
        請在電腦上開啟同一個網址，你目前的登入狀態會保留。
      </p>

      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          @click="copyCurrentUrl"
        >
          <component :is="copied ? Check : Copy" class="h-4 w-4" />
          {{ copied ? '已複製網址' : '複製目前網址' }}
        </button>
        <p v-if="copyFailed" class="text-xs text-muted-foreground">
          無法自動複製，請直接從瀏覽器網址列複製。
        </p>

        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          @click="signOut()"
        >
          <LogOut class="h-4 w-4" />
          登出
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 確認型別通過**

Run: `npm run lint:types`
Expected: 沒有錯誤輸出。如果 `signOut` 的簽名對不上，開 `src/composables/useAuth.ts` 查它實際的參數再調整呼叫。

- [ ] **Step 3: Commit**

```bash
git add src/components/DesktopOnlyNotice.vue
git commit -m "feat: 新增後台桌面限定的說明畫面"
```

### Task 1.4：接進 AdminLayout

**Files:**
- Modify: `src/components/layouts/AdminLayout.vue:142`

- [ ] **Step 1: 在 script 區塊加入 gate**

在 `AdminLayout.vue` 的 `<script setup>` 既有 import 之後加入：

```ts
import DesktopOnlyNotice from '@/src/components/DesktopOnlyNotice.vue'
import { useAdminDeviceGate } from '@/src/composables/useDeviceGate'

const { blocked: deviceBlocked } = useAdminDeviceGate()
```

- [ ] **Step 2: 包住 template 的最外層**

`AdminLayout.vue:142` 現在是：

```html
  <div class="flex min-h-screen bg-[linear-gradient(180deg,_var(--background),_var(--muted))]">
```

把它改成（注意 `v-else`，以及對應的結尾要補上 `</template>` 前的結構不變）：

```html
  <DesktopOnlyNotice v-if="deviceBlocked" />

  <div v-else class="flex min-h-screen bg-[linear-gradient(180deg,_var(--background),_var(--muted))]">
```

因為 `<template>` 底下現在有兩個根節點（`v-if` / `v-else` 是一對，Vue 3 允許多根節點），不需要額外包一層 div。`AdminLayout.vue:270` 與 `:279` 那兩個 `xl:hidden` 的抽屜節點如果在同一個 `<template>` 的根層，請確認它們跟著留在 `v-else` 的那個 div 內部；若原本就在 div 外面，給它們也加上 `v-if="!deviceBlocked"`。先用編輯器確認結構再動手。

- [ ] **Step 3: 確認型別通過**

Run: `npm run lint:types`
Expected: 沒有錯誤輸出

- [ ] **Step 4: 在瀏覽器確認**

啟動 dev server 後，用瀏覽器的裝置模擬（必須同時模擬觸控，不只改寬度，因為判斷看的是 `pointer: coarse`）開 `/admin`：
- 模擬 iPhone（觸控 + 390px）→ 看到說明畫面
- 桌機把視窗縮到 800px（滑鼠）→ 後台正常顯示，**不**被擋
- 模擬 iPad 橫向（觸控 + 1366px）→ 後台正常顯示

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/AdminLayout.vue
git commit -m "feat: 後台在窄螢幕觸控裝置上改顯示桌面限定說明"
```

### Task 1.5：接進員工登入頁

**Files:**
- Modify: `src/pages/auth/staff-login.vue:133`

`/staff-login` 用的是 `AuthLayout`（見 `staff-login.vue:4`），**不在 AdminLayout 底下**，所以 Task 1.4 不會蓋到它。少了這一步，使用者可以在手機上登入後台然後卡在說明畫面，體驗更差。

- [ ] **Step 1: 在 script 區塊加入 gate**

在 `staff-login.vue` 的 `<script setup>` 既有 import 之後加入：

```ts
import DesktopOnlyNotice from '@/src/components/DesktopOnlyNotice.vue'
import { useAdminDeviceGate } from '@/src/composables/useDeviceGate'

const { blocked: deviceBlocked } = useAdminDeviceGate()
```

- [ ] **Step 2: 包住 template**

`staff-login.vue:133` 的 `<AuthShell ...>` 開頭前加上說明畫面，並讓 `AuthShell` 只在未被攔截時渲染：

```html
  <DesktopOnlyNotice v-if="deviceBlocked" />

  <AuthShell v-else content-width-class="max-w-lg" footer-note="此入口僅供經授權的 RentMate 內部人員使用。">
```

保持 `AuthShell` 原本的其餘屬性與內容不動。

- [ ] **Step 3: 確認型別通過**

Run: `npm run lint:types`
Expected: 沒有錯誤輸出

- [ ] **Step 4: 跑完整測試確認沒弄壞既有的東西**

Run: `npm run test`
Expected: 97 個以上的測試檔全綠（新增了兩個測試檔，所以會是 99）

- [ ] **Step 5: Commit**

```bash
git add src/pages/auth/staff-login.vue
git commit -m "feat: 員工登入頁同樣限桌面，避免手機登入後卡在攔截畫面"
```

---

## Phase 2：點交存證的來源與品質落地

**為什麼要做這個 Phase。** 現在的狀況是：

1. `baseline.vue:149` 的 `processPhotoWithAI` 只取 `payload.dataUrl`，**`payload.quality` 整個被丟掉** —— HUD 每一幀算的亮度、清晰度、傾角沒有任何一個數字離開前端。
2. `SmartCaptureCamera.vue:364` 對相簿挑來的照片寫死 `brightness: 128`（中點）、`sharpness: 100`（滿分）、`isLevel: true` —— **相簿照片拿到的分數比真實現場拍攝更完美**。
3. `baseline.vue:160` 的 `capturePhoto()` 另外動態建一個 `<input type="file">`，根本不經過 SmartCaptureCamera，所以相簿上傳有兩個入口。
4. `checkout.vue` **完全沒有相機路徑** —— 它只有 `capturePhoto()` 一個檔案選擇器（`checkout.vue:107`），SmartCaptureCamera 只掛在 baseline。退租存證是爭議最常發生的那一端，卻連 HUD 都沒有。
5. EXIF 在兩條路上都救不回來：相機走 `canvas.toDataURL`、檔案走 `resizeImage()` 也是畫進 canvas 重編碼，後端 `inspection.py:39` 的 `exif_transpose` 再 re-save 又清一次。**所以不要嘗試用 EXIF 比對時間，那條路是死的。**

合起來就是：**沒有任何機制能區分「現場拍的」和「相簿挑的」，而那個看起來在把關的 HUD 在整合點上是死碼。** 這個 Phase 把來源與真實品質存下來並顯示出來。

**獨立交付物：** 每一張存證照片在資料庫裡都有可信的來源標記；現場拍攝的照片存下真實的亮度／清晰度／水平量測值；檔案上傳的品質一律為 `NULL` 而不是假滿分；存證資料對外輸出一句人看得懂的可信度說明。

**依賴：** Task 2.5 會用到 Phase 1 Task 1.1 的 `supportsFieldCapture` 與 Task 1.2 的 `useFieldCaptureSupport`。其餘 Task 不依賴 Phase 1。

**⚠️ Phase 2 內部的順序限制：Task 2.6 必須在 Task 2.4 之前完成。** `CaptureSource` 與 `CaptureQuality` 兩個型別的正本放在 `useHandover.ts`（領域層擁有它們，元件依賴領域層而不是反過來），Task 2.4 的 `SmartCaptureCamera.vue` 只匯入它們並定義自己的 `CapturePayload`。如果照編號順序做，Task 2.4 會匯入一個還不存在的型別。其餘 Task 照編號順序即可。

### Task 2.1：資料庫遷移

**Files:**
- Create: `backend/migrations/20261002_inspection_capture_provenance.sql`

- [ ] **Step 1: 建立遷移檔**

建立 `backend/migrations/20261002_inspection_capture_provenance.sql`：

```sql
-- 點交存證記錄照片來源與現場品質
-- ==================================================================
-- 原本 inspection_records 只存照片本身，看不出這張圖是當場用鏡頭拍的
-- 還是從相簿挑的。SmartCaptureCamera 的亮度／清晰度／傾角量測值算完
-- 就被丟掉，而檔案上傳的路徑甚至回報寫死的滿分（brightness 128、
-- sharpness 100、isLevel true），讓相簿照片看起來比真實拍攝更完美。
--
-- capture_source 的預設值刻意是 'file' 而不是 'camera'：
-- 既有資料的真實來源已經無從得知，標成 'file' 會低估部分真的用鏡頭拍的
-- 照片，但永不高估任何一張照片的可信度。存證寧可保守。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時逐句補，
-- 不要整份重跑。

ALTER TABLE `inspection_records`
  ADD COLUMN `capture_source` ENUM('camera','file') NOT NULL DEFAULT 'file'
    COMMENT '照片來源：camera=現場鏡頭拍攝、file=檔案上傳' AFTER `photo_url`,
  ADD COLUMN `capture_quality` JSON DEFAULT NULL
    COMMENT '現場拍攝時量到的 brightness/sharpness/isLevel；檔案上傳為 NULL' AFTER `capture_source`;
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/20261002_inspection_capture_provenance.sql
git commit -m "feat: 新增點交存證來源與品質的資料庫遷移"
```

### Task 2.2：SQLAlchemy 模型

**Files:**
- Modify: `backend/db/models.py:245-258`（`InspectionRecord`）

- [ ] **Step 1: 加上兩個欄位**

在 `backend/db/models.py` 的 `InspectionRecord` 裡，`photo_url` 那一行之後插入：

```python
    capture_source = Column(Enum('camera', 'file', validate_strings=True, create_constraint=True),
                            nullable=False, default='file')
    capture_quality = Column(JSON, nullable=True)
```

`Enum` 的寫法對齊同一個類別裡 `type` 欄位既有的 `Enum('check_in','check_out', validate_strings=True, create_constraint=True)`，不要改用別的風格。`Column`、`Enum`、`JSON` 都已經在這個檔案的 import 裡。

- [ ] **Step 2: 確認既有後端測試仍然通過**

Run: `cd backend && ../.venv/bin/python -m unittest tests.test_inspection -v`
Expected: 7 tests OK。測試用的是 in-memory SQLite + `Base.metadata.create_all`，所以新欄位會自動建出來，不需要先跑 SQL 遷移。

- [ ] **Step 3: Commit**

```bash
git add backend/db/models.py
git commit -m "feat: InspectionRecord 加上照片來源與現場品質欄位"
```

### Task 2.3：後端收下並輸出來源與品質

**Files:**
- Modify: `backend/routers/inspection.py:81`（`evidence_json`）、`:215`（`upload_photo`）、`PhotoRequest`
- Test: `backend/tests/test_inspection.py`

核心的完整性規則：**來源是 `file` 時，伺服器一律把品質存成 `NULL`，不管前端送了什麼。** 一個聲稱「我是檔案上傳，但這是我的滿分品質」的請求必須被忽略，否則整個來源標記就白做了。

- [ ] **Step 1: 寫失敗的測試**

先把 `backend/tests/test_inspection.py` 的 `upload` 輔助方法改成可以帶額外欄位（既有呼叫點完全不受影響）：

```python
    def upload(self, item_id, phase='baseline', **extra):
        response = self.request('PUT', f'/items/{item_id}/photos/{phase}',
            json={'image_data': self.photo, 'user_note': 'note', **extra})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()
```

然後在 `InspectionTests` 類別裡新增三個測試方法：

```python
    def test_camera_capture_stores_source_and_quality(self):
        item = self.upload(self.item()['id'], capture_source='camera',
            capture_quality={'brightness': 140, 'sharpness': 88, 'is_level': True})
        evidence = item['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'camera')
        self.assertEqual(evidence['captureQuality'],
                         {'brightness': 140, 'sharpness': 88, 'isLevel': True})
        self.assertEqual(evidence['integrityNote'], '現場拍攝，品質正常。')

    def test_file_upload_never_carries_quality_even_if_the_client_sends_one(self):
        # 相簿挑來的照片不能靠自己宣稱的分數換到可信度。
        item = self.upload(self.item()['id'], capture_source='file',
            capture_quality={'brightness': 128, 'sharpness': 100, 'is_level': True})
        evidence = item['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'file')
        self.assertIsNone(evidence['captureQuality'])
        self.assertEqual(evidence['integrityNote'], '此照片為檔案上傳，未經現場拍攝品質把關。')

    def test_poor_camera_quality_is_flagged_against_the_hud_thresholds(self):
        item = self.upload(self.item()['id'], capture_source='camera',
            capture_quality={'brightness': 40, 'sharpness': 20, 'is_level': False})
        note = item['evidences'][0]['integrityNote']
        self.assertIn('光線偏暗', note)
        self.assertIn('畫面晃動', note)
        self.assertIn('手機未保持水平', note)

    def test_upload_without_a_declared_source_is_treated_as_a_file(self):
        # 舊版前端不會送 capture_source，保守地當成檔案上傳。
        evidence = self.upload(self.item()['id'])['evidences'][0]
        self.assertEqual(evidence['captureSource'], 'file')
        self.assertIsNone(evidence['captureQuality'])
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `cd backend && ../.venv/bin/python -m unittest tests.test_inspection -v`
Expected: FAIL。四個新測試都會因為回傳的 JSON 裡沒有 `captureSource` 這個 key 而丟 `KeyError`

- [ ] **Step 3: 寫實作**

在 `backend/routers/inspection.py` 裡，把 `PhotoRequest` 改成：

```python
class CaptureQuality(BaseModel):
    """SmartCaptureCamera 在按下快門那一刻量到的畫面狀態。"""
    brightness: float = Field(ge=0, le=255)
    sharpness: float = Field(ge=0)
    is_level: bool


class PhotoRequest(BaseModel):
    image_data: str = Field(min_length=1, max_length=12_000_000)
    user_note: str = Field(default='', max_length=5000)
    # 舊版前端不會送這個欄位，預設成 file 是保守的方向：寧可低估可信度。
    capture_source: Literal['camera', 'file'] = 'file'
    capture_quality: CaptureQuality | None = None
```

在 `evidence_json` 之前加入門檻常數與說明文字的產生器：

```python
# 可信度門檻直接對齊 SmartCaptureCamera 的 HUD，不另外定一套數字，
# 否則畫面上說「清晰」的照片會在存證報告裡被標成晃動：
#   亮度 <65 偏暗、>215 過曝（該檔 lightStatus）
#   清晰度 <40 判定晃動（該檔 sharpnessStatus）
#   傾角 >=8 度判定未水平（該檔 isIdealState，前端已折算成 isLevel）
BRIGHTNESS_MIN = 65
BRIGHTNESS_MAX = 215
SHARPNESS_MIN = 40


def integrity_note(record):
    """一句人看得懂的可信度說明，給存證報告與房東日後審閱用。"""
    if record.capture_source != 'camera':
        return '此照片為檔案上傳，未經現場拍攝品質把關。'
    quality = record.capture_quality or {}
    if not quality:
        return '現場拍攝，未取得品質量測值。'
    problems = []
    brightness = quality.get('brightness')
    if isinstance(brightness, (int, float)):
        if brightness < BRIGHTNESS_MIN:
            problems.append('光線偏暗')
        elif brightness > BRIGHTNESS_MAX:
            problems.append('畫面過曝')
    sharpness = quality.get('sharpness')
    if isinstance(sharpness, (int, float)) and sharpness < SHARPNESS_MIN:
        problems.append('畫面晃動')
    if quality.get('isLevel') is False:
        problems.append('手機未保持水平')
    if not problems:
        return '現場拍攝，品質正常。'
    return '現場拍攝，但' + '、'.join(problems) + '。'
```

在 `evidence_json` 的回傳 dict 裡，`'userNote': record.user_note,` 之後加入三個鍵：

```python
        'captureSource': record.capture_source,
        'captureQuality': record.capture_quality,
        'integrityNote': integrity_note(record),
```

在 `upload_photo` 裡，建立 `InspectionRecord` 之前算出要存的品質：

```python
    # 來源是 file 時一律不存品質：客戶端聲稱的分數不能換到可信度。
    quality = None
    if payload.capture_source == 'camera' and payload.capture_quality is not None:
        quality = {
            'brightness': payload.capture_quality.brightness,
            'sharpness': payload.capture_quality.sharpness,
            'isLevel': payload.capture_quality.is_level,
        }
```

然後把 `InspectionRecord(...)` 的建構加上兩個參數：

```python
        record = InspectionRecord(rental_id=item.rental_id,
            type='check_in' if phase == 'baseline' else 'check_out', photo_url=name,
            item_name=item.item_name, room_name=item.room_name, user_note=payload.user_note,
            capture_source=payload.capture_source, capture_quality=quality)
```

確認檔案頂端的 import 含有 `Literal`（`upload_photo` 的簽名已經在用它，所以應該已經有了）。

- [ ] **Step 4: 跑測試確認它通過**

Run: `cd backend && ../.venv/bin/python -m unittest tests.test_inspection -v`
Expected: 11 tests OK（原本 7 個 + 新增 4 個）

- [ ] **Step 5: Commit**

```bash
git add backend/routers/inspection.py backend/tests/test_inspection.py
git commit -m "feat: 後端落地點交照片來源與現場品質，檔案上傳不接受客戶端品質"
```

### Task 2.4：前端停止編造品質分數

**Files:**
- Modify: `src/components/handover/SmartCaptureCamera.vue:143-150`（型別）、`:339`（相機路徑）、`:364`（檔案路徑）

- [ ] **Step 1: 改型別定義**

`SmartCaptureCamera.vue:143-150` 現在是：

```ts
export type CapturePayload = {
  dataUrl: string
  quality: {
    brightness: number
    sharpness: number
    isLevel: boolean
  }
}
```

改成：

```ts
// CaptureSource / CaptureQuality 的正本在 useHandover.ts（領域層擁有它們），
// 元件只定義自己的 emit 契約。所以 Task 2.6 必須先做完。
import type { CaptureQuality, CaptureSource } from '@/src/composables/useHandover'

export type CapturePayload = {
  dataUrl: string
  source: CaptureSource
  /*
   * 檔案上傳沒有現場量測值，這裡一律是 null。
   * 之前這條路回報 brightness 128 / sharpness 100 / isLevel true，
   * 等於讓相簿挑來的照片拿到比真實拍攝更完美的分數。不要再編造數字。
   */
  quality: CaptureQuality | null
}
```

- [ ] **Step 2: 相機路徑標上來源**

`SmartCaptureCamera.vue:339` 的 emit 改成：

```ts
  emit('captured', {
    dataUrl,
    source: 'camera',
    quality: {
      brightness: Math.round(brightnessValue.value),
      sharpness: sharpnessScore.value,
      isLevel: Math.abs(tiltAngle.value) < 8,
    },
  })
```

- [ ] **Step 3: 檔案路徑停止回報假滿分**

`SmartCaptureCamera.vue:364` 的 emit 改成：

```ts
    emit('captured', { dataUrl, source: 'file', quality: null })
```

- [ ] **Step 4: 確認型別檢查抓出所有呼叫點**

Run: `npm run lint:types`
Expected: **FAIL，而這是預期的**。`baseline.vue` 與 `checkout.vue` 會因為缺少 `source` 欄位而報錯 —— 這正是我們要的，型別檢查幫我們找出每一個需要改的呼叫點。Task 2.6 與 2.7 會把它們補完。這一步不要 commit。

### Task 2.5：桌機不啟動 webcam

**Files:**
- Modify: `src/components/handover/SmartCaptureCamera.vue:30-35`（提示區塊）、`:213`（`startCamera`）

決策 D10：桌機可以進點交頁，但只給上傳既有照片。筆電 webcam 拍不到房間角落，而且傾角偵測靠 DeviceOrientation，桌機永遠測不到角度 —— 一張畫質差又沒有水平資訊的照片，存證效力比使用者自己用手機拍完上傳更低。

好消息是元件現有結構剛好支援：拍攝鈕是 `:disabled="!isCameraReady"`，而底部控制列本來就有一顆「上傳」鈕，錯誤提示區塊裡也已經有「改用檔案上傳」。所以只要讓 `startCamera()` 在桌機上提早返回，剩下的行為自然就對了。

- [ ] **Step 1: 引入裝置判斷**

在 `SmartCaptureCamera.vue` 的 `<script setup>` 既有 import 之後加入：

```ts
import { useFieldCaptureSupport } from '@/src/composables/useDeviceGate'

const { fieldCapture } = useFieldCaptureSupport()
const uploadOnly = ref(false)
```

（`ref` 已經在這個檔案的 vue import 裡。）

- [ ] **Step 2: 讓 startCamera 在桌機提早返回**

`SmartCaptureCamera.vue:213` 的 `startCamera` 開頭現在是：

```ts
async function startCamera() {
  cameraError.value = null
  await nextTick()
```

改成：

```ts
async function startCamera() {
  cameraError.value = null
  uploadOnly.value = false

  /*
   * 桌機不開鏡頭：筆電 webcam 拍不到房間角落，而傾角偵測靠
   * DeviceOrientation，桌機量不到角度。畫質差又沒有水平資訊的照片，
   * 存證效力比使用者自己用手機拍完再上傳更低。
   */
  if (!fieldCapture.value) {
    uploadOnly.value = true
    cameraError.value = '這台裝置沒有可用的現場鏡頭。請改用下方的「上傳」選擇照片，或改用手機開啟這個頁面當場拍攝。'
    return
  }

  await nextTick()
```

- [ ] **Step 3: 讓提示文案在桌機上不要講得像故障**

`SmartCaptureCamera.vue:32` 現在是：

```html
          <p class="text-sm font-medium text-slate-200 mb-1">無法啟動鏡頭</p>
```

改成：

```html
          <p class="text-sm font-medium text-slate-200 mb-1">{{ uploadOnly ? '這台裝置請用上傳' : '無法啟動鏡頭' }}</p>
```

`:31` 的 `AlertCircle` 在 `uploadOnly` 時換成上傳圖示：

```html
          <component :is="uploadOnly ? Upload : AlertCircle" class="h-10 w-10 text-amber-400 mb-2" />
```

`Upload` 與 `AlertCircle` 都已經在這個檔案的 import 裡（底部控制列和提示區塊各自在用）。

- [ ] **Step 4: Commit**

```bash
git add src/components/handover/SmartCaptureCamera.vue
git commit -m "feat: 存證照片標記來源，檔案上傳不再回報假滿分；桌機改走上傳"
```

### Task 2.6：把來源與品質送到後端

**Files:**
- Modify: `src/composables/useHandover.ts:14-24`（`HandoverEvidence`）、`:148-166`（`addEvidence`）
- Test: `src/composables/useHandover.test.ts`

- [ ] **Step 1: 寫失敗的測試**

在 `src/composables/useHandover.test.ts` 的 `describe('database handover state', ...)` 裡新增兩個測試：

```ts
  it('sends the capture source and quality when the photo came from the live camera', async () => {
    const store = await loadedStore()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    request.mockResolvedValueOnce({ status: 'success', vlm_result: {}, item: structuredClone(uploaded) })
    await store.addEvidence('10', 'baseline', {
      url: 'data:image/jpeg;base64,abc',
      source: 'camera',
      quality: { brightness: 140, sharpness: 88, isLevel: true },
    })
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', {
      image_data: 'data:image/jpeg;base64,abc',
      user_note: '',
      capture_source: 'camera',
      capture_quality: { brightness: 140, sharpness: 88, is_level: true },
    })
  })

  it('sends a null quality for a file upload so no score is invented', async () => {
    const store = await loadedStore()
    request.mockResolvedValueOnce(structuredClone(uploaded))
    request.mockResolvedValueOnce({ status: 'success', vlm_result: {}, item: structuredClone(uploaded) })
    await store.addEvidence('10', 'baseline', {
      url: 'data:image/jpeg;base64,abc',
      source: 'file',
      quality: null,
    })
    expect(request).toHaveBeenCalledWith('/items/10/photos/baseline', 'PUT', {
      image_data: 'data:image/jpeg;base64,abc',
      user_note: '',
      capture_source: 'file',
      capture_quality: null,
    })
  })
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `npx vitest run src/composables/useHandover.test.ts`
Expected: FAIL，送出的 body 裡沒有 `capture_source` / `capture_quality`

- [ ] **Step 3: 改介面與實作**

`src/composables/useHandover.ts:14-24` 的 `HandoverEvidence` 加上三個欄位：

```ts
export type CaptureSource = 'camera' | 'file'

export interface CaptureQuality {
  brightness: number
  sharpness: number
  isLevel: boolean
}

export interface HandoverEvidence {
  id: string
  phase: EvidencePhase
  url: string
  capturedAt: string
  aiLabel?: string
  aiConfidence?: number
  note?: string
  userNote?: string
  vlmResult?: Record<string, unknown> | null
  captureSource?: CaptureSource
  /** 檔案上傳時後端一律回 null —— 相簿照片沒有現場量測值 */
  captureQuality?: CaptureQuality | null
  /** 後端算好的一句可信度說明，直接顯示給使用者看 */
  integrityNote?: string
}
```

`:148-166` 的 `addEvidence` 改成：

```ts
  async function addEvidence(
    itemId: string,
    phase: EvidencePhase,
    payload: {
      url: string
      note?: string
      source: CaptureSource
      quality: CaptureQuality | null
    },
  ) {
    await perform(async () => {
      const item = await inspectionRequest<HandoverItem>(
        `/items/${itemId}/photos/${phase}`,
        'PUT',
        {
          image_data: payload.url,
          user_note: payload.note ?? '',
          capture_source: payload.source,
          // 後端收到 file 時會忽略品質，這裡仍然明確送 null，讓請求自己說清楚
          capture_quality:
            payload.source === 'camera' && payload.quality
              ? {
                  brightness: payload.quality.brightness,
                  sharpness: payload.quality.sharpness,
                  is_level: payload.quality.isLevel,
                }
              : null,
        },
      )
      replaceItem(item)
      const record = item.evidences.find((e) => e.phase === phase)!
      await analyze(itemId, record.id)
    })
  }
```

注意 `source` 與 `quality` 都是**必填**（沒有 `?`），這樣型別檢查會強迫每一個呼叫點明確表態自己是哪一種來源 —— 這正是我們要的，預設值會讓人忘記標。

- [ ] **Step 4: 跑測試確認它通過**

Run: `npx vitest run src/composables/useHandover.test.ts`
Expected: PASS，既有測試加上兩個新測試全綠

- [ ] **Step 5: Commit**

```bash
git add src/composables/useHandover.ts src/composables/useHandover.test.ts
git commit -m "feat: addEvidence 把照片來源與現場品質送到後端"
```

### Task 2.7：補齊三個上傳呼叫點

**Files:**
- Modify: `src/pages/handover/baseline.vue:149-151`、`:160-181`
- Modify: `src/pages/handover/checkout.vue:107-125`

三個呼叫點，一個都不能漏：baseline 的相機路徑、baseline 的獨立檔案選擇器、checkout 的檔案選擇器。

- [ ] **Step 1: baseline 的相機路徑**

`baseline.vue:149-157` 現在是：

```ts
async function processPhotoWithAI(item: HandoverItem, dataUrl: string) {
  await addEvidence(item.id, 'baseline', { url: dataUrl })
}
```

改成：

```ts
async function processPhotoWithAI(
  item: HandoverItem,
  dataUrl: string,
  source: CaptureSource,
  quality: CaptureQuality | null,
) {
  await addEvidence(item.id, 'baseline', { url: dataUrl, source, quality })
}
```

並把 `handlePhotoCaptured` 改成把來源傳下去（它原本把 `payload.quality` 整個丟掉）：

```ts
async function handlePhotoCaptured(payload: CapturePayload) {
  if (!activeTargetItem.value) return
  await processPhotoWithAI(activeTargetItem.value, payload.dataUrl, payload.source, payload.quality)
}
```

在 `baseline.vue` 頂端的 import 加上型別（`CapturePayload` 已經從 SmartCaptureCamera 匯入了，補上另外兩個）：

```ts
import SmartCaptureCamera, { type CapturePayload } from '@/src/components/handover/SmartCaptureCamera.vue'
import type { CaptureQuality, CaptureSource } from '@/src/composables/useHandover'
```

請先看 `baseline.vue:15-17` 既有的 import 寫法，保留它原本已經匯入的項目，只增加缺的。

- [ ] **Step 2: baseline 的獨立檔案選擇器**

`baseline.vue:176-177` 在 `capturePhoto()` 裡現在是：

```ts
      const dataUrl = await resizeImage(file)
      await processPhotoWithAI(targetItem, dataUrl)
```

改成：

```ts
      const dataUrl = await resizeImage(file)
      // 這條路是使用者自己挑的檔案，沒有現場量測值，不要編造品質分數
      await processPhotoWithAI(targetItem, dataUrl, 'file', null)
```

- [ ] **Step 3: checkout 的檔案選擇器**

`checkout.vue:121` 現在是：

```ts
      await addEvidence(itemId, 'checkout', { url: dataUrl })
```

改成：

```ts
      // 退租存證目前只有檔案上傳這條路（這一頁沒有掛 SmartCaptureCamera），
      // 所以來源一律是 file，品質為 null。
      await addEvidence(itemId, 'checkout', { url: dataUrl, source: 'file', quality: null })
```

- [ ] **Step 4: 確認型別檢查全綠**

Run: `npm run lint:types`
Expected: 沒有錯誤輸出。如果還有錯，就是還有第四個呼叫點沒改 —— 照錯誤訊息的檔案與行號補上，不要加預設值繞過。

- [ ] **Step 5: 跑完整前端測試**

Run: `npm run test`
Expected: 全綠

- [ ] **Step 6: Commit**

```bash
git add src/pages/handover/baseline.vue src/pages/handover/checkout.vue
git commit -m "feat: 三個點交上傳呼叫點都標明照片來源"
```

### Task 2.8：把可信度顯示出來

**Files:**
- Modify: `src/pages/handover/baseline.vue`（存證卡片與 `print-only` 區塊）

後端算好的 `integrityNote` 要讓人看得到，否則整個 Phase 只是在資料庫裡自言自語。

- [ ] **Step 1: 找出存證卡片渲染的位置**

Run: `grep -n "aiLabel\|userNote\|evidences" src/pages/handover/baseline.vue`

找出顯示單張存證的那個區塊（會用到 `evidence.aiLabel` 或 `evidence.userNote`），以及 `print-only` 的列印區塊。

- [ ] **Step 2: 在存證卡片加上可信度說明**

在顯示 `aiLabel` 的元素附近加入（`evidence` 換成該區塊實際的變數名）：

```html
          <p
            v-if="evidence.integrityNote"
            class="mt-1 text-xs"
            :class="evidence.captureSource === 'camera' ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'"
          >
            {{ evidence.integrityNote }}
          </p>
```

檔案上傳用警示色、現場拍攝用一般色 —— 讓「這張沒經過把關」在視覺上就看得出來。

- [ ] **Step 3: 在列印版本也加上同一句**

在 `print-only` 區塊裡每一張照片對應的位置加入：

```html
            <p class="print-integrity">{{ evidence.integrityNote }}</p>
```

並在 `<style scoped>` 的 `@media print` 區塊內加上樣式：

```css
  .print-integrity {
    font-size: 10pt;
    color: #444;
    margin-top: 2pt;
  }
```

列印出來的存證是最可能被當成憑據拿去談判的那個版本，這句話在上面比在螢幕上更重要。

- [ ] **Step 4: 確認型別與測試**

Run: `npm run lint:types && npm run test`
Expected: 兩個都綠

- [ ] **Step 5: 在瀏覽器確認**

開 `/app/handover/baseline`，用模擬手機（觸控 + 390px）走一次相機路徑，再走一次「上傳」路徑，確認：
- 相機拍的照片顯示「現場拍攝，品質正常。」（或對應的品質警示）
- 上傳的照片顯示「此照片為檔案上傳，未經現場拍攝品質把關。」且是警示色
- 在桌機（滑鼠）開同一頁，鏡頭不啟動、顯示「這台裝置請用上傳」

- [ ] **Step 6: Commit**

```bash
git add src/pages/handover/baseline.vue
git commit -m "feat: 存證卡片與列印版顯示照片可信度說明"
```

---

## Phase 3：底部導航調整

**獨立交付物：** 底部導航從 7 格變 6 格，字級從幾乎不可讀的 9px 提到 11px。

**為什麼是 6 格。** 導航是 `flex h-16` 加上每格 `flex-1`，所以是等分。實際算出來：

| 裝置寬 | 6 格 | 7 格（現況） |
|---|---|---|
| 320px（iPhone SE 一代） | 53.3px | 45.7px |
| 360px（常見 Android） | 60.0px | 51.4px |
| 390px（iPhone 14/15） | 65.0px | 55.7px |

最長的標籤是 4 個中文字 × 9px = 36px，在 360px 手機的 60px 格子裡還剩 24px 餘裕。可點擊面積 60×64px，高於 Apple 的 44pt 與 Google 的 48dp。而被移除的「合約 OCR」是 2 中文 + 空格 + 3 個拉丁字母 ≈ 40px，本來就是最擠的那一格。

**真正的問題是字級不是格數。** 9px 中文接近不可讀（iOS HIG 建議正文不低於 11px，Android 建議 12sp），而全站有 54 處 `text-[8px]`~`text-[11px]`。少一格多出來的 8.6px 正好拿去把字放大。

### Task 3.1：底部導航移除合約 OCR

**Files:**
- Modify: `src/composables/useNavigation.ts:36-45`
- Test: `src/composables/useNavigation.test.ts`（新建）

- [ ] **Step 1: 寫失敗的測試**

建立 `src/composables/useNavigation.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { useNavigation } from './useNavigation'

/*
 * 底部導航的格子是等分的（AppLayout 用 flex-1），所以格數直接決定
 * 每一格的可點擊寬度。6 格在 360px 手機上是 60px，7 格會掉到 51.4px。
 * 這個測試是把「6 格」這個決定釘住，避免有人順手再塞一個進來。
 */
describe('mobileNavItems', () => {
  const { mobileNavItems, navItems, accountItem } = useNavigation()

  it('keeps the bottom bar at six slots', () => {
    expect(mobileNavItems).toHaveLength(6)
  })

  it('carries the on-site features and leaves the contract flow to desktop', () => {
    expect(mobileNavItems.map((item) => item.path)).toEqual([
      '/app',
      '/app/handover',
      '/app/garbage',
      '/app/repairs',
      '/app/notes',
      '/app/account',
    ])
  })

  it('does not offer the contract scanner on the bottom bar', () => {
    expect(mobileNavItems.some((item) => item.path.startsWith('/app/contract'))).toBe(false)
  })

  it('still reaches every mobile slot from the desktop navigation', () => {
    const desktopPaths = [...navItems, accountItem].map((item) => item.path)
    for (const item of mobileNavItems) {
      expect(desktopPaths).toContain(item.path)
    }
  })
})
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `npx vitest run src/composables/useNavigation.test.ts`
Expected: FAIL，`mobileNavItems` 目前是 7 個而且第二個是 `/app/contract/scanner`

- [ ] **Step 3: 改實作**

`src/composables/useNavigation.ts:36-45` 現在是：

```ts
  // 手機底部列專用項目（6 項）
  const mobileNavItems: NavItem[] = [
    { icon: Home, label: '首頁', path: '/app' },
    { icon: FileText, label: '合約 OCR', path: '/app/contract/scanner' },
    { icon: Trash2, label: '垃圾清運', path: '/app/garbage' },
    { icon: CheckSquare, label: '點交清單', path: '/app/handover' },
    { icon: Wrench, label: '報修', path: '/app/repairs' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
    { icon: User, label: '我的帳號', path: '/app/account' },
  ]
```

改成：

```ts
  /*
   * 手機底部列專用項目（6 項）。
   *
   * 格子是等分的，6 格在 360px 手機上每格 60px，7 格會掉到 51.4px ——
   * 接近 Apple 44pt / Google 48dp 的下限。要加新功能請先想清楚要換掉哪一個。
   *
   * 合約流程（掃描、校對、存檔、分析）刻意不在這裡：掃描完會強制進
   * contract/editor，而 OCR 結果存在 sessionStorage，手機上掃完無處可去。
   * 整條流程桌機優先，從首頁或桌機側邊欄進入。
   */
  const mobileNavItems: NavItem[] = [
    { icon: Home, label: '首頁', path: '/app' },
    { icon: CheckSquare, label: '點交清單', path: '/app/handover' },
    { icon: Trash2, label: '垃圾清運', path: '/app/garbage' },
    { icon: Wrench, label: '報修', path: '/app/repairs' },
    { icon: ClipboardList, label: '備忘錄', path: '/app/notes' },
    { icon: User, label: '我的帳戶', path: '/app/account' },
  ]
```

兩個順手修掉的小問題：原本的註解寫「6 項」但陣列有 7 個，現在名實相符了；`'我的帳號'` 改成 `'我的帳戶'`，對齊同一個檔案裡 `accountItem` 用的字（原本兩邊不一致）。`FileText` 如果在移除後變成沒有被用到的 import，`npm run lint:oxlint` 會抓出來 —— 請確認 `navItems` 還在用它（它應該還在，桌機側邊欄仍有合約 OCR）。

- [ ] **Step 4: 跑測試確認它通過**

Run: `npx vitest run src/composables/useNavigation.test.ts`
Expected: PASS，4 個測試全綠

- [ ] **Step 5: 確認被移出導航的功能沒有變成孤島**

被移出或原本就不在底部導航的三個功能（租金補貼 `/app/subsidy`、停電通報 `/app/outage`、通知中心 `/app/notifications`）加上合約 OCR，在手機上都只能從首頁進入。

Run: `grep -n "subsidy\|outage\|notifications\|contract/scanner" src/pages/dashboard.vue`

確認首頁真的有通往這四個路徑的連結。**如果其中任何一個在首頁找不到入口，停下來告訴使用者** —— 那代表這個功能在手機上變成完全無法抵達，而這不是計畫裡的決定。不要自己加入口或自己塞回導航。

- [ ] **Step 6: Commit**

```bash
git add src/composables/useNavigation.ts src/composables/useNavigation.test.ts
git commit -m "feat: 底部導航改為 6 格，合約流程交給桌機"
```

### Task 3.2：底部導航字級

**Files:**
- Modify: `src/components/layouts/AppLayout.vue:158`

- [ ] **Step 1: 把 9px 提到 11px**

`AppLayout.vue:158` 現在是：

```
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors',
```

改成：

```
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
```

9px 中文接近不可讀（iOS HIG 建議正文不低於 11px）。6 格之後每格多出 8.6px，放得下。

- [ ] **Step 2: 在瀏覽器確認**

用模擬手機在 360px 與 320px 兩個寬度下開 `/app`，確認六個標籤都沒有換行或被截斷。如果 320px 下「點交清單」擠到換行，把它的 label 改成 `'點交'`（4 字 44px → 2 字 22px），不要把字級改回去。

- [ ] **Step 3: 確認型別與測試**

Run: `npm run lint:types && npm run test`
Expected: 兩個都綠

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/AppLayout.vue
git commit -m "fix: 底部導航字級從 9px 提到 11px"
```

---

## Phase 4：手機版面的三個實際破洞

**獨立交付物：** iOS Safari 網址列出現時版面不再破；兩個固定定位的覆蓋物不再跟底部導航打架。

這三個是跨頁面的、改動集中的問題，也是「在手機上一眼看起來壞掉」最便宜的修法。**刻意不包含** `notes.css`、`SubsidyGuide.vue`、`contract/analysis.vue` 這些桌機優先的手寫 CSS —— 那是 5000+ 行的重寫，明確排除在範圍外。

### Task 4.1：100dvh 與 safe-area

**Files:**
- Modify: `src/components/layouts/AppLayout.vue:55`、`:124`、`:149`

`h-screen` 是 `100vh`，在 iOS Safari 上不含網址列的高度，網址列一出現版面就被推出畫面。而 `env(safe-area-inset-bottom)` 全站只有 `repairs.vue` 和 `landlord/tenants.vue` 兩個檔案在用 —— 底部導航本身沒有，所以在有 home indicator 的 iPhone 上，最底下那排圖示會貼在手勢條上。

- [ ] **Step 1: 外層改用 dvh**

`AppLayout.vue:55` 現在是：

```html
  <div class="flex h-screen w-full bg-muted/20">
```

改成：

```html
  <!-- h-screen 是 100vh，iOS Safari 的網址列出現時會把版面推出畫面，改用 dvh -->
  <div class="flex h-[100dvh] w-full bg-muted/20">
```

- [ ] **Step 2: 底部導航加上 safe-area**

`AppLayout.vue:149` 現在是：

```html
    <nav class="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-background sm:hidden">
```

改成：

```html
    <!-- pb 是給 home indicator 的手勢條留位，否則最底排圖示會貼在上面 -->
    <nav
      class="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
```

- [ ] **Step 3: main 的下方留白跟著一起長**

導航加了 `pb` 之後實際高度超過 64px，所以 `main` 原本的 `pb-16` 會不夠。`AppLayout.vue:124` 現在是：

```html
    <main class="flex-1 overflow-y-auto pb-16 sm:pb-0">
```

改成：

```html
    <main class="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
```

- [ ] **Step 4: 在瀏覽器確認**

模擬 iPhone 開 `/app`，往下滾到底，確認頁面最後一段內容不會被底部導航蓋住。

- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/AppLayout.vue
git commit -m "fix: 租客外框改用 dvh，底部導航加上 safe-area 留白"
```

### Task 4.2：垃圾站點詳情被導航蓋住

**Files:**
- Modify: `src/pages/garbage/garbage.css`（約 `:731-740` 與 `:1114`）

`.station-detail` 是 `position: fixed; bottom: 26px; z-index: 40`，在 700px 以下的斷點改成 `bottom: 16px`。底部導航是 `h-16`（64px）且 `z-50`。**40 < 50，所以站點詳情的下半截是真的被導航蓋在後面**，使用者看不到也點不到。

- [ ] **Step 1: 確認實際的選擇器與斷點**

Run: `grep -n "station-detail" src/pages/garbage/garbage.css`

記下 `position: fixed` 那一組規則的行號，以及 `bottom: 16px` 出現在哪一個 `@media` 區塊裡。

- [ ] **Step 2: 讓它避開導航**

把 700px（或實際斷點）以下那組規則裡的 `bottom: 16px` 改成：

```css
    /* 底部導航是 64px 高、z-50，這裡要讓出它的高度，否則下半截會被蓋住 */
    bottom: calc(64px + 16px + env(safe-area-inset-bottom));
```

**不要**把 `z-index` 調到 50 以上來解決 —— 那會變成站點詳情蓋住導航，使用者看得到卻離不開這一頁。讓位才是對的方向。

- [ ] **Step 3: 在瀏覽器確認**

模擬 iPhone 開 `/app/garbage`，點一個站點，確認詳情卡片完整可見且底部導航仍然可點。

- [ ] **Step 4: Commit**

```bash
git add src/pages/garbage/garbage.css
git commit -m "fix: 垃圾站點詳情讓出底部導航的高度"
```

### Task 4.3：帳號頁的 toast 蓋住導航

**Files:**
- Modify: `src/pages/account.vue`（約 `:1136-1140`）

帳號頁的意見回饋 toast 是 `bottom: 24px; z-index: 60`。**60 > 50，所以它是蓋在導航上面**（跟 Task 4.2 剛好相反的方向）。toast 出現的那幾秒，使用者點不到底部導航。

- [ ] **Step 1: 確認實際的選擇器**

Run: `grep -n "position: fixed" -A 8 src/pages/account.vue`

找出 `bottom: 24px; z-index: 60` 屬於哪一個選擇器，記下名稱。

- [ ] **Step 2: 在手機寬度讓它浮在導航之上**

在 `account.vue` 的 `<style scoped>` 裡，為該選擇器加上一個窄螢幕的覆寫（`639px` 對齊 Tailwind 的 `sm` 斷點，也就是底部導航出現的條件 `sm:hidden`）：

```css
@media (max-width: 639px) {
  /* 底部導航在這個寬度才出現（sm:hidden），toast 要浮在它上方而不是蓋住它 */
  .feedback-toast {
    bottom: calc(64px + 24px + env(safe-area-inset-bottom));
  }
}
```

把 `.feedback-toast` 換成 Step 1 查到的實際選擇器名稱。

- [ ] **Step 3: 在瀏覽器確認**

模擬 iPhone 開 `/app/account`，送出一次意見回饋，確認 toast 出現時底部導航仍然完整可見可點。

- [ ] **Step 4: 跑完整驗證**

Run: `npm run lint:types && npm run test`
Expected: 兩個都綠

- [ ] **Step 5: Commit**

```bash
git add src/pages/account.vue
git commit -m "fix: 帳號頁意見回饋 toast 不再蓋住底部導航"
```

---

## 收尾驗證

- [ ] **前端全測試**

Run: `npm run test`
Expected: 100 個測試檔全綠（基準 97 個 + `device-policy` + `useDeviceGate` + `useNavigation`）

- [ ] **型別檢查**

Run: `npm run lint:types`
Expected: 沒有輸出

- [ ] **Lint**

Run: `npm run lint`
Expected: 通過。如果 oxlint 抱怨 `useNavigation.ts` 有沒用到的 import，確認 `FileText` 是否仍被 `navItems` 使用

- [ ] **後端測試**

Run: `cd backend && ../.venv/bin/python -m unittest tests.test_inspection -v`
Expected: 11 tests OK

- [ ] **正式環境的遷移**

`backend/migrations/20261002_inspection_capture_provenance.sql` 需要在正式資料庫執行。**這一步不要自己做** —— 交回給使用者，由他決定什麼時候上。執行前先確認 `deploy/backup.sh` 跑得起來。

---

## 擱置的決策（不要自己決定，回去問使用者）

### P1：房東要在哪裡審閱點交存證

使用者已經同意「租客手機拍＋簽、房東桌機審閱確認」，但這件事現在在三層都不存在：

- `backend/routers/inspection.py` 的**每一個**端點都是 `Depends(get_current_tenant)`，房東與後台完全沒有讀取路徑。
- 房東端沒有任何點交頁面。
- 唯一的痕跡是 `src/pages/landlord/tenants.vue:1200` 退租表單裡一個兩選項的 `<select>`（待點交／已完成），一個純人工旗標，跟實際照片存證零連結。

選項：(i) 新建 `/landlord/handover` 頁 + 後端新增房東讀取端點；(ii) 併進 `tenants.vue` 的房客詳情，後端把 `get_current_tenant` 放寬到「該租約的房東也能讀」；(iii) 不做線上審閱，租客列印存證給房東簽紙本（`baseline.vue` 已經有 `print-only` 區塊和 `@media print` 樣式，暗示原本的設計意圖可能就是這個）；(iv) 走後台審閱。

使用者在這一輪說「先不管」，所以**這個 Phase 不存在**。如果走 (ii)，權限放寬時必須確保房東只能讀自己租約的記錄 —— `owned_item()` 目前是按租客判斷所有權，不能讓人用 item_id 猜別人的。

### P2：租客的通知中心入口

Q16 原本的建議是「在 AppLayout header 加一個租客通知鈴鐺，通知中心就不用佔導航格子」。但實作時發現 **`AppLayout` 根本沒有 `<header>`** —— 它的結構是 `<aside>` 側邊欄 + `<main>`（內容 + footer）+ `<nav>` 底部列。房東端的 `LandlordNotificationBell` 掛在 `LandlordLayout` 的 sticky header 上，租客端沒有這個東西可以掛。

所以新增鈴鐺等於**替每一個租客頁面新增一條 header**，那會吃掉手機上的垂直空間，比「照抄房東端那個元件」大得多。三個選項：(i) 新增 header；(ii) 通知中心佔第 7 格導航（回到 51.4px/格）；(iii) 維持現況，只從首頁進入。

Task 3.1 Step 5 的驗證就是在確認 (iii) 是否成立。**不要自己新增 header。**

### P3：退租存證沒有相機

`checkout.vue` 完全沒有掛 `SmartCaptureCamera`，只有一個檔案選擇器（`checkout.vue:107`）。也就是說退租點交的每一張照片都是「檔案上傳、未經現場把關」—— 而退租正是爭議最常發生的那一端。

Phase 2 會讓這件事**在資料上變得明顯**（每張 checkout 照片都會標成 `file`），但沒有修它。要不要把 `SmartCaptureCamera` 也掛到 checkout，是一個獨立的產品決定，不在這份計畫範圍內。

---

## 範圍外但已記錄的既有問題

- `index.html:15-16` 無條件從 jsdelivr 載入 eruda 除錯主控台。`deploy/nginx-tls.conf.example` 的 CSP 是 `script-src 'self'`，所以正式站會擋掉這個腳本，接著 `eruda.init()` 丟 `ReferenceError` —— 每次載入都噴一個 console 錯誤。不是資料外洩，但該修。
- `src/pages/handover/baseline.vue:112` 與 `checkout.vue:70` 各有一份一模一樣的 `resizeImage()`。
- 全站 54 處 `text-[8px]`~`text-[11px]`，字級偏小是系統性問題，Phase 3 只修了底部導航那一處。
- `backend/routers/inspection.py` 與 SQLAlchemy 都在用已棄用的 `datetime.utcnow()`，測試會噴一串 DeprecationWarning。
