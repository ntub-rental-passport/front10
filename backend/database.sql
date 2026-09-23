SET FOREIGN_KEY_CHECKS = 0;
-- RentMate 資料庫重建（第三版 · 定案正式版）
-- ==================================================================
-- 主要設計決策：
--   1. users.role 三選一（tenant/landlord/admin），一帳號一身份
--   2. Admin 不透過公開註冊入口建立，走獨立 /admin/register 流程
--   3. 合約欄位攤平儲存於 rentals（供拼回契約 + 租補預帶）
--   4. 敏感個資採用 VARBINARY 加密儲存（地址放寬至 512 bytes 避免溢位）
--   5. rentals 為合約快照，bills 為每期實際帳單
--   6. 維修工單雙向相容：rental_id 或 lease_id 至少具備一個
--

USE `115-RentMate`;

-- ============ 1. 帳號 · 登入 · 驗證 ============

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(254) NOT NULL UNIQUE,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `national_id` VARBINARY(255) DEFAULT NULL COMMENT '承租人身分證，租補申請預帶用（可編輯）',
  `avatar_url` TEXT DEFAULT NULL,
  `role` ENUM('tenant','landlord','admin') NOT NULL COMMENT '一帳號一身份，由註冊路徑決定',
  `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'Google-only 為 NULL',
  `password_changed_at` DATETIME(6) DEFAULT NULL,
  `email_verified_at` DATETIME(6) DEFAULT NULL,
  `status` ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `ix_users_status` (`status`),
  INDEX `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_identities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `provider` ENUM('google') NOT NULL,
  `provider_subject` VARCHAR(255) NOT NULL,
  `provider_email` VARCHAR(254) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_user_identities_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_identity_provider_subject` (`provider`, `provider_subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pending_registrations` (
  `id` CHAR(36) PRIMARY KEY,
  `email` VARCHAR(254) NOT NULL,
  `provider` ENUM('password','google') NOT NULL,
  `provider_subject` VARCHAR(255) DEFAULT NULL,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `avatar_url` TEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('tenant','landlord','admin') NOT NULL COMMENT '驗證後要建立的帳號身份',
  `verification_code_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `resend_available_at` DATETIME(6) NOT NULL,
  `attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `send_count` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY `uq_pending_email` (`email`),
  UNIQUE KEY `uq_pending_provider_subject` (`provider`, `provider_subject`),
  INDEX `idx_pending_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pending_admin_logins` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` INT NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `verification_code_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `request_ip` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  CONSTRAINT `fk_pending_admin_logins_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `ix_pending_admin_logins_email` (`email`),
  INDEX `ix_pending_admin_logins_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 2. 租客端 · 合約書（快照） ============

CREATE TABLE `rentals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,

  -- 【1】審閱期
  `review_date` DATE DEFAULT NULL,
  `review_days` INT DEFAULT 3 COMMENT '法定至少 3 日',
  `has_landlord_review_signature` BOOLEAN NOT NULL DEFAULT FALSE,
  `has_tenant_review_signature` BOOLEAN NOT NULL DEFAULT FALSE,

  -- 【2】住宅標示
  `address` TEXT NOT NULL,
  `land_number` VARCHAR(100) DEFAULT NULL COMMENT '基地地號',
  `building_number` VARCHAR(100) DEFAULT NULL COMMENT '專有部分建號，租補輔助',
  `building_area` DECIMAL(8,2) DEFAULT NULL COMMENT '專有部分面積',
  `has_annex_building` BOOLEAN NOT NULL DEFAULT FALSE,
  `annex_building_desc` VARCHAR(255) DEFAULT NULL,

  -- 【3】租賃範圍
  `rental_scope` ENUM('entire','partial') NOT NULL DEFAULT 'entire',
  `rental_scope_details` VARCHAR(255) DEFAULT NULL,
  `has_parking` BOOLEAN NOT NULL DEFAULT FALSE,
  `parking_details` VARCHAR(255) DEFAULT NULL,
  `has_equipment` BOOLEAN NOT NULL DEFAULT FALSE,
  `equipment_list` TEXT DEFAULT NULL,

  -- 【4】租賃期間
  `start_date` DATE NOT NULL COMMENT '租補必核',
  `end_date` DATE NOT NULL COMMENT '租補必核',
  `handover_date` DATE DEFAULT NULL,

  -- 【5】租金與繳納
  `rent_amount` INT NOT NULL COMMENT '合約約定每月租金',
  `payment_interval_months` INT NOT NULL DEFAULT 1,
  `payment_day` INT NOT NULL CHECK (`payment_day` BETWEEN 1 AND 31),
  `payment_method` VARCHAR(50) DEFAULT '轉帳' COMMENT '合約約定預設方式',
  `total_periods` INT NOT NULL,

  -- 【6】押金
  `deposit_months` INT NOT NULL DEFAULT 2 COMMENT '法定最高 2 個月',
  `deposit_amount` INT NOT NULL,

  -- 【7】費用
  `management_fee_rule` VARCHAR(255) DEFAULT NULL,
  `water_fee_rule` VARCHAR(255) DEFAULT NULL,
  `electricity_fee_type` VARCHAR(100) DEFAULT NULL,
  `electricity_fee_rate` VARCHAR(100) DEFAULT NULL,
  `gas_fee_rule` VARCHAR(255) DEFAULT NULL,
  `network_fee_rule` VARCHAR(255) DEFAULT NULL,
  `other_fees_rule` TEXT DEFAULT NULL,

  -- 【8】其他條款
  `abandoned_items_rule` TEXT DEFAULT NULL,
  `jurisdiction_court` VARCHAR(100) DEFAULT '臺灣臺北地方法院',

  -- 【9】雙方基本資料（加密快照；地址調整至 VARBINARY(512)）
  `landlord_name` VARBINARY(255) DEFAULT NULL,
  `landlord_national_id` VARBINARY(255) DEFAULT NULL,
  `landlord_registered_address` VARBINARY(512) DEFAULT NULL,
  `landlord_contact_address` VARBINARY(512) DEFAULT NULL,
  `landlord_phone` VARBINARY(255) DEFAULT NULL,
  `tenant_name` VARCHAR(100) DEFAULT NULL,
  `tenant_national_id` VARBINARY(255) DEFAULT NULL COMMENT '簽約當時的身分證',
  `tenant_registered_address` VARBINARY(512) DEFAULT NULL,
  `tenant_contact_address` VARBINARY(512) DEFAULT NULL,
  `tenant_phone` VARBINARY(255) DEFAULT NULL,

  -- 系統狀態
  `contract_tag` VARCHAR(30) DEFAULT NULL,
  `other_info` TEXT DEFAULT NULL,
  `rental_status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `confirmed_at` DATETIME(6) DEFAULT NULL COMMENT '使用者確認這是最終簽署版的時間',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_rentals_user_status` (`user_id`, `rental_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bills` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `period_index` INT NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `due_date` DATE NOT NULL COMMENT '該期具體應繳日期',
  `rent_amount` INT NOT NULL COMMENT '該期實際應繳金額',
  `electricity_amount` INT DEFAULT NULL COMMENT 'NULL = 尚未收到帳單',
  `water_amount` INT DEFAULT NULL COMMENT 'NULL = 尚未收到帳單',
  `paid_at` DATETIME(6) DEFAULT NULL COMMENT 'NULL = 未繳',
  `payment_method` ENUM('bank-transfer','cash','line-pay','other') DEFAULT NULL COMMENT '該期實際支付方式',
  `payment_note` TEXT DEFAULT NULL,
  `payment_proof_url` VARCHAR(512) DEFAULT NULL,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_bills_rental_period` (`rental_id`, `period_index`),
  INDEX `idx_bills_due_unpaid` (`due_date`, `paid_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contract_analyses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL UNIQUE,
  `contract_file_url` VARCHAR(512) NOT NULL,
  `ocr_raw_text` LONGTEXT NOT NULL,
  `risk_report` TEXT NOT NULL,
  `negotiation_script` LONGTEXT DEFAULT NULL,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `inspection_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `type` ENUM('check_in','check_out') NOT NULL,
  `photo_url` VARCHAR(512) NOT NULL,
  `item_name` VARCHAR(100) DEFAULT NULL,
  `room_name` VARCHAR(100) DEFAULT NULL,
  `vlm_result` JSON DEFAULT NULL COMMENT 'NVIDIA VLM 生成的結構化損傷判斷',
  `user_note` TEXT DEFAULT NULL,
  `captured_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  INDEX `idx_inspection_rental_type` (`rental_id`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `message_boards` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `last_editor_id` INT NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`last_editor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 3. 房東端 ============

CREATE TABLE `landlord_properties` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT DEFAULT NULL,
  `city` VARCHAR(50) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_properties_landlord` FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_landlord_property_name` (`landlord_id`, `name`),
  INDEX `idx_landlord_properties_landlord` (`landlord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_rooms` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `number` VARCHAR(50) NOT NULL,
  `status` ENUM('vacant','occupied','turnover','maintenance') NOT NULL DEFAULT 'vacant',
  `floor` INT DEFAULT NULL,
  `area` DECIMAL(8,2) DEFAULT NULL,
  `expected_rent` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_rooms_property` FOREIGN KEY (`property_id`) REFERENCES `landlord_properties`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_landlord_room_number` (`property_id`, `number`),
  INDEX `idx_landlord_rooms_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_tenants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARBINARY(255) NOT NULL,
  `email` VARCHAR(254) DEFAULT NULL,
  `national_id` VARBINARY(255) DEFAULT NULL,
  `birth_date` DATE DEFAULT NULL,
  `contact_address` VARBINARY(512) DEFAULT NULL,
  `emergency_name` VARCHAR(100) DEFAULT NULL,
  `emergency_phone` VARBINARY(255) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `line_user_id` VARCHAR(255) DEFAULT NULL,
  `line_status` ENUM('unbound','invited','bound','expired') NOT NULL DEFAULT 'unbound',
  `line_invited_at` DATETIME(6) DEFAULT NULL,
  `line_bound_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) DEFAULT NULL,
  CONSTRAINT `fk_landlord_tenants_landlord` FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_landlord_tenants_landlord` (`landlord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_leases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `monthly_rent` INT NOT NULL,
  `deposit_amount` INT NOT NULL,
  `payment_day` TINYINT UNSIGNED NOT NULL,
  `payment_frequency` VARCHAR(30) NOT NULL DEFAULT 'monthly',
  `contract_id` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('pending','active','ended','terminated') NOT NULL DEFAULT 'active',
  `moved_out_at` DATE DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_leases_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `landlord_tenants`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_landlord_leases_property` FOREIGN KEY (`property_id`) REFERENCES `landlord_properties`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_landlord_leases_room` FOREIGN KEY (`room_id`) REFERENCES `landlord_rooms`(`id`) ON DELETE RESTRICT,
  INDEX `idx_landlord_leases_tenant` (`tenant_id`),
  INDEX `idx_landlord_leases_room_period` (`room_id`, `start_date`, `end_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_move_outs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lease_id` INT NOT NULL UNIQUE,
  `move_out_date` DATE NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `final_rent` INT NOT NULL DEFAULT 0,
  `utility_fee` INT NOT NULL DEFAULT 0,
  `deposit_refund` INT NOT NULL DEFAULT 0,
  `deposit_deduction` INT NOT NULL DEFAULT 0,
  `deduction_reason` TEXT DEFAULT NULL,
  `inspection_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_move_outs_lease` FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_tenant_activities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `kind` VARCHAR(50) NOT NULL,
  `detail` TEXT NOT NULL,
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_tenant_activities_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `landlord_tenants`(`id`) ON DELETE CASCADE,
  INDEX `idx_landlord_tenant_activities_tenant` (`tenant_id`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 4. 維修工單（雙向相容） ============

CREATE TABLE `repair_tickets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_user_id` INT NOT NULL COMMENT '報修人',
  `rental_id` INT DEFAULT NULL COMMENT '租客自記約（房東未使用平台）',
  `lease_id` INT DEFAULT NULL COMMENT '房東連動約（雙方皆用平台）',
  `location` VARCHAR(100) DEFAULT NULL,
  `equipment` VARCHAR(100) DEFAULT NULL,
  `description` TEXT NOT NULL,
  `urgency` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `available_time` TEXT DEFAULT NULL,
  `access_permission` ENUM('present','absent','contact-first') NOT NULL DEFAULT 'contact-first',
  `status` ENUM('new','acknowledged','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'new',
  `landlord_read_at` DATETIME(6) DEFAULT NULL,
  `responsibility` ENUM('landlord','tenant','shared','undetermined') NOT NULL DEFAULT 'undetermined',
  `responsibility_note` TEXT DEFAULT NULL,
  `vendor_name` VARCHAR(100) DEFAULT NULL,
  `vendor_phone` VARCHAR(30) DEFAULT NULL,
  `scheduled_at` DATETIME(6) DEFAULT NULL,
  `completed_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`tenant_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE SET NULL,
  INDEX `idx_repair_tickets_rental_status` (`rental_id`, `status`),
  INDEX `idx_repair_tickets_lease_status` (`lease_id`, `status`),
  INDEX `idx_repair_tickets_lease_unread` (`lease_id`, `landlord_read_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `repair_ticket_photos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT NOT NULL,
  `photo_url` VARCHAR(512) NOT NULL,
  `photo_name` VARCHAR(255) DEFAULT NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`ticket_id`) REFERENCES `repair_tickets`(`id`) ON DELETE CASCADE,
  INDEX `idx_repair_photos_ticket` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 5. 個人筆記 · 室友待辦 ============

CREATE TABLE `personal_notes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT DEFAULT NULL,
  `tag` ENUM('租務','提醒','維護','採買') NOT NULL DEFAULT '租務',
  `due_date` DATE DEFAULT NULL,
  `due_time` TIME DEFAULT NULL,
  `done` BOOLEAN NOT NULL DEFAULT FALSE,
  `done_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_personal_notes_user_due` (`user_id`, `due_date`, `done`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `households` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `invite_code` VARCHAR(20) NOT NULL UNIQUE,
  `created_by` INT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `household_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `household_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `role` VARCHAR(50) DEFAULT NULL COMMENT '房東/管理員/室友（自由字串，非權限）',
  `accent` ENUM('indigo','emerald','amber','rose') NOT NULL DEFAULT 'indigo',
  `joined_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_household_member` (`household_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `roommate_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `household_id` INT NOT NULL,
  `creator_member_id` INT DEFAULT NULL COMMENT '成員離開後保留任務',
  `assignee_member_id` INT DEFAULT NULL COMMENT 'NULL = 未指派或原成員已離開',
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT DEFAULT NULL,
  `tag` ENUM('公共區域','清潔','帳務','採買') NOT NULL DEFAULT '公共區域',
  `due_date` DATE DEFAULT NULL,
  `due_time` TIME DEFAULT NULL,
  `done` BOOLEAN NOT NULL DEFAULT FALSE,
  `done_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`creator_member_id`) REFERENCES `household_members`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`assignee_member_id`) REFERENCES `household_members`(`id`) ON DELETE SET NULL,
  INDEX `idx_roommate_tasks_household_done` (`household_id`, `done`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 6. 通知 · 垃圾車收藏 ============

CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `category` ENUM('payment','trash','inspection','contract_end','utility_outage','repair','subsidy') NOT NULL,
  `content` TEXT NOT NULL,
  `remind_at` DATETIME(6) NOT NULL,
  `is_sent` BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_notifications_pending` (`is_sent`, `remind_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `trash_favorites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `station_id` VARCHAR(50) NOT NULL,
  `station_name` VARCHAR(255) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_trash_favorites_user_station` (`user_id`, `station_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 7. 租金補助 ============

CREATE TABLE `subsidy_applications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rental_id` INT NOT NULL,
  `application_type` ENUM('housing','rent_subsidy','recovery') NOT NULL DEFAULT 'rent_subsidy',
  `application_status` VARCHAR(50) NOT NULL DEFAULT 'draft',
  `submitted_at` DATETIME(6) DEFAULT NULL,
  `decided_at` DATETIME(6) DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `remark` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `subsidy_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `application_id` INT NOT NULL,
  `doc_type` VARCHAR(50) NOT NULL,
  `file_url` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) DEFAULT NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`application_id`) REFERENCES `subsidy_applications`(`id`) ON DELETE CASCADE,
  INDEX `idx_subsidy_docs_application` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============ 8. 後台 ============

CREATE TABLE `admin_settings` (
  `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `value` JSON NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `updated_by` INT DEFAULT NULL,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `admin_audit_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `actor_user_id` INT NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(50) DEFAULT NULL,
  `target_id` VARCHAR(100) DEFAULT NULL,
  `detail` JSON DEFAULT NULL,
  `ip` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_audit_actor_time` (`actor_user_id`, `created_at`),
  INDEX `idx_audit_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SET FOREIGN_KEY_CHECKS = 1;