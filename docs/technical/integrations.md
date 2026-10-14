# OCR、AI 與外部服務整合

核對日期：2026-10-08。[返回入口](../README.md)

## 契約辨識與複核

Express `server/index.js` 以記憶體接收上傳，呼叫 Google Cloud Vision 取得文字與位置，再由 `shared/`、`contract-field-gate.js` 抽取出租人、承租人、地址、租期起迄、租金、繳租日、押金與違約金九個欄位。

預設上限：一次一份 PDF 或最多 20 張圖片，單檔 20 MB、總計 80 MB。前端、Express 與反向代理限制應一致。PDF／TIFF 的處理與一般圖片不同；不可假設所有格式都有可送 VLM 的欄位裁切圖。

背景 Ollama 複核最多選三個未確認欄位，使用附近文字及可用圖片。`OLLAMA_OCR_ENABLED=false` 可停用複核，不停用 Vision 與規則抽取。複核失敗保留規則結果，使用者仍須人工校對。前端串流協定見 [API 說明](api.md)。

原始檔與裁切暫存於程序記憶體，這條 OCR 流程不寫入本機磁碟或資料庫。但文件內容會送 Google Vision；啟用複核時，相關文字及圖片會送設定的 Ollama。使用者之後確認存檔的欄位會另寫業務資料庫。

## 合約分析與法規問答

FastAPI `routers/contract.py` 使用 `ai/deidentify.py`、`ai/law_corpus.py`、`ai/embeddings.py`、`ai/llm_provider.py`。生成模型依 `LLM_PROVIDER_ORDER` 嘗試 NVIDIA／Ollama，分析與對話可指定不同模型。全部不可用時回報 503，不填入固定的預設分析。

合約去識別化與法規檢索是特定流程的處理，不代表其他功能上傳前都已去識別化。風險規則、法條引用與模型生成亦是不同層，修改時需分別驗證 [風險政策](../contract-risk-policy.md)、[解釋](../contract-risk-explanations.md) 與引用測試。

語料與向量存於 `backend/ai/law_corpus.json`，法規來源另在 `rag/`。更改 embedding 模型需重新建置相同模型的 passage vectors，不能混用不同維度／模型的向量。

```powershell
python backend/scripts/check_llm.py --config
python backend/scripts/build_vectors.py --help
python backend/scripts/eval_retrieval.py --help
```

上述 `--help` 用於確認工具參數。真正建向量與模型診斷可能連外、消耗額度或改寫語料，執行前確認 provider、輸出路徑與設定。模型名稱及可用性以服務回覆為準，本文件不保證外部模型持續存在。

## 點交影像

`routers/inspection.py` 先保存照片與紀錄，再分析；VLM 使用 NVIDIA 與 `INSPECTION_VLM_MODEL`。入住／退租影像比對會核對照片版本，來源變動時不應保存過期結果。模型主觀信心不是經校準機率，也不等同損害責任判定。

目前目標可為租客 `rentals` 或 `lease:<id>` 的房東租約；後者需租客可見與對應 migration。照片來源與拍攝品質保存於紀錄，檔案上傳與現場拍攝的證據說明不同。細節見 [點交文件](../inspection-persistence.md)。

## 其他整合

| 整合 | 實作來源 | 維護重點 |
| --- | --- | --- |
| Google OAuth | `routers/auth.py` | client、callback URL、前端回跳與帳號綁定 |
| SMTP | `notifications/email_service.py`、`user_notify.py` | 註冊／管理員／密碼驗證與業務通知不是同一啟用條件 |
| Web Push | `notifications/garbage_service.py` | VAPID、訂閱權限與失效訂閱處理 |
| 清運班表 | `public/data/`、`scripts/update-*-garbage.ts` | 資料來源、完整分頁、更新時間與既有提醒快照 |
| 停水 | `routers/outage.py` | 呼叫台水 API；失敗不是無公告 |
| 停電 | `routers/outage.py`、`scripts/fetch_taipower_outage.py` | API 讀本地 JSON，需外部安排更新；本 repo 的 GitHub workflow 不包含停電每日更新排程 |

目前唯一 `.github/workflows/` 自動流程是清運資料更新，每月 1 日臺灣時間 10:17 執行，也支援手動觸發；它測試並建置後提出資料更新 PR，不代表完整系統已有持續部署。
