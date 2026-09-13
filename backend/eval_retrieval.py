"""比較各 embedding provider 的檢索品質。

## 為什麼需要這支

檢索錯了不會報錯。模型拿到不相關的法規，仍然會產出格式完美的分析，
只是抓不到真正的問題 —— 從畫面上完全看不出來。所以要有一個
「對照正確答案」的量測方式，而不是看結果順不順眼。

## 為什麼不用 check_llm.py 的範例合約

那份去識別化後只有 225 字，而生產環境的輸入是整份 OCR 過的合約
（3000-6000 字）。225 字測不到：

  - 切窗（門檻 450 字，短樣本永遠只有 1 窗）
  - 「相關內容被大量無關條文包圍」這個真實的難處

2026-09-13 就因為用短樣本量測，把結論歸因到錯的地方。

## 2026-09-13 實測結果

              短樣本(175字)   長合約(905字)
    local         3/4             1/4
    nvidia        3/4             2/4

**兩邊在長合約上都崩了。** 這不是模型好壞的問題，是結構問題：
把 905 字的合約壓成一個向量，得到的是「一份租賃合約的平均樣子」，
而「押金四個月」只是其中一行，訊號被其他十二條正常條文淹沒。
合約越完整，檢索越糟 —— 而使用者上傳的一定是完整合約。

也發現措辭小改就會讓檢索結果大幅改變（同樣四個違法點、
不同寫法的短樣本，local 從 1/4 變 3/4）。檢索對表面用詞太敏感。

### 還沒做的改法：逐條檢索

合約本來就有條文結構（第一條、第二條…），應該每一條各自當查詢、
再取聯集。每條都是聚焦的查詢，不會被其他條文稀釋：

    「押金肆萬元，相當於四個月租金」   → 精準命中 L05
    「房屋稅、地價稅由乙方負擔」       → 精準命中 L07

shared/contract-field-extraction.js 裡已經有切條文的 regex（CLAUSE_HEADING）。
改 law_corpus._query_windows 依條文切即可，這支工具可以直接量出有沒有效。
（2026-09-13 與使用者確認暫緩，先收尾 P3。）

## 正確答案怎麼定

四個刻意放進去的違法點，各自對應語料裡一塊明確的法規。
這是人工判定的，不是模型說了算。

    python eval_retrieval.py            # 比較所有可用的 provider
    python eval_retrieval.py --long     # 只測長合約
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import embeddings  # noqa: E402
import law_corpus  # noqa: E402
from deidentify import deidentify  # noqa: E402

logging.basicConfig(level=logging.WARNING)

# 四個違法點 → 應該要被檢索到的法規區塊（人工判定）
GROUND_TRUTH = {
    "L05": "押金四個月（上限兩個月）",
    "L07": "房屋稅地價稅轉嫁承租人",
    "L09": "修繕責任概括轉嫁承租人",
    "L14": "違約金三個月租金（上限一個月）",
}

# 短樣本：跟 check_llm.py 同一份，用來對照
SHORT = """租賃契約
出租人：陳大華　承租人：王小明（身分證 A123456789，電話 0912345678）
租賃標的：臺北市大安區忠孝東路四段 100 號 5 樓
押金：新臺幣肆萬元整（相當於四個月租金）。
房屋及其座落基地之房屋稅、地價稅由承租人負擔。
租賃住宅之修繕，不論原因，均由承租人自行負責並負擔費用。
承租人提前終止租約者，應給付出租人三個月租金作為違約金。"""

# 長合約：把同樣四個違法點埋進一份結構完整的合約裡。
# 真實使用者上傳的就是這種東西 —— 違法條款夾在大量正常條文之間。
LONG = """住宅租賃契約書

立契約書人　出租人：陳大華（以下簡稱甲方）
　　　　　　承租人：王小明（身分證字號 A123456789，電話 0912345678）（以下簡稱乙方）

茲為住宅租賃事宜，雙方同意訂立本契約，條款如后：

第一條　租賃標的
本租賃標的為臺北市大安區忠孝東路四段 100 號 5 樓之房屋全部，
建物面積三十五平方公尺，含衛浴一間、廚房一間。
車位：無。附屬設備詳如附件一設備清單。

