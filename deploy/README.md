# RentMate 學校 VM 部署指南

> 架構：`web (Nginx:80/443)` → `fastapi:8000` / `ocr:8787`；FastAPI 連學校 MySQL，AI 備援走 `ollama:11434` / `rag:8000`。
> 網段隔離：AI 備援在 `internal: true` 的 internal；mysql 在 backend_net，只供 rollback，**不對外、不可連外**；
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
  --exclude logs --exclude '__pycache__' \
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
docker compose ps          # web、fastapi、ocr、ollama、rag 應為 running / healthy；mysql 不會自動啟動
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

# 3. 確認 AI 備援只在 internal 網段，該網段 Internal 應為 true
docker network inspect "$(docker inspect "$(docker compose ps -q rag)" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}')" --format '{{.Internal}}'
```

## 五、Ollama / RAG 容器備援

2026-10-07 起備援搬到學校 VM：`ollama` 是官方 Ollama 容器，只在 NVIDIA NIM
失敗時接手生成（順序仍是 `nvidia,ollama`）；`rag` 是 CPU embedding 服務，使用
`shibing624/text2vec-base-chinese`（順序仍是 `nvidia,local`）。兩者只接 internal
私有網段、不開主機 port、執行時不可連外。RAG 模型在映像建置時下載，執行時使用離線快取。

首次上線，在 VM 專案根目錄先用可連外的一次性容器下載模型，再啟動服務：

```bash
docker compose run --rm -e OLLAMA_PULL_MODEL=gemma3:4b ollama-pull
docker compose up -d --build ollama rag fastapi
```

模型存在 `ollama_models` volume，重建容器不會重抓。切換生成模型時，先在 VM 執行
`docker compose run --rm -e OLLAMA_PULL_MODEL=<新模型> ollama-pull`，再把 VM `.env` 的
`OLLAMA_MODEL` 改成同一個名稱，最後在本機執行 `./deploy.sh fastapi`。
容器 URL 已在 compose 固定為 `http://ollama:11434` / `http://rag:8000`；
VM `.env` 即使留下 `OLLAMA_URL=http://127.0.0.1:11434` 也不會覆蓋它。
VM `.env` 須設 `OLLAMA_OCR_ENABLED=false`，停用 OCR 的 Ollama 欄位複核；
要恢復需讓 OCR 接 internal 網段並準備 vision 模型。

VM 沒有 GPU。Ollama 限 5 GB RAM / 3 CPU，context 8192 避免截掉長合約提示的開頭，
只載一個模型、一次處理一個請求（NIM 故障時其餘請求排隊），閒置 5 分鐘卸載模型釋放 RAM，
留一核給 web / FastAPI / OCR。RAG 限 1 GB RAM / 1 CPU、單一 worker。

在 VM 測試備援，環境變數只套用到這次診斷程序，線上後端仍維持原本 provider 順序：

```bash
# 不帶參數會分析腳本內的範例合約；--config 只列設定、--chat 則測對話。
docker compose exec -e LLM_PROVIDER_ORDER=ollama fastapi python scripts/check_llm.py
# 可選：確認 RAG 模型已載入
docker compose exec fastapi python -c "import httpx; print(httpx.get('http://rag:8000/health').json())"
```

診斷會共用 VM 的 CPU / RAM，請在低流量時執行。`mysql` 自 2026-10-07 起只供回退：
先執行 `docker compose --profile rollback up -d mysql`，再把 compose 的 `DATABASE_URL`
改回 `@mysql:3306` 並在本機執行 `./deploy.sh fastapi`；原本的 mysql volume 與 backend_net 都保留。

桌機代理已移除；`llm.` 的 Cloudflare Tunnel 與 Access service token **必須到 Cloudflare
dashboard 手動撤銷**，刪除程式碼不會替你關掉雲端設定。

## 六、更新部署

⚠️ **第一次之後的 rsync 一定要加 `--exclude .env`**，否則會用開發機的 .env
覆蓋掉 VM 上的正式金鑰（MySQL 密碼會消失，compose 直接起不來）。

在本機執行：

```bash
rsync -avz --delete --exclude node_modules --exclude dist --exclude .venv --exclude .git --exclude logs --exclude '__pycache__' --exclude .env ./ rentmate@140.131.114.157:~/rentmate/
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
