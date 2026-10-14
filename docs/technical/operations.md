# 部署、備份與故障排查

核對日期：2026-10-08。[返回入口](../README.md)

## 儲存庫提供的部署材料

目前包含前端建置設定、[`backend/Dockerfile`](../../backend/Dockerfile)、[`server/Dockerfile`](../../server/Dockerfile)。未包含完整正式用 `docker-compose.yml`、Nginx 設定或 `deploy.sh`；以下為需對齊的應用程式部署條件，不是已驗證的完整自動部署腳本。

建置範例（專案根目錄）：

```powershell
npm ci
npm run build
docker build -f backend/Dockerfile -t rentmate-backend ./backend
docker build -f server/Dockerfile -t rentmate-ocr .
```

OCR Docker build context 必須是根目錄，因為它依賴 `shared/`。FastAPI Docker context 為 `backend/`，但目前停電 API 等來源會讀取 `public/data/`；部署需另外提供檔案或 volume。不要只因映像建置成功就判斷所有靜態資料已包含。

## 部署順序與路由

1. 備份資料庫、上傳檔案與可解密的金鑰，確認可回復到舊版本。
2. 在測試環境核對 migration 與目前 schema，再於部署維護期間套用必要更新。
3. 注入 DB、簽章、加密與外部服務設定；配置持久化上傳目錄與必要靜態資料。
4. 啟動 FastAPI／OCR，設定 `FASTAPI_INTERNAL_URL` 為容器網路可達位址。
5. 發布 `dist/`，提供 SPA history fallback；API 路徑不可被 fallback 改成 `index.html`。
6. HTTPS 代理先分流 `/api/ocr` 至 OCR，其餘 `/api` 至 FastAPI。保留 Cookie、Authorization 及工作區標頭；上傳大小與 AI 逾時需和應用限制相容。
7. 驗證健康檢查、登入、資料重讀、檔案讀取、OCR 與所啟用的模型／通知。

前端建置環境應使用正式瀏覽器可達的 API 路徑；不能保留開發機 `localhost`。`COOKIE_SECURE=true`、CORS 與 OAuth callback 必須對應實際 HTTPS 網站。

## 排程與監控

FastAPI lifespan 每約 20 秒執行垃圾與一般通知派送；房東提醒每 180 輪檢查一次（約一小時，另加執行耗時）。監控以約 20 秒心跳、60 秒服務檢查、每小時清理為基準；每個程序均會啟動工作。

增加 Uvicorn workers／容器副本前需確認派送領取、鎖定與重複執行行為。OCR 的 review job 存記憶體，重啟会遺失；跨副本輪詢需要工作路由或共享工作儲存。這些條件未解決前，維持經驗證的部署拓樸。

FastAPI `GET /api/health` 即使 DB down 仍可能 HTTP 200、`status=ok`，必須同時檢查 `database=ok`。OCR `/api/health` 的 `credentialsConfigured` 只是檔案存在，不代表 Vision 權限、配額或 Ollama 可用。

## 備份與還原

備份範圍包括 MySQL、四類上傳目錄（點交／報修／契約／輪播）、靜態資料與使用中的法規語料／向量，以及分開保管的部署設定與金鑰。前端匯出的 CSV／JSON 不是完整系統備份。

備份頻率、保存期限及可接受的資料遺失時間由維運需求決定，目前 repo 沒有提供完整備份排程。還原演練應在獨立環境：還原 DB 與檔案、注入相同個資金鑰、檢查 schema、抽查加密欄位與附件、再驗證跨角色權限。不要只驗證 DB 匯入成功。

應用 rollback 不會自動 rollback 資料庫。涉及不可逆資料轉換時，需要事先定義備份還原或相容版本策略，不能僅重新部署舊映像。

## 常見排錯

| 症狀 | 優先檢查 |
| --- | --- |
| 啟動缺表／缺欄位 | `db.schema_check` 與必要 migration；不要清空 DB |
| 503 或資料讀不到 | DB health、連線與完整服務回應；不可顯示假空清單 |
| 登入成功但 OCR 401 | cookie 是否帶入、JWT 是否共用、`/api/auth/me` 是否有效、密碼是否剛變更 |
| OCR 503 | `FASTAPI_INTERNAL_URL` 可達性與帳號服務狀態 |
| AI 長時間等待／503 | provider 設定、模型可用、逾時、冷卻與上游日誌；見 [LLM 排錯](../local-llm-troubleshooting.md) |
| 部分加密資料無法讀 | `PII_ENCRYPTION_KEY` 與寫入時金鑰是否一致；禁止以更換金鑰嘗試修復 |
| 重啟後照片消失 | 上傳目錄是否持久化、路徑是否一致與備份是否含原檔 |
| OCR 有進度但未成功 | NDJSON 是否收到 `result` 或 `error`，不能只看 HTTP 200 |
| 停電／清運資料過期 | 來源 metadata、更新腳本是否實際排程及後端容器是否可讀檔案 |
| 通知重複 | 程序數量、排程領取／去重規則與重啟時間 |

使用 request 日誌與模組 logger 判斷出錯層級；分享日誌前確認不含密碼、憑證、完整個資或原始契約內容。實際線上主機、備份位置與告警收件人應維護於有權限的維運紀錄。
