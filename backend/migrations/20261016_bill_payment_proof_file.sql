-- 自記帳單繳費憑證改為正式加密存檔（2026-10-16）
-- ==================================================================
-- 原本 payment_proof_url 只保存使用者看到的檔名，沒有實際檔案。
-- 新增伺服器檔名與內容類型，供加密儲存、下載及取消繳費後刪檔使用。
-- 只加 nullable 欄位，不修改既有資料；舊紀錄仍只顯示原始檔名。
-- 請先執行此 migration 再部署程式，避免 schema_check 因缺欄位阻止啟動。
--
-- 執行方式（正式機）：
--   cd ~/rentmate && docker compose exec -T fastapi python -c \
--     'import sys; from db.database import engine; from sqlalchemy import text
--   with engine.begin() as db: db.execute(text(sys.stdin.read()))' \
--     < backend/migrations/20261016_bill_payment_proof_file.sql
--
-- 回復：先回復程式版本，再執行：
--   ALTER TABLE `bills` DROP COLUMN `payment_proof_stored_name`,
--     DROP COLUMN `payment_proof_content_type`;
-- 回復會移除檔案對應資訊，已上傳檔案需另行保留或清理。

ALTER TABLE `bills`
  ADD COLUMN `payment_proof_stored_name` VARCHAR(64) NULL
    AFTER `payment_proof_url`,
  ADD COLUMN `payment_proof_content_type` VARCHAR(100) NULL
    AFTER `payment_proof_stored_name`;
