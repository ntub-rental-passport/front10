# 新北市清運查詢

在垃圾清運頁面右上角或查詢條件切換「臺北市／新北市」。新北市支援 29 行政區、里別、道路、日期時間篩選、500 公尺附近與手動查詢、路線站序、收藏及表定提醒。原本臺北市收藏 ID 保持不變；新北市使用 `ntpc|lineid|rank|latitude|longitude`，避免跨城市碰撞。

## 資料

- 官方開放資料：<https://data.ntpc.gov.tw/api/datasets/edc3ad26-8ae7-4916-a00b-bc6048d19bf8/json>
- 參考整合與 API 說明：<https://github.com/PinLin/new-taipei-rubbish-homeassistant>。未安裝 Home Assistant，也未複製其程式碼。
- `public/data/new-taipei-garbage.json` 是完整分頁快照；來源摘要在同目錄 `new-taipei-garbage-source.json`。
- 本次匯入 26,655 筆停靠班次，並非相同數量的實體站點。29 行政區皆有資料。
- `garbage*`、`recycling*`、`foodscraps*` 的每週欄位分開計算三種倒數，不套用臺北市週三／週日停收。
- 官方資料僅提供抵達時間。新版 UI 暫以抵達後 10 分鐘作為估計離站時間，`departureEstimated` 為 true，地圖以「約」標記；不是官方離站時間或 GPS 實測。區間包含離站時刻整分鐘，20:36:59 仍在區間，20:37:00 才結束。臺北市使用原始離站時間，亦套用整分鐘邊界。路線依 `lineid` 分組、`rank` 排序，虛線仍只是站序示意。
- 匯入時間不是官方更新時間，也不是 GPS 更新時間。

## 更新與部署

```sh
npx tsx scripts/update-new-taipei-garbage.ts
npx tsx scripts/update-new-taipei-garbage.ts --write
```

預設僅檢查，`--write` 才更新快照。檢查必要欄位、每週班表、29 行政區、唯一 ID、座標及筆數變化（超過 20% 必須人工確認）。全部驗證通過才替換資料。`--validate-local --write` 可驗證既有本地快照並重建摘要，不呼叫網路。

現有每月 GitHub Actions 已納入新北市資料及測試，產生待審核 PR；尚須提交與推送工作流程才會生效，不會直接部署。前後端必須一起部署 `public/data`，並重啟後端以清除班表快取。既有提醒保留建立時的班表快照。

## 尚未串接

新北官網 `GetAroundPoints`、`GetArrival` 的即時狀態、車輛位置與 ETA 尚未整合。本次不將表定倒數當作即時 GPS，不顯示臺北車輛為新北車輛。臨時停收與特殊公告未自動匯入。推播／Gmail 沿用後端設定，必須有有效憑證與正式部署才可實際發送；本次測試不寄信。