第二條　租賃期間
自民國一一五年十月一日起至一一七年九月三十日止，計二年。

第三條　租金約定及支付
每月租金新臺幣壹萬元整，乙方應於每月五日前以匯款方式給付甲方。
租金不得任意調整。

第四條　押金約定及返還
押金新臺幣肆萬元整（相當於四個月租金），乙方應於簽約時一次付清。
租賃關係消滅且乙方返還租賃住宅時，甲方應返還押金。

第五條　租賃期間相關費用之約定
水費、電費、瓦斯費、網路費由乙方負擔，依實際使用度數計算。
管理費每月新臺幣壹仟元整，由乙方負擔。

第六條　稅費負擔之約定
房屋及其座落基地之房屋稅、地價稅，由乙方負擔。
租賃契約之印花稅由甲方負擔。

第七條　使用租賃住宅之限制
本租賃標的供住宅使用，乙方不得變更用途，不得供非法使用。
未經甲方同意，乙方不得將租賃住宅之全部或一部轉租、出借他人。

第八條　修繕
租賃住宅之修繕，不論其原因為何，均由乙方自行負責並負擔費用，
甲方不負任何修繕義務。

第九條　室內裝修
乙方如需進行室內裝修，應先經甲方書面同意，並自行負擔費用，
且不得損害原有結構安全。

第十條　提前終止租約
乙方於租賃期間屆滿前提前終止租約者，應於一個月前通知甲方，
並給付甲方三個月租金作為違約金。

第十一條　租賃住宅之返還
租期屆滿或契約終止時，乙方應即將租賃住宅回復原狀返還甲方。

第十二條　通知方式
本契約雙方之通知，以書面或簡訊為之，並以本契約所載地址為送達處所。

第十三條　其他約定
本契約未盡事宜，依民法及相關法令規定辦理。
本契約一式二份，雙方各執一份為憑。

立契約書人
甲方（出租人）：陳大華　簽章
乙方（承租人）：王小明　簽章
中華民國一一五年九月三十日"""


async def evaluate(name: str, text: str) -> None:
    masked = deidentify(text).text
    print(f"\n{'=' * 66}")
    print(f" {name}（去識別化後 {len(masked)} 字）")
    print("=" * 66)

    spaces = law_corpus.SPACES
    if not spaces:
        print("  ❌ 語料沒有可用的向量空間")
        return

    for provider in sorted(spaces):
        if not embeddings.is_configured(provider):
            print(f"\n  {provider}：未設定，略過")
            continue

        windows = law_corpus._query_windows(masked, provider)
        space = spaces[provider]
        try:
            vectors = await embeddings.embed_texts(
                windows, input_type="query", provider=provider)
        except embeddings.EmbeddingUnavailable as error:
            print(f"\n  {provider}：不可用（{error}）")
            continue

        picked = law_corpus._rank(vectors, provider, law_corpus.DEFAULT_TOP_K)
        ids = [c.id for c in picked]
        hits = [i for i in GROUND_TRUTH if i in ids]

        print(f"\n  {provider}（{space.model}，{len(windows)} 窗）")
        print(f"    取到 : {' '.join(ids)}")
        print(f"    命中 : {len(hits)}/{len(GROUND_TRUTH)}")
        for chunk_id, why in GROUND_TRUTH.items():
            mark = "✅" if chunk_id in ids else "❌"
            print(f"      {mark} {chunk_id} {why}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="比較 embedding provider 的檢索品質")
    parser.add_argument("--long", action="store_true", help="只測長合約")
    parser.add_argument("--short", action="store_true", help="只測短樣本")
    args = parser.parse_args()

    cases = []
    if not args.long:
        cases.append(("短樣本（check_llm.py 用的那份）", SHORT))
    if not args.short:
        cases.append(("長合約（接近真實上傳的內容）", LONG))

    for name, text in cases:
        await evaluate(name, text)

    print(f"\n{'=' * 66}")
    print(" 命中數高的那個應該排在 EMBEDDING_PROVIDER 前面。")
    print(" 注意：檢索命中 ≠ 最終分析正確 —— 模型有時能從相鄰條文推出來。")
    print("=" * 66)


if __name__ == "__main__":
    asyncio.run(main())
