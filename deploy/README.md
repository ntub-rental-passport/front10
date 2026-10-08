# RentMate 學校 VM 部署指南

> 架構：`web (Nginx:80/443)` → `fastapi:8000` / `ocr:8787`；FastAPI 連學校 MySQL，法規檢索使用 `rag:8000`，生成模型使用 NVIDIA NIM，失敗時退回 `ollama:11434`。
> 網段隔離：RAG 檢索服務與 Ollama 在 `internal: true` 的 internal；mysql 在 backend_net，只供 rollback，**不對外、不可連外**；
> 對外只有 web 容器的 80（P2 加 TLS 後為 443）。

## 一、VM 初始設定（Ubuntu，一次性）

```bash
# 安裝 Docker（官方 script）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 重新登入 SSH 後生效

# 防火牆：預設全擋，只開 SSH + Web
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 二、部署程式碼與機密

```bash
# 資安變更不進 GitHub，程式碼用 rsync 從本機直接上傳（在本機專案根目錄執行）：
rsync -avz --delete \
  --exclude node_modules --exclude dist --exclude .venv --exclude .git \
  --exclude logs --exclude /data --exclude '__pycache__' \
  ./ <user>@<VM_IP>:~/rentmate/

# .env 與金鑰被 rsync 一併傳上去了（它們只被 .gitignore/.dockerignore 排除），
# 上 VM 後記得把 .env 改成正式環境的值（見下表）
```

`.env` 上 VM 後必須修改／確認的項目：

| 變數 | 值 |
|------|-----|
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | 產生強密碼（`openssl rand -base64 24`） |
| `JWT_SECRET` | 與開發環境**不同**的新值（`openssl rand -hex 32`） |
| `GOOGLE_REDIRECT_URI` | `https://rentmate.software/api/auth/google/callback`（GCP console 也要加這條） |
| `FRONTEND_URL` | `https://rentmate.software` |
| `CORS_ORIGINS` | `https://rentmate.software`（拿掉 localhost） |
| `COOKIE_SECURE` | 上 TLS 後在 compose 或 .env 改 `true` |

## 三、啟動

```bash
docker compose up -d --build
docker compose ps          # web、fastapi、ocr、rag 應為 running / healthy；mysql 不會自動啟動
docker compose logs -f     # 看啟動紀錄
```

資料表由 FastAPI 啟動時依 `models.py` 自動建立（`Base.metadata.create_all`）。

## 四、部署後驗證（蒐證用）

```bash
# 1. 網段隔離：從「校外」機器掃描，只有 80(/443) 應為 open
nmap -p 22,80,443,3306,8000,8787 <VM公網IP>

# 2. 未登入打受保護端點，全部應 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://<VM公網IP>/api/contract/analyze \
  -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://<VM公網IP>/api/ocr

# 3. 確認 RAG 檢索服務只在 internal 網段，該網段 Internal 應為 true
docker network inspect "$(docker inspect "$(docker compose ps -q rag)" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')" --format '{{.Internal}}'
```

## 五、RAG 檢索服務

正式環境 VM 的 `.env` 設定 `EMBEDDING_PROVIDER="local"`，只使用 `rag` 提供的
`shibing624/text2vec-base-chinese` embedding；NVIDIA embedding 不用於正式環境。模型在映像建置時下載並包進映像，執行時使用離線快取。
若 RAG 連不上，檢索會退回把全部 29 塊法規放進 prompt。
容器只接 internal 私有網段、不開主機 port，資源限制為 1 GB RAM / 1 CPU、單一 worker。
在 FastAPI 容器內確認健康狀態：

```bash
docker compose exec fastapi python -c "import httpx; print(httpx.get('http://rag:8000/health').json())"
```

### Ollama 備援

正式環境只在 NVIDIA NIM 失敗時使用 Ollama，VM 設定 `OLLAMA_MODEL="qwen2.5:3b"`。
4 vCPU、無 GPU 的 2026-10-07 實測：Law Chat 約 7–29 秒，可用；合約分析約 265 秒，超過
Cloudflare 100 秒 origin timeout，使用者會收到 524，實際上無法完成。這是展示用備援，效能很差；
若兩個 provider 都失敗，API 回傳 503，絕不回傳預設的分析內容。

