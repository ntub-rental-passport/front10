# RentMate 災難還原指南

> 適用情境：系統被打壞、容器毀損、資料庫損毀、或整台 VM 重建。
> 前提：有一份 `backup.sh` 產出的 `rentmate-backup-<時間戳>.tar.gz`。

## 還原全貌

需要三個來源才能完整還原：

| 來源 | 提供什麼 |
|------|---------|
| **git repo**（本機 `teddy-dev` 分支） | 程式碼、Dockerfile、compose、nginx/fail2ban 設定 |
| **備份 tar.gz** | 資料庫、`.env` 金鑰、Vision 憑證、TLS 憑證 |
| **本指南** | 把兩者組回可運行系統的步驟 |

---

## 情境 A：容器/資料壞了，VM 還在

```bash
cd ~/rentmate

# 1. 停掉並清除毀損的容器與資料 volume
docker compose down -v          # -v 會刪除 volume，確定要還原才下

# 2. 解開備份
tar xzf rentmate-backup-<時間戳>.tar.gz
cd rentmate-backup-<時間戳>

# 3. 還原 .env 與金鑰
cp env ~/rentmate/.env
cp key/*.json ~/rentmate/key/

# 4. 先起 MySQL，等它 healthy
cd ~/rentmate && docker compose up -d mysql
until docker compose exec -T mysql mysqladmin ping -uroot -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d'"' -f2)" 2>/dev/null | grep -q alive; do sleep 2; done

# 5. 灌回資料庫
docker compose exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "115-RentMate"' \
  < rentmate-backup-<時間戳>/db.sql

# 6. 還原 TLS 憑證
docker run --rm -v rentmate_certbot_conf:/dst \
  -v "$PWD/rentmate-backup-<時間戳>":/src alpine \
  sh -c 'tar xzf /src/certbot_conf.tar.gz -C /dst'

# 7. 起全部
docker compose up -d --build
```

---

## 情境 B：整台 VM 重建（最壞情況）

```bash
# 1. 裝 Docker（新 VM）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 重新登入生效

# 2. 從本機把程式碼 rsync 上來（git 不含機密，故用 rsync）
#    在本機執行：
#    rsync -avz --exclude node_modules --exclude .git ... ./ user@新IP:~/rentmate/

# 3. 之後同情境 A 的步驟 2～7

# 4. 主機層防護全部重建（原始檔都在 deploy/）
sudo apt install -y fail2ban
sudo cp ~/rentmate/deploy/fail2ban/jail.local /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
sudo cp ~/rentmate/deploy/rentmate-cloudflare-only.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rentmate-cloudflare-only.service
sudo ufw default deny incoming && sudo ufw allow 22,80,443/tcp && sudo ufw enable

# 5. 續期排程（見 host/crontab.txt 對照）
( crontab -l 2>/dev/null; echo '0 3 * * 1 cd ~/rentmate && docker compose run --rm certbot renew --quiet && docker compose exec -T web nginx -s reload' ) | crontab -

# 6. 若換了 IP：更新 DNS A 紀錄指向新 IP（憑證涵蓋網域不變，直接沿用備份的憑證）
```

---

## 驗證還原成功

```bash
# 容器
docker compose ps                          # 四個都 running、mysql healthy
# 資料
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT COUNT(*) FROM \`115-RentMate\`.users"'
# 網站
curl -s -o /dev/null -w "%{http_code}\n" https://rentmate.software   # 200
# 防護
curl --resolve rentmate.software:443:<源站IP> --max-time 10 https://rentmate.software  # 應逾時
```
