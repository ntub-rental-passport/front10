#!/usr/bin/env bash
#
# 驗證 fail2ban 的封鎖與「解封」在 Cloudflare 上真的生效
#
#   sudo bash ~/rentmate/deploy/test-fail2ban-unban.sh
#
# 為什麼要專門測解封：
# 先前發現 unban 會失敗——傳給 Cloudflare API 的 notes 欄位是
# 「Fail2Ban nginx-limit-req」，含空白，組進 URL 查詢字串時被截斷，
# 於是找不到對應規則、刪不掉。封鎖看起來正常，解封卻默默失敗，
# 結果是規則永久累積，被誤判的使用者永遠進不來。
#
# ⚠️ 這正是「工具回報成功 ≠ 防護生效」的典型：
# fail2ban-client unban 會回 1（表示處理了一個 IP），
# 但那只代表它「從自己的清單移除」，不代表 Cloudflare 的規則被刪掉。
# 唯一可信的驗證是直接去問 Cloudflare。
#
# 測試用 IP 取自 RFC 5737 的 TEST-NET-2（198.51.100.0/24），
# 保留給文件與測試使用，不會是真實使用者。

set -uo pipefail

JAIL="nginx-limit-req"
TEST_IP="198.51.100.42"
CONF="/etc/fail2ban/jail.local"

echo "=========================================="
echo " fail2ban 封鎖／解封驗證"
echo "=========================================="
echo

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ 需要 root 權限，請用 sudo 執行。"
    exit 1
fi

# ---------- 步驟 1：取出 Cloudflare 認證 ----------
# 從 fail2ban 設定裡讀，不要求使用者手動貼 token（貼在指令列會留在 shell 歷史）
echo "[1/6] 讀取 Cloudflare 設定..."
CF_TOKEN=$(grep -ohE 'cftoken *= *"?[A-Za-z0-9_-]+' "$CONF" /etc/fail2ban/action.d/cloudflare-token.conf 2>/dev/null \
           | head -1 | sed -E 's/.*= *"?//')
CF_ZONE=$(grep -ohE 'cfzone *= *"?[A-Za-z0-9]+' "$CONF" /etc/fail2ban/action.d/cloudflare-token.conf 2>/dev/null \
          | head -1 | sed -E 's/.*= *"?//')

if [ -z "$CF_TOKEN" ] || [ -z "$CF_ZONE" ]; then
    echo "❌ 在設定檔裡找不到 cftoken / cfzone。"
    echo "   請確認 $CONF 的 jail 有類似這樣的設定："
    echo '     action = cloudflare-token[cftoken="...", cfzone="..."]'
    exit 1
fi
echo "    ✅ 已取得（zone ${CF_ZONE:0:6}…，token 不顯示）"
echo

cf_rules_for_ip() {
    curl -sS --max-time 20 \
        "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/firewall/access_rules/rules?configuration_value=${TEST_IP}" \
        -H "Authorization: Bearer ${CF_TOKEN}" \
        -H "Content-Type: application/json"
}

count_rules() {
    cf_rules_for_ip | grep -o '"id"' | grep -c . || true
}

# ---------- 步驟 2：確認起始狀態乾淨 ----------
echo "[2/6] 確認測試 IP 目前沒有殘留規則..."
BEFORE=$(count_rules)
echo "    Cloudflare 上 $TEST_IP 的規則數：$BEFORE"
if [ "$BEFORE" -ne 0 ]; then
    echo "    ⚠️  已有殘留規則——很可能就是先前解封失敗留下的。"
    echo "       本次測試仍會繼續，最後會一併清掉。"
fi
echo

# ---------- 步驟 3：封鎖 ----------
echo "[3/6] 對 $TEST_IP 執行封鎖..."
fail2ban-client set "$JAIL" banip "$TEST_IP" >/dev/null
sleep 4
AFTER_BAN=$(count_rules)
echo "    封鎖後 Cloudflare 規則數：$AFTER_BAN"
if [ "$AFTER_BAN" -gt "$BEFORE" ]; then
    echo "    ✅ 封鎖有真的寫進 Cloudflare"
else
    echo "    ❌ 封鎖沒有寫進 Cloudflare —— action 沒生效，請查 /var/log/fail2ban.log"
fi
echo

# ---------- 步驟 4：解封（本次測試的重點）----------
echo "[4/6] 執行解封..."
fail2ban-client set "$JAIL" unbanip "$TEST_IP" >/dev/null
sleep 4
AFTER_UNBAN=$(count_rules)
echo "    解封後 Cloudflare 規則數：$AFTER_UNBAN"
echo

# ---------- 步驟 5：判定 ----------
echo "[5/6] 判定..."
RESULT=1
if [ "$AFTER_BAN" -le "$BEFORE" ]; then
    echo "    ❌ 封鎖階段就沒生效，解封無從驗證"
elif [ "$AFTER_UNBAN" -lt "$AFTER_BAN" ]; then
    echo "    ✅ 解封確實移除了 Cloudflare 規則 —— 修正生效"
    RESULT=0
else
    echo "    ❌ 解封沒有移除規則 —— notes 欄位的問題還在"
    echo "       檢查 /etc/fail2ban/action.d/cloudflare-token.conf 裡的 notes"
    echo "       必須是不含空白的字串（例如 fail2ban-nginx）"
    echo "       相關 log："
    tail -20 /var/log/fail2ban.log | grep -i "cloudflare\|unban" | tail -5 | sed 's/^/         /'
fi
echo

# ---------- 步驟 6：清理 ----------
# 測試不能留下痕跡：殘留規則會讓下次測試的起始數字不為 0，
# 也可能讓人誤以為那是真實攻擊者的封鎖紀錄。
echo "[6/6] 清理測試殘留..."
LEFT=$(count_rules)
if [ "$LEFT" -eq 0 ]; then
    echo "    ✅ 無殘留"
else
    echo "    清除 $LEFT 筆殘留規則..."
    for id in $(cf_rules_for_ip | grep -oE '"id" *: *"[a-f0-9]+"' | sed -E 's/.*"([a-f0-9]+)"$/\1/'); do
        curl -sS --max-time 20 -X DELETE \
            "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/firewall/access_rules/rules/${id}" \
            -H "Authorization: Bearer ${CF_TOKEN}" >/dev/null
        echo "      已刪除 $id"
    done
fi
fail2ban-client set "$JAIL" unbanip "$TEST_IP" >/dev/null 2>&1 || true

echo
echo "=========================================="
[ "$RESULT" -eq 0 ] && echo " 結果：通過 ✅" || echo " 結果：未通過 ❌"
echo "=========================================="
exit "$RESULT"
