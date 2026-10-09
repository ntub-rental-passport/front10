# 部署設定說明

目前應用程式的部署條件、持久化目錄、健康檢查、備份與排錯見 [部署與維運](docs/technical/operations.md)。本文件其餘段落保留原有部署說明；實際正式設定需由維運者核對。

本分支**不包含**部署與基礎設施設定（`deploy/`、`deploy.sh`、`docker-compose.yml`）。

## 為什麼

那些檔案含有正式環境的防護細節 —— Nginx 限流參數、CSP 來源白名單、
fail2ban 封鎖門檻、防火牆規則、伺服器 IP 等。這類資訊等同「如何繞過本站防護」
的說明，故不置於雲端儲存庫，僅保留於維運者本機。

應用程式碼（`src/`、`backend/`、`server/`）完整包含在本分支，
本機開發與測試不受影響。

## 本機開發

```bash
npm install
npm run dev          # 前端 http://localhost:5173
npm run dev:backend  # 後端 http://localhost:8000
npm run dev:api      # OCR 服務 http://localhost:8787
```

需自行準備 `.env`（參考 `.env.example`）與本機 MySQL。

## 認證系統：目前兩套並存

合併後同時存在兩種驗證機制，登入端點會**同時發出兩者**：

| 機制 | 傳遞方式 | 使用端點 | 相關函式 |
|------|---------|---------|---------|
| Cookie 版 | HttpOnly Cookie（JWT） | 合約分析、OCR | `create_cookie_token` / `get_current_user` |
| Bearer 版 | Authorization 標頭 | 房東／租客物件管理、報修 | `create_access_token` / `get_current_landlord` / `get_current_tenant` |

兩者的金鑰不同，皆須於 `.env` 設定，**未設定將拒絕啟動**（刻意設計，避免
使用預設金鑰而無聲失效）：

```
JWT_SECRET="<openssl rand -hex 32>"          # Cookie 版
AUTH_TOKEN_SECRET="<openssl rand -hex 32>"   # Bearer 版
```

> 長期建議收斂為單一機制，避免兩套金鑰與兩套邏輯的維護負擔。
> 詳見 `backend/auth/security.py` 檔頭說明。

## 資料庫結構變更

目前以 `backend/db/database.sql`（61 張表）為基準。帳號與密碼存於 `users`，租客／房東／管理員身分存於 `user_roles`；記事與共居採新表名及整數主鍵，敏感欄位加密後存入 VARBINARY。

部署前設定 `PII_ENCRYPTION_KEY`，執行 `python -m db.schema_check (from backend/)` 檢查結構。後端啟動只讀驗證，不會自動建表或遷移。舊庫必須先規劃資料轉換；不要再執行舊的 `migrate_to_user_roles.py`。

完整欄位對應、金鑰設定與資料轉換注意事項請見 [database-v3-upgrade.md](docs/database-v3-upgrade.md)。

## 部署

### 密碼重設與修改（2026-10-07）

更新後端前，從專案根目錄執行 `python backend/migrations/create_password_reset_challenges.py`。
此遷移只新增 `password_reset_challenges`，可重複執行，不修改既有帳號或密碼。
全新資料庫的 `backend/db/database.sql` 已包含此表；後端啟動仍只做結構檢查。

`/forgot-password` 使用信箱驗證碼重設；`/change-password` 要求已登入且提供目前密碼。
租客與房東共用帳號密碼。Google-only 帳號需繼續使用 Google 登入；管理員帳號不走一般會員重設流程。
驗證碼有效 10 分鐘、60 秒後可重寄、每碼最多 5 次錯誤、每信箱每小時最多 5 封。
驗證碼以 HMAC 儲存；新碼與密碼變更會使舊碼失效。設定沿用 `VERIFICATION_CODE_SECRET` 與既有 SMTP 變數。

更新後需重新啟動 FastAPI 與 OCR Express 服務。新憑證帶簽發時間；改密碼後舊 Cookie/Bearer 失效。
不帶簽發時間的舊 Bearer 憑證可能要求重新登入。OCR 會向 `FASTAPI_INTERNAL_URL` 的 `/api/auth/me`
確認登入是否仍有效；FastAPI 不可用時回 503，不接受已撤銷憑證。

驗證：後端從 `backend` 執行 `python -m unittest discover -s tests -p test_password_recovery.py`；
前端執行 `npm test -- src/services/passwordApi.test.ts server/auth-session.test.js` 與 `npm run build`。
瀏覽器測試腳本為 `scripts/verify-password-browser.mjs`，使用隔離測試 API（8012）、預覽（5182）與 Chrome CDP（9334）。
先執行 `python scripts/password-preview.py`；另一個 PowerShell 設定 `$env:VITE_API_BASE_URL='http://127.0.0.1:8012'`，
再執行 `npm run dev -- --port 5182 --host 127.0.0.1 --config scripts/password-preview.vite.config.ts`。
Chrome 使用獨立測試 profile 與 `--headless=new --remote-debugging-port=9334`，最後執行 `node scripts/verify-password-browser.mjs`。
測試信件在本機攔截，不能視為真實 SMTP 投遞證明；測完關閉這三個測試程序。

由維運者以本機的 `deploy.sh` 執行（rsync 上傳 + 重建容器），不經由 GitHub。
