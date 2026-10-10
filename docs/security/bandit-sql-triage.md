# Bandit B608 SQL 插值判讀

判讀日期：2026-10-10。範圍為規格列出的 28 處 B608；本次修改前以 Bandit 1.9.4 重掃，也是這 28 處。

第一欄保留規格的行號；`garbage_service.py` 因既有程式變動，四處目前分別在 184、185、190、203 行，另於括號標示。本次只加行尾註解，沒有改動 SQL、呼叫方式或行號。

「使用者可控」指使用者能否把自選內容帶進 **SQL 字串的語法部分**。使用者能控制綁定參數的值，不等於能控制 SQL 結構；以下會分別說明。API 的一般使用者與後台管理員都納入追蹤，沒有因為需要登入就視為安全。

離線腳本依其既有用途判讀：維運人員使用專案管理的 MySQL 結構與舊版服務的 SQLite 備份。`merge_into_school_db.py` 的來源是 `backend/db/database.py:11` 的部署設定，於 `backend/scripts/merge_into_school_db.py:105` 建立來源連線；`--target`（同檔 `:100`、`:104`）只選目的連線。SQLite 的 `--source`（`backend/scripts/migrate_sqlite_to_mysql.py:75`、`:79`、`:88`）只選來源目錄；檔名、表名仍由 `PLAN` 決定。專案遷移文件也明載來源是 VM 既有資料（`backend/migrations/20261001_admin_tables_to_mysql.sql:3`、`:16`；`backend/migrations/20261002_notification_monitor_tables_to_mysql.sql:14`）。這些腳本不經 HTTP；使用者寫入的資料列仍視為不可信，但維運掌管的資料庫結構不視為使用者輸入。此結論**不涵蓋維運人員匯入攻擊者提供或可修改表結構的資料庫檔案**，也不能把下表的結構中繼資料誤稱為程式常數。

## 共用呼叫鏈

`backend/db/sqlstore.py:102` 的 `Store.execute()` 在 `:104` 將資料值收進 `bound`，`:105` 執行 `text(_translate(sql)), bound`；`_translate()`（`:39`）只把 `?` 換成 `:p0` 等參數名，沒有把資料值插回字串。監控與垃圾車服務都經過這個綁定層。

`Store.upsert()` 的所有正式呼叫端都自行建立固定表名與字典鍵：

- `backend/admin/monitoring_service.py:183`、`:412`：`monitor_meta`，欄位 `key`、`value`，分別由心跳與 OCR 檢查呼叫。
- `backend/routers/platform_settings_api.py:105`、`:108` → `backend/admin/site_settings.py:271`、`:279`：request body 經驗證後成為 `{'key': key}`、`{'value': JSON}` 的**值**；表名 `site_settings` 與欄名 `key`、`value` 寫死。
- `backend/routers/platform_settings_api.py:81`、`:88` → `backend/admin/platform_settings.py:100`、`:108`：request body 成為 `key`、`value` 欄位的值；表名 `platform_settings` 與兩個欄名寫死。
- `backend/routers/admin_repairs_api.py:99`、`:113` → `backend/admin/repair_notes.py:50`、`:53`：工單 ID 與使用者註記（包含原先存於資料庫的註記）放在 `ticket_id`、`value` 的值；表名 `repair_notes` 及欄名寫死。
- `backend/routers/ai_usage_api.py:40`、`:43` → `backend/admin/ai_usage.py:48`、`:56`：回報內容成為 `date`、`provider`、`units`、`calls` 的值；表名 `daily_usage` 與欄名寫死，`add=True` 也是常數。

`Store.insert_ignore()` 的所有正式呼叫端同樣使用固定表名與字典鍵：

- `backend/routers/admin_notifications_api.py:35`、`:41` → `backend/admin/admin_notifications.py:125`、`:142`：通知 ID 可來自路徑或資料庫資料列，管理員 ID 來自登入身分；它們都是值，`admin_notification_reads`、`notification_id`、`admin_id`、`read_at` 寫死。
- `backend/routers/inbox_api.py:61`、`:69`、`:81` → `backend/notifications/inbox_service.py:381`、`:388`、`:396`：request body／路徑中的公告 ID、關閉識別字與登入者 ID 都是值；`announcement_reads`、`announcement_dismissals` 及 `user_id`、`announcement_id`、`read_at`、`dismiss_key`、`dismissed_at` 寫死。
- `backend/admin/ai_usage.py:58` → `:107`、`:111`：額度提醒識別字雖由 provider、月份、等級組成，卻放在 `{'key': 識別字}` 的值；表名 `usage_meta` 與欄名 `key`、`value` 寫死。

