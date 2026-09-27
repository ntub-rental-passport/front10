#!/usr/bin/env bash
#
# RentMate 一鍵部署（在你的 Mac 上執行）
#
#   ./deploy.sh              上傳程式碼並重建全部容器
#   ./deploy.sh web          只重建 web（改 nginx 設定時用）
#   ./deploy.sh fastapi ocr  只重建指定服務
#
# 為什麼不用 GitHub：資安相關設定（防火牆規則、fail2ban 門檻、CSP 白名單）
# 刻意不進版控雲端，故以 rsync 從本機直傳。

set -euo pipefail

VM="rentmate@140.131.114.157"
SRC="$(cd "$(dirname "$0")" && pwd)"
SERVICES="$*"

echo "=========================================="
echo " RentMate 部署 → $VM"
[ -n "$SERVICES" ] && echo " 指定服務：$SERVICES" || echo " 重建全部服務"
echo "=========================================="

# ---------- 1. 上傳程式碼 ----------
# ⚠️ --exclude .env 絕對不能拿掉：VM 上的 .env 是正式環境金鑰
#    （JWT_SECRET、MySQL 密碼與開發機不同），覆蓋掉會導致服務起不來、
#    且所有已登入使用者的 token 失效。
echo "[1/3] 上傳程式碼..."
#    --exclude desktop：那是桌機端代理，VM 不需要，而且它的 README
#    描述的是「怎麼連進家裡的網路」—— 沒有理由多放一份在別的機器上。
#    --exclude '*.db'：開發機的 SQLite（backend/ 底下的稽核、設定、監控紀錄）
#    不該上伺服器。正式環境的 SQLite 在 VM 的 data/garbage/，本機萬一出現
#    同名路徑，沒有這條就會直接蓋掉正式資料。
#    --exclude .gstack：瀏覽測試工具的 console／network log。
rsync -avz \
  --exclude node_modules --exclude dist --exclude .venv --exclude .git \
  --exclude logs --exclude '__pycache__' --exclude .env --exclude desktop \
  --exclude '*.db' --exclude '*.db-*' --exclude .gstack \
  "$SRC/" "$VM:~/rentmate/" | tail -3

# 上面的 rsync 不會刪檔：本機刪掉或改名的前端檔會一直留在 VM 上，
# 而 web 映像的 npm run build（vue-tsc -b）會檢查整個目錄，
# 殘留檔 import 已經刪掉的東西，build 就失敗。
# src/ 只放前端原始碼、VM 上沒有該保留的獨有檔案，所以只對它做完整鏡像。
# ⚠️ 不可以改成對整個專案 --delete：VM 上有只存在那邊的東西
#    （data/ 的正式環境 SQLite、deploy/ 的部分腳本），會被一起刪掉。
rsync -az --delete --itemize-changes "$SRC/src/" "$VM:~/rentmate/src/" \
  | awk '/^\*deleting/ {print "  刪除 VM 上的殘留檔 src/" $2}'

# ---------- 2. 套用 Nginx 設定 ----------
# nginx.conf 是由 nginx-tls.conf.example 複製而來（設定的真正來源是後者）
echo "[2/3] 套用 Nginx 設定..."
ssh "$VM" 'cd ~/rentmate && cp deploy/nginx-tls.conf.example deploy/nginx.conf'

# ---------- 3. 重建容器 ----------
# ⚠️ 必須加 --build：nginx 設定是透過 Dockerfile 的 COPY 打包進映像，
#    只用 --force-recreate 會沿用舊映像，設定不會更新。
echo "[3/3] 重建容器（--build，設定才會生效）..."
ssh "$VM" "cd ~/rentmate && docker compose up -d --build $SERVICES" 2>&1 | tail -5

echo
echo "=========================================="
echo " 驗證"
echo "=========================================="
sleep 4
printf "  網站首頁      : HTTP %s\n" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://rentmate.software/)"
printf "  API 未登入保護: HTTP %s (應為 401)\n" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
     https://rentmate.software/api/contract/analyze \
     -H 'Content-Type: application/json' -d '{}')"
printf "  直連源站阻擋  : %s\n" \
  "$(timeout 10 curl -s -o /dev/null -w '%{http_code}' \
     --resolve rentmate.software:443:140.131.114.157 --max-time 8 \
     https://rentmate.software 2>/dev/null || echo '無回應（正確）')"
echo "=========================================="
