# VM 檔案與圖片儲存規劃

日期：2026-10-08　狀態：設計已確認，待實作

這份文件規劃 RentMate 在 VM（`rentmate@140.131.114.157`）上的檔案儲存，包括系統圖片（首頁輪播）與使用者檔案。內容是 2026-10-08 逐題討論後確認的結果；決策紀錄在第 2 節，未決事項在第 9 節。

## 1. 現況

### 1.1 VM

- 學校提供的 Ubuntu VM，4 vCPU，沒有 GPU。根目錄 78 GB，已用 52 GB，剩 22 GB（2026-10-08 實測）。空間大多被 Docker 映像佔用，使用者檔案目前合計約 1 MB。
- 資料庫是學校的 MySQL（`140.131.114.242`，`115-RentMate`），不在 VM 上。
- 前面是 Cloudflare proxy，origin 只接受 Cloudflare 的 IP。nginx 設定 `client_max_body_size 80m`。
- `docker-compose.yml` 被 gitignore，只存在本機與 VM，由 `deploy.sh` 用 rsync 推上 VM。

### 1.2 已經會落地的檔案

| 種類 | 程式 | VM 位置 | 備註 |
|---|---|---|---|
| 點交照片 | `backend/routers/inspection.py` | `data/inspection-photos` | base64 JSON 上傳，轉成 1280px JPEG。刪除或重拍時刻意保留舊檔（`inspection.py:355`）。 |
| 報修照片與收據 | `backend/routers/repairs.py` | `data/repair-photos` | base64 JSON 上傳。刪除時會一併刪檔。 |
| 房東租約附件 | `backend/routers/landlord_contracts.py` | **沒有掛載**，檔案落在容器的可寫層 | compose 沒有設 `LEASE_FILE_DIR`。實測容器內目前 0 個檔案，還沒有資料遺失。 |
| 輪播圖 | `backend/admin/banner_images.py` | `data/banner-images` | multipart 上傳，原檔照存，沒有刪除 API。 |

只存在瀏覽器、沒有上伺服器的：

- 合約佐證附件：IndexedDB。
- 合約處理紀錄：`localStorage`，key 是 `rentmate-review:<reviewSessionId>`。
- AI 報告 PDF：在瀏覽器產生後直接下載。

### 1.3 其他現況

- **備份**：`deploy/backup.sh` 要手動執行，只備份 DB、SQLite、`.env`、金鑰和憑證，**不包含任何上傳檔**。異地備份只有 `--mail` 這一種，用 GPG 加密後寄 email。
- **輪播後台**：`/admin/content` 的「輪播」分頁已經能上傳、排序、設排程，`GET /api/admin/banner-images` 也能列出已上傳的圖。
- **加密**：DB 的個資欄位由 `backend/db/encrypted_fields.py` 加密，用 AES-GCM，金鑰是 `PII_ENCRYPTION_KEY`。
- **排程**：`backend/main.py` 的 `reminders_loop` 每 20 秒跑一次，其中有每小時跑一次的工作（`landlord_tick % 180`）。
- **通知**：`backend/notifications/user_notify.py` 的 `notify_user()`。

## 2. 決策紀錄

