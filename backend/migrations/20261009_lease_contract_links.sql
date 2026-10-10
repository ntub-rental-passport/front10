-- 自存合約與房東租約的對照、繳款證明與帳款異議
-- ==================================================================
-- 租客與房東都用平台時，不讓任何一方的紀錄單方面成為標準：
--   - lease_contract_links：租客把自己存的合約（掃描紙本、雙方簽名的那份）對應到
--     房東平台上的租約，系統逐項比對條件，差異同時給雙方看；房東之後改條件會留下紀錄
--   - utility_evidence 多兩種：payment_proof（繳款證明檔案）、charge_dispute（租客認為
--     帳款金額與合約不符的異議），並多一個 amount 欄位存租客主張的金額
-- 只新增表與欄位、放寬 ENUM，既有資料不受影響。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時看 db/schema_check.py 的輸出逐句補。

CREATE TABLE `lease_contract_links` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `lease_id` INT NOT NULL COMMENT '房東平台上的租約',
  `rental_id` INT NOT NULL COMMENT '租客自己存的合約（紙本簽約內容）',
  `tenant_user_id` INT DEFAULT NULL,
  `differences` JSON DEFAULT NULL COMMENT '最近一次逐項比對的差異',
  `landlord_note` TEXT DEFAULT NULL COMMENT '房東對差異的說明',
  `landlord_noted_at` DATETIME(6) DEFAULT NULL,
  `term_history` JSON DEFAULT NULL COMMENT '對應之後房東修改租約條件的紀錄',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tenant_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_lease_contract_links_lease` (`lease_id`),
  INDEX `idx_lease_contract_links_rental` (`rental_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `utility_evidence`
  MODIFY COLUMN `kind` ENUM('meter_photo','tenant_reading','payment_proof','charge_dispute') NOT NULL,
  ADD COLUMN `amount` INT DEFAULT NULL COMMENT '異議：租客認為依合約應收的金額' AFTER `reading`;
