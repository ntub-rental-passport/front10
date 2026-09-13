"""桌機 / 雲端 embedding 切換的測試。

重點不是「切得過去」，而是「切錯時會被擋下來」。

不同模型的向量在不同語意空間，混用算出來的餘弦相似度是無意義的亂數 ——
而且**不會拋例外**，只會安靜地檢索到錯的法條，然後把錯的法規丟給模型。
從畫面上完全看不出來。所以這裡的測試多半在測「該跳過的有沒有跳過」。
"""

import asyncio
import unittest

import embeddings
import law_corpus
import upstream_state
from law_corpus import LawChunk, VectorSpace, retrieve


def make_chunks(vectors_by_space: dict[str, list[list[float]]], count: int = 3):
    return [
        LawChunk(
            id=f"L{i + 1:02d}",
            source="測試法規",
            headers=("標題",),
            text=f"第 {i + 1} 條內容",
            vectors={name: tuple(vs[i]) for name, vs in vectors_by_space.items()},
        )
        for i in range(count)
    ]


class ProviderOrderTest(unittest.TestCase):
    def setUp(self):
        self._saved = embeddings.os.environ.get("EMBEDDING_PROVIDER")

    def tearDown(self):
        if self._saved is None:
            embeddings.os.environ.pop("EMBEDDING_PROVIDER", None)
        else:
            embeddings.os.environ["EMBEDDING_PROVIDER"] = self._saved

    def _set(self, value):
        embeddings.os.environ["EMBEDDING_PROVIDER"] = value

    def test_default_is_nvidia_only(self):
        """預設不需要桌機就能跑 —— 桌機是加分項，不是必要條件。"""
        embeddings.os.environ.pop("EMBEDDING_PROVIDER", None)
        self.assertEqual(embeddings.provider_order(), ["nvidia"])

    def test_order_is_respected(self):
        self._set("local,nvidia")
        self.assertEqual(embeddings.provider_order(), ["local", "nvidia"])

    def test_unknown_names_are_dropped(self):
        self._set("local,openai,nvidia")
        self.assertEqual(embeddings.provider_order(), ["local", "nvidia"])

    def test_all_unknown_falls_back_to_nvidia(self):
        """全部打錯時不能變成「沒有 provider」—— 那等於靜悄悄關掉檢索。"""
        self._set("openai,cohere")
        self.assertEqual(embeddings.provider_order(), ["nvidia"])


class UsableSpaceTest(unittest.TestCase):
    """「宣告了」不等於「可以用」。"""

    def test_complete_space_is_usable(self):
        chunks = make_chunks({"local": [[1.0, 0.0]] * 3})
        spaces = law_corpus._usable_spaces(
            chunks, {"local": {"model": "m", "dim": 2}})
        self.assertEqual(spaces["local"].dim, 2)

    def test_missing_vector_disables_space(self):
        """少一塊就會變成「部分比較」，比完全不檢索更難察覺。"""
        chunks = make_chunks({"local": [[1.0, 0.0]] * 3})
        chunks[1] = LawChunk(id="L02", source="s", headers=(), text="t", vectors={})
        spaces = law_corpus._usable_spaces(
            chunks, {"local": {"model": "m", "dim": 2}})
        self.assertNotIn("local", spaces)

    def test_inconsistent_dims_disable_space(self):
        """語料建到一半中斷時會長這樣。"""
        chunks = make_chunks({"local": [[1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0]]})
        spaces = law_corpus._usable_spaces(
            chunks, {"local": {"model": "m", "dim": 2}})
        self.assertNotIn("local", spaces)

    def test_declared_dim_must_match_actual(self):
        chunks = make_chunks({"local": [[1.0, 0.0]] * 3})
        spaces = law_corpus._usable_spaces(
            chunks, {"local": {"model": "m", "dim": 768}})
        self.assertNotIn("local", spaces)

    def test_space_without_model_name_is_unusable(self):
        """沒有模型名稱就無法確認查詢會用同一個模型 —— 寧可不檢索。"""
        chunks = make_chunks({"local": [[1.0, 0.0]] * 3})
        spaces = law_corpus._usable_spaces(chunks, {"local": {"dim": 2}})
        self.assertNotIn("local", spaces)


