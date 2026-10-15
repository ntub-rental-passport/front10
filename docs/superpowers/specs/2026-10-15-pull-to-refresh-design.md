# 下拉刷新與上傳後自動重抓 Design

日期：2026-10-15。範圍：租客端（`/app`）與房東端（`/landlord`）的手機版面。

## 問題

兩件事，同一個根源 —— 畫面沒有「再抓一次資料」的入口：

1. 正常狀態下，使用者沒有任何重新整理的方式。`useHandover` 的 `reload()` 只掛在
   **錯誤訊息裡**的「重新載入」按鈕上（`src/pages/handover/baseline.vue:258` 等三處），
   沒出錯就看不到那顆按鈕。
2. 點交上傳照片後，只有 `replaceItem()` 把回傳的那一個項目換掉，不會重抓清單，
   所以配對狀態、張數這類跨項目的資訊不會跟著更新。

使用者明確要求：**不要用按鈕解決**，要下拉手勢。

## 做法選擇

| 做法 | 評估 |
|---|---|
| 現成套件（vue-pull-refresh 之類） | 多一個相依、樣式難統一，而且這類套件多半假設自己就是捲動容器，跟現有版面結構會打架 |
| 每頁各自實作 | 範圍是全站，不可行 |
| **一層共用手勢 ＋ 頁面註冊刷新函式** | **採用**。沒有新相依，與既有的 `useInbox`、`usePublicContent` 的 module-scope 單例寫法一致 |

## 架構

| 檔案 | 職責 |
| --- | --- |
| `src/composables/usePullToRefresh.ts` | 純手勢判斷。吃 touch 事件序列，輸出 `pullDistance` 與狀態（idle／pulling／armed／refreshing）。不依賴特定頁面，可單獨測試 |
| `src/composables/useRefreshTarget.ts` | 註冊表。頁面在 `onMounted` 呼叫 `registerRefresh(fn)`，卸載時自動解除。**沒有註冊就退回 `location.reload()`** |
| `src/components/PullToRefresh.vue` | 視覺指示（下拉箭頭／轉圈）。在版面掛一次，包住內容區 |

掛載點是兩個版面各一次：`src/components/layouts/AppLayout.vue`（租客）與
`src/components/layouts/LandlordLayout.vue`（房東）。後台（`/admin`）不做。

### 為什麼要註冊表而不是一律整頁重載

整頁 `location.reload()` 在點交這種頁面會白閃一下，而且已選的租約、捲軸位置都要重建。
但要求每一頁都先接好才給下拉，會造成「為什麼這頁拉不動」的不一致。
所以折衷：**有註冊就用自訂刷新，沒註冊就整頁重載** —— 每一頁都有反應，之後再逐頁改成不閃的版本。

## 手勢規則

這幾條是避免它變成災難的關鍵：

- 只在 `(pointer: coarse)` 的觸控裝置啟用。沿用既有的 `useDeviceGate` 的 `coarsePointer`，
  不要重造一份判斷。桌機不做 —— 瀏覽器本來就有重新整理。
- 只有捲動容器已經在最頂端（`scrollTop === 0`）而且手指向下超過門檻才觸發。
- 橫向位移大於縱向就放棄。否則會吃掉點交照片輪播的左右滑。
- `[data-no-pull-refresh]` 子樹內一律不觸發。地圖容器（垃圾清運、停電頁）要掛這個屬性，
  它們自己要吃拖曳手勢。
- 顯示 `DesktopOnlyNotice` 擋板時不啟用 —— 那頁沒有資料可以刷新。
  房東端在手機上擋掉的是 `/landlord/finance` 與 `/landlord/contracts`（見 `src/utils/mobile-surface.ts`）。
- iOS Safari 的橡皮筋捲動會跟手勢搶，需要 `overscroll-behavior-y: contain`。

## 上傳後自動重抓

`useHandover.addEvidence()` 在辨識跑完之後呼叫 `loadItems()`，只重抓目前這份租約的項目清單，
不重抓租約清單（`/properties`）—— 已選的租約與捲軸位置不該因為傳一張照片就跳掉。

放在 `try/finally`：**辨識失敗也要重抓**。照片已經存進資料庫了，畫面不該停在舊狀態。

## 測試

- `usePullToRefresh`：給定 touch 事件序列，斷言是否觸發。涵蓋捲動不在頂端、橫向滑動、
  未達門檻、`data-no-pull-refresh` 子樹這四種不該觸發的情況。
- `useRefreshTarget`：註冊、解除、以及沒註冊時退回整頁重載。
- `useHandover`：上傳後有呼叫 `loadItems()`，且辨識失敗時仍然呼叫。
  既有的 `src/composables/useHandover.test.ts` 已經 mock 了 request，加測試很容易。

## 明確不做

- 桌機的下拉手勢
- 後台（`/admin`）
- 任何形式的刷新按鈕
- 逐頁把 fallback 的整頁重載改成自訂刷新 —— 這輪只接點交三頁，其餘頁面先用 fallback
