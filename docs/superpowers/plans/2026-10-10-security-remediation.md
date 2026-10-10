# 資安重測後續修改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本專案的分工**：程式碼由 Codex 實作（`codex-delegate`），Claude 負責寫 spec、審查 diff、自己跑測試；VM 與正式站的操作由使用者執行。每個 Task 的「執行者」欄寫明由誰做。

**Goal:** 修正 `Doc/資安重測-2026-10/資安重測報告-2026-10.md` 第五、六、十章列出的弱點，並把修正部署到正式站、重新取得證據。

**Architecture:** 依風險與依賴關係分成四個階段：
1. 低風險、高價值的套件升級與程式強化（Codex）
2. 部署到正式站並觀察 CSP（使用者）
3. 依觀察結果收緊設定，處理需要遷移的強化項目（容器非 root、大版本升級）
4. 範圍大、需要先設計的項目，另外立計劃

每個 Task 結束時都要有可以獨立驗證的成果。

**Tech Stack:** Vue 3 + Vite、Express（OCR 服務）、FastAPI + SQLAlchemy、nginx 1.27、Docker Compose、OWASP ZAP（`deploy/test/run-zap.sh`）

## Global Constraints

- 實作類 Task 一律走 `codex-delegate`，在 `codex/<task>` 分支完成後，由 Claude 審查並合併到 `merge/main-into-vm`。不 push。
- **主動掃描只能打 `deploy/test/` 的隔離測試環境**（`rentmate-test` project），絕對不能打 `rentmate.software`。
- 部署一律用 `./deploy.sh`。手動 rsync 一定要加 `--exclude '.env*'`。
- 程式碼註解用繁體中文，說明「為什麼」，沿用檔案原本的風格。
- 前端既有的失敗測試：`server/utility-ocr.test.js` 1 個。後端既有的失敗測試：57 個（`JWT_SECRET=... PYTHONPATH=.:tests` 條件下）。**每個 Task 的驗收標準都是「不新增失敗」**，不要求修好既有失敗。
- 每個 Task 完成後，Claude 要更新 `Doc/資安重測-2026-10/資安重測報告-2026-10.md` 的對應段落與第七章的 commit 表。

## 總覽

| 階段 | Task | 對應報告 | 執行者 | 依賴 |
|---|---|---|---|---|
| 1 | 1. npm 小版本升級（multer、sharp、proxy-addr、vue） | 5-1 | Codex | — |
| 1 | 2. 共用資料存取層加入識別字白名單 | 6-1、第十章 #9 | Codex | — |
| 1 | 3. 停水 API 改為驗證政府憑證 | 6-2 | Codex | — |
| 1 | 4. GitHub Actions 鎖定 SHA、CI 加入 gitleaks | 6-2、6-3 | Codex | — |
| 2 | 5. 部署到正式站、觀察 CSP、重新評級 | 3-3、第七章 | 使用者 | 1–4 合併 |
| 2 | 6. 隔離環境重掃 web | 3-4 | 使用者 | 5 |
| 3 | 7. 依觀察結果移除 `style-src 'unsafe-inline'` | 3-3 | Claude（設定檔）＋使用者部署 | 5 的觀察結果 |
| 3 | 8. 後端與 OCR 容器改用非 root 使用者 | 5-3 | Codex＋使用者（VM 權限遷移） | 5 |
| 3 | 9. RAG 服務升級 `sentence-transformers` | 5-2 | Codex＋使用者 | 5 |
| 3 | 10. `maplibre-gl` 5 → 6 | 5-1 | Codex＋人工回歸 | 5 |
| 4 | 11. 另立計劃的項目（只列範圍，不在本計劃實作） | 第八、九章 | — | — |

階段 1 的四個 Task 互相獨立，可以平行派工。

---

## 階段 1：套件升級與程式強化

### Task 1：npm 小版本升級

> ✅ 2026-10-10 完成（commit `ea8b56a4`）。

**執行者：** Codex（tier `standard`）

**Files:**
- Modify: `package.json`、`package-lock.json`

**Interfaces:** 不改任何程式介面。

- [ ] **Step 1：記錄基準**

```bash
npm test 2>&1 | tail -5 > /tmp/npm-test-before.txt
npm audit --omit=dev --json > /tmp/npm-audit-before.json
node -p "Object.entries(require('/tmp/npm-audit-before.json').metadata.vulnerabilities)"
```

