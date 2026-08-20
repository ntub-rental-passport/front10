#!/usr/bin/env bash
#
# RentMate 應用層完整備份
#
# 備份「git 裡沒有、無法從程式碼重建」的東西：
#   - MySQL 資料（使用者、註冊資料等）
#   - .env 正式環境金鑰
#   - key/ Google 憑證
#   - certbot 憑證 volume（可重簽，但備份省得重跑 ACME）
#
# 程式碼、Dockerfile、compose、nginx/fail2ban 設定都在 git，故不含在此。
#
# 用法（在 VM 上）：bash ~/rentmate/deploy/backup.sh
# 產出：~/backups/rentmate-backup-<時間戳>.tar.gz
#
# 還原見同目錄 RESTORE.md。

set -euo pipefail

cd "$(dirname "$0")/.."          # 專案根目錄
PROJECT_DIR="$(pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT="$HOME/backups"
WORK="$BACKUP_ROOT/rentmate-backup-$STAMP"
mkdir -p "$WORK/key" "$WORK/host"

echo "=========================================="
echo " RentMate 備份 → $WORK"
echo "=========================================="

# ---------- 1. MySQL 資料庫 ----------
# --single-transaction：對 InnoDB 做一致性快照，過程中不鎖表、不中斷服務
# 密碼透過容器環境變數取用，不出現在指令列
echo "[1/5] 匯出 MySQL 資料庫..."
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "115-RentMate"' \
  > "$WORK/db.sql"
echo "      $(wc -l < "$WORK/db.sql") 行、$(du -h "$WORK/db.sql" | cut -f1)"

# ---------- 2. 環境變數與金鑰 ----------
echo "[2/5] 複製 .env 與金鑰..."
cp "$PROJECT_DIR/.env" "$WORK/env"
cp "$PROJECT_DIR"/key/*.json "$WORK/key/" 2>/dev/null || true

# ---------- 3. certbot 憑證 volume ----------
# volume 內檔案為 root 擁有，透過臨時容器掛載讀取
echo "[3/5] 打包 TLS 憑證 volume..."
docker run --rm -v rentmate_certbot_conf:/src:ro -v "$WORK":/dst alpine \
  tar czf /dst/certbot_conf.tar.gz -C /src . 2>/dev/null
echo "      $(du -h "$WORK/certbot_conf.tar.gz" | cut -f1)"

# ---------- 4. 主機層設定（盡力而為，需要權限的部分可能略過）----------
echo "[4/5] 複製主機層設定..."
crontab -l > "$WORK/host/crontab.txt" 2>/dev/null || echo "（無 crontab 或無權限）" > "$WORK/host/crontab.txt"
# fail2ban 與 systemd 設定在 git deploy/ 內已有原始檔，此處僅記錄提示
cat > "$WORK/host/README.txt" <<'EOF'
主機層設定（fail2ban jail.local、systemd service、nginx.conf）的原始檔在
git 的 deploy/ 目錄，還原時重跑對應安裝步驟即可，不需從此備份取回。
ufw / iptables 規則同理，重跑 docker-cloudflare-only.sh 即可恢復。
crontab.txt 為當前的續期排程紀錄，供對照。
EOF

# ---------- 5. 打包 ----------
echo "[5/5] 壓縮打包..."
cat > "$WORK/MANIFEST.txt" <<EOF
RentMate 應用層備份
時間：$STAMP
主機：$(hostname)
內容：
  db.sql              MySQL 完整 dump（115-RentMate）
  env                 正式環境 .env（含 JWT_SECRET、MySQL 密碼、SMTP、OAuth）
  key/                Google Vision / OAuth 金鑰
  certbot_conf.tar.gz Let's Encrypt 憑證
  host/               主機設定提示與 crontab 紀錄
還原方式：見 deploy/RESTORE.md
EOF

tar czf "$BACKUP_ROOT/rentmate-backup-$STAMP.tar.gz" -C "$BACKUP_ROOT" "rentmate-backup-$STAMP"
rm -rf "$WORK"

echo "=========================================="
echo " 完成：$BACKUP_ROOT/rentmate-backup-$STAMP.tar.gz"
du -h "$BACKUP_ROOT/rentmate-backup-$STAMP.tar.gz"
echo "=========================================="
echo "⚠️  此檔含機密（金鑰、密碼），請下載到安全位置，勿放公開處。"