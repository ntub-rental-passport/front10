#!/usr/bin/env bash
#
# 將 ufw 的 80/443 限制為「只接受 Cloudflare 來源」
#
# 目的：目前任何人只要知道源站 IP（140.131.114.157）就能直連，
#       完全繞過 Cloudflare 的 DDoS 防護、WAF 與快取。
#       此腳本讓源站只接受來自 Cloudflare 節點的流量，使防護無法被繞過。
#
# 執行方式（在 VM 上）：
#   sudo bash ~/rentmate/deploy/restrict-to-cloudflare.sh
#
# 復原方式（若要恢復任何來源皆可連）：
#   sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
#
# 注意事項：
#   - SSH（22 埠）完全不受影響，不會把自己鎖在門外
#   - 執行後若關閉 Cloudflare 橘雲代理，網站將無法連線（需先執行上方復原指令）
#   - Let's Encrypt 續期不受影響：DNS 指向 Cloudflare，驗證請求由 Cloudflare 轉發而來

set -euo pipefail

echo "=========================================="
echo " 限制源站只接受 Cloudflare 流量"
echo "=========================================="
echo

# ---------- 步驟 1：取得 Cloudflare 官方 IP 清單 ----------
# 不寫死 IP 段，每次執行都抓最新的官方清單，避免 Cloudflare 調整網段後失效
echo "[1/4] 取得 Cloudflare 官方 IP 清單..."
CF_V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4 || true)
CF_V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6 || true)

# 安全檢查：抓不到清單就中止。若在此狀態下刪除既有放行規則，
# 會導致所有人（包含 Cloudflare）都連不進來，網站完全中斷。
if [ -z "$CF_V4" ]; then
    echo "❌ 無法取得 Cloudflare IPv4 清單，為避免網站中斷，中止執行。"
    echo "   請檢查網路連線後重試。"
    exit 1
fi

V4_COUNT=$(echo "$CF_V4" | grep -c . || echo 0)
V6_COUNT=$(echo "$CF_V6" | grep -c . || echo 0)
echo "    取得 IPv4 網段 ${V4_COUNT} 筆、IPv6 網段 ${V6_COUNT} 筆"
echo

# ---------- 步驟 2：確認 SSH 規則存在 ----------
# 防呆：確保 22 埠仍可連線，避免任何意外導致無法遠端管理
echo "[2/4] 確認 SSH 存取規則..."
if ufw status | grep -qE "^22/tcp\s+ALLOW"; then
    echo "    ✅ SSH（22/tcp）放行規則存在"
else
    echo "    ⚠️  未偵測到 22/tcp 放行規則，先補上以免失去遠端連線"
    ufw allow 22/tcp
fi
echo

# ---------- 步驟 3：新增 Cloudflare 放行規則 ----------
# 先「加」再「刪」：這個順序確保過程中網站不會有無法連線的空窗期
echo "[3/4] 新增 Cloudflare 來源放行規則..."
for ip in $CF_V4 $CF_V6; do
    [ -z "$ip" ] && continue
    ufw allow from "$ip" to any port 80,443 proto tcp comment 'Cloudflare' >/dev/null
    echo "    + $ip"
done
echo

# ---------- 步驟 4：移除原本「任何來源皆可」的規則 ----------
echo "[4/4] 移除原本開放給所有來源的 80/443 規則..."
ufw delete allow 80/tcp  >/dev/null 2>&1 || echo "    （80/tcp 通用規則不存在，略過）"
ufw delete allow 443/tcp >/dev/null 2>&1 || echo "    （443/tcp 通用規則不存在，略過）"
echo

echo "=========================================="
echo " 完成，目前的防火牆規則："
echo "=========================================="
ufw status numbered

cat <<'EOF'

------------------------------------------------------------
驗證方式（在自己的電腦上執行）：

  # 直連源站 —— 應該逾時或連線被拒
  curl -sS --resolve rentmate.software:443:140.131.114.157 \
       --max-time 15 https://rentmate.software

  # 走網域（經 Cloudflare）—— 應正常回應 200
  curl -s -o /dev/null -w "%{http_code}\n" https://rentmate.software

若要復原（恢復任何來源皆可直連）：

  sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
------------------------------------------------------------
EOF