| # | 決策 |
|---|---|
| 定位 | 專題 demo。使用 VM 本機資料夾，不架 MinIO 這類物件儲存服務。 |
| 範圍 | 新增補助文件夾、合約審閱上雲（處理紀錄、佐證圖片、報告）。頭像只預留種類，這次不實作。 |
| 不做 | 容量計算與限制（方案容量維持「規劃中」）、繳費證明上傳、留存 OCR 原檔。 |
| 合約佐證 | 改存伺服器，只收圖片。上傳前提醒「請勿上傳完整租約」。 |
| 舊佐證附件 | 不搬移。瀏覽器 IndexedDB 裡的舊附件照常顯示，**不加**「僅存在此裝置」標示。 |
| 補助文件 | 全部都收，包含租約影本。只有本人看得到，管理員也看不到。 |
| 報告 | 存**完整資料版**。使用者按「存到我的空間」才存。每筆審閱最多 10 份，滿了就擋下來，請使用者先刪舊的。 |
| 權限 | 輪播圖公開，可被 Cloudflare 快取。其他檔案都是私有，經過 API 驗證擁有者，不是本人回 404。 |
| 輪播圖庫 | 顯示目前張數、標示「未使用」、可選圖、可刪圖。還有輪播在用的圖不能刪；內建 3 張不能刪；最多 30 張。 |
| 刪除 | 刪除時立刻刪掉實體檔，並跑一次清理腳本處理現有的孤兒檔。 |
| 保留期限 | 補助文件在上傳 180 天後自動刪除；沒有連到租約的合約審閱，在最後更新 180 天後自動刪除。兩者都在到期前 14 天發通知。刪除租約時，審閱只解除連結，不跟著刪。 |
| 加密 | 補助文件、佐證圖片、報告 PDF 加密存放。照片類和輪播圖不加密。 |
| 目錄 | 全部集中到 `data/uploads/<種類>/`，只掛一個 volume。 |
| 上傳格式 | 新 API 用 multipart。現有的 base64 API 不動。 |
| 備份 | restic 透過 rclone 備份到專題專用的 Google Drive 帳號，每天凌晨 3 點。保留 7 天、4 週、3 個月。點交照片也要備份。拿掉 email 備份。 |
| 密碼保管 | restic 密碼存在組員共用的密碼管理器，或至少兩位組員各留一份。 |
| 備份監控 | 後台「系統監控」新增「每日備份」項目，超過 26 小時沒有成功就算異常（併入 P0）。 |
| 跨裝置入口 | 「我的合約審閱」列表頁先不做（延後）。 |
| 順序 | P0 基礎與備份 → P1 輪播圖庫 →（P2 頭像，預留）→ P3 合約審閱 → P4 補助文件夾 |

## 3. 儲存架構

### 3.1 目錄

VM 上的 `~/rentmate/data/uploads/` 掛進容器的 `/app/uploads/`：

```
data/uploads/
├── banners/      輪播圖（公開，明文）
├── inspection/   點交照片（私有，明文）
├── repairs/      報修照片與收據（私有，明文）
├── contracts/    房東租約附件（私有，明文）
├── reviews/      合約審閱的佐證圖片與報告（私有，加密）
├── subsidy/      補助文件（私有，加密）
└── avatars/      預留，這次不建立程式
```

規則：

- 現有的 `BANNER_IMAGE_DIR`、`REPAIR_UPLOAD_DIR`、`INSPECTION_UPLOAD_DIR`、`LEASE_FILE_DIR` 環境變數全部保留，compose 明確寫成 `/app/uploads/<種類>`。
- 新種類用同樣的命名：`REVIEW_FILE_DIR`、`SUBSIDY_FILE_DIR`。
- 存檔名一律是伺服器產生的隨機十六進位字串加副檔名（輪播圖沿用現有的「前綴加 sha256」命名）。使用者提供的原始檔名只存在 DB。

### 3.2 共用存取模組 `backend/storage/`

新模組，給新功能使用。舊的三個 router 這次不重構，P0 只修刪檔的行為。

- `save(kind, data, ext, *, encrypt) -> stored_name`：先寫 `.part` 暫存檔再改名，寫到一半失敗也不會被讀到。
- `read(kind, stored_name, *, encrypted) -> bytes`
- `delete(kind, stored_name)`：`unlink(missing_ok=True)`，失敗只記錄 log，不讓請求失敗。
- `path_of(kind, stored_name)`：檔名必須符合 `^[0-9a-f]{32}\.[a-z0-9]{2,5}$`，解析後的路徑必須在該種類的資料夾內，否則回 `None`。
- `reencode_image(data, max_edge, quality)`：處理 EXIF 方向、去掉 EXIF、轉成 JPEG。抽自 `inspection.py` 的 `compress_image`，並加上參數。
- 刪除順序：先 commit DB，再刪實體檔。檔案刪不掉會變成孤兒檔，但不會出現「DB 還在、檔案卻不見」的狀況。

### 3.3 加密

