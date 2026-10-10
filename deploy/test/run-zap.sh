#!/usr/bin/env bash
# 固定測試 project、網路與目標，避免主動掃描誤打正式站。
# 用法：run-zap.sh web | run-zap.sh api [landlord|tenant|all]
set -euo pipefail
# 即使呼叫者用 bash -x，也不能把登入密碼展開到終端機。
set +x

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.test.yml"
NETWORK=rentmate-test_test_net
IMAGE=ghcr.io/zaproxy/zaproxy:stable
COMPOSE=(docker compose -p rentmate-test -f "$COMPOSE_FILE")

usage() {
    echo "用法：$0 web | $0 api [landlord|tenant|all]" >&2
    exit 3
}
MODE=${1:-}
ROLE=${2:-all}
case "$MODE" in
    web) [ "$#" -eq 1 ] || usage ;;
    api) [ "$#" -le 2 ] || usage
         case "$ROLE" in landlord|tenant|all) ;; *) usage ;; esac ;;
    *) usage ;;
esac

command -v docker >/dev/null || { echo "需要 Docker；請在測試 VM 執行。" >&2; exit 3; }
command -v python3 >/dev/null || { echo "需要 python3。" >&2; exit 3; }
if [ -z "$(docker ps -q --filter label=com.docker.compose.project=rentmate-test)" ]; then
    echo "找不到執行中的 rentmate-test 容器；中止以避免掃描正式站。" >&2
    exit 3
fi
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
    echo "找不到 ${NETWORK}；請先啟動測試環境：" >&2
    echo "docker compose -p rentmate-test -f $COMPOSE_FILE up -d" >&2
    exit 3
fi

umask 077
OUT_ROOT="$SCRIPT_DIR/zap-out"
mkdir -p "$OUT_ROOT"
OUT_DIR="$OUT_ROOT/$(date +%Y%m%d-%H%M%S)"
mkdir "$OUT_DIR"
# ZAP 預設以 zap 使用者執行；父目錄保留 0700，僅 bind mount 的工作目錄允許它寫入。
chmod 777 "$OUT_DIR"
cp "$SCRIPT_DIR/zap-rules.tsv" "$OUT_DIR/zap-rules.tsv"
chmod 644 "$OUT_DIR/zap-rules.tsv"

# 登入與掃描在同一容器完成，密碼只經環境傳遞，不放進命令參數或檔案。
# 原始報告與 ZAP log 留在容器 /tmp；只把去除憑證的報告寫入掛載目錄。
cat > "$OUT_DIR/scan-driver.py" <<'PY'
import base64
import html
import http.cookies
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import quote, quote_plus
from urllib.request import Request, build_opener, HTTPRedirectHandler

BASE = "http://fastapi:8000"
WORK = Path("/zap/wrk")
mode, role = sys.argv[1:]
name = "web" if mode == "web" else "api-" + role
password = os.environ.pop("SCAN_PASSWORD", "")
secrets = [password] if password else []


class NoRedirect(HTTPRedirectHandler):
    # 身分驗證不可跟隨轉址，把憑證送到另一個站點。
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = build_opener(NoRedirect)


def auth_me(token):
    try:
        with opener.open(Request(BASE + "/api/auth/me", headers={"Cookie": "access_token=" + token}),
                         timeout=30) as response:
            return response.status
    except HTTPError as error:
        return error.code


def redact(value):
    for secret in secrets:
        for variant in (secret, html.escape(secret), quote(secret, safe=""), quote_plus(secret),
                        json.dumps(secret)[1:-1]):
            value = value.replace(variant, "[REDACTED]")
    # 登入／註冊端點的回應也可能含新 token，不能只去除掃描時的那一顆。
    return re.sub(r"eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+(?:\.[A-Za-z0-9_=-]+)?",
                  "[REDACTED]", value)


