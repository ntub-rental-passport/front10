# 點交資料與影像比對

資料結構以 `backend/database.sql` 為準，ORM 與 API 依照其中的欄位、型別及外鍵實作。
本次沿用 `rentals`、`inspection_records`，並在同一份 SQL 中新增 `inspection_items` 儲存項目與比對結果。

點交頁使用登入租客擁有的 `rentals`，不再建立瀏覽器內的示範租屋處。
若 `rentals` 沒有該帳號的資料，清單會是空的；房東的 `landlord_leases` 不會自動轉成租客合約。

## 資料庫升級

在專案根目錄、使用後端相同的 `DATABASE_URL` 執行：

```powershell
python backend/migrations/create_inspection_items.py
python backend/schema_check.py
```

升級只新增 `inspection_items`，可重複執行，不刪除既有資料。新安裝可使用更新後的 `backend/database.sql`。
完成後重新啟動後端。舊 `rentmate-handover-store` 是未綁定帳號與真實租約的瀏覽器示範資料，
不會自動匯入；請選擇正確租約後重新建立項目及上傳照片。

## 儲存位置

- `inspection_items`：租約、房間、物品、目前入住／退租照片 ID、完整比對結果 JSON、照片版本。
- `inspection_records`：`check_in`／`check_out`、照片檔名、辨識結果 `vlm_result`、備註與伺服器 UTC 儲存時間。
- 照片：預設 `backend/uploads/inspection`，可透過 `INSPECTION_UPLOAD_DIR` 改成持久化磁碟。
  資料夾不公開提供靜態存取，讀取前驗證租約擁有者。API 回傳壓縮 JPEG 的 data URL。
  資料庫與照片資料夾需要一起備份。重拍／刪除後的舊照片檔暫時保留，不會出現在點交資料中。

既有獨立 `inspection_records` 不會猜測配對到新項目；此版本的新流程由項目明確連結照片。

## 分析流程

1. 上傳先儲存照片與紀錄，成功後才呼叫 `/api/inspection/analyze`。
2. 辨識需要 `NVIDIA_API_KEY`，失敗仍保留照片，頁面提供「重新辨識」。
3. 比對將入住照放左邊、退租照放右邊，合併為一張影像送至 VLM，兼容原本的單圖模型。
4. 儲存比對類型、差異摘要、模型主觀信心、時間及兩張來源照片 ID。
   影像不足以判斷時回傳 `uncertain`；信心值不是經校準的機率，也不代表責任歸屬。
5. 重拍／刪除照片會清除舊比對；分析期間若照片被其他頁面更換，回傳 409，不寫入過期結果。

預設模型為既有的 `meta/llama-3.2-11b-vision-instruct`，可由 `INSPECTION_VLM_MODEL` 設定。
本次不更動原有列印功能；退租頁的證據包匯出仍是既有示意功能。

## 驗證

```powershell
$env:PYTHONPATH = 'backend'
python -m unittest discover -s backend/tests -p test_inspection.py
python -m unittest discover -s backend/tests -p test_schema_v3.py
npm test -- src/composables/useHandover.test.ts
npm run build
```

自動測試以替身 VLM 驗證儲存、授權、重試及版本檢查，不呼叫付費外部服務。

實際部署資料庫與 NVIDIA VLM 的端到端驗證待部署環境測試；本機資料庫狀態不代表部署環境狀態。
