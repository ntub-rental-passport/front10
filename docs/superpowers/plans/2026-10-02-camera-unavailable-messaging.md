# 相機開不起來時講清楚原因（含正式站的 Permissions-Policy 修正）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓點交相機開不起來時顯示人看得懂的原因與下一步，並修掉正式站上把相機整個擋掉的 HTTP 標頭。

**Architecture:** 判斷邏輯放在 `src/utils/device-policy.ts` 的純函式 `cameraUnavailableReason()`（已經寫好並有測試），本計畫把它接進 `SmartCaptureCamera.vue`，並讓 `useDeviceGate` 多暴露一個 `coarsePointer` 原始訊號當作它的輸入。正式站的 `Permissions-Policy: camera=()` 另外在 nginx 設定修正。

**Tech Stack:** Vue 3.5 + TypeScript + Tailwind v4（前端）、vitest 3（測試）、nginx + Docker（部署）。

---

## 執行前必讀

### 這個問題是什麼

點交相機在手機上開不起來，畫面顯示：

```
無法啟動鏡頭
無法開啟鏡頭：undefined is not an object (evaluating 'navigator.mediaDevices.getUserMedia')
```

**原因不是權限被拒，是 `navigator.mediaDevices` 這個物件根本不存在。** 瀏覽器在非 secure context（`http://` 且主機不是 localhost）下會把整個 `mediaDevices` API 藏起來，所以 `startCamera()` 讀 `.getUserMedia` 時丟的是 TypeError，被 `catch` 接住後原封不動顯示給使用者。那個原始 JS 錯誤對使用者毫無意義。

**而且正式站上還有第二道阻擋**，已實測確認：

```
$ curl -I https://rentmate.software
permissions-policy: camera=(), microphone=(), payment=()
```

`camera=()` 的空括號代表「所有來源都不准用相機，**包含網站自己**」。所以就算改用 HTTPS 開啟，`getUserMedia()` 仍然會被 Permissions Policy 拒絕。Task 3 修這個。

### 已經做完、但尚未提交的部分

`src/utils/device-policy.ts` 底部**已經有** `cameraUnavailableReason()` 與它的型別，`src/utils/device-policy.test.ts` 也已經有 5 個對應測試且全綠。**不要重寫它們**，本計畫只是把它接上。現有簽名：

```ts
export interface CameraUnavailable {
  title: string
  detail: string
}

export interface CameraEnvironment extends Pick<DeviceSnapshot, 'coarsePointer'> {
  isSecureContext: boolean
  hasMediaDevices: boolean
}

export function cameraUnavailableReason(env: CameraEnvironment): CameraUnavailable | null
```

它依序檢查三件事並回傳對應說明（可以開相機就回 `null`）：裝置不是觸控 → `這台裝置請用上傳`；不是 secure context → `這個網址不能開相機`；沒有 `mediaDevices` → `這個瀏覽器不支援相機`。

這些未提交的檔案會跟本計畫的改動一起在 Task 4 提交。

### 這個專案的測試硬限制

1. **vitest 跑在 Node，沒有 DOM**（`vite.config.ts` 的 `test.environment` 是 `'node'`），`jsdom` / `happy-dom` 都沒安裝。
2. **`@vue/test-utils` 沒有安裝**，所以 **`.vue` 元件無法做單元測試**。Task 2 改的是 `.vue`，只能靠 `npm run lint:types` 與瀏覽器確認。
3. 測試瀏覽器 API 的既有作法是 `vi.stubGlobal` 餵假物件，範本看 `src/composables/useDeviceGate.test.ts` 的 `fakeWindow()`。
4. 測試檔只會從 `src/**/*.test.ts` 被收集。

### 已驗證的指令與基準

```bash
npm run test
```
開工前基準：**100 個測試檔、1178 passed、1 skipped**。開始前先跑一次確認是綠的（數字如果對不上，先確認工作樹有沒有別人的改動）。

```bash
npm run lint:types
```
`vue-tsc --noEmit`，改完 `.vue` 一定要跑。**注意：這個專案的 `tsconfig.json` 沒有開 `strict`**，所以型別檢查抓不到 null 相關的錯誤 —— 不要把它當成 nullability 的保證。