## 逐處判讀

| 檔案:行號 | 插入的值是什麼 | 來源（追到哪裡為止，附檔案:行號） | 使用者可控（是／否） | 處置（修正／加 nosec） | 理由 |
| --- | --- | --- | --- | --- | --- |
| `backend/admin/monitoring_service.py:216` | `marks`，以逗號分隔的 `?` | `backend/routers/admin.py:284`、`:294`、`:295` 的 query string → `backend/admin/monitoring_service.py:214` 只依項目數產生 `?`；另有`backend/admin/monitoring_service.py:473` 固定傳入 `['recovered']`。 | 否 | 加 nosec | 輸入只能影響佔位符數量，不能插入自選語法；種類文字與 limit 在同檔 `:217` 另作參數綁定。 |
| `backend/admin/monitoring_service.py:543` | `either('pending')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:543` 傳入字面常數 `pending`。 | 否 | 加 nosec | 區域函式只收到此處固定狀態，沒有讀取 query、body 或資料列狀態作插值。 |
| `backend/admin/monitoring_service.py:545` | `either('pending')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:545` 傳入字面常數 `pending`。 | 否 | 加 nosec | 狀態固定；逾期時間在同檔 `:546` 透過 `count`（`:541`）綁定。 |
| `backend/admin/monitoring_service.py:548` | `either('sending')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:548` 傳入字面常數 `sending`。 | 否 | 加 nosec | 狀態固定，時間門檻是綁定參數。 |
| `backend/admin/monitoring_service.py:549` | `either('failed')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:549` 傳入字面常數 `failed`。 | 否 | 加 nosec | 狀態固定，時間門檻是綁定參數。 |
| `backend/admin/monitoring_service.py:550` | `either('missed')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:550` 傳入字面常數 `missed`。 | 否 | 加 nosec | 狀態固定，時間門檻是綁定參數。 |
| `backend/admin/monitoring_service.py:552` | `either('failed')`、`either('missed')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:552` 的兩個引數都是字面常數。 | 否 | 加 nosec | 使用者資料不會取代這兩個狀態字串。 |
| `backend/admin/monitoring_service.py:555` | `either('pending')` 條件片段 | `backend/routers/admin.py:77` → `backend/admin/monitoring_service.py:500`、`:542`；`:555` 傳入字面常數 `pending`。 | 否 | 加 nosec | 狀態固定；同列的 `ts` 以參數綁定，未插入字串。 |
| `backend/db/sqlstore.py:147` | `table`、`assignment`、`where`：表名、欄名、固定運算子與 `?` | `backend/db/sqlstore.py:144`、`:145` 取字典鍵；所有呼叫端為 `backend/admin/monitoring_service.py:183`、`:412`、`backend/admin/site_settings.py:279`、`backend/admin/platform_settings.py:108`、`backend/admin/repair_notes.py:53`、`backend/admin/ai_usage.py:56`，表名與鍵皆為字面常數（完整 API 鏈見上文）。 | 否 | 加 nosec | 沒有直接把 request 字典當欄位集合；使用者輸入是字典值，於同檔 `:148`、`:105` 綁定。 |
| `backend/db/sqlstore.py:156` | `table`、`names`、`placeholders`：表名、欄名與 `?` | `backend/db/sqlstore.py:152` 至 `:154` 取字典鍵；常數來自 `backend/admin/monitoring_service.py:183`、`:412`、`backend/admin/site_settings.py:279`、`backend/admin/platform_settings.py:108`、`backend/admin/repair_notes.py:53`、`backend/admin/ai_usage.py:56`。 | 否 | 加 nosec | 欄名與表名由呼叫端固定，資料值在同檔 `:157`、`:105` 綁定。 |
| `backend/db/sqlstore.py:166` | `table`、`where`：表名、鍵欄名與 `?` | `backend/db/sqlstore.py:165` 取字典鍵；常數來自 `backend/admin/admin_notifications.py:125`、`:142`、`backend/notifications/inbox_service.py:381`、`:388`、`:396`、`backend/admin/ai_usage.py:107`、`:111`（完整 API 鏈見上文）。 | 否 | 加 nosec | 公告 ID、通知 ID、額度提醒識別字都是字典值；`tuple(keys.values())` 經同檔 `:105` 綁定。 |
| `backend/db/sqlstore.py:173` | `table`、`names`、`placeholders`：表名、欄名與 `?` | `backend/db/sqlstore.py:169` 至 `:171` 取字典鍵；常數來自 `backend/admin/admin_notifications.py:125`、`:142`、`backend/notifications/inbox_service.py:381`、`:388`、`:396`、`backend/admin/ai_usage.py:107`、`:111`。 | 否 | 加 nosec | 表名與欄位集合固定，資料值在同檔 `:174`、`:105` 綁定。 |
| `backend/notifications/garbage_service.py:155`（目前 `:184`） | `column` | `backend/main.py:58` 背景派送 → `backend/notifications/garbage_service.py:180` 固定的 `email`／`push` 清單 → `:181` 加上 `_status`。 | 否 | 加 nosec | 只有 `email_status`、`push_status` 兩種欄名；時間門檻綁定。 |
| `backend/notifications/garbage_service.py:156`（目前 `:185`） | `column` | `backend/main.py:58` → `backend/notifications/garbage_service.py:180`、`:181` 的固定通道清單。 | 否 | 加 nosec | 使用者的通知偏好不會變成通道字串，查詢時間亦綁定。 |
| `backend/notifications/garbage_service.py:161`（目前 `:190`） | `column` | `backend/main.py:58` → `backend/notifications/garbage_service.py:180`、`:181` 的固定通道清單；`row['id']` 來自`backend/notifications/garbage_service.py:185`。 | 否 | 加 nosec | 資料列識別碼放在參數 tuple，沒有插入 SQL；欄名仍由固定通道決定。 |
| `backend/notifications/garbage_service.py:171`（目前 `:203`） | `column` | `backend/main.py:58` → `backend/notifications/garbage_service.py:180`、`:181` 的固定通道清單；狀態在 `:195`、`:201` 產生，識別碼來自 `:185`。 | 否 | 加 nosec | `state` 與 `row['id']` 都綁定。HTTP 資料由 `backend/routers/garbage.py:91`、`:96` → `backend/notifications/garbage_service.py:110`、`:115` 儲存為 payload；派送讀 payload（`:194`），不拿它產生欄名。 |
| `backend/scripts/merge_into_school_db.py:136` | `user_columns` 的欄名 | `backend/scripts/merge_into_school_db.py:131` 固定查 `users` → `:86` 至 `:89` 從來源資料庫 `information_schema.columns.column_name` 讀取；來源連線在 `:105`。 | 否 | 加 nosec | 欄名是維運掌管的結構中繼資料，非使用者填入的 email 等資料值；`uid` 在 `:137` 綁定。 |
| `backend/scripts/merge_into_school_db.py:139` | `assignment`，欄名與具名參數 | `backend/scripts/merge_into_school_db.py:138` → `:131` → `:86` 至 `:89` 的 `users` 結構中繼資料。 | 否 | 加 nosec | 使用者可控制的帳號資料讀自 `:136`，但在 `:140` 作為 bind 值傳入；更新片段只含結構欄名與佔位符。 |
| `backend/scripts/merge_into_school_db.py:147` | `user_columns` 的欄名 | `backend/scripts/merge_into_school_db.py:131` 固定查 `users` → `:86` 至 `:89` 的來源資料庫結構中繼資料。 | 否 | 加 nosec | 查新帳號仍只插入結構欄名，帳號 ID 在 `:148` 綁定。 |
| `backend/scripts/merge_into_school_db.py:151` | `names`、`holders`：欄名與具名參數 | `backend/scripts/merge_into_school_db.py:149`、`:150` 由固定 `id` 與 `user_columns` 組成 → `:131` → `:86` 至 `:89` 的結構中繼資料。 | 否 | 加 nosec | 帳號欄位內容可能來自使用者，但只經 `:152` 的字典綁定，沒有用資料值產生欄名。 |
| `backend/scripts/merge_into_school_db.py:161` | `table`、`cols` 的欄名 | `backend/scripts/merge_into_school_db.py:157` 的表名來自 `PLAN`（`:46`）；`:160` 呼叫 `columns_of`（`:86` 至 `:89`）取得該表結構。 | 否 | 加 nosec | 表名是固定搬遷清單，欄名是來源資料庫結構；尚未讀取資料列內容。 |
| `backend/scripts/merge_into_school_db.py:165` | `pk`、`table` | `backend/scripts/merge_into_school_db.py:157` 解構 `PLAN`（`:46` 至 `:75`）的固定表名與主鍵欄名。 | 否 | 加 nosec | 兩個插值都是程式常數，查得的最大 ID 不會插回這句 SQL。 |
| `backend/scripts/merge_into_school_db.py:191` | `table`、`names`、`holders` | `backend/scripts/merge_into_school_db.py:157` → `PLAN`（`:46`）；`:184`、`:185` 取 `data` 的鍵，鍵由 `:168` 的 `zip(cols, row)` 建立；`cols` 經 `:160` → `:86` 至 `:89` 來自結構。 | 否 | 加 nosec | 外鍵與 ID 改號（`:169` 至 `:183`）只改資料值；使用者寫入的內容保留在 `data` 的值，交給 `text()` 綁定。 |
| `backend/scripts/merge_into_school_db.py:211` | `table`、`cols` 的欄名 | `backend/scripts/merge_into_school_db.py:204` → `ADMIN_TABLES` 常數（`:78`）；`:210` → `columns_of`（`:86` 至 `:89`）。 | 否 | 加 nosec | 後台表名固定，欄名來自來源資料庫結構，不是公告、設定等資料內容。 |
| `backend/scripts/merge_into_school_db.py:218` | `table`、`names`、`holders`、續行的 `updates` | `backend/scripts/merge_into_school_db.py:204` → `ADMIN_TABLES`（`:78`）；`:214` 至 `:217` 只取 `cols` 衍生的字典鍵；`cols` 來自 `:210` → `:86` 至 `:89`。 | 否 | 加 nosec | INSERT 與 ON DUPLICATE KEY UPDATE 都只插入固定表名及結構欄名；包括管理員編輯內容在內的整列資料於 `:219` 綁定。 |
| `backend/scripts/migrate_sqlite_to_mysql.py:68` | `table` | 唯一正式呼叫為`backend/scripts/migrate_sqlite_to_mysql.py:95`，其 `source_table` 來自 `:87`、`:92`、`:93` 解構的 `PLAN` 常數（`:35` 至 `:58`）。 | 否 | 加 nosec | `--source` 只選檔案目錄，不能改變 SQL 中的表名；沒有 HTTP 呼叫此函式。 |
| `backend/scripts/migrate_sqlite_to_mysql.py:105` | `target`、`where`：表名與鍵欄條件 | `backend/scripts/migrate_sqlite_to_mysql.py:87`、`:92`、`:93` 的 `target`、`keys` 來自 `PLAN`（`:35`）；`:103` 由固定鍵欄建立具名參數。 | 否 | 加 nosec | 比對用的資料值可能來自使用者，但在 `:106` 綁定；表名、鍵欄不是從資料列的值取得。 |
| `backend/scripts/migrate_sqlite_to_mysql.py:113` | `target`、`columns`、`values`（此處是參數名清單） | `backend/scripts/migrate_sqlite_to_mysql.py:93` 的表名來自 `PLAN`（`:35`）；`:111`、`:112` 取 `row` 的鍵，經 `:102`、`:95` 回到 `:63`、`:68` 的 `sqlite3.Row` 欄名，即維運所選 SQLite 檔案的表結構。 | 否 | 加 nosec | 字典鍵是 SQL 結果欄名，不是 payload JSON 中的鍵；資料列內容透過 `row` 綁定。此判定依賴上述可信備份結構前提，不適用任意外來 SQLite 檔。 |

