-- 使用者帳號狀態與最後登入時間
--
-- 注意：create_all() 只建立「不存在的表」，不會修改「已存在的表」，
-- 這兩個欄位一定要用這支 SQL 加，光重啟後端沒有用。
--
-- 執行方式（正式機）：
--   cd ~/rentmate && docker compose exec -T mysql \
--     sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -urentmate "115-RentMate"' \
--     < backend/migrations/20260909_user_status.sql

-- 1. 帳號狀態
--    預設 active，既有帳號不受影響。
--    suspended 時所有登入路徑一律拒絕（帳密、Google、管理員 2FA）。
ALTER TABLE `users`
  ADD COLUMN `status` ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER `created_at`;

-- 2. 最後登入時間
--    既有帳號為 NULL（我們沒有歷史紀錄，寫任何值都是編的）。
ALTER TABLE `users`
  ADD COLUMN `last_login_at` DATETIME NULL AFTER `status`;

-- 後台常以狀態篩選，加索引避免全表掃描
CREATE INDEX `ix_users_status` ON `users` (`status`);