```bash
npx oxlint <改過的檔案>
```
預期 `Found 0 warnings and 0 errors.`

---

## 檔案結構

| 檔案 | 改什麼 |
|---|---|
| `src/composables/useDeviceGate.ts` | `DeviceGate` 多暴露 `coarsePointer` 原始訊號；`useFieldCaptureSupport()` 一併回傳 |
| `src/composables/useDeviceGate.test.ts` | 新增 `coarsePointer` 的測試 |
| `src/components/handover/SmartCaptureCamera.vue` | 用 `cameraUnavailableReason()` 取代目前寫死的桌機訊息，提示畫面改成標題＋說明兩段 |
| `deploy/nginx-tls.conf.example:91` | `camera=()` → `camera=(self)` |

**不改**：`src/utils/device-policy.ts` 與其測試（已完成）、後端任何檔案、`deploy/nginx.conf`（那份只存在於 VM 上，見文末）。

---

## Task 1：讓 useDeviceGate 暴露 coarsePointer

**Files:**
- Modify: `src/composables/useDeviceGate.ts`
- Test: `src/composables/useDeviceGate.test.ts`

**為什麼要這一步。** `cameraUnavailableReason()` 需要的輸入是「這台裝置的指標是不是粗的（觸控）」這個**原始訊號**。目前 `useFieldCaptureSupport()` 只回傳 `fieldCapture`，那是 `supportsFieldCapture()` 判斷後的**結果**。雖然兩者現在數值相同，但把結果當成輸入餵回去，哪天 `supportsFieldCapture()` 改成也看寬度，這裡就會悄悄壞掉。

- [ ] **Step 1: 寫失敗的測試**

在 `src/composables/useDeviceGate.test.ts` 的 `describe('createDeviceGate', ...)` 區塊內新增：

```ts
  it('exposes the raw coarse-pointer signal, not just the derived field-capture flag', () => {
    // cameraUnavailableReason() 要吃原始訊號。把 fieldCapture（判斷結果）
    // 當輸入餵回去，等 supportsFieldCapture 哪天也看寬度就會悄悄壞掉。
    const touch = createDeviceGate(fakeWindow(true, 390).win)
    expect(touch.coarsePointer.value).toBe(true)
    touch.stop()

    const mouse = createDeviceGate(fakeWindow(false, 1440).win)
    expect(mouse.coarsePointer.value).toBe(false)
    mouse.stop()
  })

  it('keeps coarsePointer in step with pointer changes', () => {
    const browser = fakeWindow(true, 390)
    const gate = createDeviceGate(browser.win)
    expect(gate.coarsePointer.value).toBe(true)
    browser.changePointer(false)
    expect(gate.coarsePointer.value).toBe(false)
    gate.stop()
  })
```

如果 `fakeWindow()` 的輔助函式沒有 `changePointer`，請先打開 `src/composables/useDeviceGate.test.ts` 看它實際提供哪些方法，用既有的那個來改變指標型態，不要自己另外寫一份假 window。

- [ ] **Step 2: 跑測試確認它失敗**

Run: `npx vitest run src/composables/useDeviceGate.test.ts`
Expected: FAIL，錯誤是 `gate.coarsePointer` 是 `undefined`（讀 `.value` 時丟 TypeError）

- [ ] **Step 3: 寫實作**

在 `src/composables/useDeviceGate.ts`，把 `DeviceGate` 介面改成：

```ts
export interface DeviceGate {
  blocked: Ref<boolean>
  fieldCapture: Ref<boolean>
  /** 原始訊號：主要指標裝置是不是手指。給需要自己判斷的呼叫端用 */
  coarsePointer: Ref<boolean>
  stop: () => void
}
```

在 `createDeviceGate()` 裡，`const fieldCapture = ref(false)` 那一行之後加上：

```ts
  const coarsePointer = ref(false)
```

在 `evaluate()` 函式裡，設定 `fieldCapture.value` 那一行之後加上：

```ts
    coarsePointer.value = snapshot.coarsePointer
```

然後把 `createDeviceGate()` 的**兩個** return 都補上 `coarsePointer`（一個是 `if (!win)` 的提早返回，一個是最後的正式返回）：

