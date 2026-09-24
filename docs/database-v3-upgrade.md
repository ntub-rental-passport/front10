# 新資料庫結構對應（schema v3）

基準為 `ca00945` 的 `backend/database.sql`，共 27 張表，另依確認後的需求調整帳號唯一限制：每個帳號只有一個角色，同一個 email 可以各有一個租客與房東帳號。

## 同信箱、不同角色

- `users` 的唯一限制為 `(email, role)`，公開註冊只允許 tenant／landlord。信箱在註冊與登入時去除前後空白並轉成小寫。
- 每個帳號有獨立的 user ID、密碼及資料；登入時必須選擇角色。不會因共用 email 自動共用權限。
- 待驗證註冊的 email 與 Google subject 唯一限制也包含 role，兩種角色可同時等待驗證。
- 同一 Google subject 可綁定兩個帳號；`user_identities` 唯一限制為 `(provider, provider_subject, user_id)`。登入及註冊查詢會透過 users 限定所選角色。
- 前端暱稱快取以 email＋role 區隔；後端資料仍以 user ID 授權。
- 舊雙角色帳號拆分後保留原密碼雜湊與 Google 綁定，房東資料對應新的房東 ID，租客保留原 ID，讓記事、共居及獨立 SQLite 中的垃圾提醒維持正確歸屬。升級後請重新登入，尤其舊房東 session 不再有效。

## 程式對應

- `backend/models.py` 對應全部 27 張表的欄位、型別、可空值、外鍵與索引。
- 單一帳號角色讀寫 `users.role`；密碼雜湊讀寫 `users.password_hash` 與 `password_changed_at`。Google 綁定繼續使用 `user_identities`。
- 登入、管理員兩階段驗證、使用者清單、Bearer 權限及 cookie session 都會核對帳號現有角色與停用狀態。
- `pending_registrations.invite_code` 已移除，註冊畫面不再收集該欄位。共居邀請仍由 `households.invite_code` 處理，長度不超過 20。
- 個人記事改用 `personal_notes`，共居改用 `households`、`household_members`、`roommate_tasks`。主鍵為整數，API 保留字串 ID 的前端契約。
- API 的 `date/time/done` 分別對應 `due_date/due_time/done`；`due_time` 寫入真正的 TIME，完成／取消完成會同步 `done_at`。個人與共居標籤各自依照 SQL 的 ENUM 驗證。
- 共居成員必須有真實 `user_id`。手動新增改填已註冊租客信箱，未註冊者需先註冊並使用邀請連結加入。
- 帳單使用 `period_index`、`period_start`、`period_end`、各種 `*_amount` 與付款紀錄欄位；不再映射 `bill_status`。
- 點交改用 `user_note`、`item_name`、`room_name`、`vlm_result`；合約與租補欄位依新 SQL 擴充。
- 新增維修、租補附件、管理設定及稽核的 ORM 模型。這不代表原本只使用前端本機儲存的功能已新增後端 CRUD API。
- 移除舊 `utility_outages` 映射。停電查詢的來源更新不是本次資料庫相容性修改範圍。

## 敏感資料金鑰

所有 VARBINARY 個資欄位使用 AES-256-GCM 加密，API 端仍讀寫字串。環境需設定 `PII_ENCRYPTION_KEY` 為 Base64 編碼的 32 bytes 隨機金鑰：

