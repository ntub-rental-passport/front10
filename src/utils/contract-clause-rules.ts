import type { ContractAssessment } from './contract-risk'
import type { ContractFieldReview } from './contract-ocr'

export const CLAUSE_RULE_VERSION = '2026-09-17.1'
const legalUrl = 'https://www.ey.gov.tw/File/43BC094940995CFC?A=C'
const normalize = (s: string) => s.normalize('NFKC').replace(/\s/g, '').replace(/臺/g, '台')
const number = (s: string) => Number(s.replace(/[,，]/g, ''))
const integers: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const integer = (s: string) => /^\d+$/.test(s) ? Number(s) : (integers[s] ?? NaN)
type Clause = { raw: string; value: string; start: number; end: number; normative: boolean }

// Preserve offsets in the joined OCR text, including clauses spanning pages.
export function contractClauses(pages: string[]) {
  const text = pages.join('\n')
  const clauses: Clause[] = []
  const normativeStart = text.search(/貳[、．.\s]*不得記載事項/)
  const normativeEnd = normativeStart < 0 ? -1 : text.slice(normativeStart).search(/(?:\n|^)\s*(?:附件[一二三四五]|參[、．.])/)
  for (const match of text.matchAll(/[^。；;]+/g)) {
    const raw = match[0].trim()
    if (!raw) continue
    const start = match.index! + match[0].indexOf(raw)
    clauses.push({ raw, value: normalize(raw), start, end: start + raw.length,
      normative: normativeStart >= 0 && start >= normativeStart && (normativeEnd < 0 || start < normativeStart + normativeEnd) })
  }
  return { text, clauses }
}

function actual(clause: Clause) {
  if (clause.normative) return ''
  // A document called "測試用範例" is not itself a quoted example clause.
  let value = clause.value
  if (value.includes('□')) value = value.split(/(?=[□■☑✓])/).filter((part) => /^[■☑✓]/.test(part)).join('；')
  if (/不得(?:記載|約定|要求)|禁止(?:記載|約定)|未要求|不要求|未同意|未禁止|不得禁止|不能禁止|(?:範例|示例|例如)[:：]|並非|不是/.test(value)) return ''
  return value
}

export function hasTopicCorrection(pages: string[], topic: RegExp) {
  const { clauses } = contractClauses(pages)
  return clauses.some((clause, index) => {
    if (!actual(clause) || !/更正|改為|改成|取代|作廢/.test(clause.value)) return false
    return topic.test(clause.value) || (/^(?:雙方|双方)?(?:更正|改為|改成)/.test(clause.value)
      && topic.test(clauses[index - 1]?.value ?? '') && !/電費|水費|管理費|地址|戶名/.test(clause.value))
  })
}