預期：測試結果為 1 個既有失敗（`server/utility-ocr.test.js`）；audit 為 critical 2、high 7。

- [ ] **Step 2：升級直接相依**

```bash
npm install multer@2.4.0 sharp@0.35.5 vue@3.5.43
```

- [ ] **Step 3：升級間接相依 proxy-addr**

`express@4.22.2` 允許的版本範圍已經包含 2.0.8，用 `npm update` 即可，不需要 override。

```bash
npm update proxy-addr
npm ls proxy-addr
```

預期：`express@4.22.2 └── proxy-addr@2.0.8`

- [ ] **Step 4：套用不會造成破壞性變更的自動修正**

```bash
npm audit fix
```

**不可以加 `--force`**：`--force` 會把 `maplibre-gl` 升到 6.x，那是 Task 10 的範圍。

- [ ] **Step 5：驗證**

```bash
npm test 2>&1 | tail -5
npx vue-tsc -b && npx vite build --logLevel error && echo BUILD_OK
npm audit --omit=dev --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a.metadata.vulnerabilities);for(const[n,v]of Object.entries(a.vulnerabilities))console.log(v.severity,n)})"
```

預期：
- 測試：只剩原本那 1 個失敗。
- `BUILD_OK`。
- audit：critical 只剩 `maplibre-gl`；multer、sharp、proxy-addr、vue 都不再出現。

- [ ] **Step 6：檢查 multer 2.4 的行為變更**

OCR 上傳的兩個入口是 `server/index.js:86`、`server/utility-ocr.js:23`。執行它們的既有測試：

```bash
npx vitest run server/
```

預期：除了 `utility-ocr.test.js` 原本那 1 個失敗，其餘全部通過。

- [ ] **Step 7：Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): 升級 multer、sharp、proxy-addr、vue 修補已知弱點"
```

**Claude 審查重點：** 確認 lockfile 裡沒有出現大版本跳動；確認 `maplibre-gl` 仍是 5.x；把升級後的 `npm audit --omit=dev --json` 存到 `Doc/資安重測-2026-10/06-相依套件弱點/npm-audit-production-修正後.json`。

---

### Task 2：共用資料存取層加入識別字白名單

> ✅ 2026-10-10 完成（commit `a35e72ec`）。

**執行者：** Codex（tier `light`。程式碼已經在下面寫好）

**背景：** `Store.upsert()` / `Store.insert_ignore()` 會把表名和字典鍵直接拼進 SQL。現有 12 個呼叫端都是寫死的常數（見 `docs/security/bandit-sql-triage.md`），但這個函式本身沒有防護。加上白名單驗證，避免日後新增呼叫端時引入注入風險（縱深防禦）。

**Files:**
- Modify: `backend/db/sqlstore.py`（新增 `_IDENTIFIER`、`_check_identifiers`；在 `upsert`、`insert_ignore` 開頭呼叫）
- Create: `backend/tests/test_sqlstore_identifiers.py`

**Interfaces:**
- Produces：`db.sqlstore._check_identifiers(table: str, *names: str) -> None`。任何名稱不符合 `^[A-Za-z_][A-Za-z0-9_]*$` 就丟出 `ValueError`。

- [ ] **Step 1：先寫會失敗的測試**

`backend/tests/test_sqlstore_identifiers.py`：

```python
"""Store 的表名／欄名白名單：只允許一般識別字，擋掉任何能改變 SQL 結構的字元。"""
import pytest

from db.sqlstore import Store, _check_identifiers


@pytest.mark.parametrize("name", ["site_settings", "monitor_meta", "key", "_private", "Col2"])
def test_accepts_plain_identifiers(name):
    _check_identifiers(name)


@pytest.mark.parametrize("name", [
    "users; DROP TABLE users", "key`", "a b", "1abc", "", "x--", "name)", "表",
])
def test_rejects_anything_else(name):
    with pytest.raises(ValueError):
        _check_identifiers("ok_table", name)


def test_upsert_rejects_bad_column_before_touching_database():
    # 連線給 None：如果驗證沒有在執行 SQL 之前發生，這裡會先炸 AttributeError 而不是 ValueError。
    store = Store(None)
    with pytest.raises(ValueError):
        store.upsert("site_settings", {"key": "a"}, {"value` = 1, `admin": "x"})


