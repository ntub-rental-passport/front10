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

**任何一步失敗都退回「全部給」而不是中斷。**
檢索只是為了聚焦，全部給雖然效果差一點但仍然可用 ——
沒有理由因為檢索失敗就讓整個分析功能不能用。

## 一個語料，多個向量空間

桌機在線時用組員的 text2vec-base-chinese（768 維），
不在線時退回 NVIDIA 的 nemotron-3-embed-1b（2048 維）。
兩個模型的向量在**不同的語意空間**，所以語料各存一份：

    chunks[].embeddings = { "local": [...768], "nvidia": [...2048] }
    embeddingSpaces      = { "local": {model, dim}, "nvidia": {model, dim} }

查詢用哪個 provider 就只比對那一份。混用不會報錯，只會安靜地
算出無意義的相似度然後檢索到錯的法條 —— 所以這裡有三道檢查：

    載入時  同一空間內所有向量的維度必須一致，且每一塊都要有
    查詢前  語料記錄的模型名稱必須等於該 provider 現在要用的模型
            （擋「換了模型但忘記重建語料」）
    查詢後  回傳的查詢向量維度必須等於該空間的維度

任何一道不過就跳過該空間，換下一個 provider。
"""

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

import embeddings
from embeddings import EmbeddingUnavailable, cosine, embed_texts

logger = logging.getLogger(__name__)

CORPUS_PATH = Path(__file__).resolve().parent / "law_corpus.json"


@dataclass(frozen=True)
class VectorSpace:
    """語料裡某一組向量的身分證。"""
    name: str
    model: str
    dim: int


@dataclass(frozen=True)
class LawChunk:
    id: str
    source: str
    headers: tuple[str, ...]
    text: str
    # provider 名稱 -> 預先算好的向量。缺席的空間不能用來檢索。
    vectors: dict[str, tuple[float, ...]] = field(default_factory=dict)

    @property
    def label(self) -> str:
        """給使用者看的法源標題。

        Header 1 通常只是重複文件標題（匯出時保留原樣以免失真），
        顯示時去掉，避免「住宅租賃定型化契約應記載及不得記載事項 ›
        住宅租賃定型化契約應記載及不得記載事項 (完整細項整理) › …」這種贅字。
        """
        parts = [h for h in self.headers if h and h not in self.source and self.source not in h]
        return " › ".join([self.source, *parts]) if parts else self.source


def _chunk_vectors(raw: dict, legacy_space: str) -> dict[str, tuple[float, ...]]:
    """讀出一塊的所有向量，同時接受新舊兩種格式。

    舊格式（單一 embedding 欄位）仍要能用：語料重建是手動步驟，
    不該因為升級了程式碼就讓現有部署的檢索失效。
    """
    vectors: dict[str, tuple[float, ...]] = {}

    for name, values in (raw.get("embeddings") or {}).items():
        if values:
            vectors[str(name)] = tuple(float(v) for v in values)

    if legacy := raw.get("embedding"):
        # 新格式優先：兩者都有時不覆蓋
        vectors.setdefault(legacy_space, tuple(float(v) for v in legacy))

    return vectors


def _legacy_space_name(model: str) -> str:
    """舊格式沒有記空間名稱，靠模型名稱反推。"""
    if model and model == embeddings.LOCAL_MODEL_DEFAULT:
        return embeddings.LOCAL
    return embeddings.NVIDIA


def _load() -> tuple[list[LawChunk], dict[str, VectorSpace]]:
    if not CORPUS_PATH.exists():
        # 語料缺席不該讓整個後端起不來 —— 分析仍可運作，只是沒有法源可綁
        logger.error("找不到法規語料 %s，法源綁定將停用", CORPUS_PATH)
        return [], {}
    try:
        data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        logger.error("法規語料讀取失敗：%s", error)
        return [], {}

    legacy_model = str(data.get("embeddingModel") or "")
    legacy_space = _legacy_space_name(legacy_model)

    chunks = [
        LawChunk(
            id=str(c["id"]),
            source=str(c.get("source", "")),
            headers=tuple(c.get("headers") or ()),
            text=str(c.get("text", "")).strip(),
            vectors=_chunk_vectors(c, legacy_space),
        )
        for c in data.get("chunks", [])
        if str(c.get("text", "")).strip()
    ]

    # 宣告的空間中繼資料（新格式）；舊格式從兩個頂層欄位組出一個
    declared: dict[str, dict] = dict(data.get("embeddingSpaces") or {})
    if not declared and legacy_model:
        declared[legacy_space] = {
            "model": legacy_model,
            "dim": int(data.get("embeddingDim") or 0),
        }

    return chunks, _usable_spaces(chunks, declared)


def _usable_spaces(
    chunks: list[LawChunk], declared: dict[str, dict]
) -> dict[str, VectorSpace]:
    """挑出真正可以用來檢索的空間。

    「宣告了」不等於「可以用」：少算一塊、或維度前後不一致（重建中斷過），
    都會讓排序結果變成部分比較 —— 那比完全不檢索更難察覺。
    """
    spaces: dict[str, VectorSpace] = {}
    if not chunks:
        return spaces

    for name, meta in declared.items():
        name = str(name)
        model = str((meta or {}).get("model") or "")
        present = [c.vectors.get(name) for c in chunks]

        missing = sum(1 for v in present if not v)
        if missing:
            logger.error("向量空間 %s 有 %d/%d 塊缺向量，停用（請重建語料）",
                         name, missing, len(chunks))
            continue

        dims = {len(v) for v in present}
        if len(dims) != 1:
            logger.error("向量空間 %s 的維度不一致（%s），停用（語料可能建到一半中斷）",
                         name, sorted(dims))
            continue

        dim = dims.pop()
        if (declared_dim := int((meta or {}).get("dim") or 0)) and declared_dim != dim:
            logger.error("向量空間 %s 宣告 %d 維但實際是 %d 維，停用",
                         name, declared_dim, dim)
            continue
        if not model:
            logger.error("向量空間 %s 沒記錄模型名稱，停用 —— 無法確認查詢會用同一個模型", name)
            continue

        spaces[name] = VectorSpace(name=name, model=model, dim=dim)

    return spaces


CHUNKS, SPACES = _load()
_BY_ID: dict[str, LawChunk] = {c.id: c for c in CHUNKS}
HAS_VECTORS = bool(SPACES)


def _warn_on_model_mismatch() -> None:
    """啟動時就把「設定與語料不符」講出來。

    不等到有人上傳合約才發現：那時只會在 log 裡多一行 warning，
    而使用者拿到的是「未檢索」的結果，從畫面上看不出來。
    """
    for provider in embeddings.provider_order():
        space = SPACES.get(provider)
        if space is None:
            if embeddings.is_configured(provider):
                logger.warning("EMBEDDING_PROVIDER 含 %s，但語料沒有這個空間的向量"
                               "（請執行 build_vectors.py --provider %s）", provider, provider)
            continue
        wanted = embeddings.model_for(provider)
        if wanted != space.model:
            logger.error(
                "向量空間 %s 是用 %s 建的，但現在設定要用 %s —— 這個空間會被跳過。"
                "混用不同模型的向量會算出無意義的相似度，所以寧可不檢索。",
                provider, space.model, wanted,
            )


if CHUNKS:
    _warn_on_model_mismatch()


# 取幾塊。可用 LAW_TOP_K 環境變數調整，不必改程式碼重建映像。
#
# 取捨：太少會漏（實測 top_k=8 時「九、修繕」沒進榜，是靠涵蓋範圍較廣的
# 「專法第二章」剛好帶到才沒漏判）；太多則回到「全部給」的老問題 ——
# 雜訊稀釋注意力，命中率反而下降。
#
# 一份合約可能同時踩多個地雷（範例合約就有 4 個），
# 所以要比「每個問題取 1-2 塊」寬鬆得多。
def _top_k_default() -> int:
    raw = (os.getenv("LAW_TOP_K") or "").strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return 8


DEFAULT_TOP_K = _top_k_default()


# 查詢最多看幾個字。合約再長，後面多半是簽名欄與附件。
MAX_QUERY_CHARS = 4000
# 切窗上限。4000 ÷ 450 ≈ 9 窗，設 16 是留餘裕兼防呆。
MAX_QUERY_WINDOWS = 16


def _query_windows(query: str, provider: str) -> list[str]:
    """把長查詢切成模型讀得完的片段。

    不切的話短 context 的模型只會讀到開頭；切了取平均的話，
    平均向量會退化成「這類文件的平均樣子」，反而配上最通用的段落。
    所以切窗之後**不合併**，由 _rank 對每一窗各算一次相似度。
    """
    text = query[:MAX_QUERY_CHARS]
    size = embeddings.query_window_chars(provider)
    if size <= 0 or len(text) <= size:
        return [text]
    windows = [text[i:i + size] for i in range(0, len(text), size)]
    return windows[:MAX_QUERY_WINDOWS]


def _rank(query_vecs: list[list[float]], space: str, top_k: int) -> list[LawChunk]:
    """每塊法規取「對任一查詢窗的最高相似度」。

    用 max 而不是平均：合約裡只要**有一段**在講押金，
    押金那塊法規就該被選上，不該被其他八段不相干的內容稀釋。
    """
    def score(chunk: LawChunk) -> float:
        vector = list(chunk.vectors[space])
        return max(cosine(qv, vector) for qv in query_vecs)

    ranked = sorted(CHUNKS, key=score, reverse=True)[:top_k]
    # 依原始順序輸出：法規本來就有邏輯次序，照相似度排會讓 prompt 讀起來跳來跳去
    order = {c.id: i for i, c in enumerate(CHUNKS)}
    return sorted(ranked, key=lambda c: order[c.id])


async def retrieve(query: str = "", limit: int | None = None) -> list[LawChunk]:
    """取回與 query 最相關的法規區塊。

    依 EMBEDDING_PROVIDER 的順序嘗試（預設 nvidia；桌機架好後設 local,nvidia）。
    query 為空、語料沒有可用向量、或所有 provider 都不可用時，退回全部給。
    退回而不是拋錯：檢索只是為了聚焦，全部給效果差一點但仍然可用。
    """
    if not CHUNKS:
        return []

    top_k = limit or DEFAULT_TOP_K
    if not query.strip():
        return CHUNKS
    if not SPACES:
        logger.warning("語料沒有可用的向量空間，退回全部給（請執行 build_vectors.py）")
        return CHUNKS

    for provider in embeddings.provider_order():
        space = SPACES.get(provider)
        if space is None:
            continue
        if not embeddings.is_configured(provider):
            logger.debug("embedding provider %s 未設定，略過", provider)
            continue

        # 查詢用的模型必須就是建語料的那個模型，否則兩邊不在同一個語意空間
        wanted = embeddings.model_for(provider)
        if wanted != space.model:
            logger.error("跳過向量空間 %s：語料用 %s 建、設定要用 %s",
                         provider, space.model, wanted)
            continue

        windows = _query_windows(query, provider)
        try:
            query_vecs = await embed_texts(windows, input_type="query", provider=provider)
        except EmbeddingUnavailable as error:
            logger.warning("embedding provider %s 不可用（%s），換下一個", provider, error)
            continue

        if not query_vecs or len(query_vecs[0]) != space.dim:
            # 設定看起來一致但實際不一致 —— 例如桌機上的模型被換掉了
            logger.error("跳過向量空間 %s：查詢向量 %d 維，語料是 %d 維",
                         provider, len(query_vecs[0]) if query_vecs else 0, space.dim)
            continue

        selected = _rank(query_vecs, provider, top_k)
        logger.info("法規檢索（%s/%s，%d 窗）：取 %d/%d 塊（%s）",
                    provider, space.model, len(windows), len(selected), len(CHUNKS),
                    ",".join(c.id for c in selected))
        return selected

    logger.warning("所有 embedding provider 都不可用，本次退回全部給")
    return CHUNKS


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
    spaces = {
        name: {"model": space.model, "dim": space.dim}
        for name, space in sorted(SPACES.items())
    }
    return {
        "chunks": len(CHUNKS),
        "chars": sum(len(c.text) for c in CHUNKS),
        "sources": sorted({c.source for c in CHUNKS}),
        "hasVectors": HAS_VECTORS,
        "spaces": spaces,
        # 舊欄位：沿用「排最前面的可用 provider」的維度
        "dim": next(
            (SPACES[p].dim for p in embeddings.provider_order() if p in SPACES),
            next((s.dim for s in SPACES.values()), 0),
        ),
    }
