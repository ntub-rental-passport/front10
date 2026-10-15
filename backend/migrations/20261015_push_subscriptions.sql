-- 新增帳號層級的瀏覽器推播訂閱，一個帳號可訂閱多台裝置（2026-10-15）
-- ==================================================================
-- endpoint 很長且包含裝置憑證，不直接建立唯一索引，以免超過 MySQL utf8mb4
-- 的索引長度限制。另存 SHA-256 的 64 字元 endpoint_hash，與 user_id 組成唯一鍵。
-- user_id、expired_at 的索引用來查詢該帳號仍有效的裝置；帳號刪除時連帶刪除訂閱。
-- 請先套用此 migration 再部署程式，否則啟動時的 schema_check 會因缺表而停止。
-- 程式不會自行建表或執行此 migration。
--
-- 回復：DROP TABLE `push_subscriptions`;

CREATE TABLE `push_subscriptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `endpoint` TEXT NOT NULL,
  `endpoint_hash` CHAR(64) NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth` VARCHAR(255) NOT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  `last_success_at` DATETIME DEFAULT NULL,
  `expired_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_subscriptions_user_endpoint` (`user_id`, `endpoint_hash`),
  INDEX `ix_push_subscriptions_user_expired` (`user_id`, `expired_at`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
