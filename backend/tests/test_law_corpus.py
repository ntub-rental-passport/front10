import asyncio
import unittest

import law_corpus
from law_corpus import format_for_prompt, resolve_citations, retrieve, stats


class CorpusLoadTest(unittest.TestCase):
    def test_corpus_is_loaded(self):
        self.assertGreater(len(law_corpus.CHUNKS), 0, "語料沒載入，法源綁定會全部失效")

    def test_every_chunk_has_id_and_text(self):
        for chunk in law_corpus.CHUNKS:
            self.assertTrue(chunk.id)
            self.assertTrue(chunk.text)

    def test_ids_are_unique(self):
        ids = [c.id for c in law_corpus.CHUNKS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_label_does_not_repeat_source(self):
        """Header 1 常常只是重複文件標題，顯示時不該出現兩次。"""
        for chunk in law_corpus.CHUNKS:
            self.assertEqual(chunk.label.count(chunk.source), 1, chunk.label)

    def test_corpus_fits_in_a_prompt(self):
        """全部給的前提是它塞得下。超過 5 萬字就該改用向量檢索了。"""
        self.assertLess(stats()["chars"], 50_000)


class PromptFormatTest(unittest.TestCase):
    def test_every_chunk_is_numbered(self):
        text = format_for_prompt(asyncio.run(retrieve()))
        for chunk in law_corpus.CHUNKS:
            self.assertIn(f"[{chunk.id}]", text)

    def test_empty_corpus_does_not_crash(self):
        self.assertIn("無法載入", format_for_prompt([]))


class CitationBindingTest(unittest.TestCase):
    """這組測試是整個 P2a 的重點：模型不能自己寫法源。

    實測（2026-09-09）模型編出過：
      「租賃住宅市場發展及管理條例第11條」（第11條其實是提前終止）
      「《住宅租賃法》第十二條」（台灣沒有這部法律）
    同一題問兩次會編出不同條號 —— 不是記錯，是每次現編。
    """

    def test_valid_id_resolves_to_real_label(self):
        first = law_corpus.CHUNKS[0]
        self.assertEqual(resolve_citations([first.id]), [first.label])

    def test_case_insensitive(self):
        first = law_corpus.CHUNKS[0]
        self.assertEqual(resolve_citations([first.id.lower()]), [first.label])

    def test_invented_id_is_dropped(self):
        self.assertEqual(resolve_citations(["L99", "L00", "XX"]), [])

    def test_model_written_article_numbers_are_dropped(self):
        """模型自己寫的條號一律丟棄，即使內容剛好是對的。"""
        invented = [
            "民法第429條",
            "租賃住宅市場發展及管理條例第11條",
            "《住宅租賃法》第十二條",
            "土地法第99條",
        ]
        self.assertEqual(resolve_citations(invented), [])

    def test_mixed_keeps_only_valid(self):
        first = law_corpus.CHUNKS[0]
        result = resolve_citations([first.id, "L99", "民法第429條"])
        self.assertEqual(result, [first.label])

    def test_duplicates_collapse(self):
        first = law_corpus.CHUNKS[0]
        self.assertEqual(resolve_citations([first.id, first.id]), [first.label])

    def test_non_list_input(self):
        self.assertEqual(resolve_citations("L01"), [])
        self.assertEqual(resolve_citations(None), [])

    def test_count_is_capped(self):
        ids = [c.id for c in law_corpus.CHUNKS] * 3
        self.assertLessEqual(len(resolve_citations(ids)), 10)


if __name__ == "__main__":
    unittest.main()


class RetrievalTest(unittest.TestCase):
    """檢索必須「聚焦」但不能「失效」。"""

    def test_corpus_has_vectors(self):
        """沒有向量就退回全部給——功能還在，但失去聚焦效果，值得測出來。"""
        self.assertTrue(
            law_corpus.HAS_VECTORS,
            "語料缺向量，請執行 build_vectors.py（詳見檔頭說明）",
        )

    def test_empty_query_returns_everything(self):
        """查詢是空的就沒有東西可以比對，全部給是唯一正確的行為。"""
        self.assertEqual(len(asyncio.run(retrieve(""))), len(law_corpus.CHUNKS))

    def test_embedding_failure_falls_back_to_all(self):
        """embedding 掛掉時退回全部給，不可讓整個分析功能不能用。"""
        import embeddings

        async def boom(*args, **kwargs):
            raise embeddings.EmbeddingUnavailable("測試用")

        original = law_corpus.embed_texts
        law_corpus.embed_texts = boom
        try:
            result = asyncio.run(retrieve("押金可以收幾個月"))
        finally:
            law_corpus.embed_texts = original
        self.assertEqual(len(result), len(law_corpus.CHUNKS))

    def test_results_keep_corpus_order(self):
        """回傳依語料原始順序，不依相似度——法規本身有邏輯次序。"""
        order = {c.id: i for i, c in enumerate(law_corpus.CHUNKS)}
        picked = asyncio.run(retrieve("", limit=None))
        indexes = [order[c.id] for c in picked]
        self.assertEqual(indexes, sorted(indexes))
