# 在隔離測試環境執行 OWASP ZAP

上一輪爬蟲只找到 SPA 入口與靜態檔，共 6 個網址，沒有 `/api/`，也沒有登入。
因此分成兩種掃描：

- **web**：對 `https://web` 跑 full scan，檢查 nginx 的安全標頭、HTTPS 與靜態資源。
- **api**：直接取得 FastAPI 的 `/openapi.json`，過濾危險操作後匯入 ZAP，分別登入測試房東與租客，帶著 `access_token` cookie 主動掃描。

API 目標固定為 `http://fastapi:8000`，不經 nginx。這輪要測應用程式本身；
nginx 的限流會使大量探測只得到 429，遮住真正的應用程式回應。
限流是另一層防護，攻擊者仍可能分散 IP 規避，不能把限流當成 API 已通過檢查。
HTTP 只發生在不映射對外 port 的測試 Docker 網路內。

## 執行步驟（Ubuntu VM，從專案根目錄）

需要 Docker Compose、bash、python3 與 openssl。使用
`ghcr.io/zaproxy/zaproxy:stable`；首次執行會下載映像及 ZAP add-on。
先確認另一個任務已完成測試 compose 的 HTTPS 與兩個測試密碼設定，
並準備好 `rentmate-web`、`rentmate-fastapi`、`rentmate-ocr` 映像。
FastAPI 映像必須包含這次修改後的 seed 腳本；程式碼更新後請重建映像。

1. 產生只供測試的自簽憑證（`deploy/test/certs/cert.pem`、`key.pem`，
   compose 會掛到 web 容器的 `/etc/nginx/test-certs/`）。已存在且未過期會自動跳過。

   ```bash
   bash deploy/test/gen-test-cert.sh
   ```

2. 新的隔離資料庫先啟動 MySQL 與假 SMTP，等 MySQL healthy，再匯入 schema。
   `database.sql` 是建表用，**只在新的測試資料庫執行一次**。
   不要使用正式 compose，也不要匯入正式使用者資料。

   ```bash
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml up -d mysql mailhog
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml ps
   # 等 mysql 顯示 healthy 後：
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml exec -T mysql \
     sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"' \
     < backend/db/database.sql
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml up -d
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml ps
   docker network inspect rentmate-test_test_net
   ```

   全部服務須處於 running / healthy。若 FastAPI 起不來，確認映像與 schema
   版本相同，且測試環境已提供所需的假驗證／加密金鑰（例如
   `AUTH_TOKEN_SECRET`、`VERIFICATION_CODE_SECRET`、`PII_ENCRYPTION_KEY`）；
   不要沿用正式金鑰。測試資料庫可丟棄，但必須有目前版本的完整資料表。

3. 執行掃描。web 與 api 可各自重跑；每次呼叫建立一個時間戳目錄。

   ```bash
   bash deploy/test/run-zap.sh web
   bash deploy/test/run-zap.sh api               # 預設依序掃 landlord、tenant
   # 或只重跑一個角色：
   bash deploy/test/run-zap.sh api landlord
   bash deploy/test/run-zap.sh api tenant
   ```

   API 模式會在 fastapi 容器內 seed 兩個測試帳號，再從容器環境取得密碼：
   `test.landlord@example.com` / `TEST_LANDLORD_PASSWORD`、
   `test.tenant@example.com` / `TEST_TENANT_PASSWORD`。
   環境變數優先，不會把密碼寫入 `.env`。請勿自行用 `printenv`、`set -x`
   或除錯工具記錄憑證。

   每個角色都必須先得到 `GET /api/auth/me = 200` 才會啟動 ZAP。
   透過 packaged scan 支援的 `ZAP_AUTH_HEADER=Cookie`、
   `ZAP_AUTH_HEADER_VALUE=access_token=...`、`ZAP_AUTH_HEADER_SITE=fastapi`
   注入 cookie，OpenAPI server 與 `-O` 都固定到測試 FastAPI。
   腳本先檢查執行中的 `rentmate-test` project 容器與測試網路，不接受自訂目標。

