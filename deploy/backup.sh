#!/usr/bin/env bash
#
# RentMate 應用層完整備份
#
# 備份「git 裡沒有、無法從程式碼重建」的東西：
#   - MySQL 資料（使用者、註冊資料等）
#   - 後端 SQLite（稽核紀錄、平台設定、監控事件、排程通知、垃圾車提醒；在 data/garbage/）
#   - .env 正式環境金鑰
#   - key/ Google 憑證
#   - certbot 憑證 volume（可重簽，但備份省得重跑 ACME）
#   - 所有上傳檔（由 restic 直接備份，不放進本機 tar.gz）
#
# 程式碼、Dockerfile、compose、nginx/fail2ban 設定都在 git，故不含在此。
#
# 用法（在 VM 上）：bash ~/rentmate/deploy/backup.sh
# 只做本機備份：bash ~/rentmate/deploy/backup.sh --local-only
# 產出：~/backups/rentmate-backup-<時間戳>.tar.gz
#
# 還原見同目錄 RESTORE.md。

set -euo pipefail

LOCAL_ONLY=false
if [ "$#" -eq 1 ] && [ "$1" = "--local-only" ]; then
    LOCAL_ONLY=true
elif [ "$#" -ne 0 ]; then
    echo "❌ 用法：bash deploy/backup.sh [--local-only]" >&2
    exit 1
fi

cd "$(dirname "$0")/.."          # 專案根目錄
PROJECT_DIR="$(pwd)"
BACKUP_ROOT="$HOME/backups"
STAGING="$BACKUP_ROOT/staging"

# 異地備份先驗設定，避免忙完一輪才發現工具或密碼沒備妥。
if [ "$LOCAL_ONLY" = false ]; then
    if [ -f "$HOME/.config/rentmate/backup.env" ]; then
        # shellcheck source=/dev/null
        . "$HOME/.config/rentmate/backup.env"
    fi
    export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-rclone:gdrive:rentmate-backup}"
    export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-$HOME/.config/rentmate/restic-password}"

    for tool in restic rclone; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "❌ 找不到 ${tool}；請依 deploy/README.md「每日異地備份（restic → Google Drive）」安裝並設定。" >&2
            exit 1
        fi
    done
    # 沿用既有的 Python 依賴，避免 GNU 與 BSD stat 的參數差異。
    if ! python3 - "$RESTIC_PASSWORD_FILE" <<'PYPASSWORD'
import pathlib
import stat
import sys

try:
    password_file = pathlib.Path(sys.argv[1])
    valid = password_file.is_file() and stat.S_IMODE(password_file.stat().st_mode) in (0o600, 0o400)
except OSError:
    valid = False
sys.exit(0 if valid else 1)
PYPASSWORD
    then
        echo "❌ restic 密碼檔不存在或權限不符（只接受 600 或 400）；請依 deploy/README.md「每日異地備份（restic → Google Drive）」建立密碼檔並 chmod 600。" >&2
        exit 1
    fi
fi

# 手動執行與每日排程共用鎖，拿到鎖後才能清理暫存。
mkdir -p "$BACKUP_ROOT"
exec 9> "$BACKUP_ROOT/.backup.lock"
if ! flock -n 9; then
    echo "❌ 已有備份正在執行，這次不重複執行。" >&2
    exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
