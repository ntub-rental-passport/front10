-- 站內通知加上「這則給哪個身分看」（2026-10-15）
-- ==================================================================
-- 問題：同一個帳號同時有房東與租客身分時，租客的通知中心會出現房東的訊息，
-- 反過來房東端的鈴鐺也會看到租客的訊息。
-- 根因是 `GET /api/notifications` 只用 user_id 查（routers/inbox_api.py），
-- 而這張表沒有任何欄位能分辨身分 —— `source_type` 被 notify_user 寫死成 'landlord'，
-- 每一則都一樣，不能拿來分。
--
-- 這次只加欄位，不改任何既有資料：
--   NULL     = 沒有標註身分，兩邊都顯示（所有既有的 27 筆都是這個狀態）
--   tenant   = 只在租客端顯示
--   landlord = 只在房東端顯示
--
-- 刻意允許 NULL，有兩個理由：
--   1. 既有通知不會因為這次變更而從任何人的收件匣消失。
--   2. 現在跑著的後端在 db/schema_check.py 只會對「NOT NULL 又沒有預設值」的
--      未對應欄位喊停，所以先加欄位、後部署程式是安全的；反過來（程式先上）
--      會讓 require_current_schema() 丟出 Missing column 而整個後端起不來。
--
-- 執行方式（正式機）：
--   cd ~/rentmate && docker compose exec -T fastapi python -c \
--     'import sys; from db.database import engine; from sqlalchemy import text
--   with engine.begin() as db: db.execute(text(sys.stdin.read()))' \
--     < backend/migrations/20261015_inbox_audience_role.sql
--
-- 回復：ALTER TABLE `inbox_messages` DROP COLUMN `audience_role`;

ALTER TABLE `inbox_messages`
  ADD COLUMN `audience_role` ENUM('tenant','landlord') DEFAULT NULL
  COMMENT '這則通知要給哪個身分看；NULL 表示未標註，兩邊都顯示'
  AFTER `source_type`;