def test_insert_ignore_rejects_bad_table_before_touching_database():
    store = Store(None)
    with pytest.raises(ValueError):
        store.insert_ignore("announcement_reads WHERE 1=1 --", {"user_id": 1}, {"read_at": "t"})
```

- [ ] **Step 2：確認測試失敗**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_sqlstore_identifiers.py -v
```

預期：FAIL，錯誤是 `ImportError: cannot import name '_check_identifiers'`。

- [ ] **Step 3：實作**

在 `backend/db/sqlstore.py` 的 `_PLACEHOLDER = re.compile(r'\?')` 下方加入：

```python
# 表名與欄名會直接拼進 SQL（佔位符只能放值，不能放識別字），所以只放行一般識別字。
# 現有呼叫端全是寫死的常數；這道檢查是給「日後有人把外部輸入當欄名傳進來」的保險。
_IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _check_identifiers(table: str, *names: str) -> None:
    for name in (table, *names):
        if not isinstance(name, str) or not _IDENTIFIER.match(name):
            raise ValueError(f'不允許的 SQL 識別字：{name!r}')
```

在 `upsert` 的 docstring 之後、`assignment = ...` 之前加入：

```python
        _check_identifiers(table, *keys, *values)
```

在 `insert_ignore` 的 docstring 之後、`where = ...` 之前加入：

```python
        _check_identifiers(table, *keys, *values)
```

- [ ] **Step 4：確認測試通過，且既有測試沒有新增失敗**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_sqlstore_identifiers.py -v
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest -q tests 2>&1 | tail -3
```

預期：新測試全部通過；全套測試仍是 57 個既有失敗，沒有新增。

- [ ] **Step 5：Commit**

```bash
git add backend/db/sqlstore.py backend/tests/test_sqlstore_identifiers.py
git commit -m "fix(db): Store.upsert/insert_ignore 驗證表名與欄名，只放行一般識別字"
```

---

### Task 3：停水 API 改為驗證政府憑證

> **2026-10-10 執行結果（取代下方原步驟）**：實測發現 `web.water.gov.tw` 的憑證是 TWCA 簽發（TWCA Global Root CA 已在 certifi 清單內），不是 GCA／GRCA。`verify=False` 真正的原因是 TWCA 中繼憑證缺少 Subject Key Identifier，被 Python 3.13 起預設的 `VERIFY_X509_STRICT` 擋下。最終做法：`certifi` + 只清掉 `VERIFY_X509_STRICT`，不加入任何自訂 CA（commit `bcfa8c2b`）。下方原計劃保留作為紀錄。

**執行者：** Codex（tier `standard`。要取得正確的 CA 憑證）

**背景：** `backend/routers/outage.py:72` 用 `verify=False` 呼叫 `https://web.water.gov.tw`，原因是政府網站的 GCA 憑證鏈不在預設信任清單裡。關掉驗證等於任何中間人都能竄改停水資訊。

**Files:**
- Create: `backend/certs/twgov-ca-bundle.pem`（政府憑證管理中心的根憑證與中繼憑證）
- Modify: `backend/routers/outage.py`（約 :70–75）
- Create: `backend/tests/test_outage_tls.py`

**Interfaces:**
- Produces：`outage._tls_context() -> ssl.SSLContext`，信任 certifi 的預設清單，再加上政府 CA。

- [ ] **Step 1：取得憑證鏈**

```bash
openssl s_client -connect web.water.gov.tw:443 -servername web.water.gov.tw -showcerts </dev/null 2>/dev/null | awk '/BEGIN CERT/,/END CERT/' > /tmp/water-chain.pem
openssl crl2pkcs7 -nocrl -certfile /tmp/water-chain.pem | openssl pkcs7 -print_certs -noout
```

從輸出確認發行者是哪一張政府 CA（GCA / GRCA）。根憑證**必須從政府憑證管理中心官網（`gca.nat.gov.tw`／`grca.nat.gov.tw`）下載**，不能直接信任 `s_client` 拿到的鏈。下載後比對官網公告的 SHA-256 指紋，再把根憑證與中繼憑證寫入 `backend/certs/twgov-ca-bundle.pem`，檔頭加註來源網址、指紋與下載日期。

