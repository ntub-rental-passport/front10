# 管理員後台：AI 使用量與額度預警

日期：2026-08-03
狀態：設計完成，待實作

## 一、背景與目標

後台目前有一頁「AI 品質監控」（`/admin/ai-quality`），追蹤契約分析與談判腳本的使用者評分，把 2 分以下列為需人工複核。這頁解決的是產出品質問題，但沒有回答一個更急迫的營運問題：**平台向 AI 廠商買的額度還剩多少、什麼時候會用完。**

額度用盡的後果是全站 AI 功能直接停擺，而且往往在沒有預警的情況下發生。本設計以「AI 使用量與額度」取代「AI 品質監控」，讓管理員在額度耗盡前就看到警訊。

### 明確不做的事

- **不做使用者層級的額度監控。** `src/mocks/admin/subscription.ts` 已有 `aiQuota` / `aiUsed`（免費 3 次、進階 20 次、專業 100 次），那是「使用者方案的 AI 次數」，顯示在「訂閱與容量管理」頁。本頁監控的是**平台自己付費給廠商的 API 額度**，兩者是不同的東西，不可混為一談。
- **不做真實計量。** 目前 `server/`、`backend/`、`src/` 完全沒有任何 token 記帳（沒有 `usageMetadata`、`totalTokens`、`promptTokenCount`）。本次以 mock 資料實作，但型別與 composable 介面按真實 API 回傳的形狀設計，日後接真實資料只需替換資料來源，頁面與計算邏輯不必重寫。
- **不監控 Ollama。** 它跑在本機 `127.0.0.1:11434`，不花錢也沒有額度上限，納入只會稀釋這頁的焦點。

### 監控範圍

| 供應商 | 計量單位 | 說明 |
|---|---|---|
| Gemini API | token | 契約分析、談判腳本 |
| Google Cloud Vision | page | 合約 OCR，按頁計費 |

## 二、資料模型

### 用量資料 `src/mocks/admin/ai-usage.ts`

取代 `src/mocks/admin/ai-quality.ts`。

```ts
export type AiProviderId = 'gemini' | 'vision'
export type AiUsageUnit = 'token' | 'page'

export interface AiProvider {
  id: AiProviderId
  label: string        // 'Gemini API' / 'Google Cloud Vision'
  unit: AiUsageUnit
}

export interface AiUsageDaily {
  date: string         // YYYY-MM-DD
  provider: AiProviderId
  units: number        // token 數或頁數
  calls: number        // 呼叫次數
}
```

`seedAiUsage()` 產生近 30 天 × 2 個供應商 = 60 筆。

seed 以「今天」為基準動態產生（沿用 `src/mocks/admin/helpers.ts` 的 `daysAgo`），與其他 admin mock 一致。

**seed 必須包含一個「用量未破門檻但消耗速度暴衝」的情境**：讓 Gemini 最近 3 天的每日消耗約為前期的兩倍，使其本月用量低於 80% 黃燈門檻，但預估耗盡日早於月底。若沒有這筆情境，預警邏輯中最有價值的那條規則在畫面上永遠不會被觸發，等於沒有被示範到。

由於 seed 相對於今天產生，當月已過天數會隨執行日期變動：月初執行時本月累計用量自然偏低，此時規則一不會亮燈，但規則二（近 7 日平均 × 本月剩餘天數 > 剩餘額度）仍會觸發預警。這正是預期行為，不是缺陷 —— 不需要為了讓規則一也亮燈而去調整 seed。

### 額度設定 `src/mocks/admin/settings.ts`

額度上限與門檻屬於系統層級設定，放進既有的 `SystemSettings`，由 `/admin/settings`（僅 super 可見）維護，使用量頁只讀不寫。

```ts
platformGeminiTokenQuota: number   // 每月 token 上限，seed 2_000_000
platformVisionPageQuota: number    // 每月頁數上限，seed 3_000
quotaWarnPercent: number           // 黃燈門檻，seed 80
quotaCriticalPercent: number       // 紅燈門檻，seed 95
```

**必須使用平鋪欄位，不可用巢狀物件。** 兩個理由：

