# 資料庫結構、遷移與持久化

核對日期：2026-10-08。[返回入口](../README.md)

## 來源與儲存層

| 來源 | 用途 |
| --- | --- |
| [`backend/db/database.sql`](../../backend/db/database.sql) | 新環境建表基準；含固定資料庫名稱 |
| [`backend/db/models.py`](../../backend/db/models.py) | 業務及後台 ORM |
| [`backend/db/notes_models.py`](../../backend/db/notes_models.py) | 共居模型的相容匯入入口，實際宣告在 `models.py` |
| [`backend/db/schema_check.py`](../../backend/db/schema_check.py) | 啟動所要求的結構檢查 |
| [`backend/migrations/`](../../backend/migrations/) | 舊環境的增量升級 |
| [ORM 欄位索引](../reference/data-models.md) | 表、欄位、外鍵與限制的靜態查閱 |

應用程式主要使用 MySQL 與 SQLAlchemy。`SessionLocal` 用於業務交易；`db/sqlstore.py` 將後台模組的 `?` 參數查詢轉為 SQLAlchemy 具名參數，仍使用同一 engine。通知、排程、清運提醒與監控目前也走此層。SQLite 留在隔離測試、歷史升級與舊資料搬遷工具中，不能按舊文件推定需要另外備份一套執行期後台 SQLite。

## 資料領域

| 領域 | 主要資料表 |
| --- | --- |
| 帳號與驗證 | `users`、`user_roles`、`user_identities`、`pending_registrations`、`pending_admin_logins`、`password_reset_challenges`、`admin_sessions` |
| 租客自存契約 | `rentals`、`bills` |
| 房東租務 | `landlord_properties`、`landlord_rooms`、`landlord_tenants`、`landlord_leases`、`landlord_move_outs`、`landlord_tenant_activities`、`lease_invitations` |
| 房東財務／工作區 | `landlord_charges`、`landlord_charge_payments`、`landlord_charge_events`、`landlord_expenses`、`landlord_settings`、`landlord_team_members`、`landlord_audit_events` |
| 檔案與點交 | `landlord_lease_files`、`inspection_items`、`inspection_records` |
| 報修 | `repair_tickets`、`repair_ticket_events`、`repair_ticket_photos`、`repair_notes` |
| 個人／共居 | `personal_notes`、`households`、`household_members`、`roommate_tasks` |
| 平台內容／設定 | `site_settings`、`platform_settings`、`announcements`、`banners`、`content_meta`、`feature_outages` |
| 通知／監控／稽核 | `inbox_messages`、`scheduled_notifications`、`garbage_reminders`、`admin_notifications`、`audit_events`、`daily_usage`、`monitor_state`、`monitor_events` 與相關讀取／meta 表 |

這是領域摘要，不是完整 ER 圖；實際外鍵與型別見欄位索引及建表 SQL。ORM 宣告不代表每張表都有完整前端 CRUD，尤其租補與訂閱不可只由表名判斷實作完成。

## 新建與升級

全新環境先建立資料庫，再執行經確認的 `database.sql`，接著檢查 schema。既有資料環境先備份、盤點結構，再選擇必要 migration；不要把完整建表檔當作升級腳本。FastAPI 啟動會檢查結構，不自動補齊資料表。

```powershell
Push-Location backend
python -m db.schema_check
Pop-Location
```

近期需核對的遷移包括報修（20260930）、後台（20261001）、通知監控與點交拍攝來源（20261002）、房東工作區（20261005）、點交連結房東租約（20261006）、密碼重設 challenge。每份 SQL／Python 工具的前置條件與可重跑性需閱讀來源；日期不是可直接執行全部檔案的保證。

若舊環境缺少密碼重設表，可依工具說明執行：

```powershell
python backend/migrations/create_password_reset_challenges.py
```

v3 歷史資料升級見 [資料庫 v3 升級](../database-v3-upgrade.md)。後台舊 SQLite 搬遷見 [`migrate_sqlite_to_mysql.py`](../../backend/scripts/migrate_sqlite_to_mysql.py)，工具預設試跑；確認來源與目的資料庫後才使用其寫入選項。本次文件整理沒有執行任何 migration。

## 加密個資

[`EncryptedText`](../../backend/db/encrypted_fields.py) 使用 AES-GCM，每筆產生 nonce，保存版本、nonce、密文與驗證標籤；MySQL 使用 VARBINARY。API 經 ORM 解密後可能回傳文字，因此 DB 加密不等於 HTTP 回應或所有日誌自動去識別化。

`PII_ENCRYPTION_KEY` 必須是 Base64 的 32 bytes。既有資料不能直接換金鑰；備份資料庫必須另行保管可解密的金鑰。明文舊欄位需明確遷移，程式不會自動退回明文讀取。

## 檔案與交易

資料庫記錄照片／附件識別與檔名，檔案本體在上傳目錄。檔案系統寫入與 DB commit 不是同一個原子交易；備份、還原與清理需同時核對兩者。舊點交照片可能暫時保留，不能僅依 UI 中是否可見就刪除檔案。

資料庫連線採 `pool_pre_ping`；`get_db()` 對特定 MySQL 連線失敗轉為 503，結構與查詢錯誤仍應修正原因。線上錯誤不應被解讀成「使用者沒有資料」。備份與還原流程見 [維運](operations.md)。
