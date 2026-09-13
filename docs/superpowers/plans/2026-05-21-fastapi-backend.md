# FastAPI 後端實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 FastAPI Python 後端，取代現有 Express OCR server，完整實作「OCR → 條文切段 → RAG 法規查詢 → Gemini AI 分析」流程。

**Architecture:** 兩個端點（`POST /api/ocr`、`POST /api/analyze`），services 層各自獨立，routes 層負責 HTTP 入出口，從 `backend/` 目錄啟動 uvicorn。

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, google-cloud-vision, google-generativeai, ChromaDB, pytest, httpx

---

## 檔案清單

### 新建
- `backend/main.py`
- `backend/models.py`
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/routes/__init__.py`
- `backend/routes/ocr_routes.py`
- `backend/routes/analyze_routes.py`
- `backend/services/__init__.py`
- `backend/services/ocr_service.py`
- `backend/services/clause_segmenter.py`
- `backend/services/rag_service.py`
- `backend/services/ai_analysis_service.py`
- `backend/data/legal_docs/rental_standard_contract.txt`
- `backend/data/legal_docs/civil_code_lease.txt`
- `backend/data/legal_docs/rent_subsidy_rules.txt`
- `backend/tests/__init__.py`
- `backend/tests/conftest.py`
- `backend/tests/test_ocr_routes.py`
- `backend/tests/test_clause_segmenter.py`
- `backend/tests/test_rag_service.py`
- `backend/tests/test_analyze_routes.py`

### 修改
- `font/.gitignore`
- `font/.env`
- `font/vite.config.ts`
- `font/src/pages/contract.vue`
- `font/package.json`（Task 7）

### 刪除
- `font/server/index.js`（Task 7，OCR 驗通後）

---

## Task 1: 專案骨架

**Files:** `backend/` 全部基礎檔案、`font/.gitignore`、`font/.env`

- [ ] **Step 1: 建立目錄結構**（在 `font/` 目錄下執行）

```powershell
New-Item -ItemType Directory -Force -Path backend/routes, backend/services, backend/tests, backend/data/legal_docs, backend/secrets, backend/vector_db/chroma
New-Item -ItemType File -Force -Path backend/routes/__init__.py, backend/services/__init__.py, backend/tests/__init__.py
```

- [ ] **Step 2: 建立 `backend/requirements.txt`**

```
fastapi
uvicorn[standard]
python-multipart
google-cloud-vision
google-generativeai
chromadb
python-dotenv
pytest
httpx
```

- [ ] **Step 3: 建立 `backend/models.py`**

```python
from pydantic import BaseModel


class OcrResponse(BaseModel):
    text: str
    pageCount: int
    pageTexts: list[str]
    fileName: str
    mimeType: str
    engine: str
    warnings: list[str]


class Reference(BaseModel):
    title: str
    content: str
    score: float


class ClauseAnalysis(BaseModel):
    id: int
    text: str
    riskLevel: str
    legalBasis: list[str]
    analysis: str
    suggestion: str
    negotiationScript: str
    matchedReferences: list[Reference]


class AnalyzeRequest(BaseModel):
    text: str


class AnalyzeSummary(BaseModel):
    totalClauses: int
    highRisk: int
    mediumRisk: int
    lowRisk: int


class AnalyzeResponse(BaseModel):
    clauses: list[ClauseAnalysis]
    summary: AnalyzeSummary
```

- [ ] **Step 4: 建立 `backend/main.py`**

```python
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RentMate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "rentmate-fastapi"}
```

- [ ] **Step 5: 建立 `backend/tests/conftest.py`**

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "./secrets/vision-key.json")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("CHROMA_DB_PATH", "./vector_db/test_chroma")
```

- [ ] **Step 6: 建立 `backend/.env.example`**

```
GOOGLE_APPLICATION_CREDENTIALS=./secrets/vision-key.json
GEMINI_API_KEY=你的金鑰
CHROMA_DB_PATH=./vector_db/chroma
```

- [ ] **Step 7: 更新 `font/.gitignore`**（在現有內容末尾加入）

```
backend/.env*
!backend/.env.example
backend/secrets/
backend/vector_db/
```

- [ ] **Step 8: 更新 `font/.env`**（替換整個檔案）

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

- [ ] **Step 9: 安裝套件並驗證啟動**

