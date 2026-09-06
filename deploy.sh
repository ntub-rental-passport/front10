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
rsync -avz \
  --exclude node_modules --exclude dist --exclude .venv --exclude .git \
  --exclude logs --exclude '__pycache__' --exclude .env \
  "$SRC/" "$VM:~/rentmate/" | tail -3

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
