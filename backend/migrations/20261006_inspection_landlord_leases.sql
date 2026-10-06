-- 點交存證也能用在房東平台上的租約
-- ==================================================================
-- 原本點交項目與照片一定屬於租客自己存的合約（rentals）。租客接受房東邀請、
-- 加入房東平台上的租約（landlord_leases）之後，入住前的點交也要能記在那份租約上，
-- 房東才看得到入住時的狀況、退租時才有得比對。
--
-- rental_id 改成可為 NULL，新增 lease_id；兩者恰好一個由程式保證（routers/inspection.py）。
-- 既有資料都有 rental_id，不受影響。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時看 db/schema_check.py 的輸出逐句補。

ALTER TABLE `inspection_records`
  MODIFY COLUMN `rental_id` INT DEFAULT NULL COMMENT '租客自己存的合約；與 lease_id 恰好一個',
  ADD COLUMN `lease_id` INT DEFAULT NULL COMMENT '房東平台上的租約' AFTER `rental_id`,
  ADD CONSTRAINT `fk_inspection_records_lease` FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE CASCADE,
  ADD INDEX `idx_inspection_records_lease` (`lease_id`);

ALTER TABLE `inspection_items`
  MODIFY COLUMN `rental_id` INT DEFAULT NULL COMMENT '租客自己存的合約；與 lease_id 恰好一個',
  ADD COLUMN `lease_id` INT DEFAULT NULL COMMENT '房東平台上的租約' AFTER `rental_id`,
  ADD CONSTRAINT `fk_inspection_items_lease` FOREIGN KEY (`lease_id`) REFERENCES `landlord_leases`(`id`) ON DELETE CASCADE,
  ADD INDEX `idx_inspection_items_lease` (`lease_id`);