1. `useAdminSettings.saveSettings` 以 `previous[key] !== next[key]` 做淺比較決定是否寫稽核紀錄。巢狀物件每次存檔都是新的參考，會導致**每次存檔都誤報「已變更」**，稽核紀錄被灌水。
2. 既有的 `defaultAiQuota`（使用者每日配額預設值，值 3）名稱相近。加 `platform` 前綴並把單位寫進欄位名，才能在閱讀程式碼時一眼分辨。

### localStorage 遷移（必要）

`useAdminSettings.ts` 目前是：

```ts
const settings = createAdminCollection<SystemSettings>('settings', seedSettings)
```

沒有傳第三個 `migrate` 參數。任何瀏覽器中已存在 `rentmate-admin:settings` 的使用者，舊資料會被原樣採用，四個新欄位為 `undefined`，百分比計算得出 `NaN`，整頁失效。

`createAdminCollection` 本就支援 `migrate`，本次必須補上，將缺少的欄位補為 seed 預設值：

```ts
const settings = createAdminCollection<SystemSettings>('settings', seedSettings, (raw) => ({
  ...seedSettings(),
  ...raw,
}))
```

## 三、計算與預警判定

純函式置於 `src/utils/admin-ai-usage.ts`，不依賴 Vue，可直接以 vitest 測試（比照 `src/utils/admin-rbac.ts` 與其測試檔的既有慣例）。

```ts
monthToDateUnits(records, provider, today): number       // 本月累計用量
dailyAverage(records, provider, today, days = 7): number // 近 N 日平均
daysUntilExhausted(remaining, dailyAvg): number | null   // null 表示消耗為 0
quotaStatus(input): 'ok' | 'warn' | 'critical'
```

### 計費週期定義

額度以**自然月**計算，每月 1 日歸零 —— 這是 Gemini 與 Google Cloud 的計費方式。因此：

- 「本月累計用量」= 當月 1 日至今天的用量總和
- 「本月剩餘天數」= 今天到當月最後一日的天數（今天算在內）
- `daysUntilExhausted` 回傳值**向下取整**（`Math.floor`），寧可低估可撐天數也不要高估

30 天的趨勢圖是跨月的滑動視窗，僅供觀察消耗速度變化，與額度計算的當月區間是兩回事，實作時不要混用同一份切片。

### 預警規則

`quotaStatus` 同時評估兩條規則，**取較嚴格者**：

**規則一（用量門檻）**
- 用量百分比 ≥ `quotaCriticalPercent` → `critical`
- 用量百分比 ≥ `quotaWarnPercent` → `warn`

**規則二（耗盡預估）**
- 預估可撐天數 ≤ 3 → `critical`
- 預估可撐天數 ≤ 本月剩餘天數 → `warn`

規則二是本設計的核心價值。只有規則一的話，必須燒到 80% 才會亮燈，而消耗速度突然翻倍時，從 60% 到用盡可能只需幾天，屆時才示警已來不及。規則二讓「用量還不高但這幾天暴衝」的情況提前浮現。

### 邊界情況

| 情況 | 行為 |
|---|---|
| `dailyAvg === 0` | `daysUntilExhausted` 回 `null`，畫面顯示「—」，不預警 |
| 額度設為 `0` | 視為**未設定**，顯示「未設定額度」，不計算百分比、不預警（避免除以零） |
| 用量已超過額度 | 剩餘顯示 `0`（不顯示負數），狀態直接 `critical` |
| 當月資料不足 7 天 | `dailyAverage` 以實際天數為除數，不以 7 為除數 |

## 四、頁面設計

### 使用量頁 `src/pages/admin/ai-usage.vue`

標題「AI 使用量與額度」。

**供應商卡片**（`md:grid-cols-2`，每個供應商一張）：
- 卡頭：供應商名稱 + 狀態 Badge（正常 `secondary` ／ 注意 `outline` ／ 告急 `destructive`）
- 主數字：`本月已用 1,240,000 / 2,000,000 tokens`
- `components/ui/progress` 進度條，依狀態上色
- 三個次要指標並排：剩餘、近 7 日平均（每日）、預估可撐 X 天

**近 30 天趨勢卡**：新增 `src/components/admin/UsageTrendChart.vue`，使用 `vue-chartjs` 的 `Line`，兩條線對應兩個供應商。`chart.js` 與 `vue-chartjs` 已是專案既有依賴（`src/components/admin/BarStatCard.vue`、`DonutStatCard.vue` 已在使用），不引入新套件。

