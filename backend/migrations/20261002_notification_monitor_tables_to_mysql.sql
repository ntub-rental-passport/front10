-- 後台的資料從 SQLite 搬進 MySQL（第二批，最後一批）
-- ==================================================================
-- 第一批（20261001）搬了後台介面直接要用的十三張表。這一批把剩下的四個模組
-- 搬完，之後 backend/ 底下就不再有任何 SQLite 檔：
--
--   notifications/inbox_service.py              站內通知收件匣
--   notifications/scheduled_notification_service.py  排程通知
--   admin/monitoring_service.py                 服務監控
--   notifications/garbage_service.py            垃圾車提醒
--
-- ⚠️ 一定要先跑這支，再部署新的後端程式：後端啟動時會逐張檢查資料表
-- （db/schema_check.py），表還沒建就換程式，API 會起不來。
--
-- ⚠️ 跑完要接著跑資料搬遷（scripts/migrate_sqlite_to_mysql.py），把 VM 上
-- 現有的收件匣、待寄排程、監控事件、垃圾車提醒倒進來。沒搬的話待寄的排程
-- 不會寄出、監控紀錄會從零開始。
--
-- 時間欄位沿用原本的型別，不趁這次改：
--   收件匣用 ISO 字串（前端直接吃，不必轉）
--   排程、監控、垃圾車用 Unix 秒數的浮點數（它們都在算時間差）
-- 改型別就得同時改四個模組的比較與排序邏輯，風險遠大於整齊。

-- 站內通知收件匣（inbox_service.py）：後台寄出的每一封，一個收件人一列
--
-- 表名從 `messages` 改成 `inbox_messages`：資料庫裡已經有 `notifications`
-- （租客端通知）與 `message_boards`（室友留言板），再來一張 `messages`
-- 沒人分得出誰是誰。SQL 只有 inbox_service.py 在用，改名的代價很小。
--
-- 不對 user_id 設外鍵：帳號刪掉時這些寄送紀錄要留著 —— 「有沒有寄給他」
-- 是稽核問題，不該因為帳號消失就跟著消失。
CREATE TABLE IF NOT EXISTS `inbox_messages` (
  `id` VARCHAR(64) NOT NULL,
  `batch_id` VARCHAR(64) NOT NULL COMMENT '同一次寄送的所有收件人共用一個批次號',
  `user_id` INT NOT NULL,
  `user_email` VARCHAR(255) NOT NULL COMMENT '寄送當時的信箱，之後改信箱也不動這裡',
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `channels` VARCHAR(255) NOT NULL COMMENT 'JSON 陣列：inapp／email／push',
  `inapp_state` VARCHAR(32) NULL COMMENT 'NULL = 這封不走這個管道',
  `email_state` VARCHAR(32) NULL,
  `push_state` VARCHAR(32) NULL,
  `recipient_label` VARCHAR(255) NOT NULL COMMENT '寄送當時的對象描述（全體租客、某個人…）',
  `source_label` VARCHAR(255) NOT NULL,
  `source_type` VARCHAR(32) NOT NULL COMMENT 'admin＝後台手動寄、scheduled＝排程寄出',
  `action_url` VARCHAR(512) NULL,
  `action_label` VARCHAR(255) NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` VARCHAR(40) NOT NULL COMMENT 'ISO 字串（毫秒、Z）',
  `read_at` VARCHAR(40) NULL COMMENT 'NULL = 還沒讀',
  PRIMARY KEY (`id`),
  INDEX `inbox_messages_user` (`user_id`, `created_at`),
  INDEX `inbox_messages_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公告已讀（inbox_service.py）：公告不是一人一列寄出的，誰讀過要另外記
CREATE TABLE IF NOT EXISTS `announcement_reads` (
  `user_id` INT NOT NULL,
  `announcement_id` VARCHAR(64) NOT NULL,
  `read_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`user_id`, `announcement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公告關掉不再顯示（inbox_service.py）
CREATE TABLE IF NOT EXISTS `announcement_dismissals` (
  `user_id` INT NOT NULL,
  `dismiss_key` VARCHAR(128) NOT NULL,
  `dismissed_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`user_id`, `dismiss_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 排程通知（scheduled_notification_service.py）：時間到了由後端背景迴圈寄出
CREATE TABLE IF NOT EXISTS `scheduled_notifications` (
  `id` VARCHAR(64) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `channels` VARCHAR(255) NOT NULL COMMENT 'JSON 陣列',
  `recipient` TEXT NOT NULL COMMENT 'JSON：寄給誰（當下不展開成名單，寄出時才算）',
  `recipient_label` VARCHAR(255) NOT NULL,
  `source_label` VARCHAR(255) NOT NULL,
  `due` DOUBLE NOT NULL COMMENT 'Unix 秒數：該寄出的時間',
  `created_at` DOUBLE NOT NULL,
  `status` VARCHAR(32) NOT NULL COMMENT 'pending／sending／sent／failed／missed／cancelled',
  `sent_at` DOUBLE NULL,
  `result` TEXT NULL COMMENT 'JSON：寄送結果（成功幾封、失敗原因）',
  PRIMARY KEY (`id`),
  INDEX `scheduled_notifications_due` (`status`, `due`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 各服務目前的狀態（monitoring_service.py）：一個服務一列，只存現況
CREATE TABLE IF NOT EXISTS `monitor_state` (
  `service` VARCHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL COMMENT 'up／down',
  `since` DOUBLE NOT NULL COMMENT '進入這個狀態的時間，用來算壞了多久',
  `detail` VARCHAR(255) NULL COMMENT '簡短原因。不存例外原文與主機位址',
  `checked_at` DOUBLE NOT NULL,
  PRIMARY KEY (`service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 監控事件（monitoring_service.py）：只記狀態轉換，不記每一次「正常」
CREATE TABLE IF NOT EXISTS `monitor_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `at` DOUBLE NOT NULL,
  `service` VARCHAR(64) NOT NULL,
  `kind` VARCHAR(32) NOT NULL COMMENT 'down／recovered／backend-downtime／…',
  `detail` VARCHAR(255) NULL,
  `duration` DOUBLE NULL COMMENT '恢復事件帶上這次壞了多久（秒）',
  PRIMARY KEY (`id`),
  INDEX `monitor_events_at` (`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 監控的雜項數值（monitoring_service.py）：心跳時間、OCR 回報的憑證狀態
-- `key` 是 MySQL 保留字，SQL 裡一定要用反引號括起來
CREATE TABLE IF NOT EXISTS `monitor_meta` (
  `key` VARCHAR(64) NOT NULL,
  `value` DOUBLE NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 垃圾車提醒（garbage_service.py）：使用者自己設的，到時間寄信或推播
CREATE TABLE IF NOT EXISTS `garbage_reminders` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` INT NOT NULL,
  `payload` TEXT NOT NULL COMMENT 'JSON：站點、星期、提前幾分鐘、推播訂閱',
  `due` DOUBLE NOT NULL COMMENT 'Unix 秒數：下一次該提醒的時間',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `email_status` VARCHAR(32) NOT NULL,
  `push_status` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `garbage_reminders_due` (`active`, `due`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
