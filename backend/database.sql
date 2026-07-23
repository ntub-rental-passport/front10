USE `115-RentMate`;

-- 1. users
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(254) NOT NULL UNIQUE,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `avatar_url` TEXT DEFAULT NULL,
  `email_verified_at` DATETIME(6) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_roles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `role` ENUM('tenant', 'landlord') NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_user_role` (`user_id`, `role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_identities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `provider` ENUM('google') NOT NULL,
  `provider_subject` VARCHAR(255) NOT NULL,
  `provider_email` VARCHAR(254) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_user_identities_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_identity_provider_subject` (`provider`, `provider_subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_password_credentials` (
  `user_id` INT PRIMARY KEY,
  `password_hash` VARCHAR(255) NOT NULL,
  `password_changed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_password_credentials_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pending_registrations` (
  `id` CHAR(36) PRIMARY KEY,
  `email` VARCHAR(254) NOT NULL,
  `provider` ENUM('password', 'google') NOT NULL,
  `provider_subject` VARCHAR(255) DEFAULT NULL,
  `display_name` VARCHAR(100) DEFAULT NULL,
  `avatar_url` TEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('tenant', 'landlord') NOT NULL,
  `invite_code` VARCHAR(100) DEFAULT NULL,
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

-- 2. rentals
CREATE TABLE `rentals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `address` TEXT NOT NULL,
  `landlord_name` VARCHAR(50) DEFAULT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `rent_amount` INT NOT NULL,
  `deposit_amount` INT NOT NULL,
  `payment_day` INT NOT NULL CHECK (`payment_day` BETWEEN 1 AND 31),
  `total_periods` INT NOT NULL,
  `contract_tag` VARCHAR(30) DEFAULT NULL,
  `other_info` TEXT DEFAULT NULL,
  `rental_status` VARCHAR(20) NOT NULL DEFAULT 'active',
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. bills (新功能表)
CREATE TABLE `bills` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `period_number` INT NOT NULL,
  `due_date` DATE NOT NULL,
  `rent_fee` INT NOT NULL,
  `electricity_fee` INT NOT NULL DEFAULT 0,
  `water_fee` INT NOT NULL DEFAULT 0,
  `bill_status` ENUM('unpaid', 'paid', 'overdue') NOT NULL DEFAULT 'unpaid',
  `paid_at` TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. contract_analyses
CREATE TABLE `contract_analyses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL UNIQUE,
  `contract_file_url` VARCHAR(512) NOT NULL,
  `ocr_raw_text` LONGTEXT NOT NULL,
  `risk_report` TEXT NOT NULL,
  `negotiation_script` LONGTEXT DEFAULT NULL,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. inspection_records
CREATE TABLE `inspection_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `type` ENUM('check_in', 'check_out') NOT NULL,
  `photo_url` VARCHAR(512) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `captured_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. message_boards
CREATE TABLE `message_boards` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `last_editor_id` INT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`last_editor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. notifications
CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `category` ENUM('payment', 'trash', 'inspection', 'contract_end', 'utility_outage') NOT NULL,
  `content` TEXT NOT NULL,
  `remind_at` TIMESTAMP NOT NULL,
  `is_sent` BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. trash_favorites
CREATE TABLE `trash_favorites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `station_id` VARCHAR(50) NOT NULL,
  `station_name` VARCHAR(255) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. subsidy_applications
CREATE TABLE `subsidy_applications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rental_id` INT NOT NULL,
  `application_status` VARCHAR(50) NOT NULL,
  `remark` TEXT DEFAULT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. utility_outages (新功能表)
CREATE TABLE `utility_outages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rental_id` INT NOT NULL,
  `type` ENUM('water', 'electricity') NOT NULL,
  `is_outage` BOOLEAN NOT NULL DEFAULT FALSE,
  `status_message` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