def clean_json(value):
    if isinstance(value, dict):
        return {redact(key): clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    return redact(value) if isinstance(value, str) else value


def main():
    token = ""
    if mode == "api":
        if not password:
            print("容器沒有測試帳號密碼；中止。", file=sys.stderr)
            return 3
        payload = json.dumps({"email": "test." + role + "@example.com", "password": password,
                              "role": role}).encode()
        request = Request(BASE + "/api/auth/login", data=payload,
                          headers={"Content-Type": "application/json"})
        with opener.open(request, timeout=30) as response:
            cookies = http.cookies.SimpleCookie()
            for header in response.headers.get_all("Set-Cookie", []):
                cookies.load(header)
            token = cookies["access_token"].value if "access_token" in cookies else ""
            login = json.load(response)
        if not token:
            print("登入沒有取得 access_token；中止。", file=sys.stderr)
            return 3
        secrets.extend([token, login.get("accessToken", "")])
        secrets[:] = [secret for secret in secrets if secret]
        status = auth_me(token)
        print(f"{name} 掃描前 GET /api/auth/me：{status}")
        if status != 200:
            return 3
        claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=" * (-len(token.split(".")[1]) % 4)))
        print(f"{name} JWT 剩餘有效秒數：{max(0, int(claims['exp']) - int(time.time()))}")
        os.environ.update(ZAP_AUTH_HEADER="Cookie", ZAP_AUTH_HEADER_VALUE="access_token=" + token,
                          ZAP_AUTH_HEADER_SITE="fastapi")

    with tempfile.TemporaryDirectory(prefix="rentmate-zap-") as temp:
        temp = Path(temp)
        args = ["zap-full-scan.py", "-t", "https://web"] if mode == "web" else [
            "zap-api-scan.py", "-t", str(WORK / "openapi.json"), "-f", "openapi", "-O", BASE]
        args += ["-c", str(WORK / "zap-rules.tsv"), "-r", str(temp / "report.html"),
                 "-J", str(temp / "report.json")]
        if mode == "api":
            hook = temp / "coverage.py"
            hook.write_text('''
import json
from urllib.parse import urlsplit


def zap_pre_shutdown(zap):
    paths = set()
    unauthorized = 0
    responses = 0
    start = 0
    while True:
        messages = zap.core.messages(baseurl="http://fastapi:8000/api/", start=start, count=500)
        if not messages:
            break
        for message in messages:
            request = message.get("requestHeader", "").splitlines()
            response = message.get("responseHeader", "").splitlines()
            if not request or not response:
                continue
            url = urlsplit(request[0].split()[1])
            if url.hostname not in (None, "fastapi") or not url.path.startswith("/api/"):
                continue
            paths.add(url.path)
            responses += 1
            unauthorized += response[0].split()[1] in ("401", "403")
        start += len(messages)
    print("RENTMATE_COVERAGE=" + json.dumps({"api_urls": len(paths), "responses": responses,
                                           "unauthorized": unauthorized}))
''', encoding="utf-8")
            args += ["--hook", str(hook)]
        # 不轉印 ZAP 原始輸出：警告中的 evidence 可能反射密碼或 Cookie。
        with (temp / "scan.log").open("w+") as log:
            result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT, check=False)
            log.seek(0)
            output = log.read()
        code = result.returncode
        summary = re.search(r"^FAIL-NEW:.*$", output, re.MULTILINE)
        if summary:
            # 只輸出數字統計，不輸出 ZAP 的 URL、evidence 或 request headers。
            counts = re.findall(r"(FAIL-NEW|FAIL-INPROG|WARN-NEW|WARN-INPROG|INFO|IGNORE|PASS):\s*(\d+)", summary[0])
            print(name + " " + " / ".join(key + "=" + value for key, value in counts))
        for extension in ("html", "json"):
            source = temp / ("report." + extension)
            if not source.exists():
                print(f"{name} 缺少 {extension} 報告。", file=sys.stderr)
                code = 3
                continue
            raw = source.read_text(encoding="utf-8")
            sanitized = json.dumps(clean_json(json.loads(raw)), ensure_ascii=False, indent=2) if extension == "json" else redact(raw)
            (WORK / (name + "." + extension)).write_text(sanitized, encoding="utf-8")
        if mode == "api":
            coverage = re.search(r"^RENTMATE_COVERAGE=(.*)$", output, re.MULTILINE)
            if not coverage:
                print(f"{name} 無法取得實際 API 涵蓋數；掃描不算完成。", file=sys.stderr)
                code = 3
            else:
                stats = json.loads(coverage[1])
                print(f"{name} 實際打到的 API 網址數量：{stats['api_urls']}（不同路徑，不含 query）")
                print(f"{name} API 回應：{stats['responses']}；401/403：{stats['unauthorized']}")
                if not stats["api_urls"] or stats["responses"] == stats["unauthorized"]:
                    code = 3
            status = auth_me(token)
            print(f"{name} 掃描後 GET /api/auth/me：{status}")
            if status != 200:
                print("登入已失效；請重新登入後重跑，這份報告的登入涵蓋不完整。", file=sys.stderr)
                code = 3
        return code