```ts
  if (!win) return { blocked, fieldCapture, coarsePointer, stop: () => {} }
```

```ts
  return {
    blocked,
    fieldCapture,
    coarsePointer,
    stop: () => {
      query?.removeEventListener?.('change', evaluate)
      win.removeEventListener('resize', evaluate)
    },
  }
```

最後把 `useFieldCaptureSupport()` 的回傳型別改成一併給出兩者：

```ts
export function useFieldCaptureSupport(): Pick<DeviceGate, 'fieldCapture' | 'coarsePointer'> {
  const gate = createDeviceGate(typeof window === 'undefined' ? undefined : window)
  onUnmounted(gate.stop)
  return { fieldCapture: gate.fieldCapture, coarsePointer: gate.coarsePointer }
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `npx vitest run src/composables/useDeviceGate.test.ts`
Expected: PASS，既有測試加上兩個新測試全綠

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDeviceGate.ts src/composables/useDeviceGate.test.ts
git commit -m "feat: useDeviceGate 暴露 coarsePointer 原始訊號"
```

---

## Task 2：把原因說明接進相機元件

**Files:**
- Modify: `src/components/handover/SmartCaptureCamera.vue`

**沒有單元測試**：`@vue/test-utils` 沒安裝，`.vue` 測不了。判斷邏輯的測試已經在 `src/utils/device-policy.test.ts` 裡（Task 執行前就是綠的），這一步只負責接線，靠型別檢查與瀏覽器確認。

- [ ] **Step 1: 改 import 與狀態**

`SmartCaptureCamera.vue:145` 現在是：

```ts
import { useFieldCaptureSupport } from '@/src/composables/useDeviceGate'
```

改成兩行：

```ts
import { useFieldCaptureSupport } from '@/src/composables/useDeviceGate'
import { cameraUnavailableReason, type CameraUnavailable } from '@/src/utils/device-policy'
```

`:154-155` 現在是：

```ts
const { fieldCapture } = useFieldCaptureSupport()
const uploadOnly = ref(false)
```

改成：

```ts
const { coarsePointer } = useFieldCaptureSupport()
/** 開相機之前就知道開不起來的原因；null 代表沒有這類問題 */
const unavailable = ref<CameraUnavailable | null>(null)
```

- [ ] **Step 2: 加一個把兩種失敗合而為一的 computed**

在上一步那兩行之後加入：

```ts
/*
 * 提示畫面有兩種來源：
 *   unavailable  —— 開之前就能判斷的原因（桌機、非 HTTPS、瀏覽器不支援）
 *   cameraError  —— 真的呼叫 getUserMedia 之後才失敗（拒絕權限、鏡頭被佔用）
 * 合成同一個物件，template 就只要處理一種形狀。
 */
const cameraNotice = computed<CameraUnavailable | null>(() => {
  if (unavailable.value) return unavailable.value
  if (cameraError.value) return { title: '無法啟動鏡頭', detail: cameraError.value }
  return null
})
```

`computed` 與 `ref` 都已經在這個檔案的 vue import 裡，不用再加。建議放在 `const cameraError = ref<string | null>(null)` 附近讓相關狀態聚在一起；`computed` 的內容是惰性求值，所以放在 `cameraError` 宣告之前也不會出錯，但聚在一起比較好讀。

- [ ] **Step 3: 改 startCamera 的前置判斷**

`SmartCaptureCamera.vue` 的 `startCamera()` 開頭現在是：

```ts
async function startCamera() {
  cameraError.value = null
  uploadOnly.value = false
  hasFrameMeasurement.value = false
  hasOrientationMeasurement.value = false
  /*
   * 桌機不開鏡頭：筆電 webcam 拍不到房間角落，而傾角偵測靠 DeviceOrientation，
   * 桌機量不到角度。畫質差又沒有水平資訊的照片，存證效力比使用者自己用手機
   * 拍完再上傳更低，所以這裡直接導向上傳。
   */
  if (!fieldCapture.value) {
    uploadOnly.value = true
    cameraError.value = '請改用下方的「上傳」選擇照片，或改用手機開啟這個頁面當場拍攝。'
    return
  }
  await nextTick()
```