- 新環境變數 `FILE_ENCRYPTION_KEY`，格式跟 `PII_ENCRYPTION_KEY` 一樣（base64 編碼的 32 bytes），但是另一把金鑰。
- 格式：`0x01` 版本位元組 + 12 bytes nonce + 密文含 tag。AAD 是 `rentmate-file-v1:<kind>`。
- 沒有設定金鑰時，加密種類的上傳和讀取一律回 503，**不退回明文**。
- 金鑰在 `.env` 裡，會跟著 restic 備份。restic 密碼另外保管（見第 7 節）。

### 3.4 回應標頭

- 私有檔案一律加 `X-Content-Type-Options: nosniff`。
- 加密種類用 `Cache-Control: private, no-store`；其他私有檔案沿用 `private, max-age=3600`。
- PDF 用 `Content-Disposition: inline; filename*=UTF-8''<原始檔名>`。

## 4. P0：基礎、補漏洞、備份

### 4.1 統一目錄與租約附件掛載

改 `docker-compose.yml`。這個檔案被 gitignore，由 Claude 在主工作目錄直接修改，不派給 Codex：

```yaml
    environment:
      BANNER_IMAGE_DIR: /app/uploads/banners
      REPAIR_UPLOAD_DIR: /app/uploads/repairs
      INSPECTION_UPLOAD_DIR: /app/uploads/inspection
      LEASE_FILE_DIR: /app/uploads/contracts
      REVIEW_FILE_DIR: /app/uploads/reviews
      SUBSIDY_FILE_DIR: /app/uploads/subsidy
    volumes:
      - ./data/uploads:/app/uploads
```

同時拿掉原本三條分開的掛載，以及 `:87` 那句「不放進備份」的註解。

VM 上的搬移步驟，部署前手動執行，會寫進 `deploy/README.md`：

1. 跑一次 `bash ~/rentmate/deploy/backup.sh`。
2. `docker compose stop fastapi`
3. `mkdir -p data/uploads`，把 `data/inspection-photos`、`data/repair-photos`、`data/banner-images` 分別 `mv` 成 `data/uploads/inspection`、`data/uploads/repairs`、`data/uploads/banners`。
4. `mkdir -p data/uploads/{contracts,reviews,subsidy}`
5. 部署新的 compose，再確認點交、報修照片和輪播圖都讀得到。

### 4.2 刪除時刪實體檔

- `inspection.py` 的 `delete_item` 和 `upload_photo`（重拍會換掉舊紀錄）：commit 之後刪掉被移除的照片檔。拿掉 `:355` 那句「保留圖檔」的註解。
- 報修和租約附件已經會刪檔，不需要改。

### 4.3 孤兒檔清理腳本

新增 `backend/scripts/cleanup_orphan_uploads.py`：

- 用來比對的資料：
  - `inspection/` ↔ `inspection_records.photo_url`
  - `repairs/` ↔ `repair_ticket_photos`
  - `contracts/` ↔ `landlord_lease_files.stored_name`
- 輪播圖不在這個腳本的範圍內，由圖庫自己管理。
- 預設只列出結果（dry-run），印出各種類的孤兒檔數量和總大小。加 `--apply` 才真的刪除。
- 超過 1 天的 `.part` 暫存檔一併清掉。
- 執行方式：`docker compose exec fastapi python -m scripts.cleanup_orphan_uploads`

### 4.4 每日異地備份

VM 主機上要安裝 `restic` 和 `rclone`（apt）。

改寫 `deploy/backup.sh`：

1. 原有步驟不變：DB dump、SQLite、`.env`、金鑰、certbot。本機的 tar.gz 繼續保留最近 7 份；它不含上傳檔，體積很小。
2. 新增 restic 步驟：
   - 備份對象：本次的備份暫存資料夾，加上 `~/rentmate/data/uploads`。上傳檔直接備份原始檔，不先打包，這樣 restic 才能去除重複資料。
   - 設定：`RESTIC_REPOSITORY=rclone:gdrive:rentmate-backup`，`RESTIC_PASSWORD_FILE=~/.config/rentmate/restic-password`（權限 600）。
   - 備份完執行 `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune`。
