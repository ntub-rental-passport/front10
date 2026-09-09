"""測試 NVIDIA embedding 模型的中文檢索能力。

## 為什麼要先測

要用 embedding API 取代本機的 text2vec-base-chinese，前提是它「聽得懂中文」。
規格頁寫支援多語言不代表在繁體中文法律用語上分得出差異 ——
接上去才發現檢索都抓錯，會白花時間。

## 測法

用真實的法規語料當語意庫，丟幾個租客真的會問的查詢，
看排名第一的段落是不是人工判定的正解。這比看規格表可靠。

## 用法

    python embed_probe.py                     # 測所有候選模型
    python embed_probe.py nvidia/embed-qa-4   # 只測指定的
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

from law_corpus import CHUNKS  # noqa: E402

CANDIDATES = [
    "nvidia/llama-3.2-nv-embedqa-1b-v1",
    "nvidia/nv-embedqa-mistral-7b-v2",
    "nvidia/nemotron-3-embed-1b",
    "snowflake/arctic-embed-l",
]

# 租客真的會遇到的情境，以及人工判定該命中哪一塊。
# 標題關鍵字用來判斷是否命中（避免寫死 id，語料重建後 id 會變）。
PROBES = [
    ("房東要收四個月押金，這樣合法嗎？", "押金"),
    ("合約寫房屋所有修繕都由我負責", "修繕"),
    ("房東說房屋稅要我出", "稅費"),
    ("我想提前解約，房東要我賠三個月租金", "終止"),
    ("房東可以在租期中間漲租金嗎", "租金"),
]


async def embed(client: httpx.AsyncClient, model: str, texts: list[str], input_type: str) -> list:
    """呼叫 embedding API。

    input_type 分 query / passage 是這類模型的慣例：
    查詢與被檢索的文件用不同的向量空間偏置，混用會讓相似度失準。
    """
    response = await client.post(
        f"{BASE}/embeddings",
        json={"input": texts, "model": model, "input_type": input_type,
              "encoding_format": "float", "truncate": "END"},
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    response.raise_for_status()
    return [item["embedding"] for item in response.json()["data"]]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


async def probe(model: str) -> None:
    print(f"\n{'=' * 60}")
    print(f" {model}")
    print("=" * 60)

    timeout = httpx.Timeout(120, connect=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            # 分批送，避免單次請求過大被拒
            passages = []
            for i in range(0, len(CHUNKS), 10):
                batch = [c.text[:2000] for c in CHUNKS[i:i + 10]]
                passages.extend(await embed(client, model, batch, "passage"))
            print(f"  語料向量化成功（{len(passages)} 塊，維度 {len(passages[0])}）")
        except Exception as error:
            print(f"  ❌ 不可用：{type(error).__name__}: {error or '（無訊息）'}"[:200])
            return

        hits = 0
        for question, expected in PROBES:
            try:
                query_vec = (await embed(client, model, [question], "query"))[0]
            except Exception as error:
                print(f"  ❌ 查詢失敗：{type(error).__name__}")
                return

            ranked = sorted(
                ((cosine(query_vec, p), c) for p, c in zip(passages, CHUNKS)),
                key=lambda x: -x[0],
            )
            top_score, top_chunk = ranked[0]
            title = top_chunk.label.split(" › ")[-1]
            ok = expected in top_chunk.label
            hits += ok
            print(f"  {'✅' if ok else '❌'} 「{question[:18]}…」")
            print(f"       → [{top_chunk.id}] {title[:30]}（相似度 {top_score:.3f}）")
            if not ok:
                print(f"       期待命中含「{expected}」的段落")

        print(f"  命中 {hits}/{len(PROBES)}")


async def main() -> None:
    models = [a for a in sys.argv[1:] if not a.startswith("-")] or CANDIDATES
    if not CHUNKS:
        sys.exit("❌ 語料未載入")
    print(f"語意庫：{len(CHUNKS)} 塊法規")
    for model in models:
        await probe(model)


if __name__ == "__main__":
    API_KEY = (os.getenv("NVIDIA_API_KEY") or "").strip()
    BASE = (os.getenv("NVIDIA_BASE_URL") or "https://integrate.api.nvidia.com/v1").rstrip("/")
    if not API_KEY:
        sys.exit("❌ 未設定 NVIDIA_API_KEY")
    asyncio.run(main())
