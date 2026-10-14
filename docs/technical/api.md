# API 串接與錯誤處理

核對日期：2026-10-08。[返回入口](../README.md)

## 契約來源

完整路徑見 [API 索引](../reference/api-inventory.md)。FastAPI 啟動後提供 `/docs`、`/redoc`、`/openapi.json`，請求欄位、必要值、型別與 response model 以執行中的版本為準。Express OCR 不在 FastAPI 的 OpenAPI 中。

既有 API 並沒有全面統一回應 envelope；有的直接回陣列，有的回物件，有的成功回 204。呼叫端應沿用對應 `src/services/`，不要對所有成功回應一律執行 `response.json()`。

## 認證與工作區

| 請求種類 | 所需資訊 |
| --- | --- |
| Cookie API | `access_token` HttpOnly cookie；fetch 依同源／跨來源情況使用 `credentials` |
| Bearer API | `Authorization: Bearer <accessToken>`；這是專案自訂 token，不能當作 JWT 解析 |
| 房東團隊工作區 | 認證之外可能需要 `X-Landlord-Workspace`；後端驗證成員與操作權限 |
| OCR 用量回報 | `X-Service-Token`，由 OCR 使用共用 `JWT_SECRET` 簽短效服務 JWT |
| 公開端點 | 例如健康檢查、公開內容或邀請摘要；公開不代表後續接受／修改也公開 |

登入、重新取得 session、角色切換及登出請使用 `authApi.ts` 與 `useAuth.ts`。前端路由限制只處理使用體驗，後端必須檢查角色、帳號狀態與資料所有權。

## 重要流程

| 功能 | 流程與來源 |
| --- | --- |
| 帳密／Google | `/api/auth/*`；Google callback 與 ticket exchange 是獨立步驟 |
| 密碼重設 | `/api/auth/password/reset/start` → 郵件驗證碼 → `/reset/complete`；`/change` 需已登入 |
| 合約 | `/api/contract/analyze`、`/chat`、`/finalize`、`/rentals`；OCR 上傳成功不等於契約已存檔 |
| 房東租務 | `/api/landlord/*`；租客清單、財務、附件與團隊工作區分模組 |
| 租客讀取房東帳款 | `/api/tenant/landlord-leases/*`；不同於 OCR 契約的 `rentals` |
| 點交 | `/api/inspection/*`；純數字目標為自己的 `rentals`，`lease:<id>` 為可見的房東租約 |
| 站內信／排程／後台 | 詳見對應 `inbox_api.py`、`scheduled_notifications.py` 與 `admin_*` router |

## OCR 協定

`POST /api/ocr` 接收 `multipart/form-data`，檔案欄位名稱為 `files`。cookie JWT 驗證後會呼叫 FastAPI `/api/auth/me` 再確認帳號與 session 狀態。FastAPI 無法確認登入時 OCR 回 503。

一般模式回傳 JSON；若 form 欄位 `progressStream=ndjson`，回傳 `application/x-ndjson`，逐行事件包含 `progress`、`result` 或 `error`。串流已開始後的失敗可能以 `error` 事件表達，HTTP 200 不代表辨識成功。代理需避免緩衝此回應。

背景複核由 `GET /api/ocr/review/:jobId` 輪詢；只允許工作擁有者讀取。工作存於程序記憶體，TTL 為 15 分鐘；過期、重啟或請求到另一程序可能回 404，應保留已取得的規則結果並讓使用者繼續校對。

## 狀態碼與前端行為

| 狀態 | 常見意思 | 處理 |
| --- | --- | --- |
| 400 | 業務輸入或格式不合法 | 顯示該模組訊息，保留可修正輸入 |
| 401 | 未登入、過期、變更密碼後憑證失效 | 同步登入狀態並要求重新登入 |
| 403 | 角色、工作區或操作權限不足 | 呈現無權操作，不以重試繞過 |
| 404 | 資源不存在或不可見 | 不假設其他帳號的資源存在 |
| 409 | 狀態／版本衝突 | 重新載入資料後再決定下一步 |
| 413 | 上傳超過限制 | 依前端、API 與代理三層限制調整檔案 |
| 422 | FastAPI schema 或業務驗證失敗 | 解析 `detail`，避免直接顯示物件字串 |
| 429 | 次數或上游限流 | 依模組冷卻規則提示稍後重試 |
| 503 | DB、寄信、模型或帳號服務不可用 | 保留輸入，不將失敗當成空資料／分析結果 |

FastAPI 常使用 `detail`，OCR 常使用 `error`，部分服務另有格式。以上是既有行為的整理，並非新增的統一錯誤規格。新增端點時需同步 service、權限測試與路由索引。