整段改成：

```ts
async function startCamera() {
  cameraError.value = null
  unavailable.value = null
  hasFrameMeasurement.value = false
  hasOrientationMeasurement.value = false

  /*
   * 三種「連試都不用試」的情況一次判完，說明文字由 device-policy 統一產生。
   * 特別是非 secure context：瀏覽器不是拒絕權限，而是把整個
   * navigator.mediaDevices 藏起來，直接呼叫會丟 "undefined is not an object"。
   */
  const reason = cameraUnavailableReason({
    coarsePointer: coarsePointer.value,
    isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
    hasMediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
  })
  if (reason) {
    unavailable.value = reason
    return
  }

  await nextTick()
```

桌機為什麼不開鏡頭的理由已經寫在 `device-policy.ts` 的 `supportsFieldCapture()` 上，所以這裡的註解不重複那段。

- [ ] **Step 4: 改提示畫面的 template**

`SmartCaptureCamera.vue:33-39` 現在是：

```html
        <div v-if="cameraError" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 z-20">
          <component :is="uploadOnly ? Upload : AlertCircle" class="h-10 w-10 text-amber-400 mb-2" />
          <p class="text-sm font-medium text-slate-200 mb-1">{{ uploadOnly ? '這台裝置請用上傳' : '無法啟動鏡頭' }}</p>
          <p class="text-xs text-slate-400 mb-4 max-w-sm">{{ cameraError }}</p>
          <Button size="sm" variant="secondary" @click="triggerFileInput">
            <Upload class="h-3.5 w-3.5 mr-1.5" /> 改用檔案上傳
          </Button>
        </div>
```

改成：

```html
        <div v-if="cameraNotice" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 z-20">
          <component :is="unavailable ? Upload : AlertCircle" class="h-10 w-10 text-amber-400 mb-2" />
          <p class="text-sm font-medium text-slate-200 mb-1">{{ cameraNotice.title }}</p>
          <p class="text-xs text-slate-400 mb-4 max-w-sm">{{ cameraNotice.detail }}</p>
          <Button size="sm" variant="secondary" @click="triggerFileInput">
            <Upload class="h-3.5 w-3.5 mr-1.5" /> 改用檔案上傳
          </Button>
        </div>
```

圖示仍然用 `unavailable` 判斷：事前就知道開不了（通常是要改用上傳）顯示上傳圖示，真的嘗試後失敗才顯示警告圖示。

- [ ] **Step 5: 確認 uploadOnly 已經完全移除**

Run: `grep -n "uploadOnly\|fieldCapture" src/components/handover/SmartCaptureCamera.vue`
Expected: **沒有任何輸出**。

注意這是區分大小寫的比對：`useFieldCaptureSupport` 那一行 import 要保留，而它裡面是大寫的 `FieldCapture`，所以不會被這個 pattern 命中 —— 沒有輸出才是對的。如果真的有輸出，表示上面某一步漏改，回去補完，不要留一個沒人用的 ref。

- [ ] **Step 6: 型別檢查與 lint**

Run: `npm run lint:types && npx oxlint src/components/handover/SmartCaptureCamera.vue`
Expected: `lint:types` 無輸出；oxlint 顯示 `Found 0 warnings and 0 errors.`

- [ ] **Step 7: 跑完整測試**

Run: `npm run test`
Expected: 100 個測試檔全綠（這一步沒有新增測試，確認沒弄壞既有的）

- [ ] **Step 8: 在瀏覽器確認兩種訊息**

啟動 dev server（`npm run dev`，會印出 Local 與 Network 兩個網址），然後：

1. **桌機**（滑鼠、`http://localhost:5173`）開 `/app/handover/baseline`，點任一項目的拍攝 → 應顯示標題「這台裝置請用上傳」，說明文字**不應該**提到 HTTPS。
2. **手機或瀏覽器的觸控模擬**，用 Network 那個 `http://192.168.x.x:5173` 網址開同一頁 → 應顯示標題「這個網址不能開相機」，說明文字提到 HTTPS，而且**不應該**再出現 `undefined is not an object`。

