"""桌機端代理：對外一個入口，後面是 Ollama（生成）與本機 embedding（檢索）。

## 在整個系統裡的位置

    使用者 → 學校 VM（去識別化）→ Cloudflare Tunnel → 這支程式 ┬→ Ollama    :11434
                                                              └→ 本機 embedding

VM 上的後端把「生成」和「檢索」都指向同一個網址（OLLAMA_URL），
因為兩者本來就在同一台桌機上。分成兩個網址只會多一個打錯的機會。

## 三道防線，每一道都假設前一道會壞

    ① Cloudflare Access  service token 在邊緣就驗，沒帶的請求
                         根本進不到家裡的網路
    ② X-API-Key          這支程式自己驗。Access 被設定錯、或某天
                         被關掉時，這道仍然擋得住
    ③ 127.0.0.1          只聽本機。cloudflared 從本機連過來，
                         所以不需要對區網或網際網路開放

⚠️ 沒設 LLM_TUNNEL_API_KEY 就**拒絕啟動**。一個沒有鑰匙的代理
一旦被連到，等於把家裡的顯卡送給別人用 —— 寧可起不來。

## 為什麼不裝 Docker

Windows 上要讓容器吃到顯卡得先裝 Docker Desktop + WSL2 +
NVIDIA Container Toolkit。為了跑一個代理付這些複雜度不划算，
而且每一層都是一個會壞、會需要維護的東西。
Ollama 的 Windows 安裝檔自己帶 CUDA，原生跑就好。

## embedding 為什麼用 CPU

生成要顯卡，embedding 不用：text2vec-base-chinese 是小模型，
一個查詢在 CPU 上只要幾十毫秒。讓它跟 Ollama 搶顯存反而會拖慢生成。
"""

import logging
import os
import secrets
import sys
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("proxy")


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


