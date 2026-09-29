"""合約文字送進 LLM 之前的去識別化。

## 為什麼要做

合約 OCR 全文含有承租人與出租人的姓名、身分證字號、電話、住址、
銀行帳號。這些欄位會被整段拼進 prompt 送往外部服務（自架的桌機、
或備援的 NVIDIA API），而且中途會經過 Cloudflare 邊緣解密。

關鍵事實是：**判斷合約條款是否違法，完全不需要知道當事人是誰。**
「押金超過兩個月」「修繕責任概括轉嫁承租人」這類判斷看的是條款文字，
姓名與身分證字號對模型毫無用處，送出去純粹是增加外洩面。

## 為什麼在這裡做，而不是各 provider 各自做

只有一條路徑：建 prompt 之前遮蔽，之後不管送到哪都一樣。
若改成「送 NVIDIA 才遮、送自己的機器不遮」，就需要一個
「我現在走哪條路」的分支 —— 那個分支哪天被改壞（例如有人調整
備援順序），原始個資就會靜靜流出去，而且不會有任何錯誤訊息。

## 誠實的限制

這是以規則為基礎的遮蔽，**不是保證**。中文姓名沒有明確邊界，
無法像英文那樣靠大小寫或詞典可靠地辨識，因此本模組採取
「標籤錨定」策略：只遮蔽出現在「承租人：」「地址：」這類標籤之後的內容，
以及格式明確到不會誤判的欄位（身分證字號、手機、Email）。

代價是：散落在條文中間、沒有標籤的姓名可能漏掉。
選擇保守而非激進，是因為過度遮蔽會把條款文字本身吃掉，
反而讓分析失去依據 —— 那是比漏遮更直接的傷害。
這個限制應如實寫進報告，不要宣稱「完全去識別化」。
"""

import re
from dataclasses import dataclass, field

# 遮蔽後的佔位符。刻意保留語意標籤（而非一律換成 ***），
# 讓模型仍看得出「這裡原本是承租人姓名」，維持條款的可讀性。
NAME_PLACEHOLDER = "[姓名]"
ID_PLACEHOLDER = "[身分證字號]"
PHONE_PLACEHOLDER = "[電話]"
ADDRESS_PLACEHOLDER = "[地址]"
EMAIL_PLACEHOLDER = "[電子信箱]"
ACCOUNT_PLACEHOLDER = "[帳號]"

_CJK = r"一-鿿"

# ---------------------------------------------------------------
# 格式明確、可全域遮蔽的欄位
# ---------------------------------------------------------------

# 身分證字號：一個英文字母 + 1或2（性別碼）+ 8 位數字。
# 這個格式夠特殊，全域比對不會誤傷條款文字。
_ID_NUMBER = re.compile(r"\b[A-Za-z][12]\d{8}\b")

# 手機號碼：09 開頭共 10 碼，允許中間有 - 或空白
_MOBILE = re.compile(r"\b09\d{2}[\s-]?\d{3}[\s-]?\d{3}\b")

_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")

# ---------------------------------------------------------------
# 標籤錨定的欄位
# ---------------------------------------------------------------
# 只遮「標籤後面」的內容。市話與帳號若不錨定標籤，
# 會誤傷租金金額、坪數、日期等分析需要的數字。

_LABELLED_PHONE = re.compile(
    r"(電話|手機|聯絡電話|TEL|Tel)([\s:：]*)((?:\(0\d{1,2}\)|0\d{1,2})[\s-]?\d{6,8}(?:[\s-]?#?\d{1,5})?)"
)

_LABELLED_ACCOUNT = re.compile(
    r"(帳號|銀行帳號|匯款帳號|劃撥帳號|統一編號|統編)([\s:：]*)([\d-]{6,20})"
)

# 姓名：出現在當事人標籤之後的 2-4 個中文字。
#
# ⚠️ 這條規則最容易誤傷，實測踩過：
#     「除因可歸責於承租人之事由外，由出租人負責」
#   →「除因可歸責於承租人[姓名]，由出租人[姓名]」
#   「之事由外」「負責」被當成姓名吃掉，整句條文毀了。
#
# 因此分隔符是**必要的**，且限制成合約中真正會出現的兩種寫法：
#   1. 冒號式：「承租人：王小明」「出租人(姓名)：陳大華」
#   2. 空白式：「承租人  王小明」（簽名欄常見）——但加上停用字檢查，
#      因為「承租人 之事由」這種行文也會有空白
#
# 寧可漏遮也不誤遮：漏掉的姓名是已知限制（報告中會寫明），
# 但吃掉條款文字會讓整個分析失去依據，那是更直接的傷害。

_NAME_LABELS = "承租人|出租人|房客|房東|立契約書人|代理人|連帶保證人|保證人|姓名|簽名|署名"