首次下載模型：

```bash
docker compose run --rm -e OLLAMA_PULL_MODEL=qwen2.5:3b ollama-pull
```

切換模型時先 pull 新模型，再修改 VM `.env` 的 `OLLAMA_MODEL`，最後執行
`docker compose up -d fastapi`。

不影響使用者地測試備援：

```bash
docker compose exec -e LLM_PROVIDER_ORDER=ollama fastapi python scripts/check_llm.py --chat
```

`mysql` 自 2026-10-07 起只供回退：
先執行 `docker compose --profile rollback up -d mysql`，再把 compose 的 `DATABASE_URL`
改回 `@mysql:3306` 並在本機執行 `./deploy.sh fastapi`；原本的 mysql volume 與 backend_net 都保留。

桌機代理已移除；`llm.` 的 Cloudflare Tunnel 與 Access service token **必須到 Cloudflare
dashboard 手動撤銷**，刪除程式碼不會替你關掉雲端設定。

## 六、更新部署

⚠️ **第一次之後的 rsync 一定要加 `--exclude .env`**，否則會用開發機的 .env
覆蓋掉 VM 上的正式金鑰（MySQL 密碼會消失，compose 直接起不來）。

在本機執行：

```bash
rsync -avz --delete --exclude node_modules --exclude dist --exclude .venv --exclude .git --exclude logs --exclude /data --exclude '__pycache__' --exclude .env ./ rentmate@140.131.114.157:~/rentmate/
```

在 VM 執行：

```bash
cd ~/rentmate && docker compose up -d --build
```

## 七、TLS 啟用（網域到手後）

```bash
# 0. 前提：網域 DNS A 紀錄指向 VM 公網 IP，且 http://rentmate.software 已可連到本站

# 1. 首次簽發憑證（HTTP-01 webroot 驗證，nginx.conf 已預留 acme 路徑）
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d rentmate.software --email <你的信箱> --agree-tos --no-eff-email

# 2. 套用 TLS 設定：把 deploy/nginx-tls.conf.example 內容覆蓋到 deploy/nginx.conf
#    （全檔把 rentmate.example.me 換成你的網域）

# 3. Cookie 加上 Secure 旗標：compose 的 fastapi 服務 COOKIE_SECURE 改 "true"

# 4. 重建上線
docker compose up -d --build web fastapi

# 5. 續期排程（Let's Encrypt 憑證 90 天效期）
( crontab -l ; echo '0 3 * * 1 cd ~/rentmate && docker compose run --rm certbot renew && docker compose exec web nginx -s reload' ) | crontab -
```

注意：HSTS 先以 max-age=600 試跑幾天，確認全站 HTTPS 正常再改 31536000；
CSP 目前是 Report-Only，開瀏覽器 console 觀察一段時間沒有誤擋後，
把標頭名稱改成 `Content-Security-Policy` 轉正式。

## 八、P2 驗證與蒐證

```bash
# Rate limit 實測：連打登入端點，前幾次 401/422，之後開始 429（截圖放簡報）
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" \
  https://rentmate.software/api/auth/login -X POST -H "Content-Type: application/json" -d '{}'; done

# OCR 限流：每分鐘 5 次，連打第 8 次起應 429
for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://rentmate.software/api/ocr; done

# 安全標頭確認
curl -sI https://rentmate.software | grep -iE "x-frame|x-content|referrer|strict-transport|content-security|permissions"
```

線上掃描（截圖放簡報）：
- https://securityheaders.com —— 目標 A 以上
- https://www.ssllabs.com/ssltest/ —— 目標 A+

## 九、fail2ban（P3，VM 主機上安裝）

Nginx log 已由 compose 掛載到 `./logs/nginx/`，主機上的 fail2ban 直接讀取。

**設定一律用安裝腳本，不要手動改 `/etc/`**：`deploy.sh` 只 rsync 專案檔案、
不會碰 `/etc/`，手改的設定不會被同步，VM 重灌就沒了。

```bash
sudo bash ~/rentmate/deploy/install-fail2ban.sh
```

腳本會裝好 `jail.local`、互動詢問 Cloudflare Zone ID 與 API Token
（不收命令列參數，避免留在 shell 歷史）產生 `/etc/fail2ban/jail.d/cloudflare.local`
（權限 0600），先驗語法再重啟服務。

