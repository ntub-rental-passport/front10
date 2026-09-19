# 部署設定說明

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
> 詳見 `backend/security.py` 檔頭說明。

## 資料庫結構變更

使用者的角色、密碼、第三方身分已由 `users` 表的欄位改為三張關聯表：

```
users.role          → user_roles                 （一個帳號可有多重角色）
users.password_hash → user_password_credentials
users.google_sub    → user_identities
```

既有帳號需執行遷移，否則將無法登入：

```bash
python backend/migrations/migrate_to_user_roles.py           # 預覽
python backend/migrations/migrate_to_user_roles.py --apply   # 執行
```

腳本具冪等性，可重複執行；不會刪除舊欄位。

⚠️ 若資料庫是既有的，`Base.metadata.create_all()` **只會建立缺少的資料表，
不會為既有資料表新增欄位**。`users` 表若缺 `avatar_url`，需手動補上：

```sql
ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL AFTER display_name;
```

## 部署

由維運者以本機的 `deploy.sh` 執行（rsync 上傳 + 重建容器），不經由 GitHub。
