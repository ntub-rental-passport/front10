"""把法規語料向量化，寫回 backend/law_corpus.json。

## 一份語料，兩組向量

    --provider nvidia   用 NVIDIA API（nvidia/nemotron-3-embed-1b，2048 維）
    --provider local    打桌機上的 embedding 服務
                        （組員建庫用的 shibing624/text2vec-base-chinese，768 維）
    --provider all      兩個都建

兩組向量存在同一個檔案的不同欄位：

    chunks[].embeddings = { "nvidia": [...], "local": [...] }
    embeddingSpaces      = { "nvidia": {model, dim}, "local": {model, dim} }

**不同模型的向量在不同的語意空間，混用得到的相似度是沒有意義的亂數。**
所以查詢時用哪個 provider，就只比對那一組（見 law_corpus.py）。

建其中一組不會動到另一組 —— 桌機模型換了只要重建 local，
NVIDIA 那組仍然是好的備援。

## 為什麼 local 也走 HTTP，而不是直接在這裡載入模型

這支腳本跑在 VM 的容器裡，那裡沒有 torch（也裝不下）。
更重要的是：**建語料與查詢必須走同一條路**。同一個端點、同一個模型、
同一段前處理 —— 任何一邊偷偷不一樣，向量就對不起來，
而且不會報錯，只會安靜地檢索到錯的法條。

## 為什麼向量存在 JSON 而不是 Chroma

後端容器就不需要 chromadb 依賴。29 個向量用純 Python 算餘弦相似度
的成本可以忽略（微秒等級）。語料長到上千塊時再換回向量資料庫才划算。

## 用法

金鑰只在 VM 的 .env 裡，所以在容器內執行，再把結果複製回 repo：

    docker compose exec -T fastapi python build_vectors.py --provider all
    docker compose cp fastapi:/app/law_corpus.json backend/law_corpus.json

    # 從 VM 同步回開發機，commit 進版控

為什麼不在開發機跑：那要把 NVIDIA_API_KEY 複製到本機的 .env，
多一份金鑰副本就多一個外洩點。算向量是一次性動作，
在已經有金鑰的地方做完、只把結果搬回來，是比較乾淨的作法。
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import embeddings  # noqa: E402
from embeddings import EmbeddingUnavailable, embed_texts, model_for  # noqa: E402

# 與本檔同目錄。容器內是 /app/law_corpus.json，開發機是 backend/law_corpus.json
CORPUS_PATH = HERE / "law_corpus.json"
BATCH_SIZE = 10   # 一次送太多會被拒；29 塊分 3 批即可


def _passage_text(chunk: dict) -> str:
    """送去向量化的文字。

    連同標題一起送：標題本身帶有很強的主題訊號（「五、押金約定及返還」），
    只送內文會讓「押金」這種關鍵詞的權重被稀釋。

    ⚠️ 改這個函式就必須重建所有空間的向量 —— 查詢端比對的是
    這裡產生的向量，前後不一致會讓相似度失準。
    """
    headers = " ".join(chunk.get("headers") or [])
    return f"{chunk.get('source', '')} {headers}\n{chunk['text']}"[:2000]


async def build_space(provider: str, chunks: list[dict]) -> tuple[list[list[float]], str]:
    model = model_for(provider)
    print(f"\n[{provider}] 模型 {model}，語料 {len(chunks)} 塊")

    vectors: list[list[float]] = []
    for start in range(0, len(chunks), BATCH_SIZE):
        batch = [_passage_text(c) for c in chunks[start:start + BATCH_SIZE]]
        vectors.extend(
            await embed_texts(batch, input_type="passage", timeout=120, provider=provider)
        )
        print(f"  已處理 {min(start + BATCH_SIZE, len(chunks))}/{len(chunks)}")

    if len(vectors) != len(chunks):
        raise SystemExit(f"❌ [{provider}] 向量數（{len(vectors)}）與語料塊數（{len(chunks)}）不符")

    dims = {len(v) for v in vectors}
    if len(dims) != 1:
        raise SystemExit(f"❌ [{provider}] 維度不一致：{sorted(dims)}")

    print(f"  ✅ {len(vectors)} 個向量，維度 {dims.copy().pop()}")
    return vectors, model


def _migrate_legacy(data: dict) -> None:
    """把舊格式（單一 embedding 欄位）搬進新的 embeddings 欄位。

    不做這步的話，建了 local 之後舊的 nvidia 向量會留在一個
    沒人讀的欄位裡 —— 看起來還在，實際上已經不參與檢索。
    """
    legacy_model = str(data.get("embeddingModel") or "")
    if not legacy_model:
        return
    space = (embeddings.LOCAL if legacy_model == embeddings.LOCAL_MODEL_DEFAULT
             else embeddings.NVIDIA)

    moved = 0
    for chunk in data.get("chunks", []):
        if (vector := chunk.pop("embedding", None)):
            chunk.setdefault("embeddings", {}).setdefault(space, vector)
            moved += 1

    if moved:
        data.setdefault("embeddingSpaces", {}).setdefault(space, {
            "model": legacy_model,
            "dim": int(data.get("embeddingDim") or 0),
        })
        print(f"已將 {moved} 塊的舊向量歸入「{space}」空間（模型 {legacy_model}）")
    data.pop("embeddingModel", None)
    data.pop("embeddingDim", None)


async def main() -> None:
    parser = argparse.ArgumentParser(description="建立法規語料的向量")
    parser.add_argument(
        "--provider", default="nvidia",
        choices=[*embeddings.PROVIDERS, "all"],
        help="要建哪個空間的向量（預設 nvidia）",
    )
    args = parser.parse_args()

    if not CORPUS_PATH.exists():
        sys.exit(f"❌ 找不到語料：{CORPUS_PATH}\n   請先在開發機執行 python rag/export_corpus.py")

    data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    chunks = data.get("chunks", [])
    if not chunks:
        sys.exit("❌ 語料是空的")

    _migrate_legacy(data)

    targets = list(embeddings.PROVIDERS) if args.provider == "all" else [args.provider]
    for provider in targets:
        if not embeddings.is_configured(provider):
            hint = ("設定 NVIDIA_API_KEY" if provider == embeddings.NVIDIA
                    else "設定 OLLAMA_URL 或 LOCAL_EMBEDDING_URL（桌機代理的位址）")
            if len(targets) == 1:
                sys.exit(f"❌ [{provider}] 未設定 —— 請{hint}")
            print(f"\n[{provider}] 未設定，略過（請{hint}）")
            continue

        try:
            vectors, model = await build_space(provider, chunks)
        except EmbeddingUnavailable as error:
            if len(targets) == 1:
                sys.exit(f"❌ [{provider}] 不可用：{error}")
            print(f"  ❌ 不可用：{error} —— 這個空間維持原樣")
            continue

        for chunk, vector in zip(chunks, vectors):
            chunk.setdefault("embeddings", {})[provider] = vector
        # 記下用哪個模型算的：換模型時必須整份重算，
        # 這個欄位讓後端在載入時就能檢查出不一致
        data.setdefault("embeddingSpaces", {})[provider] = {
            "model": model,
            "dim": len(vectors[0]),
        }

    if not data.get("embeddingSpaces"):
        sys.exit("❌ 沒有建立任何向量空間")

    CORPUS_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    size_mb = CORPUS_PATH.stat().st_size / 1024 / 1024
    print(f"\n✅ 已寫入 {CORPUS_PATH}（{size_mb:.1f} MB）")
    for name, meta in sorted(data["embeddingSpaces"].items()):
        print(f"   {name:7s} {meta['model']}（{meta['dim']} 維）")
    print("   接著把它複製出容器並同步回 repo（見檔頭說明）")


if __name__ == "__main__":
    asyncio.run(main())