3. 拿掉 `--mail` 和 GPG 寄信的整段。
4. 成功時把 epoch 秒數寫進 `~/rentmate/data/backup-status/last-success`（先寫暫存檔再改名），失敗時以非 0 結束，不更新這個檔案。
5. 排程：用 systemd timer（`deploy/rentmate-backup.{service,timer}`），設定 `OnCalendar=*-*-* 03:00:00 Asia/Taipei`、`Persistent=true`，log 寫到 journald。不用 crontab 的原因是 Ubuntu 的 cron 不一定支援 `CRON_TZ`，而 `Persistent` 能讓 VM 關機錯過的那次在開機後補跑。
6. 用 `flock` 防止兩次備份同時執行。手動執行時可以加 `--local-only`，只做本機備份，不送異地。

**需要使用者親手做的步驟**（Claude 沒有辦法代勞）：

1. 建立專題專用的 Google 帳號。
2. 在有瀏覽器的電腦上執行 `rclone authorize "drive"`，把拿到的 token 貼到 VM 的 `rclone config`，remote 命名為 `gdrive`。
3. 用 `openssl rand -base64 32` 產生 restic 密碼，放進組員共用的密碼管理器，再寫進 VM 的 `~/.config/rentmate/restic-password`。
4. 執行 `restic init`。

### 4.5 還原演練

- 在 VM 的暫存資料夾執行 `restic restore latest --target /tmp/restore-drill`，確認裡面有 DB dump 和上傳檔，抽查幾張照片能正常打開，最後刪掉暫存資料夾。
- `deploy/RESTORE.md` 新增「從 Google Drive 還原」和「還原上傳檔」兩節。

### 4.6 備份監控

- compose 的 fastapi 加唯讀掛載 `./data/backup-status:/app/backup-status:ro`，環境變數 `BACKUP_STATUS_FILE: /app/backup-status/last-success`。
- `backend/admin/monitoring_service.py`：
  - 新增 `probe_backup()`，登記在 `PROBES` 和 `SERVICE_LABELS`（`'backup': '每日備份'`）。
  - 沒有設定 `BACKUP_STATUS_FILE`（開發機）時回 `None`，不顯示這個項目。
  - 檔案不存在、或時間戳距今超過 26 小時，回 `(False, '上次成功備份：<時間>（N 小時前）')`；沒有紀錄時顯示「尚無成功紀錄」。
  - 26 小時以內回 `(True, '上次成功備份：<時間>')`。
- 會沿用現有的停機事件和 `_alert_transition` 通知；後台「系統監控」頁不需要另外改前端。

### 4.7 驗收

- `docker compose config` 只有一條 uploads 掛載，`LEASE_FILE_DIR` 有設定。
- 部署後點交、報修照片和輪播圖都正常顯示；新上傳的租約附件出現在 `data/uploads/contracts/`，重建容器後還在。
- 刪除點交項目後，對應的實體檔也不見了。
- `restic snapshots` 看得到當天的快照；還原演練成功。
- 後台「系統監控」顯示「每日備份」正常；手動把 `last-success` 改成 27 小時前，下一輪檢查會變成異常。
- `probe_backup` 的單元測試涵蓋四種情況：未設定、沒有檔案、超過 26 小時、正常。

## 5. P1：輪播圖庫

2026-10-08 實作時調整了兩處：內建圖只由前端處理（後端容器讀不到 `public/banners/`，前端本來就有 `BUILTIN_BANNER_IMAGES`）；圖庫管理放在輪播分頁的「圖片庫」區塊，編輯對話框只負責選圖。

### 5.1 後端（`backend/admin/banner_images.py`、`backend/routers/content_api.py`、`content_service.banner_image_usage()`）

- 後端只管理**上傳的圖**。`GET /api/admin/banner-images` 回傳 `{ items, count, limit: 30 }`，每一筆多兩個欄位：
  - `usedBy`：引用這張圖的輪播 `[{id, title}]`。比對 `banners.image_url` 時取 `/api/content/banner-images/` 後面那一段並解碼，相對網址、絕對網址、帶查詢字串的寫法都算。
  - `deletable`：`usedBy` 是空的。
