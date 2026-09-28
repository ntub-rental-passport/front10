# 後端目錄

後端依功能分類，FastAPI 入口維持 `main.py`，API URL 不變。

| 目錄 | 用途與主要檔案 |
| --- | --- |
| `ai/` | 合約去識別化、LLM 呼叫、embedding、法規檢索及 `law_corpus.json` 語料 |
| `auth/` | 登入憑證、角色權限、驗證碼：`security.py`、`verification.py` |
| `db/` | 資料庫連線、ORM、加密欄位、結構檢查、`database.sql` 與 `dbdiagram` |
| `admin/` | 稽核紀錄、系統監控、請求統計、平台設定 |
| `notifications/` | 郵件、垃圾車提醒與排程通知 |
| `common/` | 共用 HTTP 重試與上游服務冷卻狀態 |
| `scripts/` | 診斷、向量建置、檢索評估與管理員操作工具 |
| `routers/` | FastAPI 路由，依 API 功能分檔 |
| `migrations/` | 資料庫遷移工具與 SQL |
| `tests/` | 後端測試，依功能命名為 `test_*.py` |

根目錄保留 `main.py`、`requirements.txt`、`Dockerfile` 與 `.dockerignore`。
既有本機 SQLite 資料庫與備份仍使用原位置；本次分類不搬動資料庫、不執行遷移。
Docker 的持久資料路徑仍由原本的環境變數設定。

## 啟動與測試

在專案根目錄啟動（原指令不變）：

```powershell
npm run dev:backend
```

在 `backend` 目錄執行測試或檢查結構：

```powershell
python -m unittest discover -s tests
python -m db.schema_check
```

結構檢查會讀取設定的資料庫，不會自動升級結構。

若更新後啟動出現 `Missing table: admin_sessions`，請在專案根目錄執行：

```powershell
python backend/migrations/create_admin_sessions.py
```

此工具只補建管理員登入工作階段資料表，可重複執行，不重建既有資料庫。

## 工具的新位置

以下指令在專案根目錄執行：

```powershell
python backend/scripts/check_llm.py --config
python backend/scripts/build_vectors.py --help
python backend/scripts/eval_retrieval.py --help
```

`manage_admin.py`、`embed_probe.py` 也移至 `backend/scripts/`；操作方式見各檔案說明。
在容器 `/app` 目錄內使用 `python scripts/<工具名稱>.py`。
法規向量建置與 `rag/export_corpus.py` 都使用 `backend/ai/law_corpus.json`。

## 模組引用

以功能套件引用，例如 `from db.database import get_db`、
`from auth.security import get_current_user`、`from ai.llm_provider import generate`。
新增程式請放入對應功能目錄，避免重新將服務模組放到根目錄。
