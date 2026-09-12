# P3：桌機 LLM + 可切換的向量檢索

> ⚠️ **這個目錄不推 GitHub。** 它描述的是「怎麼連進我家的網路」，
> 跟 `deploy/` 同一類。本機有版控，但不 cherry-pick 到推送分支。

---

## 這在做什麼

```
使用者 ──→ 學校 VM ──┬─ 去識別化（姓名/身分證/電話/地址 遮蔽）
                     │
                     ├─ 生成 ──┬─① Cloudflare Tunnel ──→ 家裡桌機的 Ollama
                     │         └─② NVIDIA 免費 API（桌機不在線時）
                     │
                     └─ 檢索 ──┬─① 同一條隧道 ──→ 桌機的 text2vec（組員的模型）
                               └─② NVIDIA embedding API
```

兩條線各自獨立備援。桌機關機時，生成退到 NVIDIA、檢索也退到 NVIDIA，
功能不會不見 —— 只是換一組模型。

**為什麼檢索也要能走桌機**：組員建的向量庫（`rag/rental_law_db`）是用
`shibing624/text2vec-base-chinese` 建的。要讓那份成果真的被用到，
查詢就必須用同一個模型。但桌機會關機，所以不能只有它。

---

## 為什麼這樣比較安全

| | 傳統作法（port forwarding） | Cloudflare Tunnel |
|---|---|---|
| 連線方向 | 外面連進來 | **桌機主動連出去** |
| 路由器 | 要開 port | 不用動 |
| 家裡 IP | 出現在公開 DNS | **從不公開** |
| 被掃到 | 幾小時內就會被掃 | 沒有可掃的東西 |

桌機從來不接受連入連線。它自己連上 Cloudflare，維持一條長連線，
請求從那條連線送進來。所以「從網路上找到你家」這件事不成立。

再加上三道：

1. **Cloudflare Access** — service token 在邊緣就驗，沒帶的請求根本進不到家裡
2. **X-API-Key** — 代理自己再驗一次。Access 被設定錯或被關掉時仍擋得住
3. **只聽 127.0.0.1** — 代理不對區網開放，`cloudflared` 從本機連過來

> 注意：TLS 在 Cloudflare 邊緣解開，所以**去識別化仍然重要** ——
> 這條路上的資料不是端到端加密的。這也是為什麼 VM 送出去之前
> 就把姓名、身分證、電話、地址遮掉。

---

## 步驟一：桌機（Windows）

### 1. 裝 Ollama

<https://ollama.com/download/OllamaSetup.exe>

裝完它會在背景執行並監聽 `127.0.0.1:11434`。**預設值就是對的，不要改成 0.0.0.0** ——
對外的事情交給隧道，Ollama 只要聽本機就好。

拉模型（GTX 1060 6GB 跑 4B 模型剛好）：

```
ollama pull gemma3:4b
```

確認：

```
ollama list
```

### 2. 裝 Python

<https://www.python.org/downloads/>（3.11 以上）

⚠️ 安裝畫面第一頁要勾 **Add python.exe to PATH**，不然後面找不到指令。

### 3. 把 desktop 資料夾複製到桌機

整個 `desktop/` 複製過去（隨身碟、雲端硬碟都行）。

### 4. 產生 API key 並填設定

在 `desktop` 資料夾按右鍵 →「在終端中開啟」：

```
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

複製 `.env.example` 成 `.env`，把上面印出來的字串填進 `LLM_TUNNEL_API_KEY`。

> 這把鑰匙等一下 VM 的 `.env` 要填**同一把**。先別關視窗。

### 5. 啟動

點兩下 **`start.bat`**。第一次會花 5–10 分鐘下載 PyTorch 和模型（約 700MB）。

看到這行就成功了：

```
embedding 就緒：shibing624/text2vec-base-chinese（768 維）
代理啟動於 http://127.0.0.1:8787（只聽本機）
```

另開一個終端確認：

```
curl http://127.0.0.1:8787/health
```

應該回 `"embeddingReady": true`。

---

## 步驟二：cloudflared（桌機）

### 1. 下載

<https://github.com/cloudflare/cloudflared/releases/latest> 下載
`cloudflared-windows-amd64.exe`，改名成 `cloudflared.exe`，
放到例如 `C:\cloudflared\`。

### 2. 登入並建立隧道

在該資料夾開終端：

```
.\cloudflared.exe tunnel login
```

瀏覽器會開啟，選你的網域授權。

```
.\cloudflared.exe tunnel create rentmate-llm
```

記下輸出的 **Tunnel ID**（一長串 UUID）。

### 3. 設定檔

建立 `C:\Users\你的帳號\.cloudflared\config.yml`：

```yaml
tunnel: 貼上你的-TUNNEL-ID
credentials-file: C:\Users\你的帳號\.cloudflared\貼上你的-TUNNEL-ID.json

ingress:
  # 隧道只通到代理那一個 port。
  # 不要寫 service: http://127.0.0.1:11434 直接通到 Ollama ——
  # 那會跳過 X-API-Key 那道，只剩 Access 一道防線。
  - hostname: llm.你的網域
    service: http://127.0.0.1:8787
  - service: http_status:404