```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

瀏覽器開啟 `http://localhost:8000/api/health`，預期回應：
```json
{"ok": true, "service": "rentmate-fastapi"}
```

- [ ] **Step 10: Commit**

```bash
git add backend/ font/.gitignore font/.env
git commit -m "feat: scaffold FastAPI backend"
```

---

## Task 2: OCR Service 與路由

**Files:** `backend/services/ocr_service.py`、`backend/routes/ocr_routes.py`、`backend/tests/test_ocr_routes.py`、`backend/main.py`、`font/vite.config.ts`

- [ ] **Step 1: 撰寫失敗測試 `backend/tests/test_ocr_routes.py`**

```python
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

MOCK_OCR_RESULT = {
    "text": "第一條 租賃期間",
    "pageCount": 1,
    "pageTexts": ["第一條 租賃期間"],
    "fileName": "test.png",
    "mimeType": "image/png",
    "engine": "DOCUMENT_TEXT_DETECTION",
    "warnings": [],
}


def test_ocr_returns_200_with_image_file():
    with patch("routes.ocr_routes.perform_ocr", return_value=MOCK_OCR_RESULT):
        response = client.post(
            "/api/ocr",
            files={"file": ("test.png", b"fake-image-bytes", "image/png")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "第一條 租賃期間"
    assert data["engine"] == "DOCUMENT_TEXT_DETECTION"


def test_ocr_returns_400_for_unsupported_mime_type():
    response = client.post(
        "/api/ocr",
        files={"file": ("test.docx", b"fake", "application/msword")},
    )
    assert response.status_code == 400


def test_ocr_returns_422_when_no_text_recognized():
    with patch("routes.ocr_routes.perform_ocr", side_effect=ValueError("no text")):
        response = client.post(
            "/api/ocr",
            files={"file": ("blank.png", b"fake", "image/png")},
        )
    assert response.status_code == 422
```

- [ ] **Step 2: 執行測試確認失敗**

```powershell
cd backend
pytest tests/test_ocr_routes.py -v
```

預期：`ImportError` 或 `404`

- [ ] **Step 3: 建立 `backend/services/ocr_service.py`**

```python
from google.cloud import vision

SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"}
SUPPORTED_DOC_TYPES = {"application/pdf", "image/tiff", "image/gif"}


def perform_ocr(file_bytes: bytes, mime_type: str, filename: str) -> dict:
    if mime_type in SUPPORTED_IMAGE_TYPES:
        return _ocr_image(file_bytes, filename, mime_type)
    if mime_type in SUPPORTED_DOC_TYPES:
        return _ocr_document(file_bytes, filename, mime_type)
    raise ValueError(f"unsupported file type: {mime_type}")


def _ocr_image(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=file_bytes)
    response = client.document_text_detection(image=image)
    text = response.full_text_annotation.text.strip() if response.full_text_annotation else ""
    if not text:
        raise ValueError("no text recognized")
    return {
        "text": text,
        "pageCount": 1,
        "pageTexts": [text],
        "fileName": filename,
        "mimeType": mime_type,
        "engine": "DOCUMENT_TEXT_DETECTION",
        "warnings": [],
    }


def _ocr_document(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    client = vision.ImageAnnotatorClient()
    input_config = vision.InputConfig(content=file_bytes, mime_type=mime_type)
    feature = vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)
    request = vision.AnnotateFileRequest(input_config=input_config, features=[feature])
    response = client.batch_annotate_files(requests=[request])

    page_texts = [
        r.full_text_annotation.text.strip()
        for r in response.responses[0].responses
        if r.full_text_annotation.text
    ]
    full_text = "\n\n".join(page_texts)
    if not full_text:
        raise ValueError("no text recognized")

    warnings = ["Vision API 同步 PDF OCR 單次最多適合 5 頁。"] if mime_type == "application/pdf" else []
    return {
        "text": full_text,
        "pageCount": len(page_texts),
        "pageTexts": page_texts,
        "fileName": filename,
        "mimeType": mime_type,
        "engine": "batchAnnotateFiles(DOCUMENT_TEXT_DETECTION)",
        "warnings": warnings,
    }
```

- [ ] **Step 4: 建立 `backend/routes/ocr_routes.py`**

