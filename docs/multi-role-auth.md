# 多身分帳號與登入

目前 `backend/database.sql` 與 ORM 使用同一份多身分結構：

| 資料 | 欄位 |
| --- | --- |
| 唯一帳號、共用密碼 | `users.email`、`password_hash`、`password_changed_at` |
| 驗證、停用與登入時間 | `users.email_verified_at`、`status`、`last_login_at` |
| 帳號所有身分 | `user_roles.user_id`、`role`，複合主鍵禁止重複角色 |
| Google 綁定 | `user_identities.user_id`、`provider`、`provider_subject`，同一 Google 身分只綁一個帳號 |
| 待驗證身分 | `pending_registrations.role`，驗證成功才寫入 `user_roles` |

## API 行為

- `POST /api/auth/login` 沿用 `{email, password, role}`。房客／房東使用同一密碼與 user ID，必須已擁有指定角色。
- Cookie 與 Bearer token 的 `role` 代表本次選擇的身分。`GET /api/auth/me` 回傳該身分；每次驗證會重新檢查角色與停用狀態。登入另一種身分會更新 cookie。
- 要新增第二種身分，使用原有 `/registration/start` 與 `/registration/verify`。既有密碼帳號需填原密碼並驗證信箱；完成後只新增角色，保留原密碼、名稱及頭像。
- 若兩種身分在帳號建立前都已送出註冊申請，第一個驗證完成的申請建立帳號與密碼；後續申請驗證信箱後沿用該帳號，不覆寫密碼。
- Google 登入依 `provider_subject` 尋找帳號。缺少選定角色時回傳 `registrationRequired`，不簽發登入憑證；完成信箱驗證後新增角色並沿用綁定。同 email 的既有帳號也必須先完成信箱驗證才會綁定 Google。
- 公開註冊只允許 `tenant`／`landlord`。管理員保留原有帳密與郵件驗證碼兩階段登入。
- `manage_admin.py grant` 新增 admin，`revoke` 只移除 admin；其他角色保留。CLI 設定的密碼是整個帳號共用密碼。

## 資料庫套用

後端啟動與 `python backend/schema_check.py` 只檢查結構，不會自動更改資料庫。舊 `users.role` 結構無法直接配合新版程式，必須先遷移或在新資料庫套用 `backend/database.sql`。

`database.sql` 是建表檔，不是 ALTER 升級腳本。同 email 的舊房客／房東帳號若有不同 ID，需明確選定保留帳號、密碼並重新對應外鍵；本次程式修改沒有操作現有資料庫。

既有 `upgrade_local_sqlite_v3.py` 保留檔名，但輸出改成目前多身分結構，保留原 user ID 與角色。它仍是舊版明文 SQLite 資料的複製工具，不是通用 MySQL 或已加密資料庫升級工具；重複 email 會拒絕轉換，避免自動合併帳號。

## 測試

在 `backend` 目錄執行 `python -m unittest discover -s tests`。測試使用獨立 SQLite、模擬郵件與 Google 票證，包含 SQL／ORM 結構比對、多角色登入、角色撤銷、管理員驗證及註冊限制。
