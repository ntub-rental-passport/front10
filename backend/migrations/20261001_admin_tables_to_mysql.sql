-- 後台的資料從 SQLite 搬進 MySQL（第一批）
-- ==================================================================
-- 原本後台自己的資料存在十個 SQLite 小檔（backend/*.db，VM 上在 data/garbage/）。
-- 當初這樣選是為了避開「MySQL 少一張表，後端就整個起不來」的風險，不必在 VM
-- 跑遷移。代價是這些資料不在 ER 圖與資料庫文件裡，備份、查詢也要另外處理。
--
-- 這一批搬的是後台介面直接要用的七個模組、十二張表。站內通知收件匣、排程通知、
-- 監控、垃圾車提醒留在第二批。
--
-- ⚠️ 一定要先跑這支，再部署新的後端程式：後端啟動時會逐張檢查資料表
-- （db/schema_check.py），表還沒建就換程式，API 會起不來。
--
-- 表名刻意與原本的 SQLite 一致：模組裡的 SQL 就不用改表名，只換底層連線，
-- 改動愈小愈不容易出錯。
--
-- ⚠️ 跑完要接著跑資料搬遷（scripts/migrate_sqlite_to_mysql.py），把 VM 上
-- 現有的公告、輪播、模板、稽核紀錄倒進來，否則後台會變成空的。

-- 系統設定（site_settings.py）：網站名稱、維護模式、各種門檻
CREATE TABLE IF NOT EXISTS `site_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 功能停用（site_settings.py）：暫時對所有使用者關掉某個功能
CREATE TABLE IF NOT EXISTS `feature_outages` (
  `feature_key` VARCHAR(64) NOT NULL,
  `internal_reason` TEXT NOT NULL,
  `public_note` TEXT NOT NULL,
  `closed_at` VARCHAR(40) NOT NULL,
  `eta_at` VARCHAR(40) NULL,
  PRIMARY KEY (`feature_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 安全設定（platform_settings.py）：密碼最短長度、登入有效時間
CREATE TABLE IF NOT EXISTS `platform_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` INT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公告（content_service.py）
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` VARCHAR(40) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `level` VARCHAR(20) NOT NULL,
  `audience` VARCHAR(20) NOT NULL,
  `published` TINYINT(1) NOT NULL,
  `start_at` VARCHAR(40) NOT NULL,
  `end_at` VARCHAR(40) NULL,
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 首頁輪播（content_service.py）
CREATE TABLE IF NOT EXISTS `banners` (
  `id` VARCHAR(40) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `link_url` VARCHAR(512) NOT NULL,
  `audience` VARCHAR(20) NOT NULL DEFAULT 'all',
  `sort_order` INT NOT NULL,
  `published` TINYINT(1) NOT NULL,
  `start_at` VARCHAR(40) NOT NULL,
  `end_at` VARCHAR(40) NULL,
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知模板（content_service.py）
CREATE TABLE IF NOT EXISTS `notification_templates` (
  `id` VARCHAR(40) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `channels` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `action_url` VARCHAR(512) NULL,
  `action_label` VARCHAR(100) NULL,
  `enabled` TINYINT(1) NOT NULL,
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 內容的雜項狀態（content_service.py）：例如示範內容有沒有寫過
CREATE TABLE IF NOT EXISTS `content_meta` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 後台稽核紀錄（audit_service.py）
-- 既有的 admin_audit_logs 是更早的設計、沒有程式在用，這裡另開 audit_events，
-- 欄位對齊目前真正在寫的內容；舊表留著不動，避免動到別人可能引用的東西。
CREATE TABLE IF NOT EXISTS `audit_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `at` DOUBLE NOT NULL,
  `actor` VARCHAR(254) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target` VARCHAR(255) NOT NULL,
  `detail` TEXT NOT NULL,
  `subject` VARCHAR(100) NULL,
  `ip` VARCHAR(64) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_events_at` (`at`),
  KEY `idx_audit_events_subject` (`subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理員通知中心（admin_notifications.py）
CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `id` VARCHAR(40) NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `action_url` VARCHAR(512) NULL,
  `action_label` VARCHAR(100) NULL,
  `sender_name` VARCHAR(100) NULL,
  `sender_email` VARCHAR(254) NULL,
  `created_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_admin_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 每位管理員各自的已讀（admin_notifications.py）
CREATE TABLE IF NOT EXISTS `admin_notification_reads` (
  `notification_id` VARCHAR(40) NOT NULL,
  `admin_id` INT NOT NULL,
  `read_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`notification_id`, `admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 用量（ai_usage.py）：目前只記 OCR 服務用掉的 Google Vision 頁數
CREATE TABLE IF NOT EXISTS `daily_usage` (
  `date` VARCHAR(10) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `units` INT NOT NULL,
  `calls` INT NOT NULL,
  PRIMARY KEY (`date`, `provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 額度告警發過沒有（ai_usage.py）：每個門檻每月只通知一次
CREATE TABLE IF NOT EXISTS `usage_meta` (
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 後台對報修工單的內部註記與旗標（repair_notes.py）
CREATE TABLE IF NOT EXISTS `repair_notes` (
  `ticket_id` VARCHAR(40) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
