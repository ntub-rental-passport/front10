# 正式環境每天更新台電計畫性停電資料

## 問題

- `backend/routers/outage.py` 與每小時的 `backend/notifications/outage_reminders.py` 讀 `public/data/taipower-outage.json`。
- 正式環境由 `deploy.sh` 從開發機 rsync，不從 GitHub pull；`.github/workflows/update-taipower-outage.yml` 推到 GitHub 的資料到不了 VM。VM 上仍是 9/27 的資料。
- fastapi 容器把 `./public/data` 唯讀掛載，而且每次部署 rsync 都會用開發機的版本覆蓋它。

## 決定

**在 fastapi 容器既有的背景排程裡每天同步，寫到可寫的獨立掛載 `./data/outage`。**

理由：
- `deploy.sh` 的 rsync 有 `--exclude /data`，VM 的 `data/` 不會被部署覆蓋或刪除。
- 不需要在 VM 主機裝 Python／httpx，也不用 sudo 安裝 systemd unit；部署 fastapi 就生效。
- 排程開關沿用 `BACKGROUND_JOBS_ENABLED`，開發機預設不跑、不會打外部網站。fastapi 是單一 process（見 backend/Dockerfile 的說明），不會重複下載。
- fastapi 在 `frontend_net`，可以連外。

**刪除 `.github/workflows/update-taipower-outage.yml`**：正式資料改由 VM 自己產生，workflow 每天往 main 推 bot commit 只會讓開發機的 main 落後、造成衝突，對正式環境沒有作用。repo 裡的 `public/data/taipower-outage*.json` 保留，當作「VM 尚未同步成功」時的種子資料。

## 實作

1. **把下載邏輯搬進後端**：新增 `backend/notifications/taipower_sync.py`（或同等位置，fastapi 映像只 COPY `backend/`），內容是現在 `scripts/fetch_taipower_outage.py` 的解析與下載邏輯。
   - `sync(output_dir: Path, verbose=False) -> int`：下載、正規化、寫入 `output_dir/taipower-outage.json` 與 `output_dir/taipower-outage-source.json`。
   - **原子寫入**：先寫同目錄暫存檔再 `os.replace`，避免讀到寫一半的 JSON。先寫資料檔、再寫 source 檔。
   - **失敗不覆蓋**：下載或解析失敗、或結果 0 筆時拋例外，不動既有檔案（沿用原 workflow 的「至少一筆」驗證）。
   - `scripts/fetch_taipower_outage.py` 改成薄包裝：import 後端模組，預設寫到 `public/data/`（維持開發機手動執行的行為與 REPORT 輸出），不要留兩份解析邏輯。

2. **資料路徑**：新增環境變數 `OUTAGE_DATA_DIR`。
   - `outage.py` 讀取順序：`OUTAGE_DATA_DIR/taipower-outage.json` 存在就用它；否則退回 `public/data/taipower-outage.json`（種子）。source 檔跟著同一個目錄選。
   - `_power_cache` 目前只用 mtime 判斷，改成以 (路徑, mtime) 判斷，從種子切到新檔時才會重讀。
   - 未設定 `OUTAGE_DATA_DIR` 時行為與現在完全相同（開發機）。

3. **排程**：在 `backend/main.py` 的 `reminders_loop` 加一個獨立 try/except 的每日同步（風格比照其他排程）。
   - 判斷「需要同步」：`OUTAGE_DATA_DIR` 有設定，且該目錄的 source 檔 `fetchedAt` 不存在或距今超過 24 小時 → 同步。這讓第一次部署後立刻補上資料，之後每天一次；重啟容器不會重複下載。
   - 失敗時記 warning，下一次檢查間隔不要每 20 秒狂打：失敗後至少隔 1 小時再試（記在模組變數即可）。
   - 同步用 `asyncio.to_thread`，下載有 timeout，不能卡住其他派送。
   - 未設定 `OUTAGE_DATA_DIR` 時完全不同步。

4. **docker-compose.yml**（fastapi）：
   - `environment` 加 `OUTAGE_DATA_DIR: /app/outage-data`，附註說明為什麼不放 `public/data`（唯讀、會被部署覆蓋）。
   - `volumes` 加 `./data/outage:/app/outage-data`（可寫）。
   - 容器以 root 跑（python:3.12-slim 預設），docker 會自動建立主機目錄；deploy/README.md 補一行說明這個目錄是 VM 獨有資料。

5. **刪除** `.github/workflows/update-taipower-outage.yml`，並更新提到它或「每天下載」方式的文件／docstring（`outage.py` 開頭、script docstring）。

## 測試（不打真實網路）

- `taipower_sync.sync`：用假的 httpx 回應（monkeypatch）驗證原子寫入與欄位；0 筆或例外時既有檔案不變。
- `outage.py`：設定 `OUTAGE_DATA_DIR` 且檔案存在時讀新檔；不存在時退回種子；從種子切到新檔時快取會更新。
- 排程判斷函式：fetchedAt 缺少／超過 24 小時→需要；24 小時內→不需要；剛失敗→1 小時內不重試；未設定 `OUTAGE_DATA_DIR`→不需要。
- 既有 `backend/tests/test_outage_reminders.py`、`test_outage_tls.py`、`test_background_jobs.py` 全過。

## 完成標準

- 部署後 VM 的 `~/rentmate/data/outage/taipower-outage-source.json` 的 `fetchedAt` 是當天，之後每天更新。
- 再跑一次 `./deploy.sh fastapi` 不影響 `data/outage/`。
- `/api/outage/notices` 與 `outage_reminders` 讀到新資料。