```python
from fastapi import APIRouter, File, HTTPException, UploadFile
from services.ocr_service import SUPPORTED_DOC_TYPES, SUPPORTED_IMAGE_TYPES, perform_ocr

router = APIRouter()

_SUPPORTED_TYPES = SUPPORTED_IMAGE_TYPES | SUPPORTED_DOC_TYPES


@router.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    if file.content_type not in _SUPPORTED_TYPES:
        raise HTTPException(status_code=400, detail="不支援的檔案格式，請上傳 PDF、PNG、JPG、WEBP、BMP 或 TIFF。")

    file_bytes = await file.read()
    try:
        return perform_ocr(file_bytes, file.content_type, file.filename or "uploaded_file")
    except ValueError as e:
        msg = str(e)
        if "no text" in msg:
            raise HTTPException(status_code=422, detail="OCR 未辨識到文字，請上傳更清晰的圖片或 PDF。")
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        msg = str(e)
        if "credentials" in msg.lower():
            raise HTTPException(status_code=422, detail="找不到 GCP 憑證，請確認 GOOGLE_APPLICATION_CREDENTIALS 設定。")
        raise HTTPException(status_code=500, detail=f"OCR 服務錯誤：{msg}")
```

- [ ] **Step 5: 更新 `backend/main.py` 掛載 OCR router**

```python
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.ocr_routes import router as ocr_router

app = FastAPI(title="RentMate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr_router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "rentmate-fastapi"}
```

- [ ] **Step 6: 執行測試確認通過**

```powershell
cd backend
pytest tests/test_ocr_routes.py -v
```

預期：
```
test_ocr_returns_200_with_image_file PASSED
test_ocr_returns_400_for_unsupported_mime_type PASSED
test_ocr_returns_422_when_no_text_recognized PASSED
3 passed
```

- [ ] **Step 7: 複製金鑰到 `backend/secrets/`**

```powershell
Copy-Item "key\vision-key.json" "backend\secrets\vision-key.json"
```

- [ ] **Step 8: 建立 `backend/.env`**

```
GOOGLE_APPLICATION_CREDENTIALS=./secrets/vision-key.json
GEMINI_API_KEY=（填入你的實際 Gemini API Key）
CHROMA_DB_PATH=./vector_db/chroma
```

- [ ] **Step 9: 更新 `font/vite.config.ts`**

將第 8 行改為：
```typescript
const apiTarget = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
```

- [ ] **Step 10: 手動驗證 OCR**

同時啟動前端與後端，在 `contract.vue` 上傳一張租約圖片，確認「契約預覽」tab 顯示 OCR 文字。

```powershell
# Terminal 1
cd backend; uvicorn main:app --reload --port 8000

# Terminal 2（在 font/ 目錄）
npm run dev
```

- [ ] **Step 11: Commit**

```bash
git add backend/services/ocr_service.py backend/routes/ocr_routes.py backend/tests/test_ocr_routes.py backend/main.py backend/.env.example font/vite.config.ts font/.env
git commit -m "feat: add FastAPI OCR endpoint replacing Express"
```

---

## Task 3: 條文切段

**Files:** `backend/services/clause_segmenter.py`、`backend/tests/test_clause_segmenter.py`

- [ ] **Step 1: 撰寫失敗測試 `backend/tests/test_clause_segmenter.py`**

```python
from unittest.mock import patch
from services.clause_segmenter import segment_clauses


def test_segment_chinese_numbered_clauses():
    text = "第一條 租賃期間自114年起。\n第二條 每月租金一萬元。"
    result = segment_clauses(text)
    assert len(result) == 2
    assert result[0].startswith("第一條")
    assert result[1].startswith("第二條")


def test_segment_arabic_numbered_clauses():
    text = "第1條 租賃標的。\n第2條 租賃期間。\n第3條 租金。"
    result = segment_clauses(text)
    assert len(result) == 3


def test_empty_text_returns_empty_list():
    assert segment_clauses("") == []
    assert segment_clauses("   ") == []


def test_no_clause_markers_falls_back_to_gemini():
    with patch("services.clause_segmenter._segment_by_gemini", return_value=["整份契約內容"]):
        result = segment_clauses("這是一份沒有條號的合約內容")
    assert result == ["整份契約內容"]
```

- [ ] **Step 2: 執行測試確認失敗**

