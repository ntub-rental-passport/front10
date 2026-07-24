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
```

## Scripts

```sh
npm run build
npm run preview
npm run lint
npm run format
```

## OCR Notes

`src/pages/contract.vue` 會上傳檔案到本機 OCR API，再由後端串接 Google Cloud Vision。請先在 Google Cloud 啟用 Cloud Vision API，建立 service account，並把 JSON 金鑰路徑設定到 `GOOGLE_APPLICATION_CREDENTIALS`。

上傳端支援單一 PDF，或最多 20 張 PNG、JPG、JPEG、WEBP、BMP、TIFF 圖片；預設單檔 20MB、合計 80MB。MP3、MP4 與非允許格式會在前端及 API 兩端拒絕。原始檔由 Multer 暫存在伺服器記憶體，OCR 請求完成後不寫入磁碟、資料庫或 Google Cloud Storage；瀏覽器工作階段只保存 OCR 文字結果。可透過 `OCR_MAX_FILE_SIZE_MB`、`OCR_MAX_TOTAL_SIZE_MB`、`OCR_MAX_FILE_COUNT` 調整限制。

支援格式包含 PDF、PNG、JPG、JPEG、WEBP、BMP、TIFF；GIF 與其他未列出的格式目前不支援。