class LegacyFormatTest(unittest.TestCase):
    """舊語料不該因為升級程式碼就失效 —— 重建是手動步驟。"""

    def test_legacy_embedding_becomes_named_space(self):
        vectors = law_corpus._chunk_vectors({"embedding": [1.0, 2.0]}, "nvidia")
        self.assertEqual(vectors, {"nvidia": (1.0, 2.0)})

    def test_new_format_wins_over_legacy(self):
        vectors = law_corpus._chunk_vectors(
            {"embedding": [9.0], "embeddings": {"nvidia": [1.0, 2.0]}}, "nvidia")
        self.assertEqual(vectors["nvidia"], (1.0, 2.0))

    def test_legacy_space_name_from_model(self):
        self.assertEqual(
            law_corpus._legacy_space_name(embeddings.LOCAL_MODEL_DEFAULT), "local")
        self.assertEqual(
            law_corpus._legacy_space_name("nvidia/nemotron-3-embed-1b"), "nvidia")


class RetrieveGuardTest(unittest.TestCase):
    """檢索前的三道檢查。任何一道不過就跳過該空間，不能算出亂數。"""

    def setUp(self):
        self.saved = (law_corpus.CHUNKS, law_corpus.SPACES, embeddings.os.environ.copy())
        law_corpus.CHUNKS = make_chunks({"local": [[1.0, 0.0], [0.0, 1.0], [0.7, 0.7]]})
        law_corpus.SPACES = {
            "local": VectorSpace(name="local", model="模型A", dim=2)}
        embeddings.os.environ["EMBEDDING_PROVIDER"] = "local"
        embeddings.os.environ["LOCAL_EMBEDDING_URL"] = "http://127.0.0.1:9"
        self.calls = []

    def tearDown(self):
        law_corpus.CHUNKS, law_corpus.SPACES, _ = self.saved
        embeddings.os.environ.clear()
        embeddings.os.environ.update(self.saved[2])

    def _stub_embed(self, vector):
        async def fake(texts, *, input_type, provider, **kwargs):
            self.calls.append(provider)
            return [vector]
        law_corpus.embed_texts = fake

    def tearDownEmbed(self):
        pass

    def test_model_mismatch_skips_space(self):
        """語料用模型A建，設定要用模型B —— 必須跳過，不能拿去比對。

        這是最危險的一種錯：兩個模型可能維度相同，
        維度檢查擋不住，只有模型名稱擋得住。
        """
        embeddings.os.environ["LOCAL_EMBEDDING_MODEL"] = "模型B"
        self._stub_embed([1.0, 0.0])
        try:
            result = asyncio.run(retrieve("押金可以收幾個月", limit=1))
        finally:
            law_corpus.embed_texts = embeddings.embed_texts
        self.assertEqual(self.calls, [], "模型不符時根本不該去算查詢向量")
        self.assertEqual(len(result), 3, "應退回全部給")

    def test_dimension_mismatch_skips_space(self):
        """設定看起來一致，但桌機上載入的其實是別的模型。"""
        embeddings.os.environ["LOCAL_EMBEDDING_MODEL"] = "模型A"
        self._stub_embed([1.0, 0.0, 0.0, 0.0])   # 4 維 vs 語料 2 維
        try:
            result = asyncio.run(retrieve("押金可以收幾個月", limit=1))
        finally:
            law_corpus.embed_texts = embeddings.embed_texts
        self.assertEqual(self.calls, ["local"])
        self.assertEqual(len(result), 3, "維度不符必須退回全部給，不能硬比")

    def test_matching_space_actually_retrieves(self):
        embeddings.os.environ["LOCAL_EMBEDDING_MODEL"] = "模型A"
        self._stub_embed([0.0, 1.0])
        try:
            result = asyncio.run(retrieve("押金可以收幾個月", limit=1))
        finally:
            law_corpus.embed_texts = embeddings.embed_texts
        self.assertEqual([c.id for c in result], ["L02"], "應命中最相近的那塊")

    def test_falls_through_to_next_provider(self):
        """桌機不在線時退回 nvidia —— 這是整個功能的重點。"""
        law_corpus.SPACES = {
            "local": VectorSpace(name="local", model="模型A", dim=2),
            "nvidia": VectorSpace(name="nvidia", model="模型N", dim=2),
        }
        law_corpus.CHUNKS = make_chunks({
            "local": [[1.0, 0.0], [0.0, 1.0], [0.7, 0.7]],
            "nvidia": [[0.0, 1.0], [1.0, 0.0], [0.7, 0.7]],
        })
        embeddings.os.environ["EMBEDDING_PROVIDER"] = "local,nvidia"
        embeddings.os.environ["LOCAL_EMBEDDING_MODEL"] = "模型A"
        embeddings.os.environ["EMBEDDING_MODEL"] = "模型N"
        embeddings.os.environ["NVIDIA_API_KEY"] = "test-key"

        async def fake(texts, *, input_type, provider, **kwargs):
            self.calls.append(provider)
            if provider == "local":
                raise embeddings.EmbeddingUnavailable("桌機關機")
            return [[1.0, 0.0]]

        law_corpus.embed_texts = fake
        try:
            result = asyncio.run(retrieve("押金可以收幾個月", limit=1))
        finally:
            law_corpus.embed_texts = embeddings.embed_texts

        self.assertEqual(self.calls, ["local", "nvidia"], "local 失敗後要換 nvidia")
        # nvidia 空間裡 L02 才是 [1,0]，證明比對的是 nvidia 那組向量而非 local 那組
        self.assertEqual([c.id for c in result], ["L02"],
                         "必須比對 nvidia 空間的向量，不能拿 local 的來比")