- `POST`：上傳圖已經有 30 張時回 409「圖庫已滿（30 張），請先刪除未使用的圖片。」。上傳一張內容完全相同的圖（同一個 sha 檔名）不重複計算。
- 新增 `DELETE /api/admin/banner-images/{name}`：
  - 名稱不合法或找不到，回 404。
  - 還有輪播在用，回 409，`detail` 是一段中文說明，最多列出 3 則輪播標題。
  - 成功回 204，並寫入稽核紀錄（`內容管理／Banner 圖片`）。

### 5.2 前端（`BannersTab.vue`、`bannerImageApi.ts`、`src/utils/banner-library.ts`）

- 輪播分頁新增「圖片庫」區塊：
  - 標題旁顯示「12 / 30」（只算上傳的圖），並註明另有 3 張內建圖。
  - 縮圖標示「內建」、「未使用」或「使用中 N」。內建圖的使用狀況由前端用輪播清單自己算。
  - 刪除按鈕：內建圖或還在用的圖會停用，並說明原因；可以刪的圖，刪除前要先確認。
  - 讀取失敗時顯示「圖片庫讀取失敗」和重試按鈕。
- 編輯對話框維持原本的選圖方式，加上張數顯示；圖庫滿了就停用上傳。
- 上傳、刪除圖片，以及新增、修改、刪除、排序輪播之後，都重新讀取圖庫，讓使用中的標示保持正確。

### 5.3 測試

- 後端：網址比對的各種寫法、列表的 `usedBy`/`count`、刪除還在用的圖回 409、不合法的名稱回 404、第 31 張回 409、重複上傳不計數、刪除後檔案不見並有稽核紀錄。
- 前端：`banner-library.ts` 的排序、使用狀況、可否刪除與原因、圖庫已滿的判斷。

## 6. P3：合約審閱上雲（處理紀錄、佐證圖片、報告）

### 6.1 資料表（寫進 `backend/db/database.sql`，加 migration）

```sql
CREATE TABLE `contract_reviews` (
  `id` CHAR(36) PRIMARY KEY,              -- 前端的 reviewSessionId
  `user_id` INT NOT NULL,
  `rental_id` INT DEFAULT NULL,           -- 存檔後才連上
  `records` JSON NOT NULL,                -- 處理紀錄，格式同現在 localStorage 的陣列
  `expiry_notified_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `activity_at` DATETIME(6) NOT NULL,        -- 到期計時用，由程式明確寫入；不用 ON UPDATE
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE SET NULL
);

CREATE TABLE `contract_review_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` CHAR(36) NOT NULL,
  `kind` ENUM('evidence','report') NOT NULL,
  `record_key` VARCHAR(64) DEFAULT NULL,  -- 佐證屬於哪一筆處理紀錄；報告為 NULL
  `stored_name` VARCHAR(64) NOT NULL,
  `original_name` VARBINARY(...) NOT NULL, -- EncryptedText，檔名可能含個資
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `report_id` VARCHAR(64) DEFAULT NULL,   -- 報告編號
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`review_id`) REFERENCES `contract_reviews`(`id`) ON DELETE CASCADE
);
```

- `review_id` 已經屬於別的使用者時，一律回 404。
- 因為 FK 是 `ON DELETE CASCADE`，刪掉 DB 列時實體檔不會跟著刪。所以刪除審閱時，程式要先查出所有檔案，commit 之後再逐一刪檔。

### 6.2 API（`/api/contract/reviews`，沿用 contract router 的 cookie JWT `get_current_user`）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/{review_id}` | 回傳處理紀錄和檔案清單（不含檔案內容） |
| PUT | `/{review_id}` | 新建或更新處理紀錄 |
| DELETE | `/{review_id}` | 刪除審閱和所有檔案 |
| POST | `/{review_id}/evidence` | multipart，欄位是 `record_key` 和 `files[]` |
| POST | `/{review_id}/reports` | multipart，一個 PDF |
| GET | `/{review_id}/files/{file_id}` | 解密後回傳 |
| DELETE | `/{review_id}/files/{file_id}` | 刪除單一檔案 |

因為用的是 cookie 驗證，`<img src>` 可以直接顯示，不必先抓成 blob。

**佐證圖片**

- 只收 JPEG、PNG、WebP，用 Pillow 判斷實際格式，不看副檔名。
- 每筆處理紀錄最多 5 張，每張原始檔 10 MB 以內。
- 轉成長邊 2048px 的 JPEG（q85）並去掉 EXIF，再加密存放。

