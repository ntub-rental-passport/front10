ALTER TABLE `landlord_properties`
  ADD COLUMN `city` VARCHAR(50) NULL AFTER `address`;

ALTER TABLE `landlord_rooms`
  ADD COLUMN `floor` INT NULL AFTER `status`,
  ADD COLUMN `area` DECIMAL(8,2) NULL AFTER `floor`,
  ADD COLUMN `expected_rent` INT NULL AFTER `area`;