不複用 `BarStatCard`：它的 props 含 `to` 與 `cornerText`，是為總覽頁的可點擊摘要卡設計的，塞入 30 天明細會扭曲其用途。

**每日明細表格**：日期 / 供應商 / 用量 / 呼叫次數。預設只顯示近 7 天，提供「顯示全部 30 天」切換，避免一進頁面就是 60 列。

### 總覽頁 `src/pages/admin/index.vue`

目前 `queueItems`（第 100-112 行）由 `useAdminAiQuality().needsReviewCount` 產生：

```
AI 低分產出人工複核（N 筆） → /admin/ai-quality
```

改由 `useAdminAiUsage()` 的告警供應商清單產生，每個狀態非 `ok` 的供應商一項：

```
Gemini API 額度告急（預估 2 天後用盡） → /admin/ai-usage
```

`tag` 由 `'AI品質'` 改為 `'AI額度'`。全部正常時佇列為空，與現行行為一致。

### 系統設定頁 `src/pages/admin/settings.vue`

「使用限制」卡片下方新增「AI 平台額度」區塊，四個 `type="number"` 輸入對應前述四個欄位。

`src/utils/settings-validate.ts` 新增驗證：
- 兩個額度上限：非負
- 兩個門檻：介於 1 到 100
- **`quotaWarnPercent < quotaCriticalPercent`** —— 黃燈門檻若填得比紅燈高，狀態判定將永遠跳不到 `warn`，此驗證不可省略

## 五、移除 `ai-quality` 的連帶影響

共 9 個引用點，遺漏任一處都會造成編譯錯誤或白畫面。

| 檔案 | 動作 |
|---|---|
| `src/pages/admin/ai-quality.vue` | 刪除，新增 `ai-usage.vue` |
| `src/mocks/admin/ai-quality.ts` | 刪除，新增 `ai-usage.ts` |
| `src/composables/admin/useAdminAiQuality.ts` | 刪除，新增 `useAdminAiUsage.ts` |
| `src/mocks/admin-seed.ts:2` | `export *` 改指向 `./admin/ai-usage` |
| `src/utils/admin-rbac.ts:36` | 標籤改「AI 使用量」，path 改 `/admin/ai-usage` |
| `src/utils/admin-rbac.test.ts:16` | 權限矩陣 key 同步更新 |
| `src/composables/admin/useAdminRbac.ts:25` | 圖示 map 的 key 更新，`Sparkles` 改為計量語意的圖示（如 `Gauge`） |
| `src/pages/admin/index.vue:19,32,106,151` | 更換 composable 與連結 |
| `src/router/index.ts:55` | 路由路徑與元件更名 |

權限不變：`/admin/ai-usage` 維持 `['super', 'admin']`，與原 `/admin/ai-quality` 相同。

### 需同步更新的文件

`docs/superpowers/specs/2026-08-02-admin-console-revamp-design.md`（目前未提交）第 141、150、300、325-326 行仍記載「AI 品質監控」，須同步改為「AI 使用量」，否則 spec 與程式碼將不一致。

### localStorage 殘留

舊 key `rentmate-admin:ai-quality` 會留在瀏覽器中，但無害：`resetAdminData` 已有清除未註冊 key 的邏輯。

## 六、測試

### `src/utils/admin-ai-usage.test.ts`（新增）

- `monthToDateUnits`：只計當月；跨月邊界不誤計上月資料
- `dailyAverage`：不足 7 天時以實際天數為除數；全零回 0
- `daysUntilExhausted`：平均為 0 回 `null`；剩餘為 0 回 0
- `quotaStatus` 四種關鍵組合：
  1. 百分比高、消耗慢 → 由規則一決定
  2. **百分比低、消耗快 → 由規則二決定**（本設計的核心價值，必測）
  3. 額度為 0 → 未設定，不預警
  4. 已超量 → `critical`，剩餘為 0 不為負

### `src/utils/settings-validate.test.ts`（既有，補充）

- 額度為負 → 報錯
- 門檻超出 1-100 → 報錯
- `quotaWarnPercent >= quotaCriticalPercent` → 報錯

### settings 遷移

驗證舊 localStorage 缺少四個新欄位時，`migrate` 補回 seed 預設值，畫面不出現 `NaN`。
