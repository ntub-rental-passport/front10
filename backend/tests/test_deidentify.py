import unittest

from deidentify import deidentify


class DeidentifyTest(unittest.TestCase):
    """去識別化的重點有兩個，缺一不可：

    1. 該遮的要遮掉（個資不外流）
    2. 不該遮的不能動（條款文字被吃掉，分析就失去依據）

    第 2 點同樣重要 —— 過度遮蔽會直接傷害功能本身。
    """

    def test_id_number_is_masked(self):
        result = deidentify("承租人身分證字號：A123456789")
        self.assertNotIn("A123456789", result.text)
        self.assertIn("[身分證字號]", result.text)

    def test_mobile_is_masked(self):
        for raw in ["0912345678", "0912-345-678", "0912 345 678"]:
            with self.subTest(raw=raw):
                self.assertNotIn(raw, deidentify(f"聯絡方式 {raw}").text)

    def test_email_is_masked(self):
        result = deidentify("信箱 tenant.wang@example.com 請查收")
        self.assertNotIn("tenant.wang@example.com", result.text)

    def test_labelled_name_is_masked_but_label_kept(self):
        result = deidentify("承租人：王小明\n出租人：陳大華")
        self.assertNotIn("王小明", result.text)
        self.assertNotIn("陳大華", result.text)
        # 標籤保留，模型才知道那裡原本是誰
        self.assertIn("承租人", result.text)
        self.assertIn("[姓名]", result.text)

    def test_address_is_masked(self):
        result = deidentify("租賃住宅坐落：臺北市中正區忠孝東路一段100號5樓")
        self.assertNotIn("忠孝東路", result.text)

    def test_bare_address_without_label_is_masked(self):
        result = deidentify("本租賃標的為新北市板橋區文化路二段35號之1。")
        self.assertNotIn("文化路", result.text)

    def test_labelled_landline_is_masked(self):
        result = deidentify("電話：02-27208889")
        self.assertNotIn("27208889", result.text)

    # ---------- 以下是「不能動」的部分 ----------

    def test_clause_text_survives(self):
        clause = "房屋及其附屬設備之修繕，除因可歸責於承租人之事由外，由出租人負責。"
        result = deidentify(clause)
        self.assertIn("修繕", result.text)
        self.assertIn("由出租人負責", result.text)

    def test_amounts_are_not_masked(self):
        """租金與押金是分析的核心依據，遮掉就無從判斷是否違法。"""
        result = deidentify("每月租金新臺幣 20000 元，押金 60000 元（三個月）。")
        self.assertIn("20000", result.text)
        self.assertIn("60000", result.text)

    def test_article_numbers_are_not_masked(self):
        result = deidentify("依民法第 429 條及第 430 條規定辦理。")
        self.assertIn("429", result.text)
        self.assertIn("430", result.text)

    def test_dates_are_not_masked(self):
        result = deidentify("租賃期間自 2026 年 3 月 1 日起至 2027 年 2 月 28 日止。")
        self.assertIn("2026", result.text)
        self.assertIn("2027", result.text)

    def test_counts_are_reported_without_leaking_content(self):
        result = deidentify("承租人：王小明 電話：0912345678 身分證 A123456789")
        self.assertGreaterEqual(result.total, 3)
        summary = result.summary()
        self.assertNotIn("王小明", summary)
        self.assertNotIn("0912345678", summary)
        self.assertNotIn("A123456789", summary)

    def test_empty_input(self):
        self.assertEqual(deidentify("").text, "")
        self.assertEqual(deidentify("").total, 0)


if __name__ == "__main__":
    unittest.main()


class NameOverMaskingTest(unittest.TestCase):
    """姓名規則的誤傷防護。

    2026-09-09 實測踩到：「承租人之事由外」「出租人負責」被當成姓名遮掉，
    整句條文被毀。以下案例確保不再發生。
    """

    CLAUSES = [
        "除因可歸責於承租人之事由外，由出租人負責修繕。",
        "出租人應於租期屆滿前通知承租人。",
        "承租人不得擅自轉租。",
        "房東須於七日內返還押金予房客。",
        "承租人同意遵守公寓大廈規約。",
        "出租人得終止租約。",
    ]

    def test_clause_prose_is_untouched(self):
        for clause in self.CLAUSES:
            with self.subTest(clause=clause):
                self.assertEqual(deidentify(clause).text, clause)

    def test_colon_form_still_masked(self):
        for raw in ["承租人：王小明", "出租人(姓名)：陳大華", "承租人 ： 林美玲"]:
            with self.subTest(raw=raw):
                result = deidentify(raw)
                self.assertIn("[姓名]", result.text, raw)

    def test_signature_line_with_spaces_still_masked(self):
        result = deidentify("承租人   王小明")
        self.assertIn("[姓名]", result.text)


class SelfIntroductionTest(unittest.TestCase):
    """Law Chat 是自由對話，使用者會直接自報姓名，沒有「承租人：」這種標籤。"""

    def test_self_introduced_name_is_masked(self):
        for raw in ["我是王小明", "我叫陳大華", "我的名字是林美玲", "本人叫張三豐"]:
            with self.subTest(raw=raw):
                self.assertIn("[姓名]", deidentify(raw).text, raw)

    def test_role_nouns_are_not_treated_as_names(self):
        """「我是租客」的「租客」不是姓名——遮掉會讓模型誤解使用者的處境。"""
        for raw in ["我是租客", "我是房客", "我是房東", "我是室友", "我是學生"]:
            with self.subTest(raw=raw):
                self.assertEqual(deidentify(raw).text, raw)

    def test_full_chat_message(self):
        result = deidentify("我是王小明，身分證 A123456789，押金被收四個月怎麼辦")
        self.assertNotIn("王小明", result.text)
        self.assertNotIn("A123456789", result.text)
        self.assertIn("押金", result.text)      # 訴求本身必須留著
        self.assertIn("四個月", result.text)