```powershell
cd backend
pytest tests/test_clause_segmenter.py -v
```

預期：`ImportError: cannot import name 'segment_clauses'`

- [ ] **Step 3: 建立 `backend/services/clause_segmenter.py`**

```python
import json
import os
import re

import google.generativeai as genai

_CLAUSE_PATTERN = re.compile(r"(?=第[一二三四五六七八九十百千\d]+條)")


def segment_clauses(text: str) -> list[str]:
    if not text or not text.strip():
        return []
    clauses = _segment_by_regex(text)
    if clauses:
        return clauses
    return _segment_by_gemini(text)


def _segment_by_regex(text: str) -> list[str]:
    parts = _CLAUSE_PATTERN.split(text)
    return [p.strip() for p in parts if p.strip()]


def _segment_by_gemini(text: str) -> list[str]:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )
    prompt = f"""請將以下租約文字切分成獨立條文，以 JSON 陣列回傳，每個元素為一個條文字串。

租約內容：
{text[:3000]}

回傳格式：["條文一內容", "條文二內容", ...]"""

    response = model.generate_content(prompt)
    try:
        clauses = json.loads(response.text)
        if isinstance(clauses, list):
            return [str(c).strip() for c in clauses if str(c).strip()]
    except (json.JSONDecodeError, ValueError):
        pass
    return [text.strip()]
```

- [ ] **Step 4: 執行測試確認通過**

```powershell
cd backend
pytest tests/test_clause_segmenter.py -v
```

預期：`4 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/clause_segmenter.py backend/tests/test_clause_segmenter.py
git commit -m "feat: add clause segmenter with regex and Gemini fallback"
```

---

## Task 4: 法律文件與 RAG Service

**Files:** `backend/data/legal_docs/*.txt`、`backend/services/rag_service.py`、`backend/tests/test_rag_service.py`

- [ ] **Step 1: 建立法律文件佔位檔案**

建立 `backend/data/legal_docs/civil_code_lease.txt`：
```
來源：中華民國民法債編第二章第六節租賃
更新日期：2024-01-01
適用範圍：一般租賃關係

第421條 稱租賃者，謂當事人約定，一方以物租與他方使用收益，他方支付租金之契約。
第421條之1 以自然人為承租人之住宅租賃，其期限在一個月以上者，適用本條文之規定。

（請繼續填入其他相關條文）
```

建立 `backend/data/legal_docs/rental_standard_contract.txt`：
```
來源：內政部住宅租賃定型化契約應記載及不得記載事項
更新日期：2024-01-01
適用範圍：住宅租賃，適用消費者保護法

（請填入完整條文）
```

建立 `backend/data/legal_docs/rent_subsidy_rules.txt`：
```
來源：內政部租金補貼申請及審核作業規定
更新日期：2024-01-01
適用範圍：符合資格之租屋族群

（請填入租金補貼相關條文）
```

- [ ] **Step 2: 撰寫失敗測試 `backend/tests/test_rag_service.py`**

```python
import pytest
from unittest.mock import MagicMock, patch
from services.rag_service import query_legal_docs


def test_query_returns_list_of_references():
    mock_collection = MagicMock()
    mock_collection.count.return_value = 5
    mock_collection.query.return_value = {
        "documents": [["民法第421條 稱租賃者...", "不得記載第3點..."]],
        "metadatas": [[
            {"source": "civil_code_lease.txt"},
            {"source": "rental_standard_contract.txt"},
        ]],
        "distances": [[0.1, 0.3]],
    }
    mock_embedding = {"embedding": [0.1] * 768}

    with (
        patch("services.rag_service._get_collection", return_value=mock_collection),
        patch("services.rag_service.genai.embed_content", return_value=mock_embedding),
    ):
        result = query_legal_docs("押金條款", n_results=2)

    assert len(result) == 2
    assert result[0]["title"] == "civil_code_lease.txt"
    assert result[0]["content"] == "民法第421條 稱租賃者..."
    assert result[0]["score"] == pytest.approx(0.9)
    assert result[1]["score"] == pytest.approx(0.7)


def test_query_empty_collection_returns_empty_list():
    mock_collection = MagicMock()
    mock_collection.count.return_value = 0
    mock_embedding = {"embedding": [0.1] * 768}

    with (
        patch("services.rag_service._get_collection", return_value=mock_collection),
        patch("services.rag_service.genai.embed_content", return_value=mock_embedding),
    ):
        result = query_legal_docs("任意條款")

    assert result == []
```