API_KEY = _env("LLM_TUNNEL_API_KEY")
OLLAMA_URL = _env("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
# 必須與 VM 的 LOCAL_EMBEDDING_MODEL 一致，也必須是組員建向量庫時用的那個。
# 換模型就要重建語料向量（backend/build_vectors.py --provider local）。
EMBED_MODEL = _env("LOCAL_EMBEDDING_MODEL", "shibing624/text2vec-base-chinese")
# text2vec 的上限是 512 token。超過的輸入切窗後平均，
# 而不是讓它安靜地把後面 80% 丟掉（合約動輒四千字）。
WINDOW_CHARS = int(_env("EMBED_WINDOW_CHARS", "450"))
GENERATE_TIMEOUT = float(_env("PROXY_GENERATE_TIMEOUT", "600"))

_model = None          # 延後載入，載不起來時仍要能代理生成
_model_error = ""

@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


# docs_url/redoc_url 關掉：這是機器對機器的端點，
# 不需要對外掛一份自動產生的 API 說明書。
app = FastAPI(title="RentMate 桌機代理", docs_url=None, redoc_url=None, lifespan=lifespan)


def load_model() -> None:
    """載入 embedding 模型。

    失敗不中斷服務：生成（Ollama）與檢索是兩件獨立的事，
    embedding 掛掉時 VM 會退回 NVIDIA 算向量，生成仍然走桌機。
    為了一個壞掉的功能把好的那個也關掉，沒有道理。
    """
    global _model, _model_error
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        _model_error = f"sentence-transformers 未安裝：{error}"
        logger.warning("embedding 停用 —— %s", _model_error)
        return

    logger.info("載入 embedding 模型 %s（第一次會下載約 400MB）…", EMBED_MODEL)
    try:
        _model = SentenceTransformer(EMBED_MODEL, device="cpu")
        dim = _model.get_sentence_embedding_dimension()
        logger.info("embedding 就緒：%s（%d 維）", EMBED_MODEL, dim)
    except Exception as error:      # 網路、磁碟、模型名稱打錯……
        _model_error = f"{type(error).__name__}: {error}"
        logger.warning("embedding 停用 —— %s", _model_error)


def require_key(provided: str | None) -> None:
    """比對 API key。

    用 compare_digest 而不是 == ：字串比較會在第一個不同的字元就回傳，
    從回應時間可以一個字元一個字元地猜出鑰匙。這裡的成本是零，
    沒有理由不用。
    """
    if not provided or not secrets.compare_digest(provided, API_KEY):
        # 不區分「沒帶」和「帶錯」—— 對方不需要知道是哪一種
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    """無需鑰匙。用來確認「代理活著」，不透露任何可用來攻擊的資訊。

    （對外仍在 Cloudflare Access 後面，外人連這個都看不到。）
    """
    return {
        "status": "ok",
        "ollama": OLLAMA_URL,
        "embeddingModel": EMBED_MODEL if _model else None,
        "embeddingReady": _model is not None,
    }


@app.post("/embed")
def embed(payload: dict, x_api_key: str | None = Header(default=None)):
    """把文字轉成向量。

    刻意用 def 而不是 async def：模型推論是會卡住的 CPU 工作，
    寫成 async 會讓整個事件迴圈停在那裡，連 /health 都回不了。
    FastAPI 會把同步的端點丟到執行緒池 —— 這正是我們要的。
    （VM 那邊也踩過同樣的坑，見 backend/llm_provider.py 的註解。）

    回應刻意做成 OpenAI 的形狀（data[].embedding），
    這樣 VM 端解析兩個 provider 的程式碼可以共用。
    """
    require_key(x_api_key)

    # 先驗請求格式再看模型在不在：格式錯的請求不管模型狀態都該回 400，
    # 回 503 會讓呼叫端以為「等一下再試就好」，結果重試幾次都一樣。
    texts = payload.get("input") or []
    if isinstance(texts, str):
        texts = [texts]
    if not texts or not all(isinstance(t, str) for t in texts):
        raise HTTPException(status_code=400, detail="input 必須是字串或字串陣列")
    if len(texts) > 64:
        raise HTTPException(status_code=400, detail="一次最多 64 筆")

    if _model is None:
        raise HTTPException(status_code=503, detail=f"embedding 不可用（{_model_error}）")

    # input_type 收下但不使用：text2vec 是對稱模型，查詢與文件同樣處理。
    # 收下是為了讓 VM 端兩個 provider 的呼叫介面一致。
    vectors = [_encode_long(t) for t in texts]
    return {
        "model": EMBED_MODEL,
        "dim": len(vectors[0]) if vectors else 0,
        "data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)],
    }


def _encode_long(text: str) -> list[float]:
    """長文字切窗後平均。

    模型上限 512 token。直接丟四千字的合約進去，它會安靜地只讀開頭
    然後回一個向量 —— 不報錯，但檢索依據只剩前五分之一。
    切窗平均至少讓整份文件都參與。

    法規語料每塊平均 140 字，永遠只有一個窗，所以語料向量的算法
    完全沒變 —— 這一段只影響長查詢。
    """
    text = text.strip()
    if not text:
        return [0.0] * _model.get_sentence_embedding_dimension()

    windows = [text[i:i + WINDOW_CHARS] for i in range(0, len(text), WINDOW_CHARS)]
    vectors = _model.encode(windows, convert_to_numpy=True, show_progress_bar=False)
    if len(windows) == 1:
        return [float(v) for v in vectors[0]]
    return [float(v) for v in vectors.mean(axis=0)]


@app.post("/api/generate")
async def generate(request: Request, x_api_key: str | None = Header(default=None)):
    """轉給 Ollama。

    整包轉發不解析內容：模型參數、格式設定都由 VM 決定，
    這裡多一層解析就多一個會跟 Ollama 版本脫節的地方。
    """
    require_key(x_api_key)
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(GENERATE_TIMEOUT, connect=5)) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                content=body,
                headers={"Content-Type": "application/json"},
            )
    except httpx.ConnectError:
        # Ollama 沒開。講清楚是哪一個沒開 —— 否則 VM 那邊只看得到
        # 一個 502，會誤以為是隧道或代理的問題。
        logger.error("連不上 Ollama（%s）—— 它有在跑嗎？", OLLAMA_URL)
        raise HTTPException(status_code=503, detail="ollama unreachable")
    except httpx.ReadTimeout:
        logger.error("Ollama 超過 %.0f 秒沒回應", GENERATE_TIMEOUT)
        raise HTTPException(status_code=504, detail="ollama timeout")

    return JSONResponse(
        status_code=response.status_code,
        content=response.json() if response.headers.get("content-type", "").startswith("application/json")
        else {"error": response.text[:500]},
    )


@app.get("/api/tags")
async def tags(x_api_key: str | None = Header(default=None)):
    """列出 Ollama 上有哪些模型。用來從 VM 確認「模型真的拉下來了」。"""
    require_key(x_api_key)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="ollama unreachable")
    return JSONResponse(status_code=response.status_code, content=response.json())


if __name__ == "__main__":
    if not API_KEY:
        sys.exit(
            "❌ 未設定 LLM_TUNNEL_API_KEY —— 拒絕啟動。\n"
            "   沒有鑰匙的代理一旦被連到，等於把家裡的顯卡送給別人用。\n"
            "   產生一把：python -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
            "   然後寫進 desktop\\.env（見 desktop\\.env.example）"
        )
    if len(API_KEY) < 24:
        sys.exit("❌ LLM_TUNNEL_API_KEY 太短（至少 24 字元）")

    import uvicorn

    # 只聽 127.0.0.1。cloudflared 從本機連過來，
    # 所以不需要對區網或網際網路開放 —— 也就沒有「忘記關防火牆」這回事。
    port = int(_env("PROXY_PORT", "8787"))
    logger.info("代理啟動於 http://127.0.0.1:%d（只聽本機）", port)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
