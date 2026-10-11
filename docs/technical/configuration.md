# 環境設定與服務依賴

核對日期：2026-10-08。[返回入口](../README.md)

## 載入與作用範圍

設定範本為 [`.env.example`](../../.env.example)。本機後端使用根目錄 `.env`；Express 使用 `dotenv/config`，執行工作目錄會影響尋找位置。FastAPI 的驗證模組明確載入根目錄 `.env`，資料庫模組亦呼叫 `load_dotenv()`。容器應直接注入環境變數或提供經確認的設定檔。

Vite 依模式載入 `.env`、`.env.local` 與模式設定；`VITE_` 變數會進入瀏覽器建置內容，不能放私密金鑰。前端設定更改後需重啟開發伺服器；正式建置需重新 build。

## 核心設定

| 設定 | 用途與條件 |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy 業務資料庫；MySQL 使用 `mysql+pymysql://...`。未設定可讓部分流程啟動，但資料 API 會不可用 |
| `PII_ENCRYPTION_KEY` | Base64 編碼的 32 bytes AES-GCM 金鑰；共用資料與還原環境必須一致 |
| `JWT_SECRET` | HttpOnly cookie 與 OCR 服務憑證簽章；FastAPI／Express 共用，缺少時拒絕啟動 |
| `AUTH_TOKEN_SECRET` | 自訂 Bearer 簽章；缺少時無法簽發／驗證該憑證 |
| `VERIFICATION_CODE_SECRET` | 郵件驗證碼相關 HMAC；不能使用公開占位值 |
| `FRONTEND_URL` | OAuth 回跳與服務產生前端連結的位址 |
| `VITE_API_BASE_URL` | 前端業務 API，範本為 `http://localhost:8000/api`；各 service 的拼接方式見來源 |
| `VITE_OCR_API_URL` | Vite OCR 開發代理的目標 |
| `FASTAPI_INTERNAL_URL` | OCR 呼叫 FastAPI 的內部根 URL，本機預設 `http://127.0.0.1:8000`；容器中須改成服務網路位址 |
| `CORS_ORIGINS` | FastAPI 允許來源，逗號分隔；跨來源帶 cookie 時需精確匹配來源 |
| `COOKIE_SECURE` | 本機 HTTP 設 `false`，正式 HTTPS 設 `true` |

同一資料庫的開發者需共用個資加密金鑰。不同的資料庫與測試環境應各自管理設定。簽章金鑰變更會使既有 session 失效；個資金鑰變更則會使舊資料無法解密，不能當作一般設定更新。

## 外部功能

| 功能 | 設定名稱 | 未配置時影響 |
| --- | --- | --- |
| 郵件 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_APP_PASSWORD`、`SMTP_FROM_EMAIL`、`SMTP_FROM_NAME` | 需寄信的驗證與通知流程無法完整使用 |
| Google 登入 | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 或 `GOOGLE_CLIENT_SECRET_FILE`、`GOOGLE_REDIRECT_URI`、`VITE_GOOGLE_CLIENT_ID` | Google 登入不可用；不等同一般帳密不可用 |
| OCR | `GOOGLE_APPLICATION_CREDENTIALS` | Cloud Vision 無法辨識；檔案存在不代表 API 權限有效 |
| OCR 複核 | `OLLAMA_OCR_ENABLED`、`OLLAMA_URL`、`OLLAMA_OCR_MODEL` | 可停用背景複核，保留 Vision 與規則抽取 |
| 合約／法規生成 | `LLM_PROVIDER_ORDER`、`NVIDIA_API_KEY`、`NVIDIA_MODEL`、`NVIDIA_CHAT_MODEL`、`OLLAMA_MODEL`、`OLLAMA_CHAT_MODEL` | 所有 provider 不可用時回報失敗，不生成預設分析 |
| Ollama 隧道 | `LLM_TUNNEL_URL`、`LLM_TUNNEL_API_KEY`、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET` | 按實際使用的代理設定；OCR 不使用這套隧道憑證流程 |
| 法規向量 | `EMBEDDING_PROVIDER`、`EMBEDDING_MODEL`、`LOCAL_EMBEDDING_MODEL`、`LOCAL_EMBEDDING_URL`、`LAW_TOP_K` | 依檢索實作退回語料；更換模型須重新建向量 |
| 點交 VLM | `NVIDIA_API_KEY`、`INSPECTION_VLM_MODEL` | 照片保存與 AI 辨識是分開流程；失敗可重試 |
| Web Push | `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` | 推播管道不可用 |

限制與逾時變數見 [來源索引](../reference/environment-inventory.md)。索引包含工具及執行期來源；並非每一項都是啟動必要條件。動態組合名稱須追查來源。

## 持久化路徑與監控

| 設定 | 內容 |
| --- | --- |
| `INSPECTION_UPLOAD_DIR` | 點交照片 |
| `REPAIR_UPLOAD_DIR` | 報修照片 |
| `LEASE_FILE_DIR` | 房東契約附件 |
| `BANNER_IMAGE_DIR` | 輪播圖片 |
| `GARBAGE_DATA_DIR` | 後端清運靜態資料來源 |
| `OCR_HEALTH_URL` | FastAPI 監控所使用的 OCR 健康端點 |
| `LOG_LEVEL` | Python 應用程式日誌層級 |

正式環境的上傳目錄必須映射持久化儲存並一起備份。容器內的相對憑證路徑、`localhost` 與宿主機含義不同，不能原樣複製本機值。