**兩個 jail 用不同的封鎖方式，這是刻意的**：

| jail | action | 理由 |
|------|--------|------|
| `nginx-limit-req` | `cloudflare-token` | 流量經 Cloudflare 進來，封包來源永遠是 CF 節點，主機層封鎖打不到真正的攻擊者 |
| `sshd` | `nftables`（主機防火牆） | SSH 不經 Cloudflare，直連 VM 公網 IP，只有主機擋得住 |

把 Cloudflare action 放進 `[DEFAULT]` 會讓 sshd 也套用，SSH 防護會完全失效。

```bash
# 驗證與蒐證
sudo fail2ban-client status nginx-limit-req   # 看目前封鎖清單
sudo fail2ban-client status sshd

# 驗證封鎖／解封是否真的對 Cloudflare 生效（重點是解封）
sudo bash ~/rentmate/deploy/test-fail2ban-unban.sh

# Demo：從另一台機器狂打觸發 429 x10 → IP 被封 1 小時 → 截圖封鎖清單
```

⚠️ **`fail2ban-client unban` 回報成功不代表 Cloudflare 的規則被刪掉**，
它只代表「從 fail2ban 自己的清單移除」。`notes` 若含空白，解封時組出的
API 查詢字串會被截斷、刪不到規則，變成封鎖有效但解封默默失敗、規則永久累積。
唯一可信的驗證是直接去問 Cloudflare —— 上面那支測試腳本做的就是這件事。

log 輪替（避免 log 無限長大）：

```bash
sudo tee /etc/logrotate.d/rentmate-nginx << 'EOF'
/home/rentmate/rentmate/logs/nginx/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        docker compose -f /home/rentmate/rentmate/docker-compose.yml exec web nginx -s reopen
    endscript
}
EOF
```

## 每日異地備份（restic → Google Drive）

每天台北時間 03:00 執行，隨機延後最多 5 分鐘；VM 關機錯過的排程會在開機後補跑。
本機 `~/backups/rentmate-backup-<時間戳>.tar.gz` 保留最近 7 份，含 MySQL、後端 SQLite、
`.env`、`key/`、certbot 與主機設定紀錄。restic 另外把這些內容及**所有上傳檔**加密、
去除重複資料後存到 Google Drive，保留每日 7 份、每週 4 份、每月 3 份；每週日檢查儲存庫結構，
不下載全部資料做 `--read-data` 檢查。本機 tar.gz 不含上傳檔。

以下設定除筆電授權外，都以 VM 的 `rentmate` 使用者執行；不要用 root 建立 rclone 設定或密碼檔。

### 一次性設定

1. 建立專題專用的 Google 帳號，專門存放備份。先在 VM 安裝工具：

   ```bash
   sudo apt update
   sudo apt install restic
   curl https://rclone.org/install.sh | sudo bash
   ```

   Ubuntu apt 的 rclone 可能太舊，無法配合目前的 Google Drive 授權，故使用官方安裝腳本取得新版。

