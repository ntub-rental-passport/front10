# 個人記事與室友協作整合

整合來源：`origin/28` 的個人記事 API 與 `roommate-api-project` 群組／任務流程。
分支包含未解衝突，採按功能移植，不整個合併分支。保留目前個人記事與室友協作版面。

## 檔案

- `src/pages/notes/`：兩種記事頁面、共用狀態、樣式及狀態測試。
- `src/services/notesApi.ts`：同源 API proxy、現有租客 Bearer token、錯誤處理。
- `backend/routers/notes.py`：個人記事 CRUD，以 user_id 隔離。
- `backend/routers/households.py`：群組、邀請、成員、任務；每次存取檢查成員資格。
- `backend/models.py`：Note 模型。
- `backend/notes_models.py`：群組、成員、任務模型，使用現有 users 帳號。
- `backend/tests/test_notes_api.py`：真實 HTTP 路由、隔離 SQLite、外鍵及 Bearer 驗證測試。

## 啟動與資料

首次啟動新版後端會建立缺少的新資料表。也可先執行：

```sh
python backend/migrations/create_notes_tables.py
npm run dev:all
```

若 dev:all 已執行，先在自己的終端機按 Ctrl+C，再重新啟動，避免重複占用連接埠。
程式支援目前本機 SQLite 與部署用 MySQL；不使用獨立 roommate 專案的另一套使用者／登入系統。

新紀錄寫入帳號資料庫，沒有預設假記事。原 localStorage 四個記事／成員／邀請 key 均不刪除。
舊資料無帳號歸屬，不自動上傳；頁面提供 JSON 備份下載，尚未提供舊資料匯入。

## API

以下所有端點皆需現有租客 Bearer token；X-User-Email 不具有驗證效力。

| 方法 | 路徑 | 用途 |
|---|---|---|
| GET / POST | `/api/notes` | 列出／建立個人記事 |
| PATCH / DELETE | `/api/notes/{id}` | 修改／刪除自己的記事 |
| GET / POST | `/api/households` | 列出參與的群組／建立群組 |
| POST | `/api/households/join/{invite_code}` | 加入群組，可重複呼叫 |
| POST | `/api/households/{id}/invite` | 建立者更新邀請碼，舊碼失效 |
| GET / POST | `/api/households/{id}/members` | 列出成員／建立者新增分工資料 |
| DELETE | `/api/households/{id}/members/{member_id}` | 建立者移除成員並取消其任務指派 |
| GET / POST | `/api/households/{id}/tasks` | 列出／新增群組任務 |
| PATCH / DELETE | `/api/households/{id}/tasks/{task_id}` | 修改／刪除群組任務 |

記事欄位：title、content、date（YYYY-MM-DD）、time（HH:MM 或空字串）、tag、done（修改時）。
任務另外有 assigneeId，空字串代表未指派；只能指派同群組成員。creatorId 由後端設定。

手動成員只是分工資料，不會自動建立帳號或授予登入權限。
真正的室友登入後需按邀請頁「加入協作空間」，才取得群組存取權。
建立者不能移除自己；其他成員被移除後立即失去群組存取權。
同群組成員皆可編輯／完成／刪除任務。群組切換與重新整理可讀取其他人的變更；沒有 WebSocket 即時推播。

## 驗證

```sh
python -m unittest discover -s backend/tests
npm test
npm run build
node scripts/verify-notes-browser.mjs
```

Python 測試需將 backend 加入 PYTHONPATH。測試使用獨立 SQLite，不寫入實際帳號資料。
瀏覽器測試使用已建置的 dist、隨機連接埠、獨立 Chrome profile 與記憶體 API，完成後自動關閉。
這項測試驗證頁面操作與請求；實際後端授權及 CRUD 則由 `test_notes_api.py` 驗證。
