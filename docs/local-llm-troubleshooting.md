# 本機契約 AI 分析設定

正式環境使用 NVIDIA → Ollama 慢速 CPU 備援（qwen2.5:3b）；本機預設只用 NVIDIA，選用 Ollama 時，設定 `LLM_PROVIDER_ORDER=nvidia,ollama` 與 `OLLAMA_URL`。正式環境 VM 的 `.env` 設定 `EMBEDDING_PROVIDER="local"`，只使用 RAG 容器作為 embedding 來源，詳見[部署指南第五節](../deploy/README.md#五rag-檢索服務)。連不上時檢索會退回全部 29 塊法規。
本機可用 `docker compose build rag` 建置 RAG embedding 服務（映像內含模型）；若本機後端需呼叫它，
須另設可達的 `LOCAL_EMBEDDING_URL`（正式 compose 不開主機 port），或保留預設 `EMBEDDING_PROVIDER=nvidia` 使用 NVIDIA embedding。

前端 OCR 使用 `OLLAMA_OCR_MODEL`，Python 契約分析使用 `OLLAMA_MODEL`，兩者是獨立設定。修改專案根目錄 `.env` 後須重新啟動 Python 後端。

1. 執行 `ollama list`，把已安裝的模型名稱填入 `OLLAMA_MODEL`，不可只改 OCR 模型。
2. 支援思考控制的模型可設定 `OLLAMA_THINK=false`，避免額外思考輸出增加等待時間。不支援此參數的模型應移除這個設定。
3. `OLLAMA_ANALYZE_TIMEOUT` 是分析等待秒數；延長時間不能保證 CPU 能完成大型模型推論。
4. 執行 `ollama ps` 檢查模型使用 CPU 或 GPU。簡短 JSON 測試成功，只代表模型可以呼叫，不代表完整契約分析的速度及品質已通過驗證。
5. `NVIDIA_API_KEY` 未設定時，雲端 LLM 備援會略過，embedding 也無法使用。現行法規檢索會退回全部語料，不會捏造向量檢索結果。金鑰只放在本機 `.env`，不要提交或貼入對話。

## 訊息判讀

- Ollama 404：先確認模型已安裝，再檢查服務 URL。
- ReadTimeout：模型未在等待上限內回應；檢查推論負載，不能再當成模型不存在。
- NVIDIA 未設定：未呼叫雲端服務，不等於雲端服務故障。
- 向量檢索不可用：改用全部法規語料，LLM 仍可運作，但輸入負載會增加。
- 分析 503：當次未取得可用結果，不能顯示「沒有風險」。

啟動使用 `npm run dev:all` 即可，不要同時再執行 `npm run dev:api`，避免 8787 衝突。

參考：[Ollama generate API](https://docs.ollama.com/api/generate)。
