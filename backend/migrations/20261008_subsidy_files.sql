-- 租客專用的加密補助文件
-- ==================================================================
-- 僅新增一張表，不修改或刪除既有資料；可用於已有資料的 MySQL 8 資料庫。
-- CREATE TABLE IF NOT EXISTS 可重跑，但不會修正已存在而結構不符的同名表。
-- 部署後請用 db/schema_check.py 核對；應先完成本遷移再啟動新版後端。
-- MySQL DDL 會隱含 commit；既有 subsidy_documents 與 subsidy_applications 保持不變。

CREATE TABLE IF NOT EXISTS `subsidy_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rental_id` INT DEFAULT NULL,
  `doc_type` ENUM('application_form','identity','household','lease_copy','bankbook','other') NOT NULL,
  `stored_name` VARCHAR(64) NOT NULL,
  `original_name` VARBINARY(512) NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `expiry_notified_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_subsidy_files_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subsidy_files_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE SET NULL,
  INDEX `idx_subsidy_files_user_created` (`user_id`, `created_at`),
  INDEX `idx_subsidy_files_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