# 不可能作為姓名開頭的字：多為動詞、介詞、助詞
_NAME_STOP = "之應得須負不未如於者均就對因同違經任支付交返修保使繳依由並可自其該本此如若"

_LABELLED_NAME = re.compile(
    rf"({_NAME_LABELS})"
    rf"("
    rf"[\s]*(?:[（(]姓名[）)])?[\s]*[:：][\s]*"   # 冒號式
    rf"|[ \t\u3000]{{1,6}}"                        # 空白式（含全形空白）
    rf")"
    rf"(?![{_NAME_STOP}])"
    rf"([{_CJK}]{{2,4}})(?![{_CJK}])"
)

# 自稱式姓名：「我是王小明」「我叫陳大華」。
#
# 合約文字用標籤（承租人：），但 Law Chat 是自由對話，
# 使用者會直接自報姓名。這類自稱詞是很強的錨點，誤判風險低。
#
# 但要排除身分名詞 —— 「我是租客」的「租客」不是姓名，
# 遮掉會改變句意，讓模型誤解使用者的處境。
_SELF_INTRO_STOP = (
    "租客|房客|房東|屋主|承租人|出租人|二房東|室友|學生|上班族|女生|男生|新手|本人"
)
_SELF_INTRO_NAME = re.compile(
    rf"(我是|我叫|本人叫|我的名字是|敝姓)"
    rf"[\s]*"
    rf"(?!{_SELF_INTRO_STOP})"
    rf"(?![{_NAME_STOP}])"
    rf"([{_CJK}]{{2,4}})(?![{_CJK}])"
)

# 地址：標籤之後直到行尾或句號。
_LABELLED_ADDRESS = re.compile(
    r"(地址|住址|戶籍地址|通訊地址|租賃住宅坐落|房屋坐落|門牌|標的地址)"
    r"([\s:：]*)"
    r"([^\n。；;]{4,80})"
)

# 台灣門牌格式：即使沒有標籤也遮蔽。
# 條款文字不會長成「○○路○號」，誤判風險低，而漏掉住址的代價較高。
_BARE_ADDRESS = re.compile(
    rf"[{_CJK}]{{2,4}}[縣市][{_CJK}\d]{{0,10}}?[鄉鎮市區]?[{_CJK}\d]{{0,20}}?"
    rf"[路街道][{_CJK}\d]{{0,15}}?\d+號(?:之\d+)?(?:\d+樓(?:之\d+)?)?"
)


@dataclass
class DeidentifyResult:
    """遮蔽結果。counts 供稽核與報告佐證用，不含任何原始個資。"""

    text: str
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    def summary(self) -> str:
        """可安全寫進 log 的摘要 —— 只有類別與數量，沒有內容。"""
        if not self.counts:
            return "無可遮蔽項目"
        return "、".join(f"{k} {v} 處" for k, v in sorted(self.counts.items()))


def deidentify(text: str) -> DeidentifyResult:
    """遮蔽合約文字中的個人識別資訊。

    順序有意義：先處理標籤錨定的規則，再處理全域格式規則。
    反過來的話，全域規則會先把「電話：0912345678」的號碼換成佔位符，
    標籤規則就再也對不上了 —— 結果一樣安全，但統計數字會失真。
    """
    counts: dict[str, int] = {}

    def _sub(pattern: re.Pattern, repl, label: str, value: str) -> str:
        result, n = pattern.subn(repl, value)
        if n:
            counts[label] = counts.get(label, 0) + n
        return result

    out = text

    # 標籤錨定（保留標籤本身，只換掉值）
    out = _sub(_LABELLED_NAME, lambda m: f"{m.group(1)}{m.group(2)}{NAME_PLACEHOLDER}", "姓名", out)
    out = _sub(_SELF_INTRO_NAME, lambda m: f"{m.group(1)}{NAME_PLACEHOLDER}", "姓名", out)
    out = _sub(_LABELLED_ADDRESS, lambda m: f"{m.group(1)}{m.group(2)}{ADDRESS_PLACEHOLDER}", "地址", out)
    out = _sub(_LABELLED_PHONE, lambda m: f"{m.group(1)}{m.group(2)}{PHONE_PLACEHOLDER}", "電話", out)
    out = _sub(_LABELLED_ACCOUNT, lambda m: f"{m.group(1)}{m.group(2)}{ACCOUNT_PLACEHOLDER}", "帳號", out)

    # 全域格式
    out = _sub(_ID_NUMBER, ID_PLACEHOLDER, "身分證字號", out)
    out = _sub(_MOBILE, PHONE_PLACEHOLDER, "電話", out)
    out = _sub(_EMAIL, EMAIL_PLACEHOLDER, "電子信箱", out)
    out = _sub(_BARE_ADDRESS, ADDRESS_PLACEHOLDER, "地址", out)

    return DeidentifyResult(text=out, counts=counts)
