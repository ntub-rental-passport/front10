# RentMate 租隊友

RentMate 是租屋管理專題，提供租客與房東契約管理、合約 OCR 與分析、租補助手、點交存證、設備報修及通知功能，並設有管理員後台。

本儲存庫包含 Vue 前端、FastAPI 業務 API 與 Express OCR API。主要業務資料使用 MySQL；部分通知、排程與監控模組仍使用 SQLite，並非所有頁面都已完成資料庫串接。

## 系統組成

| 服務 | 技術與用途 | 本機網址 |
| --- | --- | --- |
| 前端 | Vue 3、TypeScript、Vite、Tailwind CSS | `http://localhost:5173` |
| 業務 API | FastAPI、SQLAlchemy；登入、租約、報修與後台資料 | `http://localhost:8000` |
| OCR API | Express、Google Cloud Vision；契約辨識與欄位抽取 | `http://localhost:8787` |
| OCR 背景複核（選用） | Ollama；複核未確認的契約欄位 | `http://127.0.0.1:11434` |

開發時由 Vite 將 `/api/ocr` 請求轉送至 OCR API，其餘 `/api` 請求轉送至 FastAPI。合約分析與法規問答的模型設定獨立於 OCR。

## 本機開發

以下指令以 Windows PowerShell 為例，除另有說明外，均在專案根目錄執行。請先準備 Node.js、npm、Python 與可連線的 MySQL。

### 1. 安裝依賴

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

每次開啟新的終端機執行 Python 後端前，請先啟用虛擬環境。

若 `node_modules` 是文字檔或指向其他電腦的符號連結，請先將該項目備份並移出此路徑，再執行 `npm install`，讓 npm 建立本機套件目錄。

### 2. 建立環境設定

第一次設定時複製範本；已有 `.env` 時保留原設定並補上缺少的項目：

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

FastAPI 與 OCR API 使用根目錄的 `.env`。只建立 `.env.local` 不足以設定這兩個服務；Vite 則會另外載入 `.env.local`，相同變數可能覆蓋 `.env` 的前端設定。

| 功能 | 主要設定 |
| --- | --- |
| 資料庫 | `DATABASE_URL`：實際 MySQL 帳號、密碼及資料庫名稱 |
| 登入憑證 | `JWT_SECRET`：FastAPI 與 OCR API 必須共用；未設定時 OCR API 拒絕啟動 |
| 個資加密與驗證 | `PII_ENCRYPTION_KEY`、`AUTH_TOKEN_SECRET`、`VERIFICATION_CODE_SECRET`：依範本設定；既有加密資料的金鑰不可任意更換 |
| 驗證信件 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_APP_PASSWORD` 與寄件者設定 |
| Google 登入 | `GOOGLE_CLIENT_ID`、用戶端密鑰或密鑰檔、`GOOGLE_REDIRECT_URI` |
| Google OCR | `GOOGLE_APPLICATION_CREDENTIALS`：Cloud Vision service account JSON 的本機路徑 |
| 前端與代理 | `FRONTEND_URL`、`VITE_API_BASE_URL`、`VITE_OCR_API_URL` |
| 合約分析／法規問答 | `LLM_PROVIDER_ORDER`、`NVIDIA_API_KEY`、`NVIDIA_MODEL`；正式環境 NVIDIA → Ollama 慢速備援；本機預設僅 NVIDIA，可選 nvidia,ollama |
| OCR 背景複核 | `OLLAMA_OCR_ENABLED`、`OLLAMA_URL`、`OLLAMA_OCR_MODEL` |

完整變數與產生金鑰的方式見 [`.env.example`](.env.example)。範本中的帳密、路徑與金鑰占位值需要替換；密鑰與 service account JSON 不應提交至 Git。

### 3. 準備資料庫

新環境請先建立 `115-RentMate` 資料庫，再透過 MySQL 工具執行 [`backend/db/database.sql`](backend/db/database.sql)。該檔包含固定的 `USE` 資料庫名稱，使用其他名稱時需一併調整。

已有資料的環境應依現有結構套用對應遷移，**不要將建表檔當作升級腳本重跑**。目前帳號採 `users` 與 `user_roles` 多身分設計，詳見[多身分帳號與登入](docs/multi-role-auth.md)。

近期更新涉及[報修資料表](backend/migrations/20260930_repairs_to_database.sql)與[後台資料表遷移至 MySQL](backend/migrations/20261001_admin_tables_to_mysql.sql)。若原本使用後台 SQLite 資料，建表後還需依[資料搬遷工具](backend/scripts/migrate_sqlite_to_mysql.py)的說明搬入舊資料；工具預設為試跑。

完成設定後可檢查資料庫結構：

```powershell
Push-Location backend
python -m db.schema_check
Pop-Location
```

結構檢查不會自動建立或升級資料表。

### 4. 啟動服務

在已啟用 Python 虛擬環境的終端機中，同時啟動三個服務：

```powershell
npm run dev:all
```

也可分別在三個終端機啟動：

| 指令 | 服務 |
| --- | --- |
| `npm run dev` | Vite 前端，連接埠 `5173` |
| `npm run dev:backend` | FastAPI，連接埠 `8000` |
| `npm run dev:api` | OCR API，連接埠 `8787` |

開啟 `http://localhost:5173`。FastAPI 的 API 文件位於 `http://localhost:8000/docs`。

## 登入與工作區

