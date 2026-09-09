"""把 Chroma 向量庫裡的法規文字匯出成 backend/law_corpus.json。

## 為什麼要匯出，而不是讓後端直接讀 Chroma

1. **後端容器不需要 chromadb / torch。** 查詢向量庫必須用同一個 embedding
   模型把查詢字串轉成向量，那要 sentence-transformers + torch（約 2GB
   image、1GB 記憶體）。學校 VM 只剩 5.4GB，塞不下也不該塞。

2. **build context 的限制。** fastapi 容器是以 ./backend 為 context 建的，
   COPY 不到專案根目錄的 rag/。匯出成 backend/ 底下的 JSON 最單純。

3. **可以進版控、看得到 diff。** 法規內容變動時，git diff 直接看得出改了什麼；
   二進位的向量庫做不到這件事。

## 這不是取代向量檢索

語料目前只有 29 塊、9.7KB，全部放進 prompt 的召回率是 100%，
向量檢索反而多一層漏抓的風險。等語料長大到塞不進 context 時，
再把檢索換成真正的向量搜尋（跑在桌機上，見 P2b）——
後端的介面不會變，只是 retrieve() 的實作換掉。

## 用法

    python rag/export_corpus.py            # 產生 backend/law_corpus.json
    python rag/export_corpus.py --preview  # 只印出來看，不寫檔
"""

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "rag" / "rental_law_db" / "chroma.sqlite3"
OUT_PATH = ROOT / "backend" / "law_corpus.json"

# 檔名太長，顯示給使用者時用簡稱
SOURCE_LABELS = {
    "住宅租賃定型化契約應記載及不得記載事項_完整規則版.md": "住宅租賃定型化契約應記載及不得記載事項",
    "租賃住宅市場發展及管理條例_完整條文版.md": "租賃住宅市場發展及管理條例",
    "住宅租賃契約書範本_完整結構版.md": "住宅租賃契約書範本",
}


def load_chunks() -> list[dict]:
    """從 Chroma 的 sqlite 讀出文件與 metadata。

    直接讀 sqlite 而不透過 chromadb 套件：這支腳本只在開發機執行，
    不需要為了讀 29 筆資料而把整個 chromadb 依賴帶進來。
    """
    if not DB_PATH.exists():
        sys.exit(f"❌ 找不到向量庫：{DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    # 每個 chunk 的 metadata 分散在多列（key/value），先全部撈出來再組裝
    raw: dict[int, dict[str, str]] = {}
    for row_id, key, value in conn.execute(
        "SELECT id, key, string_value FROM embedding_metadata WHERE string_value IS NOT NULL"
    ):
        raw.setdefault(row_id, {})[key] = value
    conn.close()

    chunks = []
    for index, (_, meta) in enumerate(sorted(raw.items()), start=1):
        text = (meta.get("chroma:document") or "").strip()
        if not text:
            continue
        headers = [meta.get(f"Header {n}") for n in (1, 2, 3)]
        source_file = meta.get("source_file", "")
        chunks.append({
            # 模型要靠這個 id 標注法源，所以要短、固定、好比對
            "id": f"L{index:02d}",
            "source": SOURCE_LABELS.get(source_file, source_file),
            "sourceFile": source_file,
            "headers": [h for h in headers if h],
            "text": text,
        })
    return chunks


def main() -> None:
    chunks = load_chunks()
    total_chars = sum(len(c["text"]) for c in chunks)

    print(f"讀到 {len(chunks)} 個法規區塊，共 {total_chars} 字")
    by_source: dict[str, int] = {}
    for chunk in chunks:
        by_source[chunk["source"]] = by_source.get(chunk["source"], 0) + 1
    for source, count in sorted(by_source.items()):
        print(f"  {count:2d} 塊  {source}")

    if "--preview" in sys.argv:
        print()
        for chunk in chunks[:5]:
            print(f"[{chunk['id']}] {chunk['source']} › {' › '.join(chunk['headers'])}")
            print(f"      {chunk['text'][:120]}...")
        return

    OUT_PATH.write_text(
        json.dumps({"chunks": chunks}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n✅ 已寫入 {OUT_PATH.relative_to(ROOT)}（{OUT_PATH.stat().st_size / 1024:.1f} KB）")


if __name__ == "__main__":
    main()