- [ ] **Step 2：先寫會失敗的測試**

`backend/tests/test_outage_tls.py`：

```python
"""停水 API 必須驗證 TLS：不可以再傳 verify=False。"""
import ssl

import pytest

from routers import outage


def test_tls_context_verifies_certificates():
    context = outage._tls_context()
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


@pytest.fixture
def anyio_backend():
    # 環境沒有安裝 trio；只跑 asyncio。
    return "asyncio"


@pytest.mark.anyio
async def test_water_client_never_disables_verification(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, **kwargs):
            seen.update(kwargs)

        async def __aenter__(self):
            raise RuntimeError("stop")  # 只檢查建構參數，不真的連線

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(outage.httpx, "AsyncClient", FakeClient)
    # fetch_real_water_outage（outage.py:49）會吞掉連線例外、回傳 None，所以這裡不預期例外。
    assert await outage.fetch_real_water_outage("臺北市中正區") is None
    assert seen.get("verify") is not False
    assert isinstance(seen.get("verify"), ssl.SSLContext)
```

- [ ] **Step 3：確認測試失敗**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_outage_tls.py -v
```

預期：FAIL，原因是 `AttributeError: module 'routers.outage' has no attribute '_tls_context'`。

- [ ] **Step 4：實作**

在 `outage.py` 的 import 區加入 `import ssl` 與 `import certifi`（`certifi` 已隨 httpx 安裝；若 `requirements.txt` 沒有列出，就補上目前安裝的版本）。在 `WATER_API_URL` 下方加入：

```python
# 政府網站使用 GCA／GRCA 簽發的憑證，不在 certifi 的預設清單裡。
# 以前為此直接關掉驗證（verify=False），等於讓中間人能竄改停水資訊；
# 改成「預設清單 + 官方下載並核對指紋的政府 CA」，見 backend/certs/twgov-ca-bundle.pem 檔頭。
_TWGOV_CA = Path(__file__).resolve().parents[1] / "certs" / "twgov-ca-bundle.pem"


def _tls_context() -> ssl.SSLContext:
    context = ssl.create_default_context(cafile=certifi.where())
    context.load_verify_locations(cafile=str(_TWGOV_CA))
    return context
```

把第 72 行附近的：

```python
        # verify=False 略過政府網站的 GCA 憑證驗證
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
```

改為：

```python
        async with httpx.AsyncClient(timeout=8.0, verify=_tls_context()) as client:
```

- [ ] **Step 5：測試，並實際連線驗證一次**

```bash
cd backend && JWT_SECRET=test-only PYTHONPATH=.:tests ../.venv/bin/python -m pytest tests/test_outage_tls.py -v
cd backend && ../.venv/bin/python -c "import httpx,routers.outage as o; print(httpx.get('https://web.water.gov.tw/', verify=o._tls_context(), timeout=10).status_code)"
```

預期：測試通過；實際連線印出 HTTP 狀態碼（不是 `SSLError`）。

- [ ] **Step 6：Commit**

```bash
git add backend/certs/twgov-ca-bundle.pem backend/routers/outage.py backend/tests/test_outage_tls.py
git commit -m "fix(outage): 停水 API 改為驗證政府 CA 憑證，不再關閉 TLS 驗證"
```

**Claude 審查重點：** 自己用 `openssl x509 -fingerprint -sha256` 核對 bundle 中根憑證的指紋，與官網公告一致。

---

### Task 4：GitHub Actions 鎖定 SHA、CI 加入 gitleaks

> ✅ 2026-10-10 完成（commit `18e46333`）。

**執行者：** Codex（tier `light`）

**Files:**
- Modify: `.github/workflows/update-taipei-garbage.yml:17,18,28`
- Create: `.github/workflows/gitleaks.yml`

- [ ] **Step 1：把版本標籤換成 commit SHA**

這些 SHA 是 2026-10-10 用 `git ls-remote` 取得的，都是 lightweight tag，指向的就是 commit：

```yaml
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
```

Codex 要重新執行一次以下指令，確認 SHA 沒有變：

```bash
git ls-remote https://github.com/actions/checkout refs/tags/v4
git ls-remote https://github.com/actions/setup-node refs/tags/v4
git ls-remote https://github.com/actions/upload-artifact refs/tags/v4
```

- [ ] **Step 2：新增 gitleaks workflow**

`.github/workflows/gitleaks.yml`：

```yaml
# 2026-05 曾有 GCP 服務帳號金鑰經網頁上傳進入公開 repo（見資安重測報告 6-3）。
# 每次 push / PR 都掃一次新增的 commit；輸出一律遮蔽，避免 log 再洩一次。
# 不用 gitleaks-action：組織 repo 需要授權金鑰。直接跑官方 CLI 映像並鎖定版本。
name: gitleaks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          fetch-depth: 0
      - name: gitleaks
        run: |
          docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.1 \
            git /repo --redact --no-banner --log-opts="--since=2026-10-10T00:00:00+08:00"
