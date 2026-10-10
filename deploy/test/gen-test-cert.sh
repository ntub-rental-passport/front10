#!/usr/bin/env bash
#
# ZAP 與 web 在同一個隔離網路，以自簽憑證測 HTTPS；SAN 同時涵蓋容器名與 localhost。
# 用法：bash deploy/test/gen-test-cert.sh [--force]（Ubuntu / macOS 均可執行）

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CERT_DIR="$SCRIPT_DIR/certs"
FORCE=false
if [ "$#" -eq 1 ] && [ "$1" = "--force" ]; then
    FORCE=true
elif [ "$#" -ne 0 ]; then
    echo "用法：bash deploy/test/gen-test-cert.sh [--force]" >&2
    exit 1
fi

if [ "$FORCE" = false ] && [ -f "$CERT_DIR/cert.pem" ] && [ -f "$CERT_DIR/key.pem" ] \
    && openssl x509 -in "$CERT_DIR/cert.pem" -noout -checkend 0 >/dev/null 2>&1; then
    echo "測試憑證已存在且未過期，跳過（--force 可強制重產）。"
    exit 0
fi

# 先在暫存目錄產生完整的一組檔案，避免 openssl 失敗時覆蓋既有憑證；私鑰僅供擁有者讀取。
umask 077
mkdir -p "$CERT_DIR"
CERT_TMP=$(mktemp -d "$CERT_DIR/.generate.XXXXXX")
trap 'rm -rf "$CERT_TMP"' EXIT

# 用設定檔指定 SAN，不依賴較舊 macOS OpenSSL 未提供的 -addext。
cat > "$CERT_TMP/openssl.cnf" <<'CONF'
[req]
prompt = no
distinguished_name = subject
x509_extensions = extensions

[subject]
CN = web

[extensions]
subjectAltName = DNS:web,DNS:localhost
CONF

openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -config "$CERT_TMP/openssl.cnf" \
    -keyout "$CERT_TMP/key.pem" -out "$CERT_TMP/cert.pem"
mv "$CERT_TMP/key.pem" "$CERT_DIR/key.pem"
mv "$CERT_TMP/cert.pem" "$CERT_DIR/cert.pem"
echo "已產生 30 天有效的測試憑證：$CERT_DIR/cert.pem"