```

### 4. 綁 DNS

```
.\cloudflared.exe tunnel route dns rentmate-llm llm.你的網域
```

### 5. 裝成服務（開機自動啟動）

**用系統管理員身分**開 PowerShell：

```
C:\cloudflared\cloudflared.exe service install
```

這樣重開機後隧道會自己回來。（先手動測的話用 `.\cloudflared.exe tunnel run rentmate-llm`。）

---

## 步驟三：Cloudflare Zero Trust 後台

<https://one.dash.cloudflare.com/> → Access

### 1. 建立應用程式

**Access → Applications → Add an application → Self-hosted**

- Application name：`RentMate LLM`
- Public hostname：`llm.你的網域`

### 2. 建立政策 ⚠️ 這步最容易做錯

- Policy name：`VM service token`
- **Action：`Service Auth`** ← **不是 `Allow`**
- Include → **Service Token** → 選下一步建的那個

> 選 `Allow` 的話 Cloudflare 會要求互動式登入（跳登入頁），
> 而 VM 是程式在呼叫，沒有人可以點按鈕 —— 結果是每個請求都被擋。

### 3. 建立 service token

**Access → Service Auth → Create Service Token**

- Name：`rentmate-vm`
- 有效期限：選 1 年

⚠️ **Client Secret 只會顯示這一次。** 複製下來，等一下填進 VM 的 `.env`。

### 4. 從 VM 測試

```bash
curl -s https://llm.你的網域/health \
  -H "CF-Access-Client-Id: 你的-client-id" \
  -H "CF-Access-Client-Secret: 你的-client-secret"
```

要看到 `{"status":"ok",...}`。看到 HTML 登入頁 = 第 2 步的 Action 選錯了。

---

## 步驟四：VM 設定

編輯 VM 上的 `~/rentmate/.env`：

```bash
# ---- 生成 ----
LLM_PROVIDER_ORDER="ollama,nvidia"
OLLAMA_URL="https://llm.你的網域"
OLLAMA_MODEL="gemma3:4b"

# ---- 兩道憑證（生成與檢索共用）----
LLM_TUNNEL_API_KEY="桌機 .env 裡的同一把"
CF_ACCESS_CLIENT_ID="xxxxx.access"
CF_ACCESS_CLIENT_SECRET="xxxxx"

# ---- 檢索 ----
EMBEDDING_PROVIDER="local,nvidia"
LOCAL_EMBEDDING_MODEL="shibing624/text2vec-base-chinese"
```

套用：

```bash
cd ~/rentmate && docker compose up -d --build fastapi
```

---

## 步驟五：建 local 那組向量 ⚠️ 不做這步檢索不會走桌機

語料現在只有 NVIDIA 那組向量（2048 維）。桌機的模型是 768 維，
**兩組向量不能混用** —— 混用算出來的相似度是無意義的亂數，
而且不會報錯，只會安靜地檢索到錯的法條。

所以要為桌機的模型另外建一份：

```bash
docker compose exec -T fastapi python build_vectors.py --provider local
docker compose cp fastapi:/app/law_corpus.json backend/law_corpus.json
docker compose up -d --build fastapi
```

然後把 `law_corpus.json` 同步回開發機 commit 進版控。

之後 `law_corpus.json` 會同時有兩組：

```json
"embeddingSpaces": {
  "local":  { "model": "shibing624/text2vec-base-chinese", "dim": 768 },
  "nvidia": { "model": "nvidia/nemotron-3-embed-1b",       "dim": 2048 }
}
```

---

## 步驟六：驗證

```bash
docker compose exec fastapi python check_llm.py --config
```

要看到：

```
 向量檢索（決定給模型看哪幾條法規）
  嘗試順序      : local → nvidia
  語料空間      : 2 組
     local   shibing624/text2vec-base-chinese（768 維）
     nvidia  nvidia/nemotron-3-embed-1b（2048 維）

  ✅ local：shibing624/text2vec-base-chinese（768 維）
  ✅ nvidia：nvidia/nemotron-3-embed-1b（2048 維）
  ✅ 檢索可用
```

再跑完整的一次分析：

```bash
docker compose exec fastapi python check_llm.py
```

log 裡會出現 `法規檢索（local/shibing624/text2vec-base-chinese）：取 8/29 塊`。

**測備援**：把桌機的代理關掉（Ctrl+C），再跑一次。
應該自動變成 `法規檢索（nvidia/...）`，而且**不會明顯變慢** ——
第一次會記下「連不上」，60 秒內的後續請求直接跳過桌機。

---

## 排錯

| 症狀 | 原因 | 怎麼修 |
|---|---|---|
| curl 回 HTML 登入頁 | Access 政策 Action 選了 `Allow` | 改成 `Service Auth` |
| `401 unauthorized` | 兩邊的 `LLM_TUNNEL_API_KEY` 不一樣 | 對一下，注意結尾有沒有多空白 |
| `503 ollama unreachable` | Ollama 沒在跑 | `ollama list` 確認；沒有就 `ollama serve` |
| `embeddingReady: false` | 模型沒載起來 | 看代理視窗的 WARNING；多半是第一次下載被中斷 |
| log 說「語料用 A 建、設定要用 B」 | 改了模型但沒重建語料 | `build_vectors.py --provider local` |
| log 說「查詢向量 768 維，語料是 2048 維」 | 沒建 local 那組向量 | 同上 |
| 隧道重開機後不見 | 沒裝成服務 | 用系統管理員身分跑 `cloudflared service install` |

---

## 桌機關機時會怎樣

**功能不會不見。** 生成和檢索都會退到 NVIDIA。

第一個請求會多花約 5 秒（連線逾時），之後 60 秒內的請求直接跳過桌機，
不再付那 5 秒（`UPSTREAM_COOLDOWN_SECONDS`）。桌機一開機就會自動恢復，
不用等冷卻到期、也不用重啟任何東西。

口試那天把桌機關了帶去學校也沒關係 —— 這正是備援存在的理由。
