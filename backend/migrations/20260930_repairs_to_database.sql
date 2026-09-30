-- 報修從瀏覽器搬進資料庫
-- ==================================================================
-- 原本工單存在 localStorage、照片存在 IndexedDB，房東只有在同一台電腦
-- 同一個瀏覽器才看得到，而且看不到照片。這支遷移讓 repair_tickets 能
-- 存下前端完整的處理流程，並新增只能新增的時間軸表（存證）。
--
-- ⚠️ 執行前先確認兩張表都是空的：
--     SELECT COUNT(*) FROM repair_tickets;
--     SELECT COUNT(*) FROM repair_ticket_photos;
-- 下面的 MODIFY 會把 urgency / status / responsibility 換成新的 enum 值，
-- 既有資料若是舊值（例如 status = 'new'）會變成空字串或寫入失敗。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時看
-- schema_check.py 的輸出決定補哪幾句，不要整份重跑。

-- enum 值對齊前端，避免中間翻譯層出錯
ALTER TABLE `repair_tickets`
  MODIFY COLUMN `urgency` ENUM('emergency','soon','normal') NOT NULL DEFAULT 'normal',
  MODIFY COLUMN `status` ENUM('pending','processing','inspection','completed','canceled') NOT NULL DEFAULT 'pending',
  MODIFY COLUMN `responsibility` ENUM('pending','landlord','tenant','shared') NOT NULL DEFAULT 'pending';

-- 處理流程的欄位：原本只存在瀏覽器裡
ALTER TABLE `repair_tickets`
  ADD COLUMN `phone` VARBINARY(255) DEFAULT NULL COMMENT '報修聯絡電話（加密）' AFTER `description`,
  ADD COLUMN `contact_before_arrival` BOOLEAN NOT NULL DEFAULT FALSE AFTER `access_permission`,
  ADD COLUMN `responsibility_agreement` VARCHAR(20) DEFAULT NULL COMMENT 'agreed / questioned' AFTER `responsibility_note`,
  ADD COLUMN `responsibility_question` TEXT DEFAULT NULL AFTER `responsibility_agreement`,
  ADD COLUMN `supplement_requested` BOOLEAN NOT NULL DEFAULT FALSE AFTER `responsibility_question`,
  ADD COLUMN `supplement_request_note` TEXT DEFAULT NULL AFTER `supplement_requested`,
  ADD COLUMN `tenant_schedule_reply` VARCHAR(20) DEFAULT NULL COMMENT 'accepted / reschedule / contact-first' AFTER `scheduled_at`,
  ADD COLUMN `reschedule_request` JSON DEFAULT NULL AFTER `tenant_schedule_reply`,
  ADD COLUMN `estimated_cost` INT DEFAULT NULL AFTER `reschedule_request`,
  ADD COLUMN `actual_cost` INT DEFAULT NULL AFTER `estimated_cost`,
  ADD COLUMN `payer` VARCHAR(50) DEFAULT NULL AFTER `actual_cost`,
  ADD COLUMN `completion_note` TEXT DEFAULT NULL AFTER `payer`,
  ADD COLUMN `inspection_result` VARCHAR(20) DEFAULT NULL COMMENT 'resolved / unresolved / retry' AFTER `completion_note`,
  ADD COLUMN `unresolved_note` TEXT DEFAULT NULL AFTER `inspection_result`,
  ADD COLUMN `unresolved_safety_concern` BOOLEAN NOT NULL DEFAULT FALSE AFTER `unresolved_note`,
  ADD COLUMN `revisit_available_time` TEXT DEFAULT NULL AFTER `unresolved_safety_concern`;

-- 時間軸：只新增、不修改、不刪除。這就是存證。
CREATE TABLE IF NOT EXISTS `repair_ticket_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT NOT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `actor_role` ENUM('tenant','landlord','system') NOT NULL DEFAULT 'system',
  `kind` VARCHAR(30) NOT NULL DEFAULT 'note' COMMENT 'note / supplement / status',
  `title` VARCHAR(200) NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`ticket_id`) REFERENCES `repair_tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_repair_events_ticket` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 照片：記錄用途（報修／補件／完修／未解決／收據）、屬於哪次補充、誰上傳
ALTER TABLE `repair_ticket_photos`
  ADD COLUMN `event_id` INT DEFAULT NULL COMMENT '補件照片屬於哪一次補充' AFTER `ticket_id`,
  ADD COLUMN `stage` ENUM('report','supplement','completion','unresolved','receipt') NOT NULL DEFAULT 'report' AFTER `event_id`,
  ADD COLUMN `uploaded_by` INT DEFAULT NULL AFTER `stage`,
  MODIFY COLUMN `photo_url` VARCHAR(512) NOT NULL COMMENT '伺服器產生的檔名（REPAIR_UPLOAD_DIR 下），不是外部網址',
  MODIFY COLUMN `photo_name` VARCHAR(255) DEFAULT NULL COMMENT '使用者上傳時的原始檔名',
  ADD CONSTRAINT `fk_repair_photos_event` FOREIGN KEY (`event_id`) REFERENCES `repair_ticket_events`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_repair_photos_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;

-- 執行後驗證：python backend/db/schema_check.py
