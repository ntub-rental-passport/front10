-- 管理員登入（帳密 + 信箱驗證碼兩階段）所需的結構變更
--
-- 注意：create_all() 只會建立「不存在的表」，不會修改「已存在的表」，
-- 所以 user_roles 的 enum 一定要用這支 SQL 手動改，光重啟後端沒有用。
--
-- 執行方式（正式機）：
--   docker compose exec -T mysql mysql -urentmate -p'<密碼>' '115-RentMate' < backend/migrations/20260908_admin_login.sql

-- 1. user_roles 增加 admin 選項
--    原本只有 ('tenant','landlord')，寫入 'admin' 會被 MySQL 拒絕。
ALTER TABLE `user_roles`
  MODIFY `role` ENUM('tenant','landlord','admin') NOT NULL;

-- 2. 管理員登入第二階段的暫存挑戰
--    只存驗證碼雜湊，不存驗證碼本身（與 pending_registrations 一致）。
--    使用者刪除時連帶刪除，避免留下孤兒挑戰。
CREATE TABLE IF NOT EXISTS `pending_admin_logins` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `verification_code_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `request_ip` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_pending_admin_logins_email` (`email`),
  KEY `ix_pending_admin_logins_expires_at` (`expires_at`),
  KEY `ix_pending_admin_logins_user_id` (`user_id`),
  CONSTRAINT `fk_pending_admin_logins_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
