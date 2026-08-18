# RentMate 學校 VM 部署指南

> 架構：`web (Nginx:80/443)` → `fastapi:8000` / `ocr:8787` → `mysql:3306`
> 網段隔離：mysql 在 `internal: true` 的 backend_net，**不對外、不可連外**；
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
git clone <repo網址> rentmate && cd rentmate

# 機密檔案不在 git 裡，需另外傳上來（在本機執行）：
#   scp .env key/vision-key.json <user>@<VM_IP>:~/rentmate/...
```

`.env` 上 VM 後必須修改／確認的項目：

| 變數 | 值 |
|------|-----|
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | 產生強密碼（`openssl rand -base64 24`） |
| `JWT_SECRET` | 與開發環境**不同**的新值（`openssl rand -hex 32`） |
| `GOOGLE_REDIRECT_URI` | `https://<網域>/api/auth/google/callback`（GCP console 也要加這條） |
| `FRONTEND_URL` | `https://<網域>` |
| `CORS_ORIGINS` | `https://<網域>`（拿掉 localhost） |
| `COOKIE_SECURE` | 上 TLS 後在 compose 或 .env 改 `true` |

## 三、啟動

```bash
docker compose up -d --build
docker compose ps          # 四個服務都應為 running / healthy
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

# 3. 容器內確認 mysql 連不到外網（backend_net internal 生效）
docker compose exec mysql getent hosts google.com || echo "mysql 無法對外解析（正確）"
```

## 五、Ollama（選配）

`gemma3:4b` 需要約 4GB RAM。VM 資源夠的話直接裝在主機：

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma3:4b
```

容器透過 `host.docker.internal` 連主機的 11434（compose 已設定）。
沒裝 Ollama 系統也能跑：合約分析自動退回內建規則比對結果。

## 六、更新部署

```bash
git pull
docker compose up -d --build   # 只重建有變動的 image
```