| 身分 | 登入入口 | 工作區 |
| --- | --- | --- |
| 租客 | `/login` | `/app` |
| 房東 | `/login` | `/landlord` |
| 管理員 | `/staff-login` | `/admin` |

登入已串接後端驗證與角色權限。同一帳號可具備租客與房東身分；管理員使用獨立登入流程及郵件驗證碼。帳號模型與管理員工具說明見[多身分帳號與登入](docs/multi-role-auth.md)。

## 合約 OCR

租客登入後可在 `/app/contract/scanner` 上傳契約。系統先顯示 OCR 與規則抽取結果，再於背景複核需要確認的欄位；使用者可先預覽與校對，不必等待 AI 完成。

### 使用前設定

1. 在 Google Cloud 啟用 Cloud Vision API，準備可呼叫該 API 的 service account JSON，並設定 `GOOGLE_APPLICATION_CREDENTIALS`。
2. 啟動 FastAPI 與 OCR API，確保兩者使用相同的 `JWT_SECRET`，並透過前端登入取得 cookie。
3. 若需要背景 AI 複核，啟動 Ollama 並準備與 `OLLAMA_OCR_MODEL` 相符的模型；專案預設為 `gemma4:e2b`。

不使用背景複核時，在 `.env` 設定以下項目並重新啟動 OCR API：

```dotenv
OLLAMA_OCR_ENABLED=false
```

停用後仍會執行 Google Vision 辨識與規則式欄位抽取。

### 處理流程

| 階段 | 處理內容 |
| --- | --- |
| 文字辨識 | Google Vision 執行 `DOCUMENT_TEXT_DETECTION`，回傳逐頁文字、字詞與字元、位置及信心分數 |
| 欄位抽取 | 規則引擎抽取出租人、承租人、地址、租期起日、租期迄日、租金、繳租日、押金及違約金，共 9 個欄位，並標記信心等級 |
| 背景複核 | 啟用時最多選取 3 個尚未確認的欄位，將附近文字及可用的裁切圖片交給 Ollama；前端輪詢工作結果後合併 |
| 人工校對 | 使用者檢查辨識值並在編輯器修正，再進行後續存檔或分析 |

背景複核預設文字上限為 2,500 字，最多使用 2 個欄位裁切區域。一般圖片可使用文字與裁切圖片複核；PDF、TIFF 目前採文字複核，尚未將 PDF 頁面渲染成圖片後再裁切。AI 複核失敗時會保留規則式結果。

### 上傳限制

| 項目 | 預設限制 |
| --- | --- |
| PDF | 一次 1 份，不可與其他檔案混合上傳 |
| 圖片 | 一次最多 20 張；支援 PNG、JPG、JPEG、WEBP、BMP、TIF、TIFF |
| 檔案大小 | 單檔 20 MB，單次上傳合計 80 MB |
| 不支援格式 | GIF、音訊、影片及其他未列出的格式 |

API 限制可由 `OCR_MAX_FILE_SIZE_MB`、`OCR_MAX_TOTAL_SIZE_MB`、`OCR_MAX_FILE_COUNT` 調整；調整時也需確認前端上傳驗證的限制一致。

### 資料保存與用量

OCR 原始檔與裁切圖片暫存在伺服器記憶體，供辨識及背景複核使用；此流程不將它們寫入本機磁碟、資料庫或 Google Cloud Storage。**文件內容仍會傳送至 Google Cloud Vision**，啟用 AI 複核時，相關文字與可用裁切圖片也會傳送至設定的 Ollama 服務。

前端會保留辨識與校對所需的工作階段資料。使用者完成契約存檔後，契約欄位會另存至資料庫；因此「OCR 原始檔不落地」不代表所有契約資料都不保存。點交存證與報修照片則有各自的持久化上傳目錄。

OCR 回傳階段耗時及 AI 執行資訊，Vision 頁數用量會回報 FastAPI，供後台 AI 用量畫面使用。

## 常用檢查指令

| 指令 | 用途 |
| --- | --- |
| `npm run build` | TypeScript 檢查並建置前端 |
| `npm run preview` | 預覽前端建置結果；不會啟動後端 API |
| `npm test` | 執行 Vitest 測試 |
| `npm run lint:types` | TypeScript 型別檢查 |
| `npm run lint` | 執行型別及 lint 檢查；包含自動修正，會修改檔案 |
| `npm run test:contract-gate` | 契約欄位規則驗證 |
| `npm run test:vision-annotation` | Vision 結構正規化驗證 |
| `npm run test:pdf-ocr` | PDF OCR 驗證 |

Python 後端測試請在 `backend` 目錄執行 `python -m unittest discover -s tests`。其他工具與測試說明見 [`backend/README.md`](backend/README.md)。

## 目錄與延伸文件

| 路徑 | 內容 |
| --- | --- |
| `src/` | 前端頁面、元件、狀態與 API 呼叫 |
| `server/` | OCR API、欄位規則、Vision 正規化及 Ollama 複核 |
| `backend/` | FastAPI、資料模型、業務 API、遷移與測試 |
| `docs/` | 功能設計、整合及維護文件；歷史文件需留意適用版本 |
| `scripts/` | OCR 與契約處理驗證工具 |

- [後端目錄與操作說明](backend/README.md)
- [多身分帳號與登入](docs/multi-role-auth.md)
- [後台管理系統功能總覽](docs/後台管理系統-功能總覽.md)
- [本機 LLM 排錯](docs/local-llm-troubleshooting.md)
- [點交存證持久化](docs/inspection-persistence.md)