## 結論與報告修正文案

這 28 處的插值均未發現一般使用者或後台管理員可控制的 SQL 語法內容；處置為 28 處加上限定規則的 `# nosec B608` 與繁體中文理由，沒有改寫既有安全查詢，因此沒有行為修正或相應的新測試。這不是「系統沒有 raw SQL」，也不代表通用的 `Store` 方法能安全接收任意外部表名或欄位字典；未來若新增呼叫端、改變識別字來源或接受外來資料庫結構，必須重新判讀，並對外部識別字使用白名單。

上一份報告的「後端全用 SQLAlchemy ORM、沒有 raw SQL」應改為：

> 後端同時使用 SQLAlchemy ORM 與原生 SQL。後台共用連線層會將 `?` 佔位符轉成 SQLAlchemy `text()` 的具名綁定參數；離線搬遷腳本亦使用原生 SQL。此次逐一追蹤 28 處 Bandit B608，發現 SQL 字串插值僅來自固定表名／欄名、固定狀態、程式產生的佔位符，或維運掌管的資料庫結構中繼資料；使用者可控制的資料值均另行綁定，未發現這 28 處有使用者資料值拼入 SQL 語法的路徑。離線腳本的判定以來源資料庫結構可信為前提，不能延伸為整個系統「結構上不可能被注入」的保證。

