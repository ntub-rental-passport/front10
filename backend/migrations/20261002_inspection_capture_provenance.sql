-- 點交存證記錄照片來源與現場品質
-- ==================================================================
-- 原本 inspection_records 只存照片本身，看不出這張圖是當場用鏡頭拍的，
-- 還是從相簿挑的。SmartCaptureCamera 量到的亮度／清晰度／傾角算完就被丟掉，
-- 而檔案上傳那條路甚至回報寫死的滿分（brightness 128、sharpness 100、
-- isLevel true），讓相簿照片看起來比真實拍攝更完美。
--
-- capture_source 的預設值刻意是 'file' 而不是 'camera'：
-- 既有資料的真實來源已經無從得知，標成 'file' 會低估部分真的用鏡頭拍的照片，
-- 但永不高估任何一張照片的可信度。存證寧可保守。
--
-- capture_quality 裡的 isLevel 可以是 null，意思是「沒量到」而不是「不水平」——
-- iOS 要使用者授權 deviceorientation 才拿得到傾角，但亮度與清晰度不需要權限，
-- 所以只缺傾角時仍然會存下另外兩項。
--
-- ⚠️ MySQL 的 DDL 會隱含 commit，不會一起回滾。中途失敗時逐句補，
-- 不要整份重跑。

ALTER TABLE `inspection_records`
  ADD COLUMN `capture_source` ENUM('camera','file') NOT NULL DEFAULT 'file'
    COMMENT '照片來源：camera=現場鏡頭拍攝、file=檔案上傳或舊資料' AFTER `photo_url`,
  ADD COLUMN `capture_quality` JSON DEFAULT NULL
    COMMENT '現場拍攝量到的 brightness/sharpness/isLevel；檔案上傳為 NULL' AFTER `capture_source`;
