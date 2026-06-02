USE `115-RentMate`;

-- 1. users
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