- [ ] **Step 3: 執行測試確認失敗**

```powershell
cd backend
pytest tests/test_rag_service.py -v
```

預期：`ImportError: cannot import name 'query_legal_docs'`

- [ ] **Step 4: 建立 `backend/services/rag_service.py`**

```python
import os
from pathlib import Path

import chromadb
import google.generativeai as genai

_LEGAL_DOCS_DIR = Path(__file__).parent.parent / "data" / "legal_docs"
_COLLECTION_NAME = "legal_docs"
_collection = None


def _get_collection():
    global _collection
    if _collection is not None:
        return _collection

    chroma_path = os.environ.get("CHROMA_DB_PATH", "./vector_db/chroma")
    client = chromadb.PersistentClient(path=chroma_path)
    _collection = client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    if _collection.count() == 0:
        _load_legal_docs(_collection)

    return _collection


def _load_legal_docs(collection) -> None:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    for doc_path in _LEGAL_DOCS_DIR.glob("*.txt"):
        text = doc_path.read_text(encoding="utf-8")
        chunks = _chunk_text(text)
        if not chunks:
            continue
        embeddings = [
            genai.embed_content(
                model="models/text-embedding-004",
                content=chunk,
                task_type="retrieval_document",
            )["embedding"]
            for chunk in chunks
        ]
        collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=[{"source": doc_path.name} for _ in chunks],
            ids=[f"{doc_path.stem}_{i}" for i in range(len(chunks))],
        )


def _chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            current = para
    if current:
        chunks.append(current)
    return chunks


def query_legal_docs(clause: str, n_results: int = 3) -> list[dict]:
    collection = _get_collection()
    if collection.count() == 0:
        return []

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    query_embedding = genai.embed_content(
        model="models/text-embedding-004",
        content=clause,
        task_type="retrieval_query",
    )["embedding"]

    actual_n = min(n_results, collection.count())
    results = collection.query(query_embeddings=[query_embedding], n_results=actual_n)

    return [
        {
            "title": results["metadatas"][0][i].get("source", "unknown"),
            "content": results["documents"][0][i],
            "score": round(1 - float(results["distances"][0][i]), 4),
        }
        for i in range(len(results["documents"][0]))
    ]
```

- [ ] **Step 5: 執行測試確認通過**

```powershell
cd backend
pytest tests/test_rag_service.py -v
```

預期：`2 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/services/rag_service.py backend/tests/test_rag_service.py backend/data/
git commit -m "feat: add RAG service with ChromaDB and legal doc placeholders"
```

---

## Task 5: AI 分析 Service

**Files:** `backend/services/ai_analysis_service.py`、`backend/tests/test_ai_analysis_service.py`

- [ ] **Step 1: 撰寫失敗測試 `backend/tests/test_ai_analysis_service.py`**

```python
import json
from unittest.mock import MagicMock, patch
from services.ai_analysis_service import analyze_clause

MOCK_REFERENCES = [{"title": "civil_code_lease.txt", "content": "民法第421條...", "score": 0.85}]

MOCK_GEMINI_JSON = {
    "riskLevel": "high",
    "legalBasis": ["民法第421條之1"],
    "analysis": "本條押金約定超過法定上限兩個月。",
    "suggestion": "建議修改為不超過兩個月租金。",
    "negotiationScript": "依民法規定，押金不得超過兩個月租金。",
}


def test_analyze_clause_returns_structured_result():
    mock_response = MagicMock()
    mock_response.text = json.dumps(MOCK_GEMINI_JSON)

    with patch("services.ai_analysis_service.genai.GenerativeModel") as mock_cls:
        mock_cls.return_value.generate_content.return_value = mock_response
        result = analyze_clause("押金為三個月租金", MOCK_REFERENCES)

    assert result["riskLevel"] == "high"
    assert "民法第421條之1" in result["legalBasis"]
    assert result["analysis"] != ""


def test_analyze_clause_returns_unknown_on_bad_json():
    mock_response = MagicMock()
    mock_response.text = "這不是 JSON"

    with patch("services.ai_analysis_service.genai.GenerativeModel") as mock_cls:
        mock_cls.return_value.generate_content.return_value = mock_response
        result = analyze_clause("任意條文", [])

    assert result["riskLevel"] == "unknown"
```