export function evaluateClauseRisks(pages: string[], reviews: Record<string, ContractFieldReview>, complete: boolean): ContractAssessment[] {
  const { clauses } = contractClauses(pages)
  const results: ContractAssessment[] = []
  const evidence = (clause: Clause) => {
    let offset = 0
    return pages.flatMap((page, pageIndex) => {
      const start = Math.max(clause.start, offset), end = Math.min(clause.end, offset + page.length)
      const focusText = start < end ? page.slice(start - offset, end - offset) : ''
      offset += page.length + 1
      return focusText.trim() ? [{ label: `原文第 ${pageIndex + 1} 頁`, pageIndex, focusText }] : []
    })
  }
  const emit = (ruleId: string, title: string, severity: ContractAssessment['severity'], sources: Clause[], topic: RegExp, basis: string, advice: string,
    status: ContractAssessment['status'] = 'confirmed', description = '') => {
    if (results.some((r) => r.ruleId === ruleId)) return
    const refs = sources.flatMap((source, index) => evidence(source).map((ref) => ({
      ...ref, label: `證據 ${index + 1} · 第 ${ref.pageIndex + 1} 頁：${normalize(ref.focusText).slice(0, 64)}`,
    })))
    const uncertain = sources.some((c) => /[「」『』]|假設|如果|^若|原約定|更正|改為|改成/.test(c.value)) || hasTopicCorrection(pages, topic)
    if (status === 'confirmed' && (uncertain || !refs.length)) status = 'recognition_pending'
    results.push({ id: status === 'confirmed' ? ruleId : `check-${ruleId}`, ruleId, ruleVersion: CLAUSE_RULE_VERSION,
      title, status, severity: status === 'confirmed' ? severity : null, priority: severity === 'high' && status !== 'confirmed',
      source: 'field', sourceLabel: '契約條款規則', groupId: null, groupLabel: '條款與原文證據', fieldIds: [],
      pageIndex: refs[0]?.pageIndex ?? null, focusText: refs[0]?.focusText ?? '', clause: sources.map((s) => s.raw).join('\n'),
      details: refs.length > 1 ? refs : undefined,
      description: uncertain ? '相關條款有引述、更正或例外，請核對後再判定；不計入已確認風險。' : description || '原文符合此項風險規則；分級反映可能影響，不等同法院的法律判決。',
      advice, legalBasis: [`住宅租賃定型化契約應記載及不得記載事項（114-04-18），${basis}：${legalUrl}`] })
  }

  // Labelled amounts are independent evidence; OCR confidence alone is not a legal test.
  const rents: Array<{ value: number; clause: Clause }> = []
  const deposits: Array<{ value: number; months: number; clause: Clause }> = []
  for (const clause of clauses) {
    const value = actual(clause)
    if (!value) continue
    const rent = value.match(/(?:每月租金|月租金)[:：為](?:新台幣|NT\$)?([\d,]+)元/)
    if (rent) rents.push({ value: number(rent[1]!), clause })
    const deposit = value.match(/(?:押金金額|押租保證金|押金)[:：為]([^。；]{0,100})/)
    if (deposit && !/返還|抵充|沒收|退還|喪失/.test(deposit[1]!)) {
      const money = deposit[1]!.match(/(?:新台幣|NT\$)([\d,]+)元|^([\d,]+)元/)
      const months = deposit[1]!.match(/([一二兩三四五六七八九十\d]+)個月租金/)
      deposits.push({ value: money ? number(money[1] || money[2]!) : NaN, months: months ? integer(months[1]!) : NaN, clause })
    }
  }
  const rent = rents[0]
  const excessive = deposits.find((d) => d.months > 2 || (rent && rent.value > 0 && d.value > rent.value * 2))
  if (excessive) {
    const sources = [...(rent ? [rent.clause] : []), excessive.clause]
    const conflict = new Set(rents.map((r) => r.value)).size > 1 || new Set(deposits.map((d) => `${d.value}/${d.months}`)).size > 1
      || /(?:包含|含|其中|包括).*(?:租金|清潔費|設備|管理費)/.test(excessive.clause.value)
      || Boolean(rent && Number.isFinite(excessive.months) && Number.isFinite(excessive.value)
        && excessive.months * rent.value !== excessive.value)
    const reviewConflict = ['rent', 'deposit', 'deposit_months'].some((id) => {
      const review = reviews[id]
      if (!review?.value || /尚未辨識|不適用/.test(review.value)) return false
      const expected = id === 'rent' ? rent?.value : id === 'deposit' ? excessive.value : excessive.months
      const reviewed = number(review.value.replace(/[^0-9.,]/g, ''))
      const source = normalize(review.sourceValue || '')
      return (Number.isFinite(expected) && reviewed !== expected) || !source || !sources.some((c) => c.value.includes(source))
    })
    emit('deposit-limit', '押金超過兩個月租金', 'high', sources, /押金|押租保證金|月租金|每月租金/, '壹、五',
      '核對押金性質及金額，簽約前修正超額押金。', conflict || reviewConflict ? 'recognition_pending' : 'confirmed',
      `${rent ? `月租 ${rent.value.toLocaleString()} 元，上限 ${ (rent.value * 2).toLocaleString()} 元；` : ''}${Number.isFinite(excessive.value) ? `押金 ${excessive.value.toLocaleString()} 元。` : `押金約定 ${excessive.months} 個月租金。`}`)
  }

  for (const clause of clauses) {
    const s = actual(clause)
    if (!s) continue
    const add = (id: string, title: string, severity: ContractAssessment['severity'], topic: RegExp, basis: string, advice: string,
      status: ContractAssessment['status'] = 'confirmed') => emit(id, title, severity, [clause], topic, basis, advice, status)
    if (/(?:承租人|房客)[^。；]{0,90}(?:同意|應|須|聲明)[^。；]{0,35}(?:放棄|拋棄)(?:任何)?(?:契約)?審閱/.test(s))
      add('review-waiver', '約定放棄契約審閱權', 'high', /審閱/, '壹、一及貳、一', '刪除放棄審閱約定，保留實際審閱期間。')
    if (/(?:承租人|房客)[^。；]{0,30}(?:不得|不可|禁止)[^。；]{0,45}(?:申請[^。；]{0,15}租金補貼|申請租補)/.test(s))
      add('subsidy-ban', '限制承租人申請租金補貼', 'high', /租補|租金補貼/, '貳、十', '刪除禁止申請租金補貼及相關處罰。')
    if (/(?:承租人|房客)[^。；]{0,30}(?:不得|不可|禁止)[^。；]{0,25}(?:戶籍遷入|遷入戶籍)/.test(s))
      add('household-ban', '禁止遷入戶籍', 'high', /戶籍/, '貳、四', '刪除禁止遷入戶籍的約定。')
    if (/(?:承租人|房客)[^。；]{0,30}(?:不得|不可|禁止)申報(?:租金|租賃費用)支出/.test(s))
      add('tax-report-ban', '禁止申報租賃費用支出', 'high', /申報|報稅/, '貳、三', '刪除禁止報稅及因此要求補償稅負的約定。')
    if (/(?:房屋稅|地價稅|出租人[^。；]{0,12}稅賦)[^。；]{0,100}(?:承租人|房客)(?:負擔|承擔|支付)/.test(s)
      && (!/(?:房屋稅|地價稅)[^。；]{0,30}由出租人負擔/.test(s) || /增加部分[^。；]{0,20}承租人(?:負擔|承擔)/.test(s)))
      add('tax-shift', '將出租人的房屋稅或地價稅轉由承租人負擔', 'high', /稅賦|稅負|稅費|房屋稅|地價稅/, '壹、七及貳、五', '明確由出租人負擔房屋稅、地價稅，刪除轉嫁增加稅負的條款。')
    if (/押金返還|返還[^。；]{0,20}押金/.test(s) && /(?:點交|搬離|返還住宅|租期屆滿)[^。；]{0,30}後[1-9]\d*日/.test(s))
      add('deposit-return-delay', '押金返還延後至點交後多日', 'high', /押金.*返還|返還.*押金/, '壹、五及十五', '約定返還住宅時結算，返還扣抵合法債務後的剩餘押金。')
    if (/電費[^。；]{0,70}(?:每度|每期每度)(?:電費|單價)?[:：]?(?:新台幣)?[0-9.]+元/.test(s))
      add('electricity-reference', '電費單價需比對當期帳單', null, /電費|電價/, '壹、六及十一', '取得當期電費單及用電資料後比較，不僅憑每度 8 元判定超收。', 'applicability_pending')
    if (/電費[^。；]{0,70}(?:出租人|房東)(?:公告|帳單)|電費[^。；]{0,70}出租人公告或帳單/.test(s) && /不得異議/.test(s))
      add('electricity-objection', '電費由出租人單方決定且排除異議', 'medium', /電費|電價/, '壹、六及十一', '保留核對台電帳單與計費方式的權利；另行驗證是否超收。')
    if (/網路費[^。；]{0,70}(?:房東|出租人)得[^。；]{0,30}(?:調整|調漲)/.test(s))
      add('internet-adjustment', '網路費可由出租人單方調整', 'medium', /網路費/, '壹、四及六', '明訂金額、調整條件及雙方同意程序，確認是否連帶調漲租金。')
    if (/(?:冷氣|熱水器|附屬設備)[^。；]{0,100}(?:故障|損壞)[^。；]{0,30}一律由承租人負擔/.test(s))
      add('repair-allocation', '設備故障費用一律轉由承租人負擔', 'high', /修繕|檢修|設備|冷氣|熱水器/, '壹、九及十一', '核對是否事先說明並確認修繕項目、範圍及可歸責事由；不能僅因另有約定就直接判違法。', 'applicability_pending')
    if (/(?:提前退租|提前解約|提前終止)[^。；]{0,140}(?:喪失|沒收|扣除|不退還)(?:全)?部押金[^。；]{0,20}違約金/.test(s))
      add('termination-deposit-forfeit', '提前退租即以全部押金作為違約金', 'high', /提前|違約金|沒收|喪失/, '壹、十四及十八', '區分任意終止與法定終止事由，核對通知期間及違約金，不得一律沒收全部押金。', excessive ? 'confirmed' : 'applicability_pending')
    if (/(?:遲付|積欠|欠繳|欠租)[^。；]{0,30}(?:1|一)個月[^。；]{0,100}(?:立即|逕行)終止/.test(s))
      add('landlord-termination', '欠租一個月即可立即終止租約', 'high', /欠租|遲付|積欠|出租人提前/, '壹、十七', '核對欠租總額、催告及書面通知條件；不能以欠租一個月直接要求立即搬離。')
    if (/(?:廣告|簡章|網頁)[^。；]{0,35}(?:一律)?僅供參考/.test(s))
      add('advertisement-disclaimer', '約定廣告內容僅供參考', 'high', /廣告|簡章|網頁/, '壹、二十二及貳、二', '保留廣告作為契約內容及主張權利的依據。')
    if (/(?:承租人|房客)[^。；]{0,70}(?:應|須)[^。；]{0,30}(?:契約|文件)[^。；]{0,15}繳回|(?:承租人|房客)[^。；]{0,70}(?:應|須)繳回契約/.test(s))
      add('contract-return', '要求承租人繳回契約文件', 'high', /契約.*(?:繳回|留存|影本)|文件.*繳回/, '壹、二十二及貳、七', '雙方各保留契約正本，刪除要求繳回契約的約定。')
    if (/(?:承租人|房客)[^。；]{0,40}不得(?:留存影本|拍照)/.test(s))
      add('contract-copy-ban', '限制承租人保存契約及拍照存證', 'medium', /契約|影本|拍照/, '壹、二十二', '確認承租人取得正本並可保留紀錄；核對與各執一份條款的矛盾。')
    if (/車位(?:費|租金|管理費)[:：]?另計/.test(s) && !/\d+元|依.*(?:帳單|公告|費率)|計算方式/.test(s)) {
      const extra = clauses.some((c) => c !== clause && /車位(?:費|租金|管理費).{0,25}(?:\d+元|含.{0,8}租金)|見附件|詳附件|另附/.test(actual(c)))
      add('parking-fee-unclear', '車位費另計但計算方式未明', 'medium', /車位/, '壹、六', '核對其他頁面及附件，補充金額或算法。', !complete || extra ? 'applicability_pending' : 'confirmed')
    }
    if (/設備清單.*(?:未記錄|未載明)(?:既有)?(?:刮傷|損傷)/.test(s))
      add('equipment-record', '設備既有損傷尚未記錄', 'low', /設備清單|刮傷/, '壹、十五及附件一', '點交時共同記錄既有損傷並拍照。')
  }
  return results
}
