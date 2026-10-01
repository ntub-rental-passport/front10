SET FOREIGN_KEY_CHECKS = 0;
-- RentMate 資料庫重建（多重角色版）
-- ==================================================================
-- 主要設計決策：
--   1. users 儲存唯一帳號，user_roles 儲存帳號身分；同一帳號可同時是 tenant 與 landlord
--   2. Admin 不透過公開註冊入口建立，走獨立 /admin/register 流程
--   3. 合約欄位攤平儲存於 rentals（供拼回契約 + 租補預帶）；
--      刻意不儲存合約原始檔與 OCR 全文，檢視契約一律由這些欄位回拼
--   4. 敏感個資採用 VARBINARY 加密儲存（地址放寬至 512 bytes 避免溢位）
--   5. rentals 為合約快照，bills 為每期實際帳單
--   6. 維修工單雙向相容：rental_id 或 lease_id 至少具備一個
--   7. 本檔為新資料庫建表定義，非既有資料庫的升級腳本；舊帳號合併需同步處理外鍵
--   8. 後端 ORM、註冊、登入與權限檢查透過 user_roles 核對帳號身分
--

USE `115-RentMate`;

-- ============ 1. 帳號 · 登入 · 驗證 ============

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(254) NOT NULL,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `national_id` VARBINARY(255) DEFAULT NULL COMMENT '承租人身分證，租補申請預帶用（可編輯）',
  `avatar_url` TEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'Google-only 為 NULL',
  `password_changed_at` DATETIME(6) DEFAULT NULL,
  `email_verified_at` DATETIME(6) DEFAULT NULL,
  `status` ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `uq_users_email` (`email`),
  INDEX `ix_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_roles` (
  `user_id` INT NOT NULL,
  `role` ENUM('tenant','landlord','admin') NOT NULL COMMENT '帳號擁有的身分，每種身分各存一筆',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `role`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `ix_user_roles_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 例如：為既有帳號新增房客及房東身分（將 123 換成實際 users.id）：
-- INSERT INTO `user_roles` (`user_id`, `role`) VALUES (123, 'tenant'), (123, 'landlord');
-- 註冊／新增身分時應在同一交易內建立帳號及角色；公開入口不得授予 admin。

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
  `role` ENUM('tenant','landlord','admin') NOT NULL COMMENT '驗證通過並確認帳號所有權後，要新增至 user_roles 的身分',
  `verification_code_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `resend_available_at` DATETIME(6) NOT NULL,
  `attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `send_count` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY `uq_pending_email_role` (`email`, `role`),
  UNIQUE KEY `uq_pending_provider_subject_role` (`provider`, `provider_subject`, `role`),
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

-- 管理員登入的伺服器端紀錄：閒置 20 分鐘作廢（見 models.AdminSession、security.admin_session_from）
CREATE TABLE `admin_sessions` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `last_active_at` DATETIME NOT NULL,
  CONSTRAINT `fk_admin_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `ix_admin_sessions_user_id` (`user_id`)
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
  `tax_id` VARCHAR(100) DEFAULT NULL COMMENT '無門牌者的房屋稅籍編號',
  `has_annex_building` BOOLEAN NOT NULL DEFAULT FALSE,
  `annex_building_purpose` VARCHAR(255) DEFAULT NULL COMMENT '陽台、露台、雨遮等',
  `annex_building_area` DECIMAL(8,2) DEFAULT NULL,

  -- 【3】租賃範圍
  `rental_scope` ENUM('entire','partial') NOT NULL DEFAULT 'entire',
  `rental_room` VARCHAR(255) DEFAULT NULL COMMENT '部分出租時的樓層、房間或室號',
  `rental_area` DECIMAL(8,2) DEFAULT NULL COMMENT '部分出租時的實際租賃面積',
  `has_parking` BOOLEAN NOT NULL DEFAULT FALSE,
  `car_parking_count` INT DEFAULT NULL,
  `car_parking_type` VARCHAR(20) DEFAULT NULL COMMENT '平面式或機械式',
  `car_parking_floor` VARCHAR(30) DEFAULT NULL,
  `car_parking_number` VARCHAR(50) DEFAULT NULL,
  `motorcycle_parking_count` INT DEFAULT NULL,
  `motorcycle_parking_floor` VARCHAR(30) DEFAULT NULL,
  `motorcycle_parking_number` VARCHAR(100) DEFAULT NULL,
  `parking_usage_time` VARCHAR(30) DEFAULT NULL COMMENT '全日、日間、夜間或其他',
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
  `bank_account` VARBINARY(512) DEFAULT NULL COMMENT '轉帳帳戶：金融機構、戶名、帳號',
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
  `tenant_name` VARBINARY(255) DEFAULT NULL,
  `tenant_national_id` VARBINARY(255) DEFAULT NULL COMMENT '簽約當時的身分證',
  `tenant_registered_address` VARBINARY(512) DEFAULT NULL,
  `tenant_contact_address` VARBINARY(512) DEFAULT NULL,
  `tenant_phone` VARBINARY(255) DEFAULT NULL,

  -- 【10】代理或轉租（偵測到適用情境時才填）
  `agent_name` VARBINARY(255) DEFAULT NULL,
  `agent_national_id` VARBINARY(255) DEFAULT NULL,
  `authorization_document` VARCHAR(255) DEFAULT NULL COMMENT '代理授權證明',
  `sublease_consent` VARCHAR(255) DEFAULT NULL COMMENT '出租人同意轉租之證明',

  -- 系統狀態
  `contract_tag` VARCHAR(30) DEFAULT NULL,
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

CREATE TABLE `inspection_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `type` ENUM('check_in','check_out') NOT NULL,
  `photo_url` VARCHAR(512) NOT NULL,
  `capture_source` ENUM('camera','file') NOT NULL DEFAULT 'file' COMMENT '照片來源：camera=現場鏡頭拍攝、file=檔案上傳或舊資料',
  `capture_quality` JSON DEFAULT NULL COMMENT '現場拍攝量到的 brightness/sharpness/isLevel；檔案上傳為 NULL',
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
  `rental_id` INT DEFAULT NULL COMMENT '租客自記約（房東未使用平台）：工單即為存證紀錄',
  `lease_id` INT DEFAULT NULL COMMENT '房東連動約（雙方皆用平台）：房東端可處理',
  `location` VARCHAR(100) DEFAULT NULL,
  `equipment` VARCHAR(100) DEFAULT NULL,
  `description` TEXT NOT NULL,
  `phone` VARBINARY(255) DEFAULT NULL COMMENT '報修聯絡電話（加密）',
  `urgency` ENUM('emergency','soon','normal') NOT NULL DEFAULT 'normal',
  `available_time` TEXT DEFAULT NULL,
  `access_permission` ENUM('present','absent','contact-first') NOT NULL DEFAULT 'contact-first',
  `contact_before_arrival` BOOLEAN NOT NULL DEFAULT FALSE,
  `status` ENUM('pending','processing','inspection','completed','canceled') NOT NULL DEFAULT 'pending',
  `landlord_read_at` DATETIME(6) DEFAULT NULL,
  `responsibility` ENUM('pending','landlord','tenant','shared') NOT NULL DEFAULT 'pending',
  `responsibility_note` TEXT DEFAULT NULL,
  `responsibility_agreement` VARCHAR(20) DEFAULT NULL COMMENT 'agreed / questioned',
  `responsibility_question` TEXT DEFAULT NULL,
  `supplement_requested` BOOLEAN NOT NULL DEFAULT FALSE,
  `supplement_request_note` TEXT DEFAULT NULL,
  `vendor_name` VARCHAR(100) DEFAULT NULL,
  `vendor_phone` VARCHAR(30) DEFAULT NULL,
  `scheduled_at` DATETIME(6) DEFAULT NULL,
  `tenant_schedule_reply` VARCHAR(20) DEFAULT NULL COMMENT 'accepted / reschedule / contact-first',
  `reschedule_request` JSON DEFAULT NULL,
  `estimated_cost` INT DEFAULT NULL,
  `actual_cost` INT DEFAULT NULL,
  `payer` VARCHAR(50) DEFAULT NULL,
  `completion_note` TEXT DEFAULT NULL,
  `inspection_result` VARCHAR(20) DEFAULT NULL COMMENT 'resolved / unresolved / retry',
  `unresolved_note` TEXT DEFAULT NULL,
  `unresolved_safety_concern` BOOLEAN NOT NULL DEFAULT FALSE,
  `revisit_available_time` TEXT DEFAULT NULL,
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

-- 報修時間軸：只新增、不修改、不刪除。這就是「存證」——
-- 誰在什麼時候做了什麼，事後無法竄改，發生爭議時可以拿出來對照。
CREATE TABLE `repair_ticket_events` (
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

CREATE TABLE `repair_ticket_photos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticket_id` INT NOT NULL,
  `event_id` INT DEFAULT NULL COMMENT '補件照片屬於哪一次補充',
  `stage` ENUM('report','supplement','completion','unresolved','receipt') NOT NULL DEFAULT 'report',
  `uploaded_by` INT DEFAULT NULL,
  `photo_url` VARCHAR(512) NOT NULL COMMENT '伺服器產生的檔名（REPAIR_UPLOAD_DIR 下），不是外部網址',
  `photo_name` VARCHAR(255) DEFAULT NULL COMMENT '使用者上傳時的原始檔名',
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`ticket_id`) REFERENCES `repair_tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `repair_ticket_events`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
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
CREATE TABLE `inspection_items` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `room_name` VARCHAR(100) NOT NULL,
  `item_name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(20) NOT NULL DEFAULT 'furniture',
  `baseline_record_id` INT UNIQUE,
  `checkout_record_id` INT UNIQUE,
  `comparison_result` JSON,
  `version` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`baseline_record_id`) REFERENCES `inspection_records`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`checkout_record_id`) REFERENCES `inspection_records`(`id`) ON DELETE SET NULL,
  INDEX `idx_inspection_items_rental` (`rental_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- 後台自己的資料（2026-10-01 從 SQLite 搬進來，見 migrations/20261001_admin_tables_to_mysql.sql）

-- 系統設定（site_settings.py）：網站名稱、維護模式、各種門檻

CREATE TABLE `site_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 功能停用（site_settings.py）：暫時對所有使用者關掉某個功能

CREATE TABLE `feature_outages` (
  `feature_key` VARCHAR(64) NOT NULL,
  `internal_reason` TEXT NOT NULL,
  `public_note` TEXT NOT NULL,
  `closed_at` VARCHAR(40) NOT NULL,
  `eta_at` VARCHAR(40),
  PRIMARY KEY (`feature_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 安全設定（platform_settings.py）：密碼最短長度、登入有效時間

CREATE TABLE `platform_settings` (
  `key` VARCHAR(64) NOT NULL,
  `value` INT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 公告（content_service.py）

CREATE TABLE `announcements` (
  `id` VARCHAR(40) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `level` VARCHAR(20) NOT NULL,
  `audience` VARCHAR(20) NOT NULL,
  `published` TINYINT(1) NOT NULL,
  `start_at` VARCHAR(40) NOT NULL,
  `end_at` VARCHAR(40),
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 首頁輪播（content_service.py）

CREATE TABLE `banners` (
  `id` VARCHAR(40) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `link_url` VARCHAR(512) NOT NULL,
  `audience` VARCHAR(20) NOT NULL DEFAULT 'all',
  `sort_order` INT NOT NULL,
  `published` TINYINT(1) NOT NULL,
  `start_at` VARCHAR(40) NOT NULL,
  `end_at` VARCHAR(40),
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 通知模板（content_service.py）

CREATE TABLE `notification_templates` (
  `id` VARCHAR(40) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `channels` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `action_url` VARCHAR(512),
  `action_label` VARCHAR(100),
  `enabled` TINYINT(1) NOT NULL,
  `updated_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 內容的雜項狀態（content_service.py）：例如示範內容有沒有寫過

CREATE TABLE `content_meta` (
  `key` VARCHAR(64) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 欄位對齊目前真正在寫的內容；舊表留著不動，避免動到別人可能引用的東西。

CREATE TABLE `audit_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `at` DOUBLE NOT NULL,
  `actor` VARCHAR(254) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target` VARCHAR(255) NOT NULL,
  `detail` TEXT NOT NULL,
  `subject` VARCHAR(100),
  `ip` VARCHAR(64),
  PRIMARY KEY (`id`),
  INDEX `idx_audit_events_at` (`at`),
  INDEX `idx_audit_events_subject` (`subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 管理員通知中心（admin_notifications.py）

CREATE TABLE `admin_notifications` (
  `id` VARCHAR(40) NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `action_url` VARCHAR(512),
  `action_label` VARCHAR(100),
  `sender_name` VARCHAR(100),
  `sender_email` VARCHAR(254),
  `created_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_admin_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每位管理員各自的已讀（admin_notifications.py）

CREATE TABLE `admin_notification_reads` (
  `notification_id` VARCHAR(40) NOT NULL,
  `admin_id` INT NOT NULL,
  `read_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`notification_id`, `admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI 用量（ai_usage.py）：目前只記 OCR 服務用掉的 Google Vision 頁數

CREATE TABLE `daily_usage` (
  `date` VARCHAR(10) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `units` INT NOT NULL,
  `calls` INT NOT NULL,
  PRIMARY KEY (`date`, `provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 額度告警發過沒有（ai_usage.py）：每個門檻每月只通知一次

CREATE TABLE `usage_meta` (
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 後台對報修工單的內部註記與旗標（repair_notes.py）

CREATE TABLE `repair_notes` (
  `ticket_id` VARCHAR(40) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
