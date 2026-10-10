# RentMate 災難還原指南

> 適用情境：系統被打壞、容器毀損、資料庫損毀、或整台 VM 重建。
> 前提：有一份 `backup.sh` 產出的本機 `rentmate-backup-<時間戳>.tar.gz`，或 Google Drive 的 restic 快照與另存的 restic 密碼。

## 還原全貌

需要三個來源才能完整還原：

| 來源 | 提供什麼 |
|------|---------|
| **git repo**（本機 `teddy-dev` 分支） | 程式碼、Dockerfile、compose、nginx/fail2ban 設定 |
| **本機 tar.gz／restic 異地快照** | 資料庫（MySQL 與後端 SQLite）、`.env` 金鑰、Vision 憑證、TLS 憑證；**restic 另含所有上傳檔** |
| **本指南** | 把兩者組回可運行系統的步驟 |

以前排除的上傳檔現在已納入 restic 異地備份；本機 tar.gz 仍不含上傳檔，照片或附件遺失時請走情境 C。
舊郵件中的 `.gpg` 備份仍可用 `gpg -d rentmate-backup-<時間戳>.tar.gz.gpg > backup.tar.gz` 解密，需當時另外保存的 GPG 密碼。

---

## 情境 A：容器/資料壞了，VM 還在

```bash
cd ~/rentmate

# 1. 停掉並清除毀損的容器與資料 volume
docker compose down -v          # -v 會刪除 volume，確定要還原才下

# 2. 解開本機備份；若只有異地快照，改走情境 C
#    解到 ~/backups，不要解進 ~/rentmate：裡面有 .env 與 db.sql，放在專案目錄會進 Docker build context
tar xzf ~/backups/rentmate-backup-<時間戳>.tar.gz -C ~/backups
BACKUP_DIR="$HOME/backups/rentmate-backup-<時間戳>"
cd "$BACKUP_DIR"

# 3. 還原 .env 與金鑰
mkdir -p ~/rentmate/key
cp env ~/rentmate/.env
cp key/*.json ~/rentmate/key/

# 4. 先起 MySQL，等它 healthy
cd ~/rentmate && docker compose up -d mysql
until docker compose exec -T mysql mysqladmin ping -uroot -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d'"' -f2)" 2>/dev/null | grep -q alive; do sleep 2; done

# 5. 灌回資料庫
docker compose exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "115-RentMate"' \
  < "$BACKUP_DIR/db.sql"

# 6. 還原 TLS 憑證
docker run --rm -v rentmate_certbot_conf:/dst \
  -v "$BACKUP_DIR":/src alpine \
  sh -c 'tar xzf /src/certbot_conf.tar.gz -C /dst'

# 7. 還原後端 SQLite（稽核紀錄、平台設定、監控、排程通知、垃圾車提醒）
#    一定要在 fastapi 起來之前：服務一啟動就會建立空的新檔。
#    2026-09-28 以前的備份沒有 sqlite.tar，跳過這步。
mkdir -p data/garbage
tar xf "$BACKUP_DIR/sqlite.tar" -C data/garbage

# 8. 起全部
docker compose up -d --build

# 9. 確認服務正常後，刪掉解開的備份（含 .env、db.sql 等機密）
rm -rf "$BACKUP_DIR"
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

# 3. 本機 tar.gz 還在：同情境 A 的步驟 2～8
#    VM 上的備份也遺失：走情境 C，從 Google Drive 取回，包含上傳檔

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

# 7. 依 README「每日異地備份（restic → Google Drive）」重新安裝並啟用 timer
#    沿用原本的 restic 密碼與儲存庫，不要重新產生密碼或執行 restic init
```

---

## 情境 C：從 Google Drive（restic）還原

