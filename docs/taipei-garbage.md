# 臺北市垃圾清運功能

入口：`/app/garbage`。Vue 元件依功能放於 `src/components/garbage`，純資料規則放於 `src/utils/garbage.ts`，通知 API 位於 `backend/routers/garbage.py`。

## 滿版地圖與下一班倒數

地圖模式不再佔用側欄，查詢按鈕位於地圖左上角，以具焦點管理及 Escape 關閉功能的彈窗呈現條件。列表模式保留條件欄。

`garbage-countdown.ts` 以 Asia/Taipei 計算同行政區、同地址的下一次表定班次，包含當日後續班次、跨午夜 24:xx 與一般清運停收日。一小時內每秒更新分秒。查詢日期用於篩選結果；下一班倒數始終基於現在時間，兩者用途不同。臨時停收尚未自動同步。

三種類別獨立計算，`GarbageStop.collections` 可接受各類型的時間與每週收運日。目前原始資料沒有回收、廚餘獨立班表，顯示待提供資料，不複製一般清運時間。新提供的 `(1).csv` 與原始快照 SHA-256 相同，官方來源更新時間為 2026-08-25 16:33:23。

準誤點尚未啟用。預估誤點為「預測抵達－表定抵達」，實際誤點為「確認到站－表定抵達」。可靠 ETA 需連續車輛 GPS、路線匹配、站點進度、路段行車與停靠歷史；只有單筆位置或站點 CSV 不足以支持此預測。Google 道路時間只能作輔助，不包含清運停靠時間。介面與操作指引明確區分表定倒數與真實抵達。

## 原始資料

含「回收車」、「每週／每周」文字備註的特殊站點，不推測一般清運倒數；先保留原文與表定時段，待取得結構化收運日及類別班表後啟用。

`public/data/taipei-garbage.csv` 是使用者提供的「●垃圾車清運點位資訊.csv」快照，於 2026-09-08 匯入，共 4,010 筆，涵蓋 12 行政區。相同路口可能登記在兩個里，因此識別碼保留里別、路線、車次、地址及抵達時間。經緯度順序依欄位名稱解析，CSV 引號、逗號及換行均受支援。

- 官方資料集：https://data.gov.tw/dataset/136515
- 臺北資料平臺：https://data.taipei/dataset/detail?id=6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae
- 一般清運週三、週日停收規則：https://www.dep.gov.taipei/News_Content.aspx?n=ACEFA960B5A4ACD7&s=A00A0483EDD01410
- tptrash-api 參考：https://github.com/ccjeng/tptrash-api

本次未將 tptrash-api 的舊 HTTP 示範主機作為正式依賴，也未確認到可直接使用的臺北市官方車輛 GPS 動態資料服務。站點 CSV 是班表，無車輛動態、當天到站預測或臨時停收欄位。畫面因此明確標示表定時間，週三、週日依一般清運規則顯示停收；特殊收受點和臨時公告需至官方確認。

資料檢核發現 9 筆座標缺漏或超出臺北合理範圍，保留原始資料供列表、收藏及提醒使用，地圖與附近查詢僅使用其餘 4,001 筆；異常站點導航改以地址查詢，不推測修正原始經緯度。另有 3 筆跨午夜班次含 `24xx` 時間，顯示為 `24:xx`，代表班表日期的隔日凌晨。提醒計算以班表日期判斷停收日，再加上實際小時偏移，因此週二 24:11 仍屬週二班次。

更新資料：使用相同欄位結構替換 CSV，重新建置前端並重新啟動後端（後端會快取班表）。已排程提醒會保留建立時的班表快照；如官方修改清運時間，需刪除舊提醒後重設。此版本不自動同步官方 CSV。

附近與手動查詢使用 Haversine 距離，原始浮點距離 `<= 500` 才納入，顯示時才四捨五入。附近列表列出所有班表站點，並標示今天的表定狀態；地圖／列表查詢則依指定日期篩選。地圖使用 MapLibre 與 OpenFreeMap，保留地圖來源標註。

## 車輛 GPS 介接

