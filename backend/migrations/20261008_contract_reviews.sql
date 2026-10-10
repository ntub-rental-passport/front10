-- 合約審閱紀錄與加密佐證、報告檔案
-- ==================================================================
-- 僅新增兩張表，不修改或刪除既有資料；可用於已有資料的 MySQL 8 資料庫。
-- CREATE TABLE IF NOT EXISTS 可重跑，但不會修正已存在而結構不符的同名表。
-- 部署後請用 db/schema_check.py 核對；應先完成本遷移再啟動新版後端。
-- activity_at 由程式明確寫入，通知與租約解除連結不會重設到期起算時間。
-- MySQL DDL 會隱含 commit；兩張表依外鍵順序建立，中途失敗可重跑。

CREATE TABLE IF NOT EXISTS `contract_reviews` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rental_id` INT DEFAULT NULL,
  `records` JSON NOT NULL,
  `activity_at` DATETIME(6) NOT NULL COMMENT '由程式明確更新，作為未連結審閱的到期起算時間',
  `expiry_notified_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_contract_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contract_reviews_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE SET NULL,
  INDEX `idx_contract_reviews_rental_activity` (`rental_id`, `activity_at`),
  INDEX `idx_contract_reviews_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contract_review_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` CHAR(36) NOT NULL,
  `kind` ENUM('evidence','report') NOT NULL,
  `record_key` VARCHAR(64) DEFAULT NULL,
  `stored_name` VARCHAR(64) NOT NULL,
  `original_name` VARBINARY(512) NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT NOT NULL,
  `report_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_contract_review_files_review` FOREIGN KEY (`review_id`) REFERENCES `contract_reviews`(`id`) ON DELETE CASCADE,
  INDEX `idx_contract_review_files_review_kind` (`review_id`, `kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

