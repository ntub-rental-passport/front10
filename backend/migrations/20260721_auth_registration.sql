USE `115-RentMate`;

-- One-time migration for an existing database created by the previous database.sql.
-- Back up the database before running this file.
ALTER TABLE `users`
  MODIFY COLUMN `email` VARCHAR(254) NOT NULL,
  ADD COLUMN `display_name` VARCHAR(100) DEFAULT NULL AFTER `email`,
  ADD COLUMN `avatar_url` TEXT DEFAULT NULL AFTER `display_name`,
  ADD COLUMN `email_verified_at` DATETIME(6) DEFAULT NULL AFTER `avatar_url`;

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

-- Preserve existing hashes before removing the legacy users.password column.
INSERT INTO `user_password_credentials` (`user_id`, `password_hash`)
SELECT `id`, `password`
FROM `users`
WHERE `password` IS NOT NULL AND `password` <> '';

ALTER TABLE `users` DROP COLUMN `password`;

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