**報告**

- 檢查開頭的 `%PDF-` 魔術位元組，20 MB 以內。
- 每筆審閱最多 10 份，第 11 份回 409「已存 10 份報告，請先刪除舊報告」。

**存檔連結**

- `/api/contract/finalize` 的 payload 加上選填的 `review_id`。如果它屬於同一位使用者，就寫入 `rental_id`。

### 6.3 前端（`src/pages/contract/analysis.vue`、`src/utils/contract-evidence.ts`、`contract-resolution.ts`）

- **載入**：先呼叫 `GET /reviews/{id}`。伺服器上沒有資料、但 `localStorage` 有舊紀錄時，就用 PUT 上傳一次，之後以伺服器的資料為準。
- **更新處理紀錄**：改呼叫 PUT。`localStorage` 只作為送出失敗時的暫存。
- **佐證附件**：上傳區塊顯示「請勿上傳完整租約，只收圖片」。`EVIDENCE_ACCEPT` 改成只收圖片。新加的附件上傳到伺服器。
- **舊附件**（`EvidenceAttachment`，沒有伺服器 file id 的那些）：照常從 IndexedDB 讀取和顯示，不加任何標示。在別台裝置上讀不到 IndexedDB 時，下載就顯示「無法開啟此附件」。
- **報告**：匯出對話框加一顆「存到我的空間」按鈕。它固定用 `privacyMode: false` 產生完整版，再上傳。頁面上列出這筆審閱已存的報告，可以下載和刪除。
- **存檔**：呼叫 finalize 時一起帶上 `review_id`。

### 6.4 保留期限

`reminders_loop` 每小時執行一次，只處理 `rental_id IS NULL` 的審閱：

- **通知**：`activity_at` 已經滿 166 天、`expiry_notified_at IS NULL`，而且至少有一筆處理紀錄或一個檔案 → 用 `notify_user()`（分類「租約」）發通知「合約審閱紀錄將於 14 天後刪除」，然後寫入 `expiry_notified_at`。
- **刪除**：`activity_at` 已經滿 180 天，而且通知已經發出滿 14 天（沒有任何紀錄和檔案的空審閱則不用通知）→ 刪除審閱和底下的檔案。
- 使用者更新紀錄、上傳或刪除檔案時，程式會寫入新的 `activity_at`，並清空 `expiry_notified_at`，計時重新開始。

2026-10-08 實作前調整了兩處：
- 計時改用專門的 `activity_at` 欄位，不用 `updated_at`。`updated_at` 帶有 `ON UPDATE`，寫入「已通知」這個動作本身就會重設計時，紀錄會永遠刪不掉。
- 刪除前一定要先通知滿 14 天。長期掛在租約下的審閱，租約被刪掉後會立刻符合 180 天的條件；沒有這條規定的話，可能通知才發出一小時就被刪除。

**部署順序**：`main.py` 啟動時會檢查資料表，所以要先在學校 DB 執行 `backend/migrations/20261008_contract_reviews.sql`，再部署 fastapi。VM 的 `.env` 也要先設定 `FILE_ENCRYPTION_KEY`。

### 6.5 測試

- 擁有者隔離：別人的 `review_id` 回 404。
- 格式和數量上限：非圖片檔、第 6 張、第 11 份報告都要擋下。
- 加密：硬碟上的檔案不是明文；少了金鑰時回 503。
- finalize 會連上 `rental_id`，刪除租約後變回 NULL。
- 到期通知和到期刪除各自的時間點正確，刪除後實體檔也不見了。
- 前端：舊 `localStorage` 紀錄的一次性上傳、舊附件照常顯示。

## 7. P4：補助文件夾

### 7.1 資料表

新建 `subsidy_files` 表，不沿用 `subsidy_documents`。原因是後者的 `application_id` 是 NOT NULL，並且外鍵指向一個從沒有程式寫入的 `subsidy_applications`。

