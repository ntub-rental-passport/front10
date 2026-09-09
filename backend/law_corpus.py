"""租賃法規語料的檢索與法源綁定。

## 這個模組要解決的問題

實測（2026-09-09）發現模型會**編造法條**，而且格式完美、看起來很專業：

    「租賃住宅市場發展及管理條例第11條：出租人應負擔租賃住宅之房屋稅、地價稅。」
      → 第 10-11 條實際上是「提前終止租約」
    「租賃住宅市場發展及管理條例第13條：違約金最高不得超過一個月租金。」
      → 第 13 條實際上是「廣告真實性義務」
    「《住宅租賃法》第十二條」
      → 台灣沒有這部法律

同一個問題問兩次，會編出兩個不同的條號 —— 它不是記錯，是每次現編。

租客會拿這些條號去跟房東談判。對方一查就破功，反而失去籌碼。
這比「沒有法源」更糟。

## 解法：法源不由模型生成，由系統填

    1. 把語料每一塊編號（L01…L29）放進 prompt
    2. 要求模型只能用這些編號標注法源，不可自行書寫條號
    3. **回應中的編號由系統換成實際的法規標題** —— 模型碰不到最終文字
    4. 認不得的編號直接丟棄（模型仍可能編出 L99）

模型負責判斷風險，系統負責標注法源，各司其職。

## 檢索：向量相似度，失敗時退回全部給

實測（2026-09-09）發現「29 塊全給」有實際代價：prompt 有 88.5% 是法規，
其中 45% 跟當下這份合約完全無關（契約審閱期、租賃業設立登記、罰則……），
模型的注意力被稀釋，命中率從 4/4 掉到 3/4。
語料的召回率是 100%，但**模型的注意力不是**。

因此改為向量檢索：只給最相關的幾塊。向量用 NVIDIA 的 embedding API
算（見 embeddings.py），語料的向量預先算好存在 law_corpus.json 裡，
查詢時只需要一次 API 呼叫。不需要 torch，VM 就跑得動。

**embedding 服務掛掉時退回「全部給」而不是中斷。**
檢索只是為了聚焦，全部給雖然效果差一點但仍然可用 ——
沒有理由因為檢索失敗就讓整個分析功能不能用。
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from embeddings import EmbeddingUnavailable, cosine, embed_texts

logger = logging.getLogger(__name__)

CORPUS_PATH = Path(__file__).resolve().parent / "law_corpus.json"


@dataclass(frozen=True)
class LawChunk:
    id: str
    source: str
    headers: tuple[str, ...]
    text: str
    # 預先算好的向量。缺席時該塊不參與相似度排序（會退回全部給）
    embedding: tuple[float, ...] = field(default=())

    @property
    def label(self) -> str:
        """給使用者看的法源標題。

        Header 1 通常只是重複文件標題（匯出時保留原樣以免失真），
        顯示時去掉，避免「住宅租賃定型化契約應記載及不得記載事項 ›
        住宅租賃定型化契約應記載及不得記載事項 (完整細項整理) › …」這種贅字。
        """
        parts = [h for h in self.headers if h and h not in self.source and self.source not in h]
        return " › ".join([self.source, *parts]) if parts else self.source


def _load() -> list[LawChunk]:
    if not CORPUS_PATH.exists():
        # 語料缺席不該讓整個後端起不來 —— 分析仍可運作，只是沒有法源可綁
        logger.error("找不到法規語料 %s，法源綁定將停用", CORPUS_PATH)
        return []
    try:
        data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        logger.error("法規語料讀取失敗：%s", error)
        return []

    return [
        LawChunk(
            id=str(c["id"]),
            source=str(c.get("source", "")),
            headers=tuple(c.get("headers") or ()),
            text=str(c.get("text", "")).strip(),
            embedding=tuple(c.get("embedding") or ()),
        )
        for c in data.get("chunks", [])
        if str(c.get("text", "")).strip()
    ]


CHUNKS: list[LawChunk] = _load()
_BY_ID: dict[str, LawChunk] = {c.id: c for c in CHUNKS}
HAS_VECTORS = bool(CHUNKS) and all(c.embedding for c in CHUNKS)

# 預設取幾塊。實測 5 個查詢的正解都排在第 1 名，取 8 塊是給
# 「一份合約同時踩到多個地雷」留餘裕 —— 範例合約就有 4 個違法點。
DEFAULT_TOP_K = 8


async def retrieve(query: str = "", limit: int | None = None) -> list[LawChunk]:
    """取回與 query 最相關的法規區塊。

    query 為空、語料沒有向量、或 embedding 服務不可用時，退回全部給。
    退回而不是拋錯：檢索只是為了聚焦，全部給效果差一點但仍然可用，
    沒有理由因為檢索失敗就讓整個分析功能不能用。
    """
    if not CHUNKS:
        return []

    top_k = limit or DEFAULT_TOP_K
    if not query.strip() or not HAS_VECTORS:
        if not HAS_VECTORS:
            logger.warning("語料沒有向量，退回全部給（請執行 build_vectors.py）")
        return CHUNKS

    try:
        query_vec = (await embed_texts([query[:4000]], input_type="query"))[0]
    except EmbeddingUnavailable:
        logger.warning("embedding 不可用，本次退回全部給")
        return CHUNKS

    ranked = sorted(
        CHUNKS, key=lambda c: cosine(query_vec, list(c.embedding)), reverse=True
    )[:top_k]
    # 依原始順序輸出：法規本來就有邏輯次序，照相似度排會讓 prompt 讀起來跳來跳去
    order = {c.id: i for i, c in enumerate(CHUNKS)}
    selected = sorted(ranked, key=lambda c: order[c.id])
    logger.info("法規檢索：取 %d/%d 塊（%s）",
                len(selected), len(CHUNKS), ",".join(c.id for c in selected))
    return selected


def format_for_prompt(chunks: list[LawChunk]) -> str:
    """組成 prompt 裡的法規段落。每塊都帶編號，模型要靠它標注法源。"""
    if not chunks:
        return "（法規語料暫時無法載入）"
    return "\n\n".join(
        f"[{c.id}] {c.label}\n{c.text}" for c in chunks
    )


def resolve_citations(ids) -> list[str]:
    """把模型回傳的編號換成實際的法規標題。

    ⚠️ 這裡是防編造的最後一關：
      - 認不得的編號（模型可能編出 L99 或直接寫「民法第429條」）一律丟棄
      - 回傳的文字完全由語料決定，模型碰不到

    因此使用者看到的每一條法源，都保證對應到語料裡真實存在的段落。
    """
    if not isinstance(ids, list):
        return []

    resolved: list[str] = []
    for raw in ids[:10]:
        key = str(raw).strip().upper()
        chunk = _BY_ID.get(key)
        if chunk is None:
            logger.info("丟棄無法對應的法源標記：%s", str(raw)[:60])
            continue
        if chunk.label not in resolved:
            resolved.append(chunk.label)
    return resolved


def stats() -> dict[str, object]:
    """供 check_llm.py 與監控顯示。"""
    return {
        "chunks": len(CHUNKS),
        "chars": sum(len(c.text) for c in CHUNKS),
        "sources": sorted({c.source for c in CHUNKS}),
        "hasVectors": HAS_VECTORS,
        "dim": len(CHUNKS[0].embedding) if HAS_VECTORS else 0,
    }