先依 [README 的一次性設定](README.md#每日異地備份restic--google-drive) 安裝 restic 與新版 rclone，
將專用 Google 帳號設定為 `gdrive`。從團隊密碼管理器取回**原本的 restic 密碼**，寫入
`~/.config/rentmate/restic-password` 並 `chmod 600`；這裡不要產生新密碼，也不要執行 `restic init`。
**沒有原本的 restic 密碼就無法還原。**

以 `rentmate` 使用者執行：

```bash
export RESTIC_REPOSITORY=rclone:gdrive:rentmate-backup
export RESTIC_PASSWORD_FILE="$HOME/.config/rentmate/restic-password"
if [ -f ~/.config/rentmate/backup.env ]; then
    source ~/.config/rentmate/backup.env
fi
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
restic snapshots
restic restore latest --target /tmp/rentmate-restore --host rentmate-vm --tag rentmate
```

要回到特定時間，可把 `latest` 換成 `restic snapshots` 列出的快照 ID。
備份使用絕對路徑，[restic 會在 target 下重建原路徑](https://restic.readthedocs.io/en/stable/050_restore.html)。
標準 VM 布局還原後如下（若原本 HOME 或專案路徑不同，依 `restic ls latest` 的實際路徑調整）：

| 原始內容 | `/tmp/rentmate-restore` 下的位置 |
|----------|----------------------------------|
| MySQL dump | `home/rentmate/backups/staging/db.sql` |
| `.env`、Google 金鑰 | `home/rentmate/backups/staging/env`、`home/rentmate/backups/staging/key/` |
| TLS 憑證、SQLite 快照 | `home/rentmate/backups/staging/certbot_conf.tar.gz`、`home/rentmate/backups/staging/sqlite.tar` |
| 主機提示、清單 | `home/rentmate/backups/staging/host/`、`home/rentmate/backups/staging/MANIFEST.txt` |
| 全部上傳檔 | `home/rentmate/rentmate/data/uploads/{banners,inspection,repairs,contracts,reviews,subsidy}/` |
| 搬移前的上傳檔（若該快照仍有） | `home/rentmate/rentmate/data/{inspection-photos,repair-photos,banner-images}/` |

### 還原上傳檔

先讓 fastapi 停止寫入，再把上傳檔放回去。下列指令適用已部署新 uploads 掛載的 compose；
若是在全新 VM、容器尚未啟動，可略過 `docker compose stop fastapi`。

```bash
cd ~/rentmate
docker compose stop fastapi
RESTORED_DATA=/tmp/rentmate-restore/home/rentmate/rentmate/data
mkdir -p data/uploads/{banners,inspection,repairs,contracts,reviews,subsidy} data/backup-status

# 舊目錄先對應到新名稱；同時有新舊目錄時，以新目錄的同名檔為準。
for mapping in inspection-photos:inspection repair-photos:repairs banner-images:banners; do
    old=${mapping%%:*}
    new=${mapping#*:}
    if [ -d "$RESTORED_DATA/$old" ]; then
        rsync -a "$RESTORED_DATA/$old/" "data/uploads/$new/"
    fi
done
if [ -d "$RESTORED_DATA/uploads" ]; then
    rsync -a "$RESTORED_DATA/uploads/" data/uploads/
fi

# 接著執行情境 A 步驟 3～8；BACKUP_DIR 讓後續匯入指令使用這份還原資料。
BACKUP_DIR=/tmp/rentmate-restore/home/rentmate/backups/staging
cd "$BACKUP_DIR"
```

完成情境 A 步驟 3～8 後，驗證照片、輪播圖與附件都能開啟。若是整台 VM 重建，還要做情境 B 的主機防護、
續期與 timer 設定。確認還原成功後才刪除 `/tmp/rentmate-restore`；不要自行建立 `last-success`，讓下一次完整備份更新。

## 還原演練

- [ ] 依情境 C 匯出 restic 環境設定並執行 `restic snapshots`，確認有近期的 `rentmate-vm` / `rentmate` 快照。
- [ ] 執行 `restic restore latest --target /tmp/rentmate-restore --host rentmate-vm --tag rentmate`，只還原到暫存目錄，不覆蓋正式資料。
- [ ] 執行 `test -s /tmp/rentmate-restore/home/rentmate/backups/staging/db.sql`，確認 MySQL dump 非空，並核對 `env`、`key/`、`certbot_conf.tar.gz`、`sqlite.tar` 是否齊全。
- [ ] 從還原的 `data/uploads`（或舊目錄）抽開幾張點交照片、報修照片及輪播圖，確認內容可讀。
- [ ] 記錄演練日期與快照 ID，確認後執行 `rm -rf /tmp/rentmate-restore`，清除含機密的暫存資料。

### 演練紀錄

| 日期 | 快照 | 結果 |
|------|------|------|
| 2026-10-08 | `43820a32` | 通過：db.sql 880 KB／65 張表、dump 結尾完整；env 與正式 .env 相同；key/、certbot、sqlite 齊全；點交 2 張、報修 7 張照片與正式檔案逐一比對相同。暫存目錄已刪除。 |

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