2. 在有瀏覽器、已安裝新版 rclone 的筆電執行（建議與 VM 使用相同版本）：

   ```bash
   rclone authorize "drive"
   ```

   瀏覽器登入剛建立的專用帳號並同意授權，保留回傳的完整 token JSON。
   回到 VM 執行：

   ```bash
   rclone config
   ```

   選 `n` 新增 remote → 名稱 `gdrive` → 類型 `drive` → client ID/secret 留空使用預設值 →
   scope 選完整 Drive 存取 → 進階設定選 `n` → 使用瀏覽器自動授權選 `n` → 在 `config_token`
   貼上筆電取得的完整 token → 不使用 Shared Drive → 儲存設定。token 留在 rclone 設定檔，不放進 repo。
   無瀏覽器授權步驟可對照 [rclone 官方說明](https://rclone.org/remote_setup/)。

3. 產生 restic 密碼（只做一次，已有密碼時不要覆蓋）：

   ```bash
   mkdir -p ~/.config/rentmate
   chmod 700 ~/.config/rentmate
   (umask 077; openssl rand -base64 32 > ~/.config/rentmate/restic-password)
   chmod 600 ~/.config/rentmate/restic-password
   ```

   **把密碼檔內容存進團隊共用密碼管理器，並／或由兩名組員各自保留一份；不能只留在 VM。
   沒有 restic 密碼，就算 Google Drive 的備份完整，也無法還原。**

4. 設定並初始化儲存庫（僅第一次執行 `restic init`）：

   ```bash
   export RESTIC_REPOSITORY=rclone:gdrive:rentmate-backup
   export RESTIC_PASSWORD_FILE="$HOME/.config/rentmate/restic-password"
   restic init
   ```

   腳本預設使用上述值。若要覆寫，可建立 `~/.config/rentmate/backup.env`，只放非機密設定：

   ```bash
   RESTIC_REPOSITORY=rclone:gdrive:rentmate-backup
   RESTIC_PASSWORD_FILE="$HOME/.config/rentmate/restic-password"
   ```

   手動操作 restic 時也要先 `source ~/.config/rentmate/backup.env`（若有建立），再
   `export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE`。密碼檔權限只接受 `600` 或 `400`。

5. 安裝並啟用每日排程，接著手動跑第一份：

   ```bash
   sudo cp ~/rentmate/deploy/rentmate-backup.{service,timer} /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now rentmate-backup.timer
   sudo systemctl start rentmate-backup.service
   journalctl -u rentmate-backup -n 50
   restic snapshots
   systemctl list-timers rentmate-backup.timer
   ```

   備份的 host 固定為 `rentmate-vm`、tag 為 `rentmate`。記錄寫入 journald；只有異地備份、保留清理
   與當天需要的檢查都成功後，才會原子更新 `~/rentmate/data/backup-status/last-success`（epoch 秒）。
   SQLite 匯出失敗時仍會備份其他內容，但異地備份執行以錯誤結束，不更新成功時間。
   fastapi 透過唯讀掛載讀取此檔；超過 26 小時未成功，後台監控會顯示紅色。
   手動與排程共用 `~/backups/.backup.lock`，已有備份執行時，新執行會以錯誤結束。

臨時只做本機備份可執行 `bash ~/rentmate/deploy/backup.sh --local-only`，不需 restic/rclone 或密碼檔，
也不會更新成功時間。還原與演練見 [RESTORE.md](RESTORE.md#情境-c從-google-driverestic還原)。

## 上傳檔目錄（data/uploads）

統一目錄為 `~/rentmate/data/uploads/{banners,inspection,repairs,contracts,reviews,subsidy}`。
以前上傳檔未納入備份；現在 restic 會備份 `data/uploads`，也會把仍存在的
`data/inspection-photos`、`data/repair-photos`、`data/banner-images` 一起備份並印出提示，搬移前後都適用。
部署使用 `rsync --delete` 時務必保留上面範例的 `--exclude /data`（開頭的 `/` 只排除根目錄的 data/，`public/data` 仍會同步），避免刪除 VM 上的上傳檔與備份成功紀錄。

先完成異地備份設定，再在 VM 做**一次性搬移**（目的目錄尚不存在；不存在的舊目錄可略過對應 `mv`）：

```bash
cd ~/rentmate
bash deploy/backup.sh                 # 確認成功才繼續；這次會先備份舊目錄
docker compose stop fastapi
mkdir -p data/uploads
mv data/inspection-photos data/uploads/inspection
mv data/repair-photos data/uploads/repairs
mv data/banner-images data/uploads/banners
mkdir -p data/uploads/{contracts,reviews,subsidy} data/backup-status
```

保持 fastapi 停止，把另外提供的新 `docker-compose.yml` 部署到 VM：以
`./data/uploads:/app/uploads` 取代三條舊掛載，六種上傳路徑改成 `/app/uploads/` 下對應目錄，
並掛載 `./data/backup-status:/app/backup-status:ro` 供監控使用。compose 由部署者另外處理，不在這次腳本變更內。

```bash
cd ~/rentmate
docker compose up -d --force-recreate fastapi
docker compose ps fastapi
bash deploy/backup.sh                 # 搬移後再留一份新目錄布局的快照
```

到網站抽查點交照片、報修照片及輪播圖都能載入，再上傳一個檔案確認落在 `data/uploads` 對應目錄。
