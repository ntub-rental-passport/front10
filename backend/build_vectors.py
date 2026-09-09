"""用 NVIDIA embedding API 把語料重新向量化，寫回 backend/law_corpus.json。

## 為什麼要重算

組員原本的向量庫是用 shibing624/text2vec-base-chinese 建的（768 維）。
查詢時必須用**同一個模型**把問題轉成向量才能比對 —— 而那需要
sentence-transformers + torch（約 2GB），學校 VM 塞不下。

改用 NVIDIA 的 embedding API 後，語料也必須用同一個模型重算。
**不同模型的向量在不同的語意空間，混用得到的相似度是沒有意義的亂數。**

## 為什麼向量存在 JSON 而不是 Chroma

後端容器就不需要 chromadb 依賴。29 個向量、2048 維，
用純 Python 算餘弦相似度的成本可以忽略（微秒等級）。
語料長到上千塊時再換回真正的向量資料庫才划算。

## 用法

金鑰只在 VM 的 .env 裡，所以在容器內執行，再把結果複製回 repo：

    # 1. 在容器內算向量（金鑰不離開 VM）
    docker compose exec -T fastapi python build_vectors.py

    # 2. 把結果複製出來
    docker compose cp fastapi:/app/law_corpus.json backend/law_corpus.json

    # 3. 從 VM 同步回開發機，commit 進版控

為什麼不在開發機跑：那要把 NVIDIA_API_KEY 複製到本機的 .env，
多一份金鑰副本就多一個外洩點。算向量是一次性動作，
在已經有金鑰的地方做完、只把結果搬回來，是比較乾淨的作法。
"""

import asyncio
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from embeddings import DEFAULT_MODEL, embed_texts  # noqa: E402

# 與本檔同目錄。容器內是 /app/law_corpus.json，開發機是 backend/law_corpus.json
CORPUS_PATH = HERE / "law_corpus.json"
BATCH_SIZE = 10   # 一次送太多會被拒；29 塊分 3 批即可


async def main() -> None:
    if not (os.getenv("NVIDIA_API_KEY") or "").strip():
        sys.exit("❌ 未設定 NVIDIA_API_KEY")
    if not CORPUS_PATH.exists():
        sys.exit(f"❌ 找不到語料：{CORPUS_PATH}\n   請先在開發機執行 python rag/export_corpus.py")

    data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    chunks = data.get("chunks", [])
    if not chunks:
        sys.exit("❌ 語料是空的")

    model = (os.getenv("EMBEDDING_MODEL") or DEFAULT_MODEL).strip()
    print(f"語料 {len(chunks)} 塊，使用模型 {model}")

    vectors: list[list[float]] = []
    for start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[start:start + BATCH_SIZE]
        # 連同標題一起送：標題本身帶有很強的主題訊號（「五、押金約定及返還」），
        # 只送內文會讓「押金」這種關鍵詞的權重被稀釋
        texts = [
            f"{c.get('source', '')} {' '.join(c.get('headers') or [])}\n{c['text']}"[:2000]
            for c in batch
        ]
        vectors.extend(await embed_texts(texts, input_type="passage", timeout=120))
        print(f"  已處理 {min(start + BATCH_SIZE, len(chunks))}/{len(chunks)}")

    if len(vectors) != len(chunks):
        sys.exit(f"❌ 向量數（{len(vectors)}）與語料塊數（{len(chunks)}）不符")

    for chunk, vector in zip(chunks, vectors):
        chunk["embedding"] = vector

    # 記下用哪個模型算的：換模型時必須整份重算，
    # 這個欄位讓後端能在啟動時檢查出不一致
    data["embeddingModel"] = model
    data["embeddingDim"] = len(vectors[0])

    CORPUS_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    size_mb = CORPUS_PATH.stat().st_size / 1024 / 1024
    print(f"\n✅ 已寫入 {CORPUS_PATH}")
    print(f"   維度 {len(vectors[0])}、檔案 {size_mb:.1f} MB")
    print("   接著把它複製出容器並同步回 repo（見檔頭說明）")


if __name__ == "__main__":
    asyncio.run(main())