- [ ] **Step 2: 執行測試確認失敗**

```powershell
cd backend
pytest tests/test_ai_analysis_service.py -v
```

預期：`ImportError`

- [ ] **Step 3: 建立 `backend/services/ai_analysis_service.py`**

```python
import json
import os

import google.generativeai as genai


def analyze_clause(clause_text: str, references: list[dict]) -> dict:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

    refs_text = "\n".join(
        f"- {r['title']}：{r['content'][:300]}" for r in references
    ) or "無相關法律依據"

    prompt = f"""你是台灣專業的租賃法律顧問。請分析下列租約條文，以 JSON 格式回傳分析結果。

條文：
{clause_text}

相關法律依據：
{refs_text}

請嚴格回傳以下 JSON 格式（不要加任何其他文字或 markdown）：
{{
  "riskLevel": "high 或 medium 或 low（擇一）",
  "legalBasis": ["法條名稱"],
  "analysis": "白話解析（2-3句，說明這條對租客的影響）",
  "suggestion": "修改建議（1-2句）",
  "negotiationScript": "可直接對房東說的話術（1-2句）"
}}"""

    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )

    try:
        response = model.generate_content(prompt)
        result = json.loads(response.text)
        if not isinstance(result, dict):
            raise ValueError("not a dict")
        result.setdefault("riskLevel", "unknown")
        result.setdefault("legalBasis", [])
        result.setdefault("analysis", "")
        result.setdefault("suggestion", "")
        result.setdefault("negotiationScript", "")
        return result
    except (json.JSONDecodeError, ValueError):
        return {
            "riskLevel": "unknown",
            "legalBasis": [],
            "analysis": "",
            "suggestion": "",
            "negotiationScript": "",
        }
```

- [ ] **Step 4: 執行測試確認通過**

```powershell
cd backend
pytest tests/test_ai_analysis_service.py -v
```

預期：`2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai_analysis_service.py backend/tests/test_ai_analysis_service.py
git commit -m "feat: add Gemini AI analysis service for clause risk assessment"
```

---

## Task 6: Analyze 路由與前端整合

**Files:** `backend/routes/analyze_routes.py`、`backend/tests/test_analyze_routes.py`、`backend/main.py`、`font/src/pages/contract.vue`

- [ ] **Step 1: 撰寫失敗測試 `backend/tests/test_analyze_routes.py`**

```python
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

_CLAUSES = ["第一條 租賃期間為一年。", "第二條 押金為三個月租金。"]
_REFERENCES = [{"title": "civil_code_lease.txt", "content": "...", "score": 0.8}]
_ANALYSIS = {
    "riskLevel": "high",
    "legalBasis": ["民法第421條之1"],
    "analysis": "押金超過法定上限。",
    "suggestion": "改為兩個月。",
    "negotiationScript": "依法押金不超過兩個月。",
}


def test_analyze_returns_200_with_text():
    with (
        patch("routes.analyze_routes.segment_clauses", return_value=_CLAUSES),
        patch("routes.analyze_routes.query_legal_docs", return_value=_REFERENCES),
        patch("routes.analyze_routes.analyze_clause", return_value=_ANALYSIS),
    ):
        response = client.post("/api/analyze", json={"text": "第一條 租賃期間。第二條 押金。"})

    assert response.status_code == 200
    data = response.json()
    assert len(data["clauses"]) == 2
    assert data["clauses"][0]["id"] == 1
    assert data["clauses"][0]["matchedReferences"][0]["title"] == "civil_code_lease.txt"
    assert data["summary"]["totalClauses"] == 2
    assert data["summary"]["highRisk"] == 2


def test_analyze_returns_400_for_empty_text():
    response = client.post("/api/analyze", json={"text": ""})
    assert response.status_code == 400


def test_analyze_returns_422_for_missing_field():
    response = client.post("/api/analyze", json={})
    assert response.status_code == 422
```

- [ ] **Step 2: 執行測試確認失敗**

```powershell
cd backend
pytest tests/test_analyze_routes.py -v
```

預期：`404` 或 `ImportError`

