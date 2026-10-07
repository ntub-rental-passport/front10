"""VM 內網的 CPU embedding 備援；模型快取在建置時準備，執行時不需連外。"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("rag")


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


# 必須與後端及語料向量使用的模型一致，換模型就得重建語料向量。
EMBED_MODEL = _env("LOCAL_EMBEDDING_MODEL", "shibing624/text2vec-base-chinese")
# 模型上限 512 token；切窗平均讓長合約的後半段也能參與檢索。
WINDOW_CHARS = int(_env("EMBED_WINDOW_CHARS", "450"))

_model = None
_model_error = ""


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


# 機器對機器的內網服務，不需要自動產生的 API 說明頁。
app = FastAPI(title="RentMate embedding 備援", docs_url=None, redoc_url=None, lifespan=lifespan)


def load_model() -> None:
    """載入失敗仍提供健康狀態，讓後端知道 embedding 備援尚未就緒。"""
    global _model, _model_error
    _model = None
    _model_error = ""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        _model_error = f"sentence-transformers 未安裝：{error}"
        logger.warning("embedding 停用 —— %s", _model_error)
        return

    logger.info("載入 embedding 模型 %s（CPU，使用映像內的快取）…", EMBED_MODEL)
    try:
        model = SentenceTransformer(EMBED_MODEL, device="cpu")
        dim = model.get_sentence_embedding_dimension()
        _model = model
        logger.info("embedding 就緒：%s（%d 維）", EMBED_MODEL, dim)
    except Exception as error:      # 磁碟、快取損壞、模型名稱打錯……
        _model_error = f"{type(error).__name__}: {error}"
        logger.warning("embedding 停用 —— %s", _model_error)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "embeddingModel": EMBED_MODEL if _model is not None else None,
        "embeddingReady": _model is not None,
    }


@app.post("/embed")
def embed(payload: dict):
    """同步端點讓 CPU 推論進執行緒池，避免阻塞 /health 的事件迴圈。"""
    # 先驗格式再看模型：錯誤輸入應回 400，避免呼叫端誤以為 503 值得重試。
    texts = payload.get("input")
    if isinstance(texts, str):
        texts = [texts] if texts else []
    if not isinstance(texts, list) or not texts or not all(isinstance(t, str) for t in texts):
        raise HTTPException(status_code=400, detail="input 必須是字串或字串陣列")
    if len(texts) > 64:
        raise HTTPException(status_code=400, detail="一次最多 64 筆")

    if _model is None:
        raise HTTPException(status_code=503, detail=f"embedding 不可用（{_model_error}）")

    # input_type 收下但不使用：text2vec 是對稱模型，查詢與文件同樣處理。
    vectors = [_encode_long(t) for t in texts]
    return {
        "model": EMBED_MODEL,
        "dim": len(vectors[0]),
        "data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)],
    }


def _encode_long(text: str) -> list[float]:
    """長文字切窗後平均，避免模型安靜地截掉合約後段。"""
    text = text.strip()
    if not text:
        return [0.0] * _model.get_sentence_embedding_dimension()

    windows = [text[i:i + WINDOW_CHARS] for i in range(0, len(text), WINDOW_CHARS)]
    vectors = _model.encode(windows, convert_to_numpy=True, show_progress_bar=False)
    if len(windows) == 1:
        return [float(v) for v in vectors[0]]
    return [float(v) for v in vectors.mean(axis=0)]