```

> 只掃 2026-10-10 之後的 commit：那把已撤銷的金鑰（2026-05-31）還留在歷史裡，掃全部歷史會永遠失敗。歷史清除放在 Task 11。用日期而不用 `before..sha` 的範圍寫法，是因為第一次 push（`before` 全為 0）和 pull_request 事件都沒有可用的 `before`。

- [ ] **Step 3：驗證 YAML 語法**

```bash
python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]];print('YAML_OK')" .github/workflows/*.yml
```

預期：`YAML_OK`

- [ ] **Step 4：Commit**

```bash
git add .github/workflows/
git commit -m "ci: GitHub Actions 鎖定 commit SHA，新增 gitleaks 掃描新 commit"
```

**注意：** workflow 要等使用者決定 push 到 GitHub 之後才會生效。

---

## 階段 2：部署與觀察

### Task 5：部署到正式站、觀察 CSP、重新評級

> ✅ 2026-10-11 完成。
> - CSP 觀察：四種身分都看過，唯一違規來自 reka-ui，結果促成 Task 7 改用 hash。
> - 評級：securityheaders A+；SSL Labs 原為 B，原因是 Cloudflare 接受 TLS 1.0、1.1，已在 Cloudflare 改為最低 TLS 1.2。
> - 注意：`./deploy.sh web` 不會重建 fastapi 和 ocr。後端已在 10-11 用 `./deploy.sh fastapi` 補上；ocr 的 npm 升級已在容器內確認上線（multer 2.4.0、sharp 0.35.5、proxy-addr 2.0.8）。

**執行者：** 使用者。Claude 負責判讀結果。

**前提：** Task 1–4 已合併到 `merge/main-into-vm`。

- [ ] **Step 1：在 VM 上換成新的 nginx 設定**

```bash
cd ~/rentmate && cp deploy/nginx-tls.conf.example deploy/nginx.conf
```

- [ ] **Step 2：在 Mac 上部署全部服務**

前端、OCR（npm 套件升級）、後端（Task 2、3）都有變更，所以全部重建：

```bash
cd "/Users/teddy/Desktop/專題/code/Rentmate current/frontend/frontend" && ./deploy.sh
```

- [ ] **Step 3：功能確認**

COOP、COEP、CORP 是新加的標頭，請逐項實際操作：

- Google 登入
- 帳密登入
- 地圖顯示與搜尋
- 邀請連結的 QR code
- 房源圖片、使用者頭像
- 補助文件以 PDF 開啟
- OCR 上傳（multer、sharp 已升級）
- 點交拍照
- 停水資訊（Task 3）

任何一項壞掉，先回報 Claude，不要自己改設定。

- [ ] **Step 4：觀察 CSP Report-Only 違規**

在 Chrome 打開 DevTools Console，**再**重新整理 `https://rentmate.software`，貼上：

```js
window.__cspv = []; document.addEventListener('securitypolicyviolation', e => { if (e.disposition !== 'report') return; const v = { directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile + ':' + e.lineNumber, sample: e.sample, page: location.pathname }; __cspv.push(v); console.warn('CSP-RO', v); });
```

把 Step 3 的所有頁面再點一遍（地圖、動畫要實際操作），然後執行：

```js
copy(JSON.stringify(__cspv, null, 2))
```

存成 `Doc/資安重測-2026-10/08-正式站驗證/CSP-ReportOnly觀察.json`。重新整理之前就出現在 Console 的 `[Report Only]` 訊息，也一起截圖存進同一個資料夾。

- [ ] **Step 5：重新評級**

