#!/usr/bin/env bash
#
# 限制「Docker 容器」的 80/443 只接受 Cloudflare 來源
#
# ── 為什麼需要這個腳本（ufw 為何無效）─────────────────────────
#
# ufw 的規則掛在 iptables 的 INPUT 鏈上，管的是「送到主機本身」的封包。
# 但 Docker 發布容器埠（ports: "80:80"）時，封包走的是
#     網卡 → DNAT → FORWARD 鏈 → 容器
# 這條路徑「完全不經過 INPUT」，因此 ufw 的規則對容器流量一律無效。
#
# 實測佐證：ufw status 顯示 22 筆 Cloudflare 規則、通用 80/443 已移除，
#          但直連源站 IP 仍可正常取得 HTTP 200。
#
# Docker 官方提供 DOCKER-USER 鏈供使用者掛自訂規則，
# 該鏈保證在 Docker 自身規則「之前」被檢查，是正確的下手位置。
#
# ── 規則設計 ────────────────────────────────────────────────
#
#   1. 已建立的連線直接放行（避免影響既有連線）
#   2. 來自 Cloudflare 網段、經外部網卡進入的 80/443 → 放行
#   3. 其餘經外部網卡進入的 80/443 → 丟棄
#
# 關鍵：規則一律加上 `-i ens3`（外部網卡）條件。
#      若省略此條件，規則會同時比對到「容器對外連線」的封包
#      （例如後端呼叫 Google API 走 443），導致容器無法連外。
#
# ── 使用方式 ────────────────────────────────────────────────
#
#   手動執行：sudo bash ~/rentmate/deploy/docker-cloudflare-only.sh
#   開機自動：見同目錄 rentmate-cloudflare-only.service
#
#   復原（恢復任何來源皆可直連）：
#     sudo iptables -F DOCKER-USER
#
# 本腳本可重複執行（會先清除自己先前加入的規則）。

set -euo pipefail

# 外部網路介面 —— 自動偵測，避免主機環境變動時失效
EXT_IF=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $5; exit}')
TAG="RENTMATE-CF"   # 規則標記，用於識別與清除本腳本加入的規則

echo "=========================================="
echo " 限制容器 80/443 只接受 Cloudflare 流量"
echo "=========================================="
echo "外部網路介面：${EXT_IF}"
echo

if [ -z "$EXT_IF" ]; then
    echo "❌ 無法偵測外部網路介面，中止執行。"
    exit 1
fi

# ---------- 步驟 1：取得 Cloudflare 官方 IP 清單 ----------
echo "[1/4] 取得 Cloudflare 官方 IP 清單..."
CF_V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4 || true)

# 安全檢查：抓不到清單就中止。
# 若在此狀態下仍加入 DROP 規則，會導致包含 Cloudflare 在內的所有流量被擋，網站完全中斷。
if [ -z "$CF_V4" ]; then
    echo "❌ 無法取得 Cloudflare IP 清單，為避免網站中斷，中止執行。"
    exit 1
fi
echo "    取得 $(echo "$CF_V4" | grep -c .) 筆網段"
echo

# ---------- 步驟 2：清除本腳本先前加入的規則（冪等性）----------
echo "[2/4] 清除先前的規則..."
# 由後往前刪，避免刪除過程中行號變動導致刪錯規則
REMOVED=0
for num in $(iptables -L DOCKER-USER --line-numbers -n 2>/dev/null \
             | grep "$TAG" | awk '{print $1}' | sort -rn); do
    iptables -D DOCKER-USER "$num"
    REMOVED=$((REMOVED + 1))
done
echo "    清除 ${REMOVED} 筆舊規則"
echo

# ---------- 步驟 3：加入放行規則 ----------
echo "[3/4] 加入放行規則..."

# 已建立／相關的連線直接放行，確保既有連線與回應封包不受影響
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED \
         -m comment --comment "$TAG" -j RETURN

# Cloudflare 各網段放行（RETURN 表示交回 FORWARD 鏈由 Docker 自身規則繼續處理）
for ip in $CF_V4; do
    [ -z "$ip" ] && continue
    iptables -A DOCKER-USER -i "$EXT_IF" -s "$ip" -p tcp \
             -m multiport --dports 80,443 \
             -m comment --comment "$TAG" -j RETURN
    echo "    + $ip"
done
echo

# ---------- 步驟 4：丟棄其餘外部來源 ----------
echo "[4/4] 丟棄其餘外部來源的 80/443 流量..."
iptables -A DOCKER-USER -i "$EXT_IF" -p tcp \
         -m multiport --dports 80,443 \
         -m comment --comment "$TAG" -j DROP
echo "    完成"
echo

echo "=========================================="
echo " 目前的 DOCKER-USER 規則："
echo "=========================================="
iptables -L DOCKER-USER -n --line-numbers

cat <<'EOF'

------------------------------------------------------------
驗證方式（在自己的電腦上執行）：

  # 直連源站 —— 應逾時（封包被 DROP，不會有回應）
  curl --resolve rentmate.software:443:140.131.114.157 \
       --max-time 10 https://rentmate.software

  # 走網域經 Cloudflare —— 應正常回應 200
  curl -s -o /dev/null -w "%{http_code}\n" https://rentmate.software

復原方式：
  sudo iptables -F DOCKER-USER
------------------------------------------------------------
EOF