```sql
CREATE TABLE `subsidy_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rental_id` INT DEFAULT NULL,
  `doc_type` ENUM('application_form','identity','household','lease_copy','bankbook','other') NOT NULL,
  `stored_name` VARCHAR(64) NOT NULL,
  `original_name` VARBINARY(...) NOT NULL,  -- EncryptedText
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,          -- 上傳後 180 天
  `expiry_notified_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE SET NULL
);
```

### 7.2 API（`/api/subsidy/files`，沿用 `subsidy_reminders.py` 的 `get_current_tenant`）

- `GET`：列出自己的文件，包含 `expiresAt`。
- `POST`：multipart，欄位是 `doc_type`、選填的 `rental_id`（必須是自己的租約）、`file`。
  - 收 PDF、JPG、PNG，用魔術位元組判斷，10 MB 以內，每人最多 20 個。
  - 原檔加密存放，不轉檔。補助申請可能需要原始畫質。
- `GET /{id}`：解密後回傳。`DELETE /{id}`：刪除。
- **不提供任何管理員端點**。也要確認後台的使用者紀錄 API 不會帶出這張表。
- Bearer 驗證沒辦法讓 `<img>` 直接顯示，所以前端沿用 `repairMediaStore.ts` 的作法：先抓成 blob，再用 `createObjectURL`。

### 7.3 前端

- `src/pages/subsidy/upload.vue`（「申請準備」分頁）加一個「我的補助文件」區塊：
  - 依文件類型分組列出，可以上傳、預覽、刪除。
  - 每個檔案旁邊顯示「將於 YYYY-MM-DD 自動刪除」。
  - 標明「只有你看得到，系統管理員也無法查看」。

### 7.4 保留期限

跟 6.4 一樣接在 `reminders_loop` 的每小時工作裡：

- `expires_at` 剩 14 天以內、還沒發過通知的：發通知。
- 已經過了 `expires_at` 的：刪除。

### 7.5 測試

- 擁有者隔離、不能掛到別人的租約、管理員 token 存取回 403 或 404。
- 格式、大小和數量上限。
- 加密。
- 到期通知和到期刪除。

## 8. 交付方式

- 依照 CLAUDE.md 的分工：Claude 拆任務和 review，Codex 透過 `delegate-codex` 實作。每個階段一個分支，合併到 `vm-ai-containers`。
- `docker-compose.yml` 和 VM 上的手動步驟，由 Claude 在主工作目錄處理，或寫成 runbook 交給使用者執行。
- 每個階段完成的標準：Claude 自己看完整份 diff，並跑過 `npm test`、後端測試和 `npm run lint:types`。

| 階段 | 交給 Codex 的任務 |
|---|---|
| P0 | (1) `backend/storage/` 共用模組和單元測試；(2) inspection 刪除時刪檔；(3) 孤兒檔清理腳本；(4) 改寫 `backup.sh` 並更新 `RESTORE.md`；(5) `probe_backup` 備份監控。compose 和 VM 搬移由 Claude 與使用者處理。 |
| P1 | 輪播圖庫的後端和前端，各一個任務 |
| P3 | (1) 資料表和 migration；(2) API 和到期工作；(3) 前端 |
| P4 | (1) 資料表、API 和到期工作；(2) 前端 |

## 9. 未決事項

1. **VM 硬碟空間**：只剩 22 GB，大部分被 Docker 映像佔用。不在這次的範圍，建議另外處理（例如 `docker system df` 加上清理 build 快取）。

## 9.1 延後事項

- **合約審閱的跨裝置入口**（2026-10-08 決定先不做）：P3 完成後，資料雖然已經存在伺服器上，但只能從原本的分析頁（同一個 `reviewSessionId`）打開。換一台裝置，或清掉瀏覽器資料之後，使用者沒有地方可以找回之前的審閱和報告。之後只要加一個「我的合約審閱」列表頁（`GET /api/contract/reviews`）就能補上，不必改資料表。

## 10. 不在範圍內

- 頭像上傳：只預留 `avatars/` 種類。
- 容量計算與限制。
- MinIO、R2 和 CDN 圖片處理。
- 繳費證明上傳。
- 把現有的 base64 上傳 API 改成 multipart。
- 輪播圖自動轉 WebP 或產生多種尺寸。
- 房東租約附件去 EXIF 或轉檔。