class CooldownTest(unittest.TestCase):
    """桌機關機時，不該每個請求都再付一次連線逾時。"""

    def setUp(self):
        upstream_state.reset()
        self.saved = upstream_state.os.environ.get("UPSTREAM_COOLDOWN_SECONDS")

    def tearDown(self):
        upstream_state.reset()
        if self.saved is None:
            upstream_state.os.environ.pop("UPSTREAM_COOLDOWN_SECONDS", None)
        else:
            upstream_state.os.environ["UPSTREAM_COOLDOWN_SECONDS"] = self.saved

    def test_marks_and_reports(self):
        upstream_state.mark_unreachable("llm:ollama")
        self.assertTrue(upstream_state.is_cooling("llm:ollama"))
        self.assertGreater(upstream_state.remaining("llm:ollama"), 0)
        self.assertIn("llm:ollama", upstream_state.snapshot())

    def test_success_clears_immediately(self):
        """桌機一開機就該馬上恢復，不該等冷卻到期。"""
        upstream_state.mark_unreachable("llm:ollama")
        upstream_state.mark_reachable("llm:ollama")
        self.assertFalse(upstream_state.is_cooling("llm:ollama"))

    def test_expires(self):
        upstream_state.os.environ["UPSTREAM_COOLDOWN_SECONDS"] = "0.05"
        upstream_state.mark_unreachable("llm:ollama")
        self.assertTrue(upstream_state.is_cooling("llm:ollama"))
        import time
        time.sleep(0.06)
        self.assertFalse(upstream_state.is_cooling("llm:ollama"))

    def test_zero_disables(self):
        """設 0 要能完全停用 —— 除錯時想看真實的逾時行為。"""
        upstream_state.os.environ["UPSTREAM_COOLDOWN_SECONDS"] = "0"
        upstream_state.mark_unreachable("llm:ollama")
        self.assertFalse(upstream_state.is_cooling("llm:ollama"))

    def test_bad_value_falls_back_to_default(self):
        upstream_state.os.environ["UPSTREAM_COOLDOWN_SECONDS"] = "abc"
        self.assertEqual(upstream_state.cooldown_seconds(),
                         upstream_state.DEFAULT_COOLDOWN_SECONDS)

    def test_unknown_name_is_not_cooling(self):
        self.assertFalse(upstream_state.is_cooling("沒看過的端點"))


