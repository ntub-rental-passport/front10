-- 依功能記錄 NVIDIA 呼叫；預設值保留既有 Vision 資料，並讓舊版省略新欄位時仍可寫入。
ALTER TABLE `daily_usage`
  ADD COLUMN `feature` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `failed` INT NOT NULL DEFAULT 0,
  ADD COLUMN `prompt_tokens` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `completion_tokens` BIGINT NOT NULL DEFAULT 0,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`date`, `provider`, `feature`);
