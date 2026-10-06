-- 房東端從瀏覽器搬進資料庫
-- ==================================================================
-- 房東端畫面已經定案，這支遷移補上它背後缺的資料：
--
--   landlord_leases.tenant_user_id   租客接受邀請後綁定的帳號（取代只比對 email）
--   landlord_lease_files             合約附件（原本只在瀏覽器記檔名，檔案沒存）
--   landlord_charges                 應收帳款，每期每種費用一筆，金額建立時固定
--   landlord_charge_payments         實收紀錄（只新增，記錯用負數沖銷）
--   landlord_charge_events           催繳、沖銷等帳款事件
--   landlord_expenses                支出（原本存 localStorage，不分房東）
--   lease_invitations                房東邀請租客加入租約（QR／連結／邀請碼）
--   landlord_settings                帳號與通知偏好（原本存 localStorage）
--   landlord_audit_events            操作紀錄（原本是前端自己寫的本機紀錄）
--   landlord_team_members            團隊成員與權限
--
-- 全部是新表或新增可為 NULL 的欄位，既有資料不受影響。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時看
-- db/schema_check.py 的輸出決定補哪幾句，不要整份重跑。

ALTER TABLE `landlord_leases`
  ADD COLUMN `tenant_user_id` INT DEFAULT NULL COMMENT '接受邀請後綁定的租客帳號' AFTER `moved_out_at`,
  ADD COLUMN `tenant_bound_at` DATETIME(6) DEFAULT NULL AFTER `tenant_user_id`,
  ADD CONSTRAINT `fk_landlord_leases_tenant_user` FOREIGN KEY (`tenant_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

CREATE TABLE `landlord_lease_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lease_id` INT NOT NULL,
  `stored_name` VARCHAR(64) NOT NULL COMMENT '伺服器產生的檔名（LEASE_FILE_DIR 下）',
  `original_name` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `uploaded_by` INT DEFAULT NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_landlord_lease_files_lease` (`lease_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_charges` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `lease_id` INT NOT NULL,
  `kind` ENUM('rent','water','electricity','other') NOT NULL DEFAULT 'rent',
  `title` VARCHAR(100) NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `amount` INT NOT NULL COMMENT '建立當下固定，改租金不回頭改舊帳',
  `voided_at` DATETIME(6) DEFAULT NULL,
  `void_reason` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE RESTRICT,
  UNIQUE KEY `uq_landlord_charge_period` (`lease_id`, `kind`, `period_start`),
  INDEX `idx_landlord_charges_landlord_due` (`landlord_id`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_charge_payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `charge_id` INT NOT NULL,
  `amount` INT NOT NULL COMMENT '負數代表沖銷',
  `paid_on` DATE NOT NULL,
  `method` VARCHAR(30) NOT NULL DEFAULT 'other',
  `note` TEXT DEFAULT NULL,
  `recorded_by` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`charge_id`) REFERENCES `landlord_charges`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_landlord_charge_payments_charge` (`charge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_charge_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `charge_id` INT NOT NULL,
  `kind` VARCHAR(30) NOT NULL,
  `detail` TEXT NOT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`charge_id`) REFERENCES `landlord_charges`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_landlord_charge_events_charge` (`charge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_expenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `category` VARCHAR(30) NOT NULL,
  `amount` INT NOT NULL,
  `spent_on` DATE NOT NULL,
  `property_id` INT DEFAULT NULL,
  `repair_ticket_id` INT DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `recorded_by` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`property_id`) REFERENCES `landlord_properties`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`repair_ticket_id`) REFERENCES `repair_tickets`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_landlord_expenses_landlord_date` (`landlord_id`, `spent_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lease_invitations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `lease_id` INT NOT NULL,
  `invited_email` VARCHAR(254) DEFAULT NULL COMMENT '指定收件人；NULL 代表接受後要房東確認',
  `token_hash` CHAR(64) NOT NULL COMMENT '連結／QR 的 token，只存 SHA-256',
  `code_hash` CHAR(64) NOT NULL COMMENT '手動邀請碼，只存 SHA-256',
  `status` ENUM('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
  `expires_at` DATETIME(6) NOT NULL,
  `accepted_by` INT DEFAULT NULL,
  `accepted_at` DATETIME(6) DEFAULT NULL,
  `revoked_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_lease_invitations_token` (`token_hash`),
  UNIQUE KEY `uq_lease_invitations_code` (`code_hash`),
  INDEX `idx_lease_invitations_lease` (`lease_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_settings` (
  `landlord_id` INT NOT NULL PRIMARY KEY,
  `phone` VARBINARY(255) DEFAULT NULL COMMENT '聯絡手機（加密）',
  `workspace_name` VARCHAR(100) DEFAULT NULL,
  `email_notifications` BOOLEAN NOT NULL DEFAULT TRUE,
  `rent_reminders` BOOLEAN NOT NULL DEFAULT TRUE,
  `contract_reminders` BOOLEAN NOT NULL DEFAULT TRUE,
  `repair_notifications` BOOLEAN NOT NULL DEFAULT TRUE,
  `reminder_days` INT NOT NULL DEFAULT 30,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_audit_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL COMMENT '工作區擁有者',
  `actor_user_id` INT DEFAULT NULL COMMENT '實際操作的人（可能是團隊成員）',
  `category` VARCHAR(30) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `result` ENUM('success','warning') NOT NULL DEFAULT 'success',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_landlord_audit_events_landlord` (`landlord_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_team_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `owner_id` INT NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `role` ENUM('manager','accounting','viewer') NOT NULL DEFAULT 'viewer',
  `status` ENUM('pending','active','revoked') NOT NULL DEFAULT 'pending',
  `member_user_id` INT DEFAULT NULL,
  `token_hash` CHAR(64) DEFAULT NULL,
  `expires_at` DATETIME(6) DEFAULT NULL,
  `invited_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `accepted_at` DATETIME(6) DEFAULT NULL,
  `revoked_at` DATETIME(6) DEFAULT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_landlord_team_member_email` (`owner_id`, `email`),
  UNIQUE KEY `uq_landlord_team_member_token` (`token_hash`),
  INDEX `idx_landlord_team_members_member` (`member_user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