到 securityheaders.com 與 SSL Labs 掃描 `rentmate.software`，截圖存到 `Doc/資安重測-2026-10/08-正式站驗證/`。

---

### Task 6：隔離環境重掃 web

> ✅ 2026-10-11 完成。
> - web：WARN 4 → 1，只剩 Proxy Disclosure；PASS 138 → 141。
> - 另外重掃 api 兩個角色，結果和 10-10 完全相同。
> - 詳見 `Doc/資安重測-2026-10/01-ZAP掃描/ZAP前後對照.md`。

**執行者：** 使用者

**前提：** Task 5 已完成。`./deploy.sh` 已在 VM 上重建 `rentmate-web` 映像檔，新映像檔不含 CDN 腳本。

- [ ] **Step 1：在 VM 上啟動測試環境並重掃**

照 `Doc/資安重測-2026-10/VM執行清單.md` 的步驟 2，然後執行：

```bash
bash deploy/test/run-zap.sh web 2>&1 | tee deploy/test/zap-out/run-web-rescan.log
```

預期：`Sub Resource Integrity Attribute Missing` 與 `Cross-Domain JavaScript Source File Inclusion` 都不再出現。

- [ ] **Step 2：拉回結果（在 Mac 執行），再清除測試環境**

照清單的步驟 5、6。Claude 會更新 `ZAP前後對照.md` 與報告 3-4 節。

---

## 階段 3：收緊設定與需要遷移的強化

### Task 7：移除 `style-src 'unsafe-inline'`

> ✅ 2026-10-11 設定已合併（commit `f07db2bd`，merge `52f2d631`），**待使用者部署**。
>
> **實際做法和下方 Step 1 不同**：觀察結果**有** style 違規（管理員 4 筆、租客 2 筆），全部來自 reka-ui `SelectViewport` 寫死的隱藏捲軸 CSS（詳見 `Doc/資安重測-2026-10/08-正式站驗證/CSP-ReportOnly觀察.md`）。這段 CSS 內容固定，所以改成 `style-src 'self' 'sha256-60LHlRjW/B3CtzIoE/Lf1/NEDvko9efWMFaGVhHu/cs='`，同樣拿掉了 `'unsafe-inline'`，也移除了 Report-Only 標頭。改由 Codex（tier `light`）實作，並新增 `src/utils/csp-style-hash.test.ts`。這個測試會從 `node_modules` 重新計算 hash 並和兩個 nginx 檔比對，同時禁止引入 ScrollArea、Combobox 等其他會插入 `<style>` 的 reka-ui 元件。
>
> Claude 驗證：
> - grep：`unsafe-inline` 0、`Report-Only` 0、hash 1。
> - 故意把 hash 改錯，測試會失敗；故意引入 ScrollArea，測試也會失敗。
> - `npm test`：146 個測試檔通過。
> - crossplane：status ok。

**執行者：** Claude 修改設定檔（只動設定），使用者負責部署

**前提：** Task 5 Step 4 的觀察結果中，**沒有** `style-src`、`style-src-elem`、`style-src-attr` 的違規。如果有，這個 Task 改成「找出是哪個套件造成，評估替代方案」，不直接修改設定。

**Files:**
- Modify: `deploy/nginx-tls.conf.example`、`deploy/test/nginx.test.conf`

- [ ] **Step 1：修改兩個 nginx 設定檔**

把強制執行的 CSP 中的 `style-src 'self' 'unsafe-inline';` 改為 `style-src 'self';`，並刪除整行 `add_header Content-Security-Policy-Report-Only ...`（觀察任務已完成，兩者內容相同）。把 2026-10-10 的「暫時保留」註解改寫為：

```nginx
    # style-src 'self'（2026-10 起不含 'unsafe-inline'）：以 Report-Only 在正式站觀察
    # 全站頁面，沒有任何 style 違規（證據：Doc/資安重測-2026-10/08-正式站驗證/）。
    # Vue 的 :style 透過 CSSOM 設定，不受 CSP 限制；新增會注入 <style> 的套件前，要先確認相容。
```

- [ ] **Step 2：驗證語法**

```bash
for f in deploy/nginx-tls.conf.example deploy/test/nginx.test.conf; do grep -c "unsafe-inline" "$f"; done
```