class TunnelUrlTest(unittest.TestCase):
    """隧道網址必須跟 OCR 的 OLLAMA_URL 分開。

    OCR（server/ollama-contract.js）打 {OLLAMA_URL}/api/chat 而且
    **不帶任何憑證**。把 OLLAMA_URL 指向隧道的話，OCR 會被 Cloudflare
    Access 回 403 —— 一個本來好好的功能會因為接桌機而壞掉。
    """

    def setUp(self):
        import llm_provider
        self.llm_provider = llm_provider
        self.saved = dict(embeddings.os.environ)
        for key in ("LLM_TUNNEL_URL", "OLLAMA_URL", "LOCAL_EMBEDDING_URL"):
            embeddings.os.environ.pop(key, None)

    def tearDown(self):
        embeddings.os.environ.clear()
        embeddings.os.environ.update(self.saved)

    def test_tunnel_url_wins(self):
        embeddings.os.environ["LLM_TUNNEL_URL"] = "https://llm.example.test"
        embeddings.os.environ["OLLAMA_URL"] = "http://ocr-host:11434"
        self.assertEqual(self.llm_provider.ollama_base(), "https://llm.example.test")
        self.assertEqual(embeddings._local_base(), "https://llm.example.test")

    def test_falls_back_to_ollama_url(self):
        """本機開發沒有隧道，行為必須跟以前完全一樣。"""
        embeddings.os.environ["OLLAMA_URL"] = "http://127.0.0.1:11434"
        self.assertEqual(self.llm_provider.ollama_base(), "http://127.0.0.1:11434")
        self.assertEqual(embeddings._local_base(), "http://127.0.0.1:11434")

    def test_explicit_embedding_url_wins_over_both(self):
        embeddings.os.environ["LOCAL_EMBEDDING_URL"] = "http://embed-only:9000"
        embeddings.os.environ["LLM_TUNNEL_URL"] = "https://llm.example.test"
        self.assertEqual(embeddings._local_base(), "http://embed-only:9000")

    def test_default_when_nothing_set(self):
        self.assertEqual(self.llm_provider.ollama_base(), "http://127.0.0.1:11434")


class QueryWindowTest(unittest.TestCase):
    """長查詢要切窗，而且切完之後**不能取平均**。

    text2vec 上限 512 token，3000-6000 字的合約直接丟進去只會讀到開頭，
    而且不報錯。切窗後取最高相似度而非平均：平均向量會退化成
    「這類文件的平均樣子」，反而配上最通用的段落。

    註：check_llm.py 的範例合約只有 225 字，測不到這條路徑 ——
    所以這裡用合成的長字串測。
    """

    def setUp(self):
        self.saved = dict(embeddings.os.environ)

    def tearDown(self):
        embeddings.os.environ.clear()
        embeddings.os.environ.update(self.saved)

    def test_short_query_is_one_window(self):
        self.assertEqual(law_corpus._query_windows("押金可以收幾個月", "local"), ["押金可以收幾個月"])

    def test_long_query_is_split_for_local(self):
        windows = law_corpus._query_windows("契" * 4000, "local")
        self.assertEqual(len(windows), 9)
        self.assertTrue(all(len(w) <= 450 for w in windows))

    def test_nvidia_is_not_split(self):
        """那個模型 context 夠長，切窗只會讓它失去上下文。"""
        self.assertEqual(len(law_corpus._query_windows("契" * 4000, "nvidia")), 1)

    def test_window_count_is_capped(self):
        embeddings.os.environ["LOCAL_QUERY_WINDOW_CHARS"] = "10"
        self.assertLessEqual(
            len(law_corpus._query_windows("契" * 4000, "local")),
            law_corpus.MAX_QUERY_WINDOWS)

    def test_rank_takes_max_not_mean(self):
        """一份合約裡只要**有一段**在講押金，押金那塊就該被選上。

        取平均的話，那一段會被其他八段不相干的內容稀釋掉 ——
        這正是實測時漏掉「違約金」的原因。
        """
        saved = law_corpus.CHUNKS
        law_corpus.CHUNKS = make_chunks({"s": [[1.0, 0.0], [0.0, 1.0], [0.6, 0.6]]})
        try:
            # 兩個窗：第一窗完全不像任何一塊，第二窗精準命中 L02
            picked = law_corpus._rank([[0.6, 0.6], [0.0, 1.0]], "s", 1)
            self.assertEqual([c.id for c in picked], ["L02"],
                             "有一窗命中就該選上，不該被另一窗拉低")
        finally:
            law_corpus.CHUNKS = saved


if __name__ == "__main__":
    unittest.main()
