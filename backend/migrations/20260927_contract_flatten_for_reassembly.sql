-- 合約欄位攤平，供「檢視契約」由欄位回拼定型化契約
-- ==================================================================
-- 背景：專案刻意不儲存合約原始檔，也不把 OCR 全文明文落地（全文含所有
-- 姓名、身分證字號、地址與電話，存了等於抵銷 rentals 的加密欄位）。
-- 使用者要檢視契約時，一律由 rentals 的欄位逐格填回範本，所以每個校對
-- 欄位都必須有自己的一欄——不能再把數個欄位串成一段字串，否則回拼時
-- 得反解析自己寫出來的格式。
--
-- ⚠️ 執行前先確認 rentals 是空的：
--     SELECT COUNT(*) FROM rentals;
-- 若已有資料，下面的 DROP COLUMN 會連同已存的內容一起消失，
-- 需要先把 parking_details / annex_building_desc / rental_scope_details /
-- other_info 的內容人工拆進新欄位。
--
-- ⚠️ tenant_name 由 VARCHAR 改為加密欄位：既有的明文姓名無法自動轉換，
-- 因為加密要經過應用層的 EncryptedText。rentals 非空時請勿直接執行。

-- ⚠️ MySQL 的 DDL 會隱含 commit，包在交易裡也不會一起回滾。
-- 中途失敗就是改到一半，必須看 schema_check.py 的輸出決定補哪幾句，
-- 不要整份重跑（已成功的 ADD COLUMN 會因重複而再次失敗）。

-- 【2】住宅標示：無門牌者的稅籍編號、附屬建物用途與面積各自成欄
ALTER TABLE `rentals`
  ADD COLUMN `tax_id` VARCHAR(100) DEFAULT NULL COMMENT '無門牌者的房屋稅籍編號' AFTER `address`,
  ADD COLUMN `annex_building_purpose` VARCHAR(255) DEFAULT NULL COMMENT '陽台、露台、雨遮等' AFTER `has_annex_building`,
  ADD COLUMN `annex_building_area` DECIMAL(8,2) DEFAULT NULL AFTER `annex_building_purpose`,
  DROP COLUMN `annex_building_desc`;

-- 【3】租賃範圍：部分出租的房間與面積、車位七個欄位全部攤平
ALTER TABLE `rentals`
  ADD COLUMN `rental_room` VARCHAR(255) DEFAULT NULL COMMENT '部分出租時的樓層、房間或室號' AFTER `rental_scope`,
  ADD COLUMN `rental_area` DECIMAL(8,2) DEFAULT NULL COMMENT '部分出租時的實際租賃面積' AFTER `rental_room`,
  ADD COLUMN `car_parking_count` INT DEFAULT NULL AFTER `has_parking`,
  ADD COLUMN `car_parking_type` VARCHAR(20) DEFAULT NULL COMMENT '平面式或機械式' AFTER `car_parking_count`,
  ADD COLUMN `car_parking_floor` VARCHAR(30) DEFAULT NULL AFTER `car_parking_type`,
  ADD COLUMN `car_parking_number` VARCHAR(50) DEFAULT NULL AFTER `car_parking_floor`,
  ADD COLUMN `motorcycle_parking_count` INT DEFAULT NULL AFTER `car_parking_number`,
  ADD COLUMN `motorcycle_parking_floor` VARCHAR(30) DEFAULT NULL AFTER `motorcycle_parking_count`,
  ADD COLUMN `motorcycle_parking_number` VARCHAR(100) DEFAULT NULL AFTER `motorcycle_parking_floor`,
  ADD COLUMN `parking_usage_time` VARCHAR(30) DEFAULT NULL COMMENT '全日、日間、夜間或其他' AFTER `motorcycle_parking_number`,
  DROP COLUMN `rental_scope_details`,
  DROP COLUMN `parking_details`;

-- 【5】租金與繳納：轉帳帳戶含金融機構、戶名與帳號，與身分證同等敏感，加密儲存
ALTER TABLE `rentals`
  ADD COLUMN `bank_account` VARBINARY(512) DEFAULT NULL COMMENT '轉帳帳戶：金融機構、戶名、帳號' AFTER `payment_method`;

-- 【9】承租人姓名改為加密（原本是唯一一個明文的當事人姓名）
ALTER TABLE `rentals`
  MODIFY COLUMN `tenant_name` VARBINARY(255) DEFAULT NULL;

-- 【10】代理或轉租資料：原本擠在 other_info，攤平成四欄
ALTER TABLE `rentals`
  ADD COLUMN `agent_name` VARBINARY(255) DEFAULT NULL AFTER `tenant_phone`,
  ADD COLUMN `agent_national_id` VARBINARY(255) DEFAULT NULL AFTER `agent_name`,
  ADD COLUMN `authorization_document` VARCHAR(255) DEFAULT NULL COMMENT '代理授權證明' AFTER `agent_national_id`,
  ADD COLUMN `sublease_consent` VARCHAR(255) DEFAULT NULL COMMENT '出租人同意轉租之證明' AFTER `authorization_document`,
  DROP COLUMN `other_info`;

-- contract_analyses 整張移除：
--   contract_file_url  → 不儲存合約原始檔
--   ocr_raw_text       → 不儲存 OCR 全文（明文個資）
--   risk_report        → 風險報告可由規則隨時重算
--   negotiation_script → 從未使用
DROP TABLE IF EXISTS `contract_analyses`;

-- 執行後用 backend/schema_check.py 驗證：
--   python backend/schema_check.py
