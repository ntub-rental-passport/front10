# RentMate FRONT10

Vue 3 + Vite 前端專案，包含租屋管理、帳戶、合約 OCR 與合約分析等頁面。

## Project Setup

```sh
npm install
```

## Development

啟動前端：

```sh
npm run dev
```
啟動後端：

uvicorn main:app --reload

啟動 OCR API：

```sh
npm run dev:api
```

預設前端會在 `http://localhost:3000` 啟動，OCR API 預設為 `http://localhost:8787`。

## Role workspaces

目前前端已拆分四種角色與工作區：

```text
tenant   -> /app
landlord -> /landlord
admin    -> /admin
reviewer -> /reviewer
```

租客與房東使用 `/login` 登入；系統管理員與資料審核人員使用 `/staff-login`。
目前登入與頁面資料屬於前端展示流程，正式上線前仍需由後端完成帳密驗證、權限檢查、密碼雜湊與操作紀錄。

## Environment

先複製環境變數範本：

```sh
copy .env.example .env.local
```

常用設定：

```env
GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"
OCR_API_PORT="8787"
VITE_OCR_API_URL="http://localhost:8787"
OLLAMA_OCR_MODEL="gemma4:e2b"
OLLAMA_OCR_TIMEOUT_MS="300000"
OLLAMA_OCR_CONTEXT_LENGTH="2048"
OLLAMA_OCR_MAX_CHARS="2500"
OLLAMA_OCR_NUM_PREDICT="220"
```

## Scripts

```sh
npm run build
npm run preview
npm run lint
npm run format
```

## OCR Notes

`src/pages/contract/index.vue` 會上傳檔案到本機 OCR API，再由後端串接 Google Cloud Vision。請先在 Google Cloud 啟用 Cloud Vision API，建立 service account，並把 JSON 金鑰路徑設定到 `GOOGLE_APPLICATION_CREDENTIALS`。

OCR 採分級流程。第一層 Google `DOCUMENT_TEXT_DETECTION` 保存頁面、Word、Symbol、Bounding box、Confidence 與逐頁文字；第二層共用規則核心立即抽取 9 個契約欄位，依 Google confidence、格式驗證、來源定位、欄位距離與候選數決定 high／medium／low。前端取得這兩層結果後即可直接預覽或進入編輯器，不等待本機模型。

只有最多 3 個低信心欄位會進入背景 AI 複核。後端只傳欄位關鍵字附近約 2,500 字，圖片最多選 2 個對應裁切區域；完成後前端以工作 ID 輪詢並合併結果。Ollama 回傳的 load、prompt evaluation、generation、token 數與 tokens/s 會連同 Google Vision、正規化、規則抽取、裁切及 Ollama 各階段耗時一併保存。可透過 `OLLAMA_OCR_ENABLED=false` 完全停用第三層，此時系統仍會正常使用 Google OCR 與規則式結果。

上傳端支援單一 PDF，或最多 20 張 PNG、JPG、JPEG、WEBP、BMP、TIFF 圖片；預設單檔 20MB、合計 80MB。MP3、MP4 與非允許格式會在前端及 API 兩端拒絕。原始檔與裁切圖片由 Multer／Sharp 暫存在伺服器記憶體，OCR 請求完成後不寫入磁碟、資料庫、瀏覽器或 Google Cloud Storage；瀏覽器工作階段只保存 OCR 文字、座標、信心分數與裁切區域 metadata。可透過 `OCR_MAX_FILE_SIZE_MB`、`OCR_MAX_TOTAL_SIZE_MB`、`OCR_MAX_FILE_COUNT` 調整限制。

目前只有一般圖片會進行座標裁切與多模態複核；PDF 與 TIFF 雖然同樣保存 Vision 的 Word／Symbol 結構，但暫時採用文字型 E2B 校對。若要讓 PDF 也進入圖片複核，下一步需把指定 PDF 頁面安全地渲染成圖片後，再套用相同座標縮放與裁切流程。

支援格式包含 PDF、PNG、JPG、JPEG、WEBP、BMP、TIFF；GIF 與其他未列出的格式目前不支援。