4. 查看 `deploy/test/zap-out/<YYYYmmdd-HHMMSS>/`：
   `web.html` / `web.json`、`api-landlord.html` / `api-landlord.json`、
   `api-tenant.html` / `api-tenant.json`。API 模式另保存原始與過濾後的 OpenAPI，
   所有掃描使用複製到該目錄的 `zap-rules.tsv`。
   原始 ZAP 輸出及報告只留在暫存容器內，輸出目錄的報告會移除密碼與 token；
   終端機只印統計，不轉印可能含憑證的 evidence。
   工作目錄允許 ZAP 容器使用者寫入，外層新建的 `zap-out` 目錄維持 0700。

   API 結束時從 ZAP 的實際 HTTP 訊息統計有回應的 `/api/` 網址數量
   （以不同路徑計，不含 query）、總回應數與 401/403 數。這包含 OpenAPI
   匯入時的請求與主動掃描請求，不只是「規格裡有多少端點」，也不依賴
   只有觸發 alert 的網址才會出現在 JSON 報告裡。
   若沒有 API 回應、全部都是 401/403、缺少報告／統計，或掃描後 `/me` 不再是
   200，視為流程失敗，不能用這份報告宣稱登入掃描完成。

   exit code 最後統一回報：0 = PASS、1 = FAIL、2 = WARN、3 = 流程錯誤。
   WARN 不會中斷下一個角色的掃描；綜合結果優先順序為流程錯誤、FAIL、WARN、PASS。
   規則 10096（Timestamp Disclosure - Unix）設 IGNORE：一般 JS bundle 數字
   被誤判成 Unix 時間戳，屬於誤報；其他規則維持 packaged scan 預設。

5. 用完清除隔離環境與測試資料。報告留在本機目錄，另外保留所需的蒐證副本。

   ```bash
   docker compose -p rentmate-test -f deploy/test/docker-compose.test.yml down -v
   rm -rf deploy/test/certs
   ```

## 排除的端點

排除清單集中於 `zap_filter_openapi.py` 的 `EXCLUSION_RULES`。
每個被移除的「方法 + 路徑」與理由都印在 stderr；保留同一路徑其他方法。

| 方法 | 路徑 | 原因 |
| --- | --- | --- |
| POST | `/api/auth/logout` | 清除 cookie，管理員還會刪除 session |
| 全部 | `/api/auth/google`、`/api/auth/google/*` | Google OAuth 外部服務與假金鑰不適合主動掃描 |
| 全部 | `/api/auth/admin/*` | 管理員的信箱驗證及 session 不在本次範圍 |
| 全部 | `/api/internal/*` | 內部服務使用獨立服務憑證 |
| POST | `/api/auth/password/change` | 更新 `password_changed_at`、撤銷舊 token 並清除 cookie |
| POST | `/api/auth/password/reset/complete` | 密碼重設會撤銷舊 token、管理員 session 並清除 cookie |
| PATCH | `/api/admin/users/{user_id}/status` | 可停用測試帳號，身分守門員會立即拒絕後續請求 |

已讀取 routers：目前沒有公開的自刪帳號或切換角色端點。
`PATCH /api/auth/profile` 只修改顯示名稱／頭像，不撤銷 session，因此保留。
一般刪除業務資料的端點也保留；請只在可丟棄的隔離資料庫執行。

## 已知限制

- OCR 的 Node 服務不在 FastAPI OpenAPI 中，這套 API 掃描不涵蓋 OCR。
- 沒有登入 admin。保留的 `/api/admin/*` 業務 API 會被探測，但沒有管理員權限，
  不能當成管理員功能已經通過登入掃描。
- 部分房東／租客 API 的 `get_current_landlord` / `get_current_tenant` **只接受
  Authorization Bearer**。本任務依規格只注入 cookie，這些端點仍會得到 401，
  即使 `/api/auth/me` 是 200。網址涵蓋數不等於所有端點都通過授權或進入業務流程；
  終端機另印 401/403 統計。要補齊這類登入涵蓋，需要後續加入 Bearer 注入。
- landlord 與 tenant 都使用 `session_seconds(role) = session_minutes() * 60`。
  隔離環境沒有覆寫設定時，實際為 **86,400 秒（24 小時）**；可選設定為
  1,800、3,600、7,200、28,800、86,400、259,200、604,800 秒。
  `/me` 不會延長有效期限，也沒有自動 refresh。每個角色掃描前重新登入，
  腳本會顯示這顆 JWT 的剩餘秒數；長時間掃描超過期限仍會變成 401。
  掃描後 `/me` 若失效會回報流程錯誤，需重新登入重跑，不能把中途過期的
  報告當作完整登入掃描。
- 空測試資料庫的資源 ID、驗證碼與檔案上傳可能無法符合 API 前置條件，
  匯入及主動探測不保證每個操作都進入業務邏輯。這次不做 IDOR 測試。
- `stable` 標籤會更新，結果比較時請同時記錄 VM 使用的 image digest。

ZAP 參考：[API scan](https://www.zaproxy.org/docs/docker/api-scan/)、
[scan hooks](https://www.zaproxy.org/docs/docker/scan-hooks/)、
[authentication environment variables](https://www.zaproxy.org/docs/getting-further/authentication/handling-auth-yourself/)。
