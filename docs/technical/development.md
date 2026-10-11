# 本機開發與專案慣例

核對日期：2026-10-08。[返回入口](../README.md)

## 環境準備

容器基底使用 Node.js 22、Python 3.12，可作為開發環境對齊基準。npm 套件有 lockfile；Python `requirements.txt` 多數套件未鎖版本，因此相同指令在不同日期不保證得到相同依賴版本。

以下在專案根目錄的 PowerShell 執行：

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

設定流程見 [環境設定](configuration.md)。若使用共用資料庫，請取得相同的加密與簽章設定，不要為同一批資料各自生成金鑰。全新資料庫與既有環境的處理見 [資料庫維護](database.md)。

## 啟動與基本驗證

```powershell
npm run dev:all
```

此指令透過 `npm-run-all2` 同時啟動 Vite、Uvicorn 與 OCR API；Python 必須使用已啟用的虛擬環境。分別執行可使用 `npm run dev`、`npm run dev:backend`、`npm run dev:api`。

| 入口 | 用途 |
| --- | --- |
| `http://localhost:5173` | 前端 |
| `http://localhost:8000/docs` | FastAPI API 文件 |
| `http://localhost:8000/api/health` | FastAPI 與 DB 連線狀態 |
| `http://localhost:8787/api/health` | OCR 程序、憑證檔存在及複核設定 |

先驗證公開頁面與服務健康，再用自己的測試帳號驗證登入、空資料頁面與建立／重讀資料。不要使用正式帳號測試刪除、寄送通知或資料遷移。

## 修改落點

- 新增頁面：放入 `src/pages/`，註冊 `src/router/index.ts` 並確認對應 layout、角色與導覽入口。
- API 呼叫：放入 `src/services/`，沿用相近模組的 URL、cookie、Bearer 與工作區標頭處理。
- 共用純邏輯：放入 `src/utils/` 或 `shared/`；共享規則應避免前後端各維護不同版本。
- 新增後端 API：放入 `backend/routers/`，在 `backend/main.py` 註冊；輸入與權限需在後端檢查。
- 資料結構修改：同步 ORM、建表 SQL、schema 檢查與既有環境 migration，見 [資料庫維護](database.md)。

## 開發常見差異

`src/services/` 中不少服務在開發模式固定使用 `/api`，再由 Vite 代理；另一些直接使用設定的 API 位址。不要只看 `.env` 就推定全部 HTTP 請求走同一條路。以瀏覽器 Network 與對應 service 為準。

前端保存的登入狀態不等於後端 session 仍有效；刷新時會同步 `/api/auth/me`。同一環境使用一致的 `localhost` 或 `127.0.0.1`，避免 cookie 因主機名稱不同而無法帶入。

`npm run lint` 包含 `--fix`，會修改原始碼；純文件修改不需要執行此指令。完整測試策略見 [測試與品質檢查](testing.md)。