```powershell
python -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

將產生值存入部署環境的 secret 或本機 `.env`，不要提交金鑰。必須單獨備份，不能在已有密文時直接更換。缺金鑰、格式不正確、密文驗證失敗時不會退回明文。255／512 bytes 容量包含 29 bytes 的版本、nonce 與驗證標籤開銷。

## 新環境啟動

1. 在選定的新 MySQL 資料庫套用 `backend/database.sql`。檔案指定 `USE 115-RentMate`；執行前確認目標資料庫，不要將它當成既有庫的 ALTER migration。
2. 設定 `DATABASE_URL`、`PII_ENCRYPTION_KEY` 與既有登入／郵件環境變數，安裝 `backend/requirements.txt`。
3. 執行 `python backend/schema_check.py`，只讀檢查表格、欄位、型別與帳號唯一限制。
4. 執行 `npm run dev:all`。後端啟動不再呼叫 `create_all`，遇到舊結構會明確拒絕啟動，不會產生新舊混用的表格。

管理員維持既有 CLI 建立／授權流程，不開放公開註冊取得 admin。`manage_admin.py grant` 將帳號唯一角色設為 admin；若信箱同時有租客與房東帳號，CLI 會拒絕任意挑選其中一個，請使用獨立管理員信箱。`revoke` 停用管理員帳號，既有兩階段驗證仍保留。

## 本機 SQLite 升級

先停止開發伺服器，避免備份後仍有程式寫入舊庫。預檢不改動任何檔案：

```powershell
python backend/migrations/upgrade_local_sqlite_v3.py --source backend/rentmate_dev.db --target backend/rentmate_v3.db
```

確認預檢資料筆數後，加上 `--apply --activate`：工具會保留來源檔案、建立一致性快照、將資料寫入全新 SQLite，檢查每筆搬移值、解密、外鍵及結構後，才更新 `.env` 的 DATABASE_URL 與加密金鑰。原 `.env` 備份於 `logs/env-before-v3-*.env`。目標檔已存在時會拒絕覆寫。

超過 20 字元的舊共居邀請碼會重新產生，請改用升級後的邀請連結。金鑰與資料庫必須一起備份。原始資料庫未修改，但不要用新版程式直接操作舊庫；回復時需一併回復相容的程式版本與環境設定。

## 舊資料轉換前需要處理

新 SQL 是建表定義，不能直接覆蓋舊資料庫。轉換需在備份或新資料庫中進行：

- 多重角色帳號拆成不同 user ID，各自只有一個角色；具有不明角色歸屬的通知或留言時，工具會拒絕搬移，要求明確對照。
- 將舊密碼雜湊及修改時間搬至 users，不重新雜湊既有 hash。
- notes 及共居表重新命名，UUID 主鍵需建立整數 ID 對照並同步所有外鍵。
- 舊無帳號的手動室友要先對應真實帳號；不能建立空 user_id 或冒用建立者帳號。
- 補齊 bills 的期起訖日期，轉換金額與付款狀態；不能僅更名後假造 paid_at。
- 將原明文個資使用上述相同金鑰加密，再寫入 VARBINARY，不能只 CAST 為 bytes。
- `inspection_records.description` 搬到 `user_note`；各新增可空值與預設欄位按 SQL 處理。

舊 `migrate_to_user_roles.py` 與 `create_notes_tables.py` 已停用，避免將 v3 反向改回舊結構。歷史 `.sql` migration 僅供查閱，不可當作 v3 升級流程。

## 測試

後端測試使用獨立 SQLite 記憶體資料庫。`test_schema_v3.py` 另外比對 MySQL 編譯型別、外鍵及索引與 SQL，並驗證註冊、登入、權限撤銷、密文讀寫、帳單及點交。這些測試不會修改既有資料，也不代替實際 MySQL 資料遷移驗證。

自動測試涵蓋同信箱兩種角色的註冊與登入、Google 綁定、同角色重複註冊、前端暱稱區隔、舊 SQLite 帳號拆分與資料歸屬、敏感欄位加密及重複手機檢查。MySQL 使用 SQL 結構與型別契約測試，尚未在實際 MySQL 伺服器執行搬移。

## 2026-09-24 本機執行結果

- 已將 `.env` 切換至 `backend/rentmate_v3_20260924.db`；原 `backend/rentmate_dev.db` 的 SHA-256 確認未變。
- 一致性快照：`backend/rentmate_v3_20260924-legacy-snapshot.db`。環境備份：`logs/env-before-v3-20260924-102850.env`。以上檔案與金鑰都不納入 Git。
- 原 5 個使用者變成 6 個帳號：原 ID 1 保留租客角色，房東角色移至 ID 6；Google 綁定由 3 筆變成 4 筆。
- 保留 4 個房產、14 個房間、3 個房東租客紀錄、3 份租約、4 筆租客活動、2 個共居群組、3 筆群組成員及 1 個共居任務。獨立垃圾提醒庫的 1 筆提醒繼續歸屬租客 ID 1。
- 後端 117 項、前端 662 項測試通過；TypeScript／Vite 建置通過。
- 實際以 Uvicorn 啟動並連接升級後資料庫：`/api/health` 回傳 HTTP 200、database=ok；租客共居、房東物件及租客清單均回傳 200；舊 ID 1 的房東 token 回傳 403。
- 啟動測試使用獨立的空白垃圾提醒佇列，避免測試寄出通知；測試伺服器已停止。重新執行 `npm run dev:all` 並登入即可使用。
