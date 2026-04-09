# 前端版型 (front10)

台北商業大學畢業專題 - 前端介面

## 本地執行

**前置需求：** Node.js

1. 安裝相依套件：
   `npm install`
2. 複製環境變數檔：
   `copy .env.example .env.local`
3. 啟動前端：
   `npm run dev`

## Google Cloud Vision OCR 設定

這個專案現在已加入一個本機 OCR API，讓 `src/pages/contract.vue` 可以真的上傳圖片或 PDF，並呼叫 Google Cloud Vision 做文字辨識。

### 1. 在 Google Cloud 啟用服務

1. 建立或選擇你的 Google Cloud 專案
2. 啟用 `Cloud Vision API`
3. 建立一個 `Service Account`
4. 下載該服務帳戶的 JSON 金鑰

### 2. 設定憑證

在 `.env.local` 內加入：

```env
GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"
OCR_API_PORT="8787"
VITE_OCR_API_URL="http://localhost:8787"
```

也可以直接在系統環境變數中設定 `GOOGLE_APPLICATION_CREDENTIALS`。

### 3. 啟動 OCR API

另開一個終端機執行：

```bash
npm run dev:api
```

這會啟動本機 OCR 服務：

```text
http://localhost:8787/api/ocr
```

### 4. 啟動前端

再開另一個終端機執行：

```bash
npm run dev
```

Vite 在開發模式下會把 `/api/*` 代理到 `VITE_OCR_API_URL`。

## 目前 OCR 支援範圍

- 圖片：`PNG`、`JPG`、`JPEG`、`WEBP`、`BMP`
- 文件：`PDF`、`TIFF`、`GIF`
- 多語言提示：繁中、簡中、日文、英文

## PDF 限制

目前使用的是 Vision API 的同步文件 OCR 路徑，適合先做 MVP。

- 小型 PDF 很適合
- 若租約超過 5 頁，建議之後升級成 GCS + 非同步批次 OCR 流程

## 下一步建議

當 OCR 穩定後，下一步可以把 Vision 回傳的全文送進 Gemini：

1. 依條號切段
2. 比對高風險規則
3. 產生白話解析
4. 生成談判腳本
