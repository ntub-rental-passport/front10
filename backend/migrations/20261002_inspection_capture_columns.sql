-- 點交照片補兩個欄位：怎麼拍的、畫質如何
-- ==================================================================
-- models.py 已經有 capture_source 與 capture_quality（組員加的），但 database.sql
-- 與實際的資料庫都沒有，後端啟動時的資料表檢查會擋下來。
--
-- VM 的容器資料庫一直沒出問題，是因為它跑的是還沒用到這兩個欄位的舊版後端；
-- 2026-10-02 換成學校的資料庫、同時換上新程式，才顯現出來。
--
-- 既有資料一律當成「從檔案選的」：那是改版前唯一的來源。

ALTER TABLE `inspection_records`
  ADD COLUMN `capture_source` ENUM('camera','file') NOT NULL DEFAULT 'file' AFTER `photo_url`,
  ADD COLUMN `capture_quality` JSON DEFAULT NULL AFTER `capture_source`;