預期：兩個檔案都輸出 `0`。

再用 crossplane 驗證語法（做法同 2026-10-10：把設定檔包進 `events {} http { include ...; }` 後執行 `crossplane parse`），預期 `status ok`。

- [ ] **Step 3：Commit，並請使用者部署**

```bash
git add deploy/nginx-tls.conf.example deploy/test/nginx.test.conf
git commit -m "fix(deploy): CSP 移除 style-src 'unsafe-inline'"
```

使用者在 VM 上執行 `cp deploy/nginx-tls.conf.example deploy/nginx.conf`，在 Mac 上執行 `./deploy.sh web`，然後重做 Task 5 Step 3 的功能確認。

---

### Task 8：後端與 OCR 容器改用非 root 使用者

**執行者：** Codex 修改 Dockerfile；使用者在 VM 上遷移檔案權限

**背景：** Trivy DS-0002（High）。fastapi 會寫入 bind mount 的 `./data/garbage`（`/app/var`）與 `./data/uploads`（`/app/uploads`）。這些目錄現在由容器內的 root 寫入，換成非 root 使用者之前，VM 上的權限必須先處理好，否則上傳和垃圾車資料會寫入失敗。

**nginx 不在本 Task 範圍：** 官方映像檔的 master 程序以 root 身分綁定 80/443，worker 以 `nginx` 使用者執行。改用 unprivileged 映像檔要連帶修改 port、certbot 與 fail2ban 的 log 權限，風險遠高於效益。報告中列為「已評估、接受」。

**Files:**
- Modify: `backend/Dockerfile`、`server/Dockerfile`

- [ ] **Step 1：Codex 先盤點所有寫入路徑**

```bash
grep -rnE "open\(.*['\"]w|write_text|write_bytes|mkdir|\.save\(|sqlite3\.connect" backend --include=*.py | grep -v tests
grep -rnE "writeFile|mkdir|createWriteStream" server --include=*.js | grep -v test
```

把每一個寫入路徑對應到 compose 的 volume，列在回報中。只要有路徑會寫進映像檔內部、而不是 volume，就要在 Dockerfile 裡預先建立該目錄並 `chown` 給 UID 10001。

- [ ] **Step 2：修改 `backend/Dockerfile`**

在 `COPY . .` 之後、`EXPOSE` 之前加入：

```dockerfile
# 不以 root 執行：應用程式就算被攻破，攻擊者也拿不到容器內的 root（Trivy DS-0002）。
# 固定 UID 10001，VM 上的 data/garbage、data/uploads 要 chown 給同一個 UID（見部署說明）。
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /app/var /app/uploads \
    && chown -R app:app /app/var /app/uploads
USER app
```

- [ ] **Step 3：修改 `server/Dockerfile`**

在 `COPY shared ./shared` 之後、`EXPOSE` 之前加入：

```dockerfile
# node 映像檔內建 UID 1000 的 node 使用者。OCR 服務只讀唯讀掛載的 Vision 金鑰、處理記憶體中的上傳檔。
USER node
```

如果 Step 1 發現 OCR 服務有寫入路徑，比照 Step 2 預先建立目錄並 `chown` 給 `node`。

- [ ] **Step 4：Commit**

```bash
git add backend/Dockerfile server/Dockerfile
git commit -m "fix(docker): 後端與 OCR 容器改用非 root 使用者執行"
```

- [ ] **Step 5：使用者在 VM 上遷移權限（部署之前）**

先備份，再改擁有者。`./key/vision-key.json` 要讓 UID 1000 讀得到（VM 的 `rentmate` 帳號通常就是 UID 1000，下面的 `stat` 用來確認）：

```bash
cd ~/rentmate && sudo tar czf ~/data-backup-$(date +%Y%m%d).tgz data/garbage data/uploads
```

```bash
sudo chown -R 10001:10001 data/garbage data/uploads && stat -c '%u %a %n' key/vision-key.json
```

- [ ] **Step 6：部署並驗證**

在 Mac 上：

```bash
./deploy.sh fastapi ocr
```

在 VM 上：

```bash
docker exec rentmate-fastapi-1 id && docker exec rentmate-ocr-1 id
```

預期：`uid=10001(app)`、`uid=1000(node)`。

