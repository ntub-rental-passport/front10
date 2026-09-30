"""Law Chat 不得輸出語料中查不到的法條編號。

背景：對話線原本只在 prompt 寫「適度引用法律依據」，輸出沒有任何檢查。
實測兩個模型都編條號（民法第98條是解釋意思表示、第236條是受領遲延，
兩條都與押金無關）。Law Chat 的產出是要原封不動傳給房東的，
錯誤條號比沒有條號更糟。
"""
import unittest
from dataclasses import dataclass

from routers.contract import _CITATION_FALLBACK, _strip_unverified_citations


@dataclass
class FakeChunk:
    text: str
    label: str = '測試法源'


class StripUnverifiedCitationsTests(unittest.TestCase):
    def setUp(self):
        self.corpus = [FakeChunk('押租保證金最高不得超過二個月房屋租金之總額。見土地法第99條規定。')]

    def strip(self, reply, chunks=None):
        return _strip_unverified_citations(reply, chunks if chunks is not None else self.corpus)

    def test_invented_article_number_is_replaced(self):
        cleaned, removed = self.strip('房東您好，依民法第98條規定，押金不得超過兩個月租金。')
        self.assertNotIn('第98條', cleaned)
        self.assertIn(_CITATION_FALLBACK, cleaned)
        self.assertEqual(removed, ['依民法第98條'])
        # 句子其餘部分要留著，訊息仍然可用
        self.assertIn('押金不得超過兩個月租金', cleaned)

    def test_article_present_in_the_corpus_is_kept(self):
        cleaned, removed = self.strip('依土地法第99條規定，押金不得超過二個月租金。')
        self.assertIn('第99條', cleaned)
        self.assertEqual(removed, [])

    def test_several_invented_citations_are_all_removed(self):
        cleaned, removed = self.strip('依民法第236條及第450條之規定辦理。')
        self.assertNotIn('第236條', cleaned)
        self.assertNotIn('第450條', cleaned)
        self.assertEqual(len(removed), 2)

    def test_full_width_digits_are_recognised(self):
        cleaned, removed = self.strip('依民法第９８條規定。')
        self.assertNotIn('９８', cleaned)
        self.assertEqual(len(removed), 1)

    def test_full_width_digits_matching_the_corpus_are_kept(self):
        cleaned, removed = self.strip('依土地法第９９條規定。')
        self.assertEqual(removed, [])

    def test_article_with_sub_number_is_handled(self):
        cleaned, removed = self.strip('依租賃住宅市場發展及管理條例第10條之1規定。')
        self.assertNotIn('第10條之1', cleaned)
        self.assertEqual(len(removed), 1)

    def test_reply_without_citations_is_untouched(self):
        original = '房東您好，想與您討論押金金額，方便的話希望能調整為兩個月，謝謝。'
        cleaned, removed = self.strip(original)
        self.assertEqual(cleaned, original)
        self.assertEqual(removed, [])

    def test_empty_corpus_removes_every_citation(self):
        # 檢索失敗時沒有任何可查證的法源，那就一條都不能留
        cleaned, removed = self.strip('依民法第99條規定。', chunks=[])
        self.assertNotIn('第99條', cleaned)
        self.assertEqual(len(removed), 1)

    def test_no_duplicated_prefix_after_replacement(self):
        cleaned, _ = self.strip('根據民法第98條，押金過高。')
        self.assertNotIn('根據依', cleaned)
        self.assertEqual(cleaned.count(_CITATION_FALLBACK), 1)


if __name__ == '__main__':
    unittest.main()
