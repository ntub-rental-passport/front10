# RentMate FastAPI 後端
FROM python:3.12-slim

WORKDIR /app

# 先複製依賴清單再安裝，讓 Docker layer cache 在程式碼變動時不用重裝套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# ⚠️ 刻意**不加** --workers。這不是漏掉的，是現在加上去會壞。
#
# 單一 process 的代價是真的：所有 Python 層的工作（SQLAlchemy 查詢、Pydantic
# 驗證、JWT 簽發、密碼雜湊）都被 GIL 串成一條線，一整班同時登入就會排隊。
# 但在下面這些狀態搬到共享儲存之前，多 worker 換來的是「隨機失敗」，
# 而隨機失敗比慢更難查、也更難對使用者解釋。
#
# ## 加了 --workers 會立刻壞掉的東西
#
# 多個 worker 是多個**獨立的 OS process**，各有一份自己的模組層變數。
# nginx 不做 sticky session，同一個使用者的連續兩個請求會落到不同 worker。
# 凡是「A 請求寫進記憶體、B 請求再讀出來」的設計都會隨機失敗：
#
#   backend/routers/auth.py          `_oauth_tickets`
#       GET  /api/auth/google/callback 用 _store_ticket() 把 Google 帳號資料
#       存進 dict，前端接著 POST /api/auth/google/session 交換 —— 兩個不同的
#       請求。落到不同 worker 就查不到票證，回 401「票證無效或已過期」。
#       以 2 個 worker 計，Google 登入約有一半的機率失敗。
#
#   backend/routers/landlord_tenants.py  `_import_previews`
#       /import/preview 發 preview_token、/import/confirm 再拿它取回預覽列。
#       同樣是跨請求，會隨機回「匯入預覽已失效，請重新選擇 CSV」。
#
#   backend/routers/lease_invitations.py `_code_attempts`
#       邀請碼的輸入次數上限（10 分鐘內 8 次）。計數分散在各 worker，
#       實際允許的次數變成 8 × worker 數 —— 不會報錯，但暴力猜碼的
#       防線被悄悄放寬，這種壞法比直接壞掉更糟。
#
#   backend/admin/metrics.py         `request_counter`
#       middleware 只數得到自己 process 的請求，後台 /api/admin/metrics
#       讀到的「近一小時錯誤率」只是其中一個 worker 的樣本。
#
#   backend/main.py                  lifespan 的 reminders_loop / monitor_loop
#       排程器跟著 app 啟動，每個 worker 都會跑一份：垃圾車提醒、房東收租與
#       合約到期通知會重複寄給同一個人，監控心跳與服務探測也會重複寫入。
#
# ## 不受影響的（已經在共享儲存裡，不用動）
#
#   管理員二階段驗證的挑戰碼走 pending_admin_logins 資料表
#   （backend/db/models.py 的 PendingAdminLogin），不是記憶體 ——
#   /admin/login 寫入、/admin/verify 讀取，兩邊都經過 DB，跨 process 沒問題。
#   AdminSession、PendingRegistration 同理。Google 註冊票證與 OAuth state
#   是 HMAC 簽章的無狀態字串，本來就不依賴伺服器端記憶體。
#   routers/garbage.py 的 `_cache`、routers/outage.py 的 `_power_cache`、
#   notifications/garbage_service.py 的 stops() lru_cache 都是唯讀資料快取，
#   每個 worker 各熱一份只是多花記憶體，不影響正確性。
#   common/upstream_state.py 的 `_down_until` 已在檔案裡說明是刻意每個
#   worker 各自學習。
#
# ## 要開多 worker 之前必須先做的事
#
#   1. `_oauth_tickets` 與 `_import_previews` 搬到共享儲存。兩者都是
#      「短命、有 TTL、單次取用」的資料，Redis 最合適；不想多一個元件的話，
#      比照 PendingAdminLogin 開一張有 expires_at 的表也可以。
#   2. `_code_attempts` 搬到共享儲存，否則速率限制等於失效。
#   3. `request_counter` 改成共享計數，或改讀 nginx access log。
#   4. main.py 的背景排程**只能有一個 process 跑**：拆成獨立的
#      scheduler 容器（建議，排程壞掉不會連帶影響 API），或靠環境變數
#      只讓其中一個 worker 啟動 lifespan 的迴圈。
#
# ## 搬完之後 worker 數怎麼決定
#
#   這裡的瓶頸是 CPU（argon2 與 Python 層的工作），不是 I/O 等待，
#   所以常見的 (2 × 核心數 + 1) 並不適用 —— 那是給 I/O 密集服務的。
#   以 worker 數 ≈ vCPU 數為起點（正式站 2 vCPU → --workers 2），
#   再用「一整班同時登入」的實際情境量牆鐘時間往上調。
#   每個 worker 是一份完整的 Python 記憶體映像，加上 argon2 每筆驗證
#   19 MiB 的峰值，調之前先確認 VM 的記憶體夠，否則第一個遇到的
#   不是變快而是 OOM kill。
#
# 容器內對所有介面監聽；對外仍只透過 nginx 反向代理進來（compose 不映射此 port）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