已先閱讀並執行 `deploy/check-sql-safety.sh`。它以文字模式搜尋 f-string、`text()` 拼接、直接 `execute()` 與原生游標；不追蹤資料來源，也不處理 `nosec`，因此其命中需要人工判讀。該腳本的「零 raw SQL」說明與現況不符，本次依範圍限制未修改 deploy 檔案。

## 驗證紀錄

worktree 原先沒有 `.venv`，先於根目錄執行 `python3 -m venv .venv`，再執行 `.venv/bin/python -m pip install -r backend/requirements.txt pytest bandit`。修改前後使用同一環境：Python 3.14.6、pytest 9.1.1、Bandit 1.9.4、SQLAlchemy 2.1.4、FastAPI 0.143.0；中間沒有更新依賴。

首次在 `backend/` 執行下列命令時，有 9 個收集錯誤（缺少 `JWT_SECRET`，以及 `test_multi_role_auth.py` 匯入 `test_schema_v3` 的搜尋路徑）。因此只補命令列環境變數後重跑；沒有修改 `.env`、測試或應用程式來排除既有失敗。

```sh
../.venv/bin/python -m pytest -q tests --junitxml=/tmp/bandit-sql-before.xml > /tmp/bandit-sql-pytest-before.log 2>&1
```

完整測試命令（工作目錄均為 `backend/`）：

