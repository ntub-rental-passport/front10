# 後台總覽圖表化 設計規格

日期：2026-07-17
狀態：已核准

## 目標

後台總覽（`/admin`）的四張純數字統計卡改為「圖表為主、數字嵌入」的圖表卡，提升直觀度。待辦佇列、最新稽核事件、重置示範資料功能維持不變。

## 技術選擇

- 圖表庫：`chart.js` + `vue-chartjs`（Vue 3 官方封裝），使用者指定。
- 資料聚合直接在頁面 computed 完成，沿用既有 admin composables，不動資料層。

## 圖表對應

| 卡片 | 圖表 | 內容 | 嵌入數字 | 點擊導向 |
|---|---|---|---|---|
| 待審核項目 | 環圈圖 | 待審物件／待審評價／已處理 | 環中心＝待審總數 | /admin/review |
| 使用者組成 | 環圈圖 | 租客／房東／管理員 | 環中心＝使用者總數；卡底小字顯示停用數 | /admin/users |
| AI 產出品質 | 長條圖 | 1–5 星評分分布 | 角落 Badge「需複核 N 筆」 | /admin/ai-quality |
| 稽核事件趨勢 | 長條圖 | 近 7 天每日事件數 | 角落顯示今日數；今日柱高亮 | /admin/audit |

## 元件切分

- `src/components/admin/DonutStatCard.vue`：Card 外框＋標題＋vue-chartjs Doughnut＋環中心數字（絕對定位覆疊）＋卡底備註＋RouterLink 整卡導向。
- `src/components/admin/BarStatCard.vue`：Card 外框＋標題＋角落數字/Badge＋vue-chartjs Bar＋RouterLink 整卡導向。
- 兩元件透過 props 接收 labels、data、colors、centerValue/cornerValue、to、note；不含任何業務邏輯。
- `src/pages/admin/index.vue`：移除原 statCards 數字卡渲染，改組四張圖表卡；新增 computed：角色分布、評分分布、近 7 天每日事件數、待審/已處理分布。

## 視覺規範

- 配色沿用現有 primary 藍紫色系（多段以不同明度區分），警示（≤2 星、待審）用 destructive 紅。
- Chart.js 只註冊需要的元件（ArcElement、BarElement、CategoryScale、LinearScale、Tooltip），不顯示內建 Legend（圖例以自訂小點列呈現，樣式與現有 UI 一致）。
- Tooltip 保留（hover 顯示確切數值）。
- 遵循 dataviz 設計準則：足夠對比、不用漸層裝飾、輔以文字數字避免僅靠顏色傳達。

## 錯誤處理

- 空資料（重置後或分母為 0）：圖表以「已處理 0／全部 0」仍可渲染；長條圖 y 軸最小刻度 1，避免空圖表破版。

## 驗證

- `npm run lint` 通過。
- 瀏覽器：四張圖渲染正確、數字與各模組一致；在審核模組通過一筆物件後回總覽，環圈圖即時更新；重置示範資料後圖表回種子狀態；點擊卡片導向正確模組。
