-- 電費佐證：電表照片與租客回報的讀數
-- ==================================================================
-- 租客加入房東平台上的租約後，電費以房東的紀錄為準、租客端唯讀。
-- 這張表讓雙方有同一份依據：
--   - 房東抄表時可以附電表照片，租客在首頁看得到
--   - 租客對讀數有意見，可以回報自己抄到的讀數（可附照片）
--   - 房東決定採用（更正那筆電費，事件紀錄保留原值）或維持原讀數並回覆
-- 只新增一張表，既有資料不受影響。

CREATE TABLE `utility_evidence` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `charge_id` INT NOT NULL,
  `kind` ENUM('meter_photo','tenant_reading') NOT NULL COMMENT 'meter_photo=電表照片、tenant_reading=租客回報讀數',
  `role` ENUM('landlord','tenant') NOT NULL,
  `submitted_by` INT DEFAULT NULL,
  `reading` DECIMAL(12,2) DEFAULT NULL COMMENT '租客回報的本期讀數',
  `stored_name` VARCHAR(64) DEFAULT NULL COMMENT '伺服器產生的照片檔名（UTILITY_PHOTO_DIR 下）',
  `original_name` VARCHAR(255) DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `status` ENUM('open','accepted','kept') NOT NULL DEFAULT 'open' COMMENT '租客讀數：待處理／房東採用／房東維持原讀數',
  `response` TEXT DEFAULT NULL COMMENT '房東的回覆',
  `resolved_by` INT DEFAULT NULL,
  `resolved_at` DATETIME(6) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`charge_id`) REFERENCES `landlord_charges`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_utility_evidence_charge` (`charge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