try:
    sys.exit(main())
except Exception:
    # urllib / ZAP 例外可能夾帶 request，不把例外內容或 traceback 印出。
    print("掃描流程失敗（登入、連線或報告處理）；請確認測試服務狀態。", file=sys.stderr)
    sys.exit(3)
PY
chmod 644 "$OUT_DIR/scan-driver.py"

RESULTS=()
FINAL_STATUS=0
run_scan() {
    local scan_role="$1" status=0
    docker run --rm --network "$NETWORK" -v "$OUT_DIR:/zap/wrk" \
        -e SCAN_PASSWORD "$IMAGE" python3 /zap/wrk/scan-driver.py "$MODE" "$scan_role" || status=$?
    RESULTS+=("$MODE${scan_role:+-$scan_role}: $status")
    # FAIL 比 WARN 優先；3 以上代表流程錯誤，不可混成安全掃描的警告。
    case "$status" in
        0) ;;
        1) [ "$FINAL_STATUS" -eq 3 ] || FINAL_STATUS=1 ;;
        2) [ "$FINAL_STATUS" -ne 0 ] || FINAL_STATUS=2 ;;
        *) FINAL_STATUS=3 ;;
    esac
}

if [ "$MODE" = web ]; then
    unset SCAN_PASSWORD
    run_scan ""
else
    # seed 輸出不含密碼，但連線錯誤可能含 DSN，因此失敗時只印固定訊息。
    if ! "${COMPOSE[@]}" exec -T fastapi python scripts/seed_test_accounts.py >/dev/null 2>&1; then
        echo "建立測試帳號失敗；請確認測試資料庫 migration 與環境變數。" >&2
        exit 3
    fi
    # 直接從測試網路讀 OpenAPI；停用轉址，並移除所有層級的 server 覆寫以鎖定測試目標。
    docker run --rm --network "$NETWORK" "$IMAGE" python3 -c '
import json
from urllib.request import build_opener, HTTPRedirectHandler
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
def strip_servers(value):
    if isinstance(value, dict):
        return {key: strip_servers(item) for key, item in value.items() if key != "servers"}
    if isinstance(value, list):
        return [strip_servers(item) for item in value]
    return value
with build_opener(NoRedirect).open("http://fastapi:8000/openapi.json", timeout=30) as response:
    spec = strip_servers(json.load(response))
spec["servers"] = [{"url": "http://fastapi:8000"}]
print(json.dumps(spec, ensure_ascii=False))
' > "$OUT_DIR/openapi-original.json"
    python3 "$SCRIPT_DIR/zap_filter_openapi.py" "$OUT_DIR/openapi-original.json" "$OUT_DIR/openapi.json"
    chmod 644 "$OUT_DIR/openapi.json"
    ROLES=("$ROLE")
    [ "$ROLE" != all ] || ROLES=(landlord tenant)
    for scan_role in "${ROLES[@]}"; do
        env_key="TEST_$(printf '%s' "$scan_role" | tr '[:lower:]' '[:upper:]')_PASSWORD"
        if ! SCAN_PASSWORD=$("${COMPOSE[@]}" exec -T fastapi printenv "$env_key" 2>/dev/null) || [ -z "$SCAN_PASSWORD" ]; then
            echo "fastapi 未設定 ${env_key}；中止，不回退到隨機密碼。" >&2
            exit 3
        fi
        export SCAN_PASSWORD
        run_scan "$scan_role"
        unset SCAN_PASSWORD
    done
fi

printf '掃描 exit code（0=PASS、1=FAIL、2=WARN、3=流程錯誤）：\n'
printf '%s\n' "${RESULTS[@]}"
echo "報告目錄：$OUT_DIR"
exit "$FINAL_STATUS"
