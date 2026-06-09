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

支援的圖片格式包含 PNG、JPG、JPEG、WEBP、BMP。PDF、TIFF、GIF 目前不在前端 MVP 支援範圍內。
