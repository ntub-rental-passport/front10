#!/usr/bin/env bash
#
# 安裝／更新 fail2ban 設定（在 VM 上執行）
#
#   sudo bash ~/rentmate/deploy/install-fail2ban.sh
#
# 為什麼需要這支腳本：deploy.sh 只 rsync 專案檔案，不會碰 /etc/。
# fail2ban 的設定住在 /etc/fail2ban/，所以它永遠不會被自動同步 ——
# 先前 Cloudflare 的 action 就是直接在 VM 上建的，repo 裡完全沒有紀錄，
# VM 一旦重灌就沒有任何地方記得它長什麼樣。這支腳本讓那份設定可以被重現。
#
# token 以互動方式輸入，不接受命令列參數 ——
# 寫在參數裡會留在 ~/.bash_history 與 ps 的行程列表中。
#
# 冪等：可重複執行。已存在的 Cloudflare 設定預設保留，除非你選擇覆寫。

set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
JAIL_DEST="/etc/fail2ban/jail.local"
CF_DEST="/etc/fail2ban/jail.d/cloudflare.local"

echo "=========================================="
echo " fail2ban 設定安裝"
echo "=========================================="
echo

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ 需要 root 權限，請用 sudo 執行。"
    exit 1
fi

if ! command -v fail2ban-client >/dev/null 2>&1; then
    echo "[0/4] 安裝 fail2ban..."
    apt-get install -y fail2ban
    echo
fi

# ---------- 1. 主設定 ----------
echo "[1/4] 安裝 jail.local..."
# 備份既有設定：這支腳本會覆寫，出錯時要有辦法還原
if [ -f "$JAIL_DEST" ] && ! cmp -s "$SRC/fail2ban/jail.local" "$JAIL_DEST"; then
    cp "$JAIL_DEST" "${JAIL_DEST}.bak.$(date +%Y%m%d%H%M%S)"
    echo "    （既有設定已備份為 ${JAIL_DEST}.bak.*）"
fi
cp "$SRC/fail2ban/jail.local" "$JAIL_DEST"
chmod 0644 "$JAIL_DEST"
echo "    ✅ $JAIL_DEST"
echo

# ---------- 2. Cloudflare action ----------
echo "[2/4] 設定 Cloudflare action..."
mkdir -p /etc/fail2ban/jail.d

WRITE_CF=1
if [ -f "$CF_DEST" ]; then
    echo "    $CF_DEST 已存在。"
    read -r -p "    要重新輸入 token 並覆寫嗎？(y/N) " reply
    [ "${reply,,}" = "y" ] || WRITE_CF=0
fi

if [ "$WRITE_CF" -eq 1 ]; then
    echo "    Zone ID：Cloudflare 後台 → 你的網域 → 概觀頁右下角"
    read -r -p "    Cloudflare Zone ID: " CF_ZONE
    echo "    API Token 需要「Zone → Firewall Services → Edit」權限，"
    echo "    且只授權這一個 zone（不要用 Global API Key）。"
    read -r -s -p "    Cloudflare API Token（不會顯示）: " CF_TOKEN
    echo

    if [ -z "$CF_ZONE" ] || [ -z "$CF_TOKEN" ]; then
        echo "    ❌ Zone ID 與 Token 都不能空白。"
        exit 1
    fi

    # 先寫再改權限會有一瞬間是 0644，其他使用者讀得到 token。
    # 先建立空檔、鎖權限，再寫入內容。
    install -m 0600 /dev/null "$CF_DEST"
    sed -e "s|REPLACE_WITH_ZONE_ID|${CF_ZONE}|" \
        -e "s|REPLACE_WITH_API_TOKEN|${CF_TOKEN}|" \
        "$SRC/fail2ban/jail.d/cloudflare.local.example" > "$CF_DEST"
    echo "    ✅ $CF_DEST（權限 0600）"
else
    echo "    保留既有設定。"
fi
echo

# ---------- 3. 檢查設定 ----------
# 先驗再重啟：設定有錯時 fail2ban 會起不來，等於防護整個消失
echo "[3/4] 檢查設定語法..."
if fail2ban-client --test >/dev/null 2>&1; then
    echo "    ✅ 設定正確"
else
    echo "    ❌ 設定有誤，未重啟服務（現有防護維持運作）："
    fail2ban-client --test 2>&1 | tail -10 | sed 's/^/       /'
    exit 1
fi
echo

# ---------- 4. 套用 ----------
# 用 restart 而非 enable --now：服務已在執行時，enable --now 不會重新讀設定
echo "[4/4] 重新啟動 fail2ban..."
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 3
echo

echo "=========================================="
echo " 目前狀態"
echo "=========================================="
fail2ban-client status
echo
echo "驗證封鎖與解封是否真的對 Cloudflare 生效："
echo "  sudo bash $SRC/test-fail2ban-unban.sh"