管理者可在後端 `.env` 設定 `TAIPEI_GARBAGE_GPS_URL`，指向已獲准使用並完成欄位轉換的 HTTPS 資料服務。金鑰應在服務端設定，不放前端。這是本系統的標準化資料介面，不宣稱任何官方服務已提供此格式：

```json
{"vehicles":[{"plate":"821-BT","lat":25.11836,"lng":121.525,"updatedAt":"2026-09-08T18:30:00+08:00"}]}
```

API 路徑：`GET /api/garbage/vehicles`。後端快取 20 秒，頁面每 30 秒更新；只接受臺北合理座標、具時區的時間戳，並排除超過 120 秒或未來超過 30 秒的定位。無設定、來源失敗或資料過期時清除動態標記，顯示實際狀態；GPS 不用來偽造到站分鐘數。

## 提醒服務

使用既有正式租客 Bearer token 與 MySQL 帳號資料驗證身分，寄送對象固定為該帳號的 email，前端不能指定其他收件者。提醒資料存於 `backend/garbage-reminders.db`（Git 已忽略 `*.db`），可透過 `GARBAGE_REMINDER_DB` 指定持久化路徑。

FastAPI lifespan 會啟動每 20 秒檢查一次的排程。正式使用需保持後端常駐，並確保提醒 SQLite 檔案可持久保存。相同 DB 檔案中的原子領取避免多 worker 重複寄送；不支援多台主機各自維護獨立 DB 的部署方式。提醒超過五分鐘才被排程器看到會標記 `missed`，失敗標記 `failed`；若程序在領取後中斷，會保留 `sending` 待人工確認，以免不確定的 SMTP 交易自動重寄。SMTP 接受郵件不保證收件匣送達。

API：`GET /capabilities`、`GET/POST /reminders`、`PATCH/DELETE /reminders/{id}`，均位於 `/api/garbage` 下。讀寫提醒必須登入，最多 50 筆未到期且啟用的提醒。時間固定使用 UTC+08:00，拒絕停收日、過期時間與一年後的日期。

### Gmail

沿用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_APP_PASSWORD`、`SMTP_FROM_EMAIL`。預設 Gmail 主機與 STARTTLS 587。需完成 SMTP 設定後重新啟動後端；本次驗證使用 mock 寄送器，沒有發送真實郵件。

### 系統推播

安裝更新後的 `backend/requirements.txt`（新增 `pywebpush`），並在後端設定：

```dotenv
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:your-service-contact@example.com
```

公私鑰需為相同 P-256 VAPID 金鑰組，公鑰為 base64url 編碼的未壓縮公鑰，私鑰可為 pywebpush 支援的 PEM 檔案路徑。私鑰及 SMTP 密碼禁止提交。未設定或未安裝推播套件時，前端會禁用該通知方式。

推播需 HTTPS（localhost 可開發測試），由使用者按保存提醒時授權；service worker `/garbage-sw.js` 處理背景通知及導向清運頁。服務部署於網域根目錄；iOS 等裝置可能需安裝到主畫面。支援 Chrome/Firefox/Edge/Safari 常見推播端點，拒絕使用者提供任意主機。新瀏覽器供應者需經確認後更新端點允許清單。

## 驗證

```powershell
npm run build
npm test -- src/utils/garbage.test.ts
```

於 `backend` 目錄執行：

```powershell
python -m unittest discover -s tests -p test_garbage.py -v
```

測試涵蓋 CSV 欄位、12 行政區、500 公尺邊界、跨午夜篩選、臺北時區與停收日、GPS 資料過期、提醒帳號隔離、排程去重、暫停、逾時及寄送失敗。GPS 真實資料源與實際郵件／裝置推播須在部署環境完成端到端驗證。

另可於 Windows 安裝 Chrome 並啟動前端後執行 `node scripts/verify-garbage-browser.mjs`。測試建立暫存的獨立 Chrome profile，攔截提醒 API，不寄送真實通知；檢查七個分頁、行政區篩選、收藏持久化、GPS 附近查詢及手機版溢出，截圖位置會輸出於終端。可用 `GARBAGE_TEST_ORIGIN` 和 `CHROME_PATH` 調整測試網址與瀏覽器位置。
