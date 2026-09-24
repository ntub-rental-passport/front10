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

目前以 `backend/database.sql` 的 schema v3（27 張表）為基準。單一角色與密碼存於 `users`；記事與共居採新表名及整數主鍵，敏感欄位加密後存入 VARBINARY。

部署前設定 `PII_ENCRYPTION_KEY`，執行 `python backend/schema_check.py` 檢查結構。後端啟動只讀驗證，不會自動建表或遷移。舊庫必須先規劃資料轉換；不要再執行舊的 `migrate_to_user_roles.py`。

完整欄位對應、金鑰設定與資料轉換注意事項請見 [database-v3-upgrade.md](docs/database-v3-upgrade.md)。

## 部署

由維運者以本機的 `deploy.sh` 執行（rsync 上傳 + 重建容器），不經由 GitHub。