第 2 點是這個 Task 的重點，一定要實際看到。

- [ ] **Step 9: Commit**

```bash
git add src/components/handover/SmartCaptureCamera.vue src/utils/device-policy.ts src/utils/device-policy.test.ts
git commit -m "fix: 相機開不起來時說明真正的原因，不再顯示原始 JS 錯誤"
```

`device-policy.ts` 與它的測試一起提交，因為它們是這個功能的判斷邏輯，之前只是先寫好放著。

---

## Task 3：修掉正式站把相機整個擋掉的標頭

**Files:**
- Modify: `deploy/nginx-tls.conf.example:91`

**這是實測確認過的問題**，不是推測：

```
$ curl -I https://rentmate.software
permissions-policy: camera=(), microphone=(), payment=()
```

`camera=()` 的空括號是「拒絕所有來源，包含網站自己」。要讓本站能用、同時仍然擋住跨站 iframe，正確寫法是 `camera=(self)`。

- [ ] **Step 1: 改設定範本**

`deploy/nginx-tls.conf.example:91` 現在是：

```nginx
    add_header Permissions-Policy "camera=(), microphone=(), payment=()" always;
```

改成：

```nginx
    # camera=(self)：點交存證要用後鏡頭。空括號 () 是「連本站都不准」，
    # 會讓 getUserMedia 被 Permissions Policy 直接拒絕，(self) 才是
    # 「只有本站自己可以用」—— 跨站 iframe 仍然擋住。
    # microphone 維持關閉：點交相機是 audio: false，不需要麥克風。
    add_header Permissions-Policy "camera=(self), microphone=(), payment=()" always;
```

- [ ] **Step 2: 確認沒有別的地方也在發這個標頭**

Run: `grep -rn "Permissions-Policy" deploy/`
Expected: 兩筆 —— `deploy/nginx-tls.conf.example`（剛改好的 `camera=(self)`）與 `deploy/test/nginx.test.conf`。

`deploy/test/nginx.test.conf` 是測試用設定，**也要改成 `camera=(self)`**，否則部署前的測試會驗到跟正式站不同的行為。用同一個值取代它那一行的 `camera=()`。

- [ ] **Step 3: Commit**

```bash
git add deploy/nginx-tls.conf.example deploy/test/nginx.test.conf
git commit -m "fix: Permissions-Policy 放行本站相機，點交存證才能開鏡頭"
```

---

## 收尾驗證

- [ ] **全部測試**

Run: `npm run test`
Expected: 100 個測試檔、1180 passed、1 skipped（基準 1178 + Task 1 的 2 個新測試）

- [ ] **型別檢查**

Run: `npm run lint:types`
Expected: 無輸出

- [ ] **工作樹乾淨**

Run: `git status --short`
Expected: 沒有未提交的本計畫相關檔案。如果看到 `.env.example`、`deploy/backup.sh`、`backend/scripts/merge_into_school_db.py` 之類的東西，**那是別人正在進行的資料庫搬遷工作，不要提交它們**。

---

## 交回給人做的部分（Codex 無法執行）

Task 3 改的是 repo 裡的**範本**。正式站實際生效的是 **`deploy/nginx.conf`**，而那個檔案：

- **不在 repo 裡**，也沒被 git 追蹤（`git ls-files | grep nginx` 只會列出 `.example` 與 `test/` 兩份）
- 只存在於部署用的 VM 上
- 由 `deploy/Dockerfile.web:18` 的 `COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf` **build 進 image**，不是掛載進去的

所以要讓正式站真的能開相機，必須由人在 VM 上做這三件事：

1. 編輯 VM 上的 `deploy/nginx.conf`，把 `camera=()` 改成 `camera=(self)`（跟 Task 3 一樣的值）
2. 重建並重啟：`docker compose up -d --build web`
3. 確認標頭真的換了：
   ```bash
   curl -sI https://rentmate.software | grep -i permissions-policy
   ```
   應該看到 `permissions-policy: camera=(self), microphone=(), payment=()`

**在第 3 步確認之前，不要宣稱正式站的相機修好了。** 設定是 build 進 image 的，只改檔案不重建等於沒改。
