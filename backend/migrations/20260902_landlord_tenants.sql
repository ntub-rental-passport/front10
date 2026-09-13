CREATE TABLE `landlord_properties` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_properties_landlord` FOREIGN KEY (`landlord_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_landlord_property_name` (`landlord_id`, `name`),
  INDEX `idx_landlord_properties_landlord` (`landlord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_rooms` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `number` VARCHAR(50) NOT NULL,
  `status` ENUM('vacant','occupied','turnover','maintenance') NOT NULL DEFAULT 'vacant',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_rooms_property` FOREIGN KEY (`property_id`) REFERENCES `landlord_properties` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_landlord_room_number` (`property_id`, `number`),
  INDEX `idx_landlord_rooms_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_tenants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `landlord_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(254) NULL,
  `national_id` VARCHAR(20) NULL,
  `birth_date` DATE NULL,
  `contact_address` TEXT NULL,
  `emergency_name` VARCHAR(100) NULL,
  `emergency_phone` VARCHAR(30) NULL,
  `notes` TEXT NULL,
  `line_user_id` VARCHAR(255) NULL,
  `line_status` ENUM('unbound','invited','bound','expired') NOT NULL DEFAULT 'unbound',
  `line_invited_at` DATETIME(6) NULL,
  `line_bound_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) NULL,
  CONSTRAINT `fk_landlord_tenants_landlord` FOREIGN KEY (`landlord_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_landlord_tenants_landlord` (`landlord_id`),
  INDEX `idx_landlord_tenants_search` (`landlord_id`, `name`, `phone`)
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
  `contract_id` VARCHAR(100) NULL,
  `status` ENUM('pending','active','ended','terminated') NOT NULL DEFAULT 'active',
  `moved_out_at` DATE NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_leases_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `landlord_tenants` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_landlord_leases_property` FOREIGN KEY (`property_id`) REFERENCES `landlord_properties` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_landlord_leases_room` FOREIGN KEY (`room_id`) REFERENCES `landlord_rooms` (`id`) ON DELETE RESTRICT,
  INDEX `idx_landlord_leases_tenant` (`tenant_id`),
  INDEX `idx_landlord_leases_room_period` (`room_id`, `start_date`, `end_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_move_outs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lease_id` INT NOT NULL UNIQUE,
  `move_out_date` DATE NOT NULL,
  `reason` TEXT NULL,
  `final_rent` INT NOT NULL DEFAULT 0,
  `utility_fee` INT NOT NULL DEFAULT 0,
  `deposit_refund` INT NOT NULL DEFAULT 0,
  `deposit_deduction` INT NOT NULL DEFAULT 0,
  `deduction_reason` TEXT NULL,
  `inspection_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_move_outs_lease` FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `landlord_tenant_activities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL,
  `kind` VARCHAR(50) NOT NULL,
  `detail` TEXT NOT NULL,
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_landlord_tenant_activities_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `landlord_tenants` (`id`) ON DELETE CASCADE,
  INDEX `idx_landlord_tenant_activities_tenant` (`tenant_id`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