接著實際操作：上傳報修照片、點交拍照、OCR 辨識、垃圾車提醒設定，確認都正常。如果失敗，回復方法是把擁有者改回 root（`sudo chown -R 0:0 data/garbage data/uploads`），再部署 revert 後的 commit。

---

### Task 9：RAG 服務升級 `sentence-transformers`

**執行者：** Codex 修改；使用者部署

**Files:**
- Modify: `rag/service/requirements.txt`

- [ ] **Step 1：修改版本**

把 `sentence-transformers==5.1.1` 改為 `sentence-transformers==5.6.0`。

- [ ] **Step 2：本機驗證向量維度與檢索品質沒有改變**

Codex 用 `backend/scripts/eval_retrieval.py` 在升級前後各跑一次，比較輸出。用的模型沒變，向量應該完全相容。如果這支腳本在本機缺少依賴而無法執行，就寫明原因，改到部署後在 VM 上驗證。

- [ ] **Step 3：Commit**

```bash
git add rag/service/requirements.txt
git commit -m "fix(rag): 升級 sentence-transformers 修補 RCE 弱點"
```

- [ ] **Step 4：使用者部署並確認健康狀態**

在 Mac 上：

```bash
./deploy.sh rag
```

在 VM 上：

```bash
docker ps --filter name=rentmate-rag --format '{{.Status}}'
```

預期：`(healthy)`。再到網站上用一次法律問答，確認有引用法條。

---

### Task 10：`maplibre-gl` 5 → 6

**執行者：** Codex（tier `hard`：大版本升級，需要比對 API 變更）＋使用者做人工回歸

**Files:**
- Modify: `package.json`、`package-lock.json`，以及 `grep -rl maplibre src` 列出的所有檔案

- [ ] **Step 1：盤點用法與破壞性變更**

```bash
grep -rn "maplibre" src --include=*.vue --include=*.ts | grep -v test
```

Codex 要讀 maplibre-gl 6.0 的 CHANGELOG，逐條對照上面的用法，在回報中列出「受影響的呼叫與對應改法」。

- [ ] **Step 2：升級並修改呼叫端**

```bash
npm install maplibre-gl@6.13.0
```

依 Step 1 的清單修改呼叫端。

- [ ] **Step 3：驗證**

```bash
npx vue-tsc -b && npx vite build --logLevel error && echo BUILD_OK
npm test 2>&1 | tail -3
npm audit --omit=dev --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).metadata.vulnerabilities))"
```

預期：`BUILD_OK`；測試不新增失敗；`critical: 0`。

- [ ] **Step 4：Commit**

```bash
git add package.json package-lock.json src/
git commit -m "fix(deps): maplibre-gl 升級到 6.x 修補 sanitizer 繞過"
```

- [ ] **Step 5：使用者在正式站做人工回歸**

部署（`./deploy.sh web`）後，實際操作地圖：載入、縮放、標記、彈出視窗、搜尋地址，並確認 Console 沒有錯誤。

---

## 階段 4：另立計劃（本計劃不實作）

### Task 11：需要先設計或團隊協調的項目

以下項目範圍大或影響全隊，各自需要先經過 brainstorming 或團隊討論，再寫獨立的計劃：

| 項目 | 為什麼要另外立計劃 |
|---|---|
| 驗證機制收斂為單一的 HttpOnly cookie | 會牽動前端所有 API 呼叫，以及後端的 `get_current_landlord`／`get_current_tenant`／`get_current_admin`，屬於架構變更 |
| 清除 git 歷史中的已撤銷金鑰（`git filter-repo`） | 要對公開 repo 做 force push，所有組員都要重新 clone，需要事先協調 |
| 存取控制專項測試、管理員角色掃描、OCR 服務掃描、LLM 提示注入實測 | 報告第九章列出的未執行項目，需要另外設計測試方式與環境 |

---

## 完成條件

- [ ] 階段 1–3 的每個 Task 都已合併、部署，並通過驗證步驟。
- [ ] `npm audit --omit=dev`：critical 0。
- [ ] ZAP web 重掃沒有 SRI、Cross-Domain JS 警告；如果 Task 7 已完成，也沒有 CSP `unsafe-inline` 警告。
- [ ] 報告第五、六、七、十章已更新為修正後的狀態，證據檔都放進 `Doc/資安重測-2026-10/`。
