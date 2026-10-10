-- 客服信箱改為團隊公用 Gmail（2026-10-10）
--
-- site_settings.value 是 json.dumps 過的文字，信箱前後含 JSON 雙引號。
-- 只改仍是舊預設值的 supportEmail；管理員自訂值保留，沒有這列也不新增。
-- HEX 比對避免 MySQL 的不分大小寫定序把管理員改過的值也當成舊預設。
-- 正式站連學校 MySQL，透過 fastapi 的 DATABASE_URL 執行，避免改到 rollback 的 mysql。
--
-- 執行方式（正式機）：
--   cd ~/rentmate && docker compose exec -T fastapi python -c \
--     'import sys; from db.database import engine; from sqlalchemy import text
--   with engine.begin() as db: db.execute(text(sys.stdin.read()))' \
--     < backend/migrations/20261010_support_email.sql

UPDATE `site_settings`
SET `value` = '"rentmate.software@gmail.com"'
WHERE `key` = 'supportEmail' AND HEX(`value`) = HEX('"support@rentmate.tw"');