- [ ] **Step 3: 建立 `backend/routes/analyze_routes.py`**

```python
from fastapi import APIRouter, HTTPException
from models import AnalyzeRequest, AnalyzeResponse, AnalyzeSummary, ClauseAnalysis, Reference
from services.ai_analysis_service import analyze_clause
from services.clause_segmenter import segment_clauses
from services.rag_service import query_legal_docs

router = APIRouter()


@router.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="OCR 文字不可為空。")

    clauses = segment_clauses(request.text)
    if not clauses:
        raise HTTPException(status_code=422, detail="無法從文字中切出條文。")

    result_clauses = []
    for i, clause_text in enumerate(clauses):
        references = query_legal_docs(clause_text, n_results=3)
        analysis = analyze_clause(clause_text, references)
        result_clauses.append(
            ClauseAnalysis(
                id=i + 1,
                text=clause_text,
                riskLevel=analysis.get("riskLevel", "unknown"),
                legalBasis=analysis.get("legalBasis", []),
                analysis=analysis.get("analysis", ""),
                suggestion=analysis.get("suggestion", ""),
                negotiationScript=analysis.get("negotiationScript", ""),
                matchedReferences=[
                    Reference(title=r["title"], content=r["content"], score=r["score"])
                    for r in references
                ],
            )
        )

    risk_counts = {"high": 0, "medium": 0, "low": 0}
    for c in result_clauses:
        if c.riskLevel in risk_counts:
            risk_counts[c.riskLevel] += 1

    return AnalyzeResponse(
        clauses=result_clauses,
        summary=AnalyzeSummary(
            totalClauses=len(result_clauses),
            highRisk=risk_counts["high"],
            mediumRisk=risk_counts["medium"],
            lowRisk=risk_counts["low"],
        ),
    )
```

- [ ] **Step 4: 更新 `backend/main.py` 掛載 analyze router**

```python
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.analyze_routes import router as analyze_router
from routes.ocr_routes import router as ocr_router

app = FastAPI(title="RentMate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr_router)
app.include_router(analyze_router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "rentmate-fastapi"}
```

- [ ] **Step 5: 執行全部測試**

```powershell
cd backend
pytest tests/ -v
```

預期：全部通過

- [ ] **Step 6: 在 `contract.vue` `<script setup>` 新增型別與 refs**（在既有 `ocrResult` ref 之後加入）

```typescript
type Reference = { title: string; content: string; score: number }
type ClauseAnalysis = {
  id: number
  text: string
  riskLevel: 'high' | 'medium' | 'low' | 'unknown'
  legalBasis: string[]
  analysis: string
  suggestion: string
  negotiationScript: string
  matchedReferences: Reference[]
}
type AnalyzeResponse = {
  clauses: ClauseAnalysis[]
  summary: { totalClauses: number; highRisk: number; mediumRisk: number; lowRisk: number }
}

const isAnalyzing = ref(false)
const analyzeError = ref('')
const analyzeResult = ref<AnalyzeResponse | null>(null)
```

- [ ] **Step 7: 在 `contract.vue` 新增 `startAnalysis` 函式**（在 `sendToOcr` 之後加入）

```typescript
async function startAnalysis(): Promise<void> {
  if (!ocrResult.value?.text) return
  isAnalyzing.value = true
  analyzeError.value = ''
  analyzeResult.value = null
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ocrResult.value.text }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.detail || '分析服務發生錯誤。')
    analyzeResult.value = payload as AnalyzeResponse
    activeTab.value = 'negotiation'
  } catch (error) {
    analyzeError.value = error instanceof Error ? error.message : '分析失敗。'
  } finally {
    isAnalyzing.value = false
  }
}
```

- [ ] **Step 8: 在「分析準備」tab 的 CardContent 末尾加入觸發按鈕**

找到 `<TabsContent value="analysis"` 的 `<CardContent`，在最後一個子元素後加入：

```html
<div class="pt-2">
  <Button :disabled="isAnalyzing" @click="startAnalysis">
    {{ isAnalyzing ? 'AI 分析中...' : '開始 AI 條文分析' }}
  </Button>
  <div v-if="analyzeError" class="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
    {{ analyzeError }}
  </div>
</div>
```

- [ ] **Step 9: 在「AI 談判輔助」tab 顯示分析結果**