WORK="$BACKUP_ROOT/rentmate-backup-$STAMP"
STATUS_TEMP=""
cleanup() {
    local result=$?
    rm -rf "$STAGING" "$WORK" || result=1
    if [ -n "$STATUS_TEMP" ]; then
        rm -f "$STATUS_TEMP" || result=1
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
rm -rf "$STAGING"
mkdir -p "$WORK/key" "$WORK/host"

# 讀 .env 供其他備份步驟使用；資料庫連線以 compose 的 fastapi 設定為準。
set -a
# shellcheck source=/dev/null
. "$PROJECT_DIR/.env"
set +a

echo "=========================================="
echo " RentMate 備份 → $WORK"
echo "=========================================="

# ---------- 1. MySQL 資料庫 ----------
# --single-transaction：對 InnoDB 做一致性快照，過程中不鎖表、不中斷服務
# 2026-10-02 起資料庫在學校的機器上。mysql 服務只在不能對外連線的
# backend_net；臨時客戶端要接 frontend_net 才能連到學校資料庫。
# .env 的 SCHOOL_DB_PASSWORD 可能與 compose 實際給 fastapi 的連線不同。
# 從 compose 取正式連線設定，密碼只經由程序環境傳給 mysqldump，不印出或寫進腳本。
# --no-tablespaces 避免一般資料庫帳號缺少 PROCESS 權限時匯出失敗。
echo "[1/5] 匯出 MySQL 資料庫..."
python3 - "$WORK/db.sql" <<'PYDB'
import json
import os
import subprocess
import sys
import urllib.parse

config = json.loads(subprocess.check_output(
    ["docker", "compose", "config", "--format", "json"], text=True,
))
url = urllib.parse.urlsplit(config["services"]["fastapi"]["environment"]["DATABASE_URL"])
database_name = urllib.parse.unquote(url.path.lstrip("/"))
if url.hostname != "140.131.114.242" or url.username != "rentmate" or database_name != "115-RentMate" or not url.password:
    raise SystemExit("正式資料庫連線設定不符合預期，停止備份")

env = os.environ.copy()
env["MYSQL_PWD"] = urllib.parse.unquote(url.password)
with open(sys.argv[1], "wb") as dump:
    subprocess.run(
        ["docker", "run", "--rm", "--network", "rentmate_frontend_net",
         "-e", "MYSQL_PWD", "mysql:8.4", "mysqldump",
         "-h", url.hostname, "-u", url.username,
         "--single-transaction", "--routines", "--triggers", "--no-tablespaces",
         database_name],
        env=env, stdout=dump, check=True,
    )
PYDB
echo "      $(wc -l < "$WORK/db.sql") 行、$(du -h "$WORK/db.sql" | cut -f1)"

# ---------- 1b. 後端 SQLite ----------
# 稽核紀錄、平台設定、監控事件、排程通知、垃圾車提醒是 fastapi 自己的 SQLite，
# 放在 data/garbage/（容器裡的 /app/var），不在 MySQL 裡，mysqldump 備不到。
# 在容器裡用 SQLite 的線上備份 API 複製：服務正在寫入也能拿到一致的快照；
# 直接 cp 寫到一半的檔案，可能備到一個打不開的資料庫。
# 這步失敗（例如 fastapi 沒在跑）先警告不中止 —— MySQL 與 .env 還是要備份，
# 但異地備份不算完整成功，最後不更新監控時間。
echo "      匯出後端 SQLite..."
SQLITE_OK=true
if docker compose exec -T fastapi python - > "$WORK/sqlite.tar" <<'PY'
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp, tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as archive:
    for source in sorted(Path("/app/var").glob("*.db")):
        copy = Path(tmp) / source.name
        src, dst = sqlite3.connect(source), sqlite3.connect(copy)
        src.backup(dst)
        src.close()
        dst.close()
        archive.add(copy, arcname=source.name)
PY
then
  echo "      $(tar tf "$WORK/sqlite.tar" | wc -l | tr -d ' ') 個 SQLite 檔、$(du -h "$WORK/sqlite.tar" | cut -f1)"
else
  SQLITE_OK=false
  rm -f "$WORK/sqlite.tar"
  echo "      ⚠️ 後端 SQLite 這次沒備份到（fastapi 容器沒在跑？），MySQL 與 .env 照常備份"
fi

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
  sqlite.tar          後端 SQLite：稽核紀錄、平台設定、監控、排程通知、垃圾車提醒
  env                 正式環境 .env（含 JWT_SECRET、MySQL 密碼、SMTP、OAuth）
  key/                Google Vision / OAuth 金鑰
  certbot_conf.tar.gz Let's Encrypt 憑證
  host/               主機設定提示與 crontab 紀錄
上傳檔：僅收錄於 restic 異地備份（data/uploads 與仍存在的舊上傳目錄），不在此 tar.gz。
還原方式：見 deploy/RESTORE.md
EOF

tar czf "$BACKUP_ROOT/rentmate-backup-$STAMP.tar.gz" -C "$BACKUP_ROOT" "rentmate-backup-$STAMP"
if [ "$LOCAL_ONLY" = false ]; then
    # 固定快照路徑，讓 restic 每次都能對照同一棵目錄樹。
    mv "$WORK" "$STAGING"
else
    rm -rf "$WORK"
fi

ARCHIVE="$BACKUP_ROOT/rentmate-backup-$STAMP.tar.gz"

echo "=========================================="
echo " 完成：$ARCHIVE"
du -h "$ARCHIVE"
echo "=========================================="

# ---------- 6. 保留最近 7 份，舊的自動刪除 ----------
echo "[6/7] 清理舊備份（保留最近 7 份）..."
# 檔名由上方固定格式產生，不含空白或換行，可沿用 ls 的時間排序。
# shellcheck disable=SC2012
ls -1t "$BACKUP_ROOT"/rentmate-backup-*.tar.gz 2>/dev/null | tail -n +8 | while read -r old; do
    rm -f "$old" && echo "    刪除 $(basename "$old")"
done
# shellcheck disable=SC2012
echo "    目前保留 $(ls -1 "$BACKUP_ROOT"/rentmate-backup-*.tar.gz 2>/dev/null | wc -l) 份"

# ---------- 7. restic 加密異地備份 ----------
if [ "$LOCAL_ONLY" = false ]; then
    echo "[7/7] 備份至 Google Drive..."
    SOURCES=("$STAGING")
    if [ -d "$PROJECT_DIR/data/uploads" ]; then
        SOURCES+=("$PROJECT_DIR/data/uploads")
    fi
    # 搬移前後都要收齊，避免舊目錄還有檔案卻漏備。
    for legacy in inspection-photos repair-photos banner-images; do
        if [ -d "$PROJECT_DIR/data/$legacy" ]; then
            echo "    發現舊上傳目錄 data/${legacy}，一併備份。"
            SOURCES+=("$PROJECT_DIR/data/$legacy")
        fi
    done
    restic backup --host rentmate-vm --tag rentmate "${SOURCES[@]}"
    restic forget --host rentmate-vm --tag rentmate --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune
    if [ "$(TZ=Asia/Taipei date +%u)" = 7 ]; then
        echo "    週日檢查 restic 儲存庫結構..."
        restic check
    fi
    if [ "$SQLITE_OK" = false ]; then
        echo "❌ 後端 SQLite 未備份成功，保留其他備份，但不更新成功時間。" >&2
        exit 1
    fi

    # 先清暫存，最後才更新成功時間；容器不會讀到寫了一半的數字。
    rm -rf "$STAGING"
    mkdir -p "$PROJECT_DIR/data/backup-status"
    STATUS_TEMP=$(mktemp "$PROJECT_DIR/data/backup-status/.last-success.XXXXXX")
    date +%s > "$STATUS_TEMP"
    chmod 644 "$STATUS_TEMP"
    mv "$STATUS_TEMP" "$PROJECT_DIR/data/backup-status/last-success"
    STATUS_TEMP=""
else
    echo "[7/7] 僅做本機備份，略過異地備份與成功時間更新。"
fi

echo "=========================================="
echo "⚠️  備份含機密（金鑰、密碼），勿放公開處。"