```sh
# 修改前
JWT_SECRET=bandit-sql-triage-test-secret-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest -q tests --junitxml=/tmp/bandit-sql-before.xml > /tmp/bandit-sql-pytest-before.log 2>&1
# 修改後
JWT_SECRET=bandit-sql-triage-test-secret-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest -q tests --junitxml=/tmp/bandit-sql-after.xml > /tmp/bandit-sql-pytest-after.log 2>&1
```

兩次皆為退出碼 1：**57 failed、750 passed、951 subtests passed**，沒有收集錯誤。這是本環境的實測基準，並非沿用規格預估的約 35 個失敗。以 JUnit XML 比較失敗案例的 `classname`、`name` 及出現次數，修改前後完全相同，新增失敗為 **0**。

SQL 檢查命令（工作目錄為專案根目錄）：

```sh
# 修改前：退出碼 1，28 處 B608，掃描錯誤 0
.venv/bin/bandit -r backend -x backend/tests,backend/.venv -t B608 -f json -o /tmp/bandit-sql-before.json
# 修改後：退出碼 0，B608 剩餘 0 處，限定規則註解排除 28 處，跳過檔案 0
.venv/bin/bandit -r backend -x backend/tests,backend/.venv -t B608 > /tmp/bandit-sql-after.log 2>&1
# 既有文字模式檢查：修改前後均退出碼 1
bash deploy/check-sql-safety.sh > /tmp/bandit-sql-safety-before.log 2>&1
bash deploy/check-sql-safety.sh > /tmp/bandit-sql-safety-after.log 2>&1
```

Bandit 的 0 處是經人工判讀後排除警告的結果，不代表移除了原生 SQL。Bandit 1.9.4 另輸出部分 `nosec encountered (B608), but no failed test` 警告；最終統計仍確認 28 處按規則排除，沒有全域停用 B608。既有 SQL 檢查腳本前後都命中相同的 42 個不同程式行（排除新加的行尾註解後逐行比對），並無新增命中。

`git diff --check` 通過。另以 Python AST 比對五個 Python 檔案與 `HEAD`，語法樹完全相同；28 個註解的位置與修改前 Bandit JSON 的位置完全一致。判讀表的 28 列與規格清單逐一比對，沒有缺漏，且每列來源欄都有完整的 `檔案:行號`。變更僅限指定五個 Python 檔案及本文件，沒有新增測試或其他檔案變更。
