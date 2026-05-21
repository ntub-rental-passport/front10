# FastAPI 後端設計文件

**日期：** 2026-05-21
**狀態：** 已批准，待實作

## 背景

前端 `contract.vue` 已完成 OCR UI，目前呼叫 Express（`server/index.js`，port 8787）做 Google Cloud Vision OCR。本次目標是建立 FastAPI Python 後端，完整實作「OCR → 條文切段 → RAG 法規查詢 → Gemini AI 分析」的完整流程，並取代現有 Express 後端。

---

## 目錄結構

> **注意：** `font/` 是此專案的 repo root 與 Vue 前端根目錄，名稱源自初始建立時的資料夾命名，並非字型資料夾。

```
font/                              ← repo root（Vue 前端根目錄，非字型資料夾）
├── backend/                       ← FastAPI 後端（新建）
│   ├── main.py                    ← FastAPI app 進入點，掛載 routes
│   ├── requirements.txt
│   ├── .env                       ← 後端專用，不進 git
│   ├── .env.example               ← 範本，進 git
│   ├── routes/
│   │   ├── ocr_routes.py          ← POST /api/ocr
│   │   └── analyze_routes.py      ← POST /api/analyze
│   ├── services/
│   │   ├── ocr_service.py         ← Google Cloud Vision Python SDK
│   │   ├── clause_segmenter.py    ← 條文切段（正則 + Gemini fallback）
│   │   ├── rag_service.py         ← ChromaDB 查詢 + embedding
│   │   └── ai_analysis_service.py ← Gemini 風險分析
│   ├── data/
│   │   └── legal_docs/            ← 法律文件（使用者自行填入）
│   │       ├── rental_standard_contract.txt
│   │       ├── civil_code_lease.txt
│   │       └── rent_subsidy_rules.txt
│   ├── secrets/                   ← .gitignore 忽略
│   │   └── vision-key.json        ← 從 key/ 複製
│   └── vector_db/
│       └── chroma/                ← ChromaDB 持久化，.gitignore 忽略
│
├── key/                           ← 舊金鑰目錄，可保留
├── .env                           ← 前端只保留 VITE_API_BASE_URL
└── server/index.js                ← 暫時保留，等 FastAPI /api/ocr 跑通後再移除
```

---

## API 端點

### `POST /api/ocr`

接收 `multipart/form-data`，欄位 `file`（PDF / PNG / JPG / WEBP / BMP / TIFF）。

**回應（200）：**
```json
{
  "text": "完整 OCR 文字",
  "pageCount": 3,
  "pageTexts": ["第1頁...", "第2頁..."],
  "fileName": "contract.pdf",
  "mimeType": "application/pdf",
  "engine": "DOCUMENT_TEXT_DETECTION",
  "warnings": []
}
```
回應格式與現有 Express 相同，前端 `contract.vue` 不需修改。

---

### `POST /api/analyze`

接收 JSON body：
```json
{
  "text": "OCR 辨識出的完整條文文字"
}
```

**回應（200）：**
```json
{
  "clauses": [
    {
      "id": 1,
      "text": "第一條 租賃期間...",
      "riskLevel": "high",
      "legalBasis": ["民法第421條之1"],
      "analysis": "白話解析...",
      "suggestion": "修改建議...",
      "negotiationScript": "談判話術...",
      "matchedReferences": [
        {
          "title": "住宅租賃定型化契約應記載及不得記載事項",
          "content": "相關條文內容...",
          "score": 0.82
        }
      ]
    }
  ],
  "summary": {
    "totalClauses": 12,
    "highRisk": 3,
    "mediumRisk": 5,
    "lowRisk": 4
  }
}
```

前端「分析準備」tab 觸發此端點，「AI 談判輔助」tab 顯示結果。

---

## 各 Service 職責

### `ocr_service.py`
- 使用 `google-cloud-vision` Python SDK
- 圖片 → `document_text_detection()`
- PDF/TIFF → `batch_annotate_files()`（同步模式）
- 金鑰透過 `GOOGLE_APPLICATION_CREDENTIALS` 環境變數載入

### `clause_segmenter.py`
- 先用正則切段：偵測 `第X條`、`（一）`、`1.` 等常見租約格式
- 正則切出 0 條時，fallback 改用 Gemini 語意切段
- 回傳 `list[str]`

### `rag_service.py`
- 啟動時從 `data/legal_docs/` 載入文件，embed 後存入 ChromaDB
- 若 ChromaDB 已有資料則直接讀取，不重複 embed（持久化）
- 每條條文查詢最相近的 3 筆法律依據，回傳 `title`、`content`、`score`
- Embedding 模型：Gemini `text-embedding-004`
- 每份法律文件開頭須包含 metadata header：
  ```
  來源：
  更新日期：
  適用範圍：
  ```

### `ai_analysis_service.py`
- 接收單一條文 + RAG 找到的法律依據
- 組成 prompt 送進 `gemini-2.0-flash`
- 要求回傳結構化 JSON（`response_mime_type="application/json"`）
- 欄位：`riskLevel`、`legalBasis`、`analysis`、`suggestion`、`negotiationScript`

---

## 環境設定

### `backend/.env`
```
GOOGLE_APPLICATION_CREDENTIALS=./secrets/vision-key.json
GEMINI_API_KEY=你的金鑰
CHROMA_DB_PATH=./vector_db/chroma
```

### `backend/requirements.txt`
```
fastapi
uvicorn[standard]
python-multipart
google-cloud-vision
google-generativeai
chromadb
python-dotenv
```

### 前端 `font/.env`（精簡後）
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```
移除 `GOOGLE_APPLICATION_CREDENTIALS`、`OCR_API_PORT`、`VITE_OCR_API_URL`。

### `.gitignore` 新增
```
backend/.env*
!backend/.env.example
backend/secrets/
backend/vector_db/
```

---

## 錯誤處理

| 層級 | 情境 | HTTP 狀態 |
|------|------|-----------|
| OCR | 找不到 GCP 憑證 | 422 + 中文訊息 |
| OCR | 不支援的檔案格式 | 400 |
| OCR | 辨識不到文字 | 422 |
| Analyze | OCR text 為空 | 400 |
| Analyze | Gemini 回傳非 JSON | 該條文標記 `riskLevel: "unknown"`，繼續處理其他條文 |
| 全域 | 未預期錯誤 | 500 + log |

---

## 取代 Express 的步驟

1. 將 `key/vision-key.json` 複製到 `backend/secrets/vision-key.json`
2. `vite.config.ts` proxy target 改為讀取 `VITE_API_BASE_URL`（預設 `http://127.0.0.1:8000`）
3. 啟動 FastAPI：`cd backend && uvicorn main:app --reload --port 8000`（確保 `./secrets/` 等相對路徑正確解析）
4. 確認 FastAPI `POST /api/ocr` 跑通後，再移除 `server/index.js` 並刪除 `package.json` 的 `dev:api` / `start:api` scripts