找到 `<TabsContent value="negotiation"` 的 `<CardContent`，在現有內容後加入：

```html
<div v-if="analyzeResult" class="mt-4 space-y-4">
  <div class="grid grid-cols-4 gap-3 text-center text-sm">
    <div class="rounded-2xl border bg-muted/30 p-3">
      <p class="text-muted-foreground">條文總數</p>
      <p class="text-xl font-bold">{{ analyzeResult.summary.totalClauses }}</p>
    </div>
    <div class="rounded-2xl border bg-destructive/10 p-3">
      <p class="text-muted-foreground">高風險</p>
      <p class="text-xl font-bold text-destructive">{{ analyzeResult.summary.highRisk }}</p>
    </div>
    <div class="rounded-2xl border bg-amber-500/10 p-3">
      <p class="text-muted-foreground">中風險</p>
      <p class="text-xl font-bold text-amber-600">{{ analyzeResult.summary.mediumRisk }}</p>
    </div>
    <div class="rounded-2xl border bg-emerald-500/10 p-3">
      <p class="text-muted-foreground">低風險</p>
      <p class="text-xl font-bold text-emerald-600">{{ analyzeResult.summary.lowRisk }}</p>
    </div>
  </div>
  <div v-for="clause in analyzeResult.clauses" :key="clause.id" class="rounded-2xl border p-4">
    <div class="flex items-center justify-between">
      <p class="font-semibold">條文 {{ clause.id }}</p>
      <Badge
        :variant="clause.riskLevel === 'high' ? 'destructive' : 'outline'"
        :class="clause.riskLevel === 'medium' ? 'border-amber-400 text-amber-700' : clause.riskLevel === 'low' ? 'border-emerald-400 text-emerald-700' : ''"
      >
        {{ { high: '高風險', medium: '中風險', low: '低風險', unknown: '未知' }[clause.riskLevel] }}
      </Badge>
    </div>
    <p class="mt-2 text-sm text-muted-foreground">{{ clause.text }}</p>
    <div class="mt-3 space-y-1 text-sm">
      <p><span class="font-medium">解析：</span>{{ clause.analysis }}</p>
      <p><span class="font-medium">建議：</span>{{ clause.suggestion }}</p>
      <p><span class="font-medium">話術：</span>{{ clause.negotiationScript }}</p>
    </div>
    <div v-if="clause.matchedReferences.length" class="mt-3 border-t pt-2 text-xs text-muted-foreground">
      <p class="font-medium">法律依據</p>
      <p v-for="ref in clause.matchedReferences" :key="ref.title">
        {{ ref.title }}（相似度 {{ (ref.score * 100).toFixed(0) }}%）
      </p>
    </div>
  </div>
</div>
```

- [ ] **Step 10: Commit**

```bash
git add backend/routes/analyze_routes.py backend/tests/test_analyze_routes.py backend/main.py src/pages/contract.vue
git commit -m "feat: add analyze endpoint and frontend integration"
```

---

## Task 7: 驗證完整流程並清理 Express

**前提：** Task 2 Step 10 的手動 OCR 測試已通過。

- [ ] **Step 1: 端對端手動測試**

```powershell
# Terminal 1
cd backend; uvicorn main:app --reload --port 8000

# Terminal 2（font/ 目錄）
npm run dev
```

在瀏覽器執行完整流程：
1. 上傳租約 PDF 或圖片 → 確認「契約預覽」tab 有 OCR 文字
2. 點擊「開始 AI 條文分析」→ 確認「AI 談判輔助」tab 顯示條文卡片、風險等級、法律依據

- [ ] **Step 2: 確認 Express 未啟動時 OCR 仍正常（FastAPI 獨立運作）**

- [ ] **Step 3: 移除 Express scripts，修改 `font/package.json`**

```json
"scripts": {
  "dev": "vite --port=3000 --host=0.0.0.0",
  "build": "vue-tsc -b && vite build",
  "preview": "vite preview",
  "clean": "rm -rf dist",
  "lint": "vue-tsc --noEmit"
}
```

- [ ] **Step 4: 刪除 `font/server/index.js`**

```bash
git rm server/index.js
```

- [ ] **Step 5: 最終 Commit**

```bash
git add font/package.json
git commit -m "chore: remove Express OCR server, FastAPI is now the only backend"
```
