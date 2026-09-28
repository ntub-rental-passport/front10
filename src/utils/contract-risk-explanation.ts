import type { ContractAssessment } from './contract-risk'

export type LegalCitation = { label: string; href: string; summary: string }
type Guidance = { laws: LegalCitation[]; reason: string; steps: string[]; message: string }

const article = (name: string, code: string, number: string, summary: string): LegalCitation => ({
  label: `${name}第 ${number.replace('-', ' 之 ')} 條`,
  href: `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=${code}&flno=${number}`,
  summary,
})
const civil = (number: string, summary: string) => article('民法', 'B0000001', number, summary)
const consumer = (number: string, summary: string) =>
  article('消費者保護法', 'J0170001', number, summary)
const housing = (number: string, summary: string) =>
  article('租賃住宅市場發展及管理條例', 'D0060125', number, summary)
const standard = (section: string, summary: string): LegalCitation => ({
  label: `住宅租賃定型化契約應記載及不得記載事項・${section}`,
  href: 'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
  summary,
})
const fairness = consumer(
  '12',
  '預先擬定的條款若違反誠信並對消費者顯失公平，該條款無效；仍須依具體約定判斷。',
)
const effect = consumer(
  '17',
  '違反公告應記載或不得記載事項的定型化條款無效；公告應記載事項即使漏寫，仍屬契約內容。',
)
const review = consumer('11-1', '簽約前須給予合理審閱時間；以定型化條款要求放棄審閱權的約定無效。')
const copy = consumer('13', '消費者在定型化契約上簽名或蓋章後，應取得契約書正本。')

// Reviewed against official statutes on 2026-09-29. Summaries, not verbatim quotations.
// Rule-specific guidance does not change the assessment status or prove applicability.
export const RULE_GUIDANCE: Record<string, Guidance> = {
  'deposit-limit': {
    laws: [
      housing(
        '7',
        '押金上限為兩個月租金；租約結束、住宅返還且租約債務結清時，應返還押金或扣抵後餘額。',
      ),
    ],
    reason:
      '以押金名義收取超過兩個月租金的款項，與法定上限不符。應先核對是否確為押金，並排除預付租金或其他費用混列的情況。',
    steps: [
      '將押金條款改為「押金為兩個月租金」，同時修改數字、中文金額及付款收據。',
      '若已付款，保留匯款紀錄與收據，書面列出超收差額並請求返還；另記錄雙方確認的退款日期。',
    ],
    message:
      '房東您好，住宅租賃條例第 7 條規定押金上限為兩個月租金。請協助將押金金額修正到上限以內；若已收取超額部分，也請確認退款金額與日期，並一起更新契約及收據。',
  },
  'deposit-return-delay': {
    laws: [
      housing('7', '返還押金的條件包括租約消滅、返還住宅及清償租約債務；有債務時返還扣抵後餘額。'),
      housing('12', '退租時雙方應共同完成屋況及附屬設備點交；未到場者須依催告程序處理。'),
    ],
    reason:
      '若已完成返還及債務結算，仍一律延後多日退還押金，會額外限制取回款項。未結費用應具體列明，不能只用固定等待期間代替結算。',
    steps: [
      '刪除「點交後固定若干日才退還」的條款，改為符合法定返還條件時退還押金或扣抵後餘額。',
      '點交時記錄表度、設備狀態與扣款憑據；若有未到帳費用，逐項確認計算方式、待結金額與後續結算日期。',
    ],
    message:
      '房東您好，請將押金返還改為租約結束、返還房屋並結清租約債務時辦理。我們可以在點交時一起核對費用與憑據，退還扣抵後的餘額，不另外設定一律延後的等待期。',
  },
  'review-waiver': {
    laws: [
      review,
      housing('5', '適用本條例的住宅租賃，出租人與承租人間視為具消費關係，適用消費者保護法。'),
      standard('壹、一及貳、一', '住宅租賃契約應有至少三日的審閱期，不得約定承租人放棄審閱。'),
    ],
    reason:
      '依消費者保護法第 11 條之 1，訂立定型化契約前，應提供 30 日以內的合理期間，讓消費者審閱全部條款；住宅租賃定型化契約另要求至少三日，並非每份租約都固定有 30 日審閱期。\n\n依租賃住宅市場發展及管理條例第 5 條，適用該條例的住宅租賃，房東與房客間視為具消費關係。房東使用定型化契約時，不能以契約條款要求房客預先放棄審閱權。即使您已簽名，仍可主張該放棄聲明無效；但不代表整份租約因此當然無效或可撤銷。',
    steps: [
      '刪除「放棄審閱」及「日後不得主張」文字，記錄完整契約與附件的實際交付日期。',
      '至少保留三日審閱再簽約；已簽約者保留交付、簽署時間及往來訊息，提出書面修正。',
    ],
    message:
      '房東您好，我想先取得完整契約與附件，保留至少三日審閱時間。請刪除放棄審閱及不得再主張權利的文字，並註明實際交付日期，讓雙方都有清楚紀錄。',
  },
  'review-period': {
    laws: [
      review,
      standard('壹、一', '住宅租賃契約的審閱期間至少三日；應核對實際交付及簽署時間。'),
    ],
    reason:
      '約定少於三日無法符合住宅租賃契約的審閱要求；應確認是否實際給予完整條款及附件，而非只補填天數。',
    steps: [
      '將審閱期改為至少三日，填寫契約與附件交付日期。',
      '重新安排簽約時間並保留收件紀錄，避免倒填已完成審閱的日期。',
    ],
    message:
      '房東您好，請給我完整契約與附件至少三日的審閱時間，並一起調整簽約日期與審閱期欄位。我會在審閱後整理問題與您確認。',
  },
  'subsidy-ban': {
    laws: [standard('貳、十', '不得約定限制承租人申請租金補貼。'), effect],
    reason:
      '禁止申請或以申請為由加收費用、處罰，會妨礙租補權益；能否核准補貼仍須由主管機關依申請資格審查。',
    steps: [
      '刪除禁止租補、申請須另經房東同意及相關處罰條款。',
      '確認契約地址、租金及出租人資料，保存完整契約以供申請，並書面確認不因申請另行加收費用。',
    ],
    message:
      '房東您好，住宅租賃定型化契約不得限制申請租金補貼。請刪除這項限制及相關加收費用，我會依主管機關規定自行確認資格與申請。',
  },
  'household-ban': {
    laws: [standard('貳、四', '不得在住宅租賃契約約定禁止承租人遷入戶籍。'), effect],
    reason: '契約不能預先排除遷入戶籍的權利；實際登記文件與居住事實仍由戶政機關審認。',
    steps: [
      '刪除禁止遷入戶籍及違反即解約、沒收押金的附帶約定。',
      '向戶政機關確認所需證明，保留租約與實際居住資料。',
    ],
    message:
      '房東您好，請刪除禁止遷入戶籍及相關處罰的條款。我會依戶政機關要求準備資料，不以契約限制代替依法辦理的程序。',
  },
  'tax-report-ban': {
    laws: [standard('貳、三', '不得限制承租人申報租賃費用支出。'), effect],
    reason: '禁止申報會限制承租人的報稅權益；是否符合扣除資格，仍須依當年度稅法及實際支出認定。',
    steps: [
      '刪除禁止申報租金支出及申報後須補償房東稅負的文字。',
      '每次支付租金保留匯款紀錄或收據，並核對契約期間及金額。',
    ],
    message:
      '房東您好，請刪除禁止申報租金及因此補償稅負的約定。我會依稅法確認申報資格，也請協助提供與實際付款一致的租金收據。',
  },
  'tax-shift': {
    laws: [
      civil('427', '租賃物的稅捐原則由出租人負擔。'),
      standard(
        '壹、七及貳、五',
        '房屋稅、地價稅由出租人負擔，不得將出租人應負擔的稅賦轉嫁給承租人。',
      ),
    ],
    reason:
      '將房屋稅、地價稅或因出租增加的稅負交由房客支付，與住宅租賃定型化契約的費用分配規範不符。',
    steps: [
      '明訂房屋稅、地價稅及出租人應負擔稅賦由出租人支付，刪除「增加部分由房客補足」。',
      '將水電、管理費等使用費分開列明，要求已收稅費的明細與憑證並協商返還。',
    ],
    message:
      '房東您好，房屋稅與地價稅請依住宅租賃規範由出租人負擔，刪除要求房客補足增加稅負的文字。水電及管理費可以另外逐項列明，避免混在一起。',
  },
  'electricity-reference': {
    laws: [standard('壹、六及十一', '按度計費應比對當期每度平均電價；出租人須提供電費相關資訊。')],
    reason:
      '僅有每度單價還不能確認是否超收。需要同一期帳單、計費方式、分表度數與分攤資料，才能比較契約計收金額。',
    steps: [
      '索取當期台電帳單、期初期末電表照片及公共用電分攤方式。',
      '按度計費時比對當期每度平均電價；其他計費方式則核對實際帳單與分攤總額，逐項列出差額。',
    ],
    message:
      '房東您好，請提供這一期台電帳單、分表起訖度數及公共用電分攤方式，我想先核對每度電價與計算結果，再確認應付金額及是否需要調整。',
  },
  'electricity-objection': {
    laws: [standard('壹、六及十一', '電費約定及資訊提供應符合住宅租賃規範。'), fairness],
    reason:
      '由房東單方決定又禁止提出異議，使房客難以查核費用是否合理；這與是否已發生超收是兩個需要分別確認的問題。',
    steps: [
      '刪除「依房東公告且不得異議」，改列帳單來源、計價公式及分攤方法。',
      '約定每期提供帳單與度數，發現計算錯誤時雙方核對並退補差額。',
    ],
    message:
      '房東您好，請將電費改為可核對的帳單與計算方式，並刪除不得異議的限制。若度數或計算有出入，希望能保留核對與退補差額的方式。',
  },
  'internet-adjustment': {
    laws: [
      civil('247-1', '預擬條款若加重他方責任或造成重大不利益，且按情形顯失公平，該部分約定無效。'),
      fairness,
    ],
    reason:
      '未定範圍、理由及程序的單方調價，會讓固定租屋成本無法預期；是否無效仍須檢視實際條款與公平性，不是所有費用調整都違法。',
    steps: [
      '填明網路月費、服務內容及是否含在租金內。',
      '將調整條件、憑據、通知期間及雙方書面同意程序寫入契約；未達成合意前依原約定處理。',
    ],
    message:
      '房東您好，請先列明網路費與服務內容。若未來確有調整需要，希望提供原因與費用依據，經雙方書面確認後再變更，避免由單方隨時調價。',
  },
  'repair-allocation': {
    laws: [
      civil('429', '修繕原則由出租人負擔，但仍須檢視契約另訂及習慣。'),
      housing('8', '出租人須維持住宅合於約定居住使用，簽約前說明由其負責的修繕範圍及聯絡方式。'),
    ],
    reason:
      '「一律由房客負擔」未區分設備自然老化、原有瑕疵與使用不當。須核對事前說明及具體責任分配，不能僅看到另有約定就直接認定有效或違法。',
    steps: [
      '逐項列出冷氣、熱水器等設備的修繕負責人，區分自然耗損與可歸責於房客的損壞。',
      '寫明報修聯絡方式、通知與處理期限；需要修繕時先留存照片及書面通知。',
    ],
    message:
      '房東您好，請把設備修繕責任分項寫清楚，區分自然老化、原有問題與使用不當，不要一律由房客負擔。也請提供報修窗口，讓我們按約定通知與處理。',
  },
  'termination-deposit-forfeit': {
    laws: [
      standard('壹、十四及十八', '任意提前終止與依法終止應分開處理，須核對通知期間及違約金條件。'),
      civil('252', '約定違約金過高時，法院得酌減至相當金額。'),
      housing('11', '符合法定承租人提前終止事由及通知要求時，出租人不得要求賠償。'),
    ],
    reason:
      '押金是履約擔保，不是所有提前退租都可以全數沒收。須區分法定終止與約定任意終止，不能把不同事由一律當成違約；違約金也需核對適用上限。',
    steps: [
      '刪除「提前退租一律沒收全部押金」，分別列明終止事由、通知期間及適用違約金。',
      '任意終止依定型化契約核對是否得提前終止、至少一個月通知及未先期通知時最高一個月租金的違約金規範；法定終止另依其條件處理。',
      '退租時列出合法債務、違約金依據及押金餘額，避免重複扣款。',
    ],
    message:
      '房東您好，請把提前退租的通知及違約金分開寫清楚，不要直接沒收全部押金。若屬依法可終止的情形，請按法律處理；其餘則核對約定及適用上限，再結算押金餘額。',
  },
  'landlord-termination': {
    laws: [
      housing(
        '10',
        '因欠租或費用終止，須達兩個月租額並經相當期限催告仍拒繳；另須依規定事先書面通知。',
      ),
    ],
    reason:
      '僅欠一個月就立即終止，省略金額門檻、催告及書面通知等要件，與住宅租賃欠租終止程序不符。',
    steps: [
      '將條款改為符合法定欠款門檻、催告及終止前三十日書面通知等要件。',
      '逐筆核對應繳及已繳租金，保存收據、催告與通知送達紀錄；有爭議的費用另列。',
    ],
    message:
      '房東您好，請刪除欠租一個月即可立即解約的約定，改按住宅租賃條例第 10 條的欠款門檻、催告及書面通知程序處理。我們也可以先一起核對付款明細。',
  },
  'advertisement-disclaimer': {
    laws: [
      consumer('22', '廣告必須真實，契約成立後的履行義務不得低於廣告承諾。'),
      housing('13', '住宅出租廣告應符合實際情況。'),
    ],
    reason:
      '把廣告一律列為僅供參考，可能排除已承諾的設備與居住條件，不能用概括免責文字免除相關義務。',
    steps: [
      '刪除概括排除廣告效力的條款，將重要承諾如設備、車位及可使用範圍寫入附件。',
      '保存刊登日期、網址、廣告截圖及對話，現場逐項核對並由雙方確認差異。',
    ],
    message:
      '房東您好，廣告中的設備與使用範圍是我決定承租的重要條件。請刪除一律僅供參考的文字，將這些承諾列入契約附件，並一起確認現況。',
  },
  'contract-return': {
    laws: [copy, standard('貳、七', '不得約定承租人必須繳回契約書。')],
    reason: '租約結束後仍可能需要證明押金、費用與履約內容，要求繳回會使房客失去重要權利憑證。',
    steps: [
      '刪除退租時須繳回租約的要求，約定雙方各自保留已簽署的完整正本及附件。',
      '點交或結清另簽收據，註明日期、金額與交付項目，不以繳回租約代替。',
    ],
    message:
      '房東您好，請刪除繳回租約的條款，雙方各自保留正本。退租時我們可以另簽點交與結算紀錄，確認已完成的事項。',
  },
  'contract-copy-ban': {
    laws: [copy, fairness],
    reason:
      '禁止留存影本或拍照可能妨礙日後舉證，應確認是否同時限制取得正本。拍照限制的效力需看範圍及理由，不能直接等同未交付正本。',
    steps: [
      '確認雙方均取得已簽署的正本及附件，刪除妨礙保存自身契約內容的限制。',
      '約定可為履約、報稅及爭議處理保存副本，分享時遮蔽不必要的個資。',
    ],
    message:
      '房東您好，我需要保留完整簽署正本，也希望能備份自己這份契約供履約查核。請調整禁止留存或拍照的文字；對外提供時我會遮蔽不必要的個資。',
  },
  'parking-fee-unclear': {
    laws: [
      standard('壹、六', '租賃期間相關費用的負擔及計算方式應明確約定。'),
      consumer('11', '定型化條款應平等互惠；條款有疑義時，應採有利消費者的解釋。'),
    ],
    reason:
      '只寫「另計」無法確認總支出及付款義務，容易對是否包含管理費等項目產生不同理解；資訊不足本身不等於已經超收。',
    steps: [
      '核對車位附件，補上車位編號、每期金額、計算方式、付款日期及收款人。',
      '寫明是否已含管理費或清潔費；不租用車位時，註明不適用及不計費。',
    ],
    message:
      '房東您好，車位費目前只寫另計，請補上金額、計算週期及是否包含管理費。若有附件也請一併提供，讓我確認每月總支出。',
  },
  'equipment-record': {
    laws: [
      civil(
        '432',
        '承租人負有善良管理人的保管義務；依約定使用所生的正常變更或毀損，不負賠償責任。',
      ),
      housing('12', '退租返還須共同點交屋況與附屬設備。'),
    ],
    reason:
      '沒有入住時的設備紀錄，退租時容易把既有損傷或正常使用耗損誤認為房客造成。這是存證風險，並非僅因未拍照就違法。',
    steps: [
      '入住時逐項記錄設備型號、數量、功能及既有刮傷，拍攝附日期的全景與近照。',
      '將照片編號列入點交清單並由雙方確認；退租時使用同一份清單逐項比對。',
    ],
    message:
      '房東您好，我們可以一起把設備現況及原有刮傷記在附件並拍照確認嗎？退租時按同一份清單核對，也能區分正常耗損與需負責的損壞。',
  },
}

export function explainContractRisk(risk: ContractAssessment) {
  const known = risk.ruleId ? RULE_GUIDANCE[risk.ruleId] : undefined
  const confirmed = risk.status === 'confirmed'
  let problemSummary = ''
  if (risk.ruleId === 'review-waiver' && confirmed && risk.clause) {
    const clause = risk.clause.replace(/\s/g, '')
    problemSummary = '承租人聲明放棄契約審閱期間之權利'
    // Preserve the scope of the restriction; do not invent it for waiver-only clauses.
    const restriction = clause.match(/(?:不得|不可)[^。；;]{0,60}主張契約(?:無效|撤銷)[^。；;]*/)?.[0]
    if (restriction) problemSummary += `，日後${restriction}`
    problemSummary += '。'
  }
  const steps = [
    ...(known?.steps ?? [
      '先對照下方原文、所在頁次及相關附件，確認金額、條件與是否有其他更正約定。',
      risk.advice || '請房東就不明確的條款提供書面說明，再將雙方確認的內容寫入契約。',
    ]),
  ]
  let reason = known?.reason ?? (risk.description || '目前資料不足，請先核對原文與適用條件。')
  let message =
    known?.message ??
    `房東您好，我想確認「${risk.title}」這一項。${steps.join('')}請協助提供依據，並將確認結果以書面保留。`
  // Only compute concrete amounts from confirmed evidence, never from conflicting OCR.
  const rent = risk.metrics?.find((metric) => metric.label === '月租')?.value
  const deposit = risk.metrics?.find((metric) => metric.label === '押金')?.value
  if (
    risk.ruleId === 'deposit-limit' &&
    confirmed &&
    Number.isFinite(rent) &&
    rent! > 0 &&
    Number.isFinite(deposit) &&
    deposit! > rent! * 2
  ) {
    const money = (value: number) => `${value.toLocaleString('zh-TW')} 元`
    const cap = money(rent! * 2),
      excess = money(deposit! - rent! * 2)
    reason = `本契約月租 ${money(rent!)}，兩個月押金上限為 ${cap}；約定押金 ${money(deposit!)}，超出 ${excess}。確認全部款項均屬押金時，超額約定與第 7 條上限不符。`
    steps[0] = `將押金由 ${money(deposit!)} 改為不超過 ${cap}（${money(rent!)} × 2 個月），同步更正中文金額與收據。`
    message = `房東您好，月租為 ${money(rent!)}，依住宅租賃條例第 7 條，押金上限是 ${cap}。目前約定 ${money(deposit!)}，多出 ${excess}，請協助更正契約；若已收取，也請返還差額並確認退款日期。`
  }
  if (!confirmed) {
    reason = `目前為「待核對／補充說明」，尚不能認定本契約違法。${risk.description ? `${risk.description}\n` : ''}${known ? `適用條件確認後，應注意：${reason}` : ''}`
    steps.unshift('先確認原文辨識、更正條款及適用條件；以下修改方向供確認問題成立後討論。')
    message = `房東您好，我想先核對「${risk.title}」的原文、附件及實際適用條件，目前還不能確定是否有問題。請協助提供完整說明；${known ? `如果確認有上述情況，希望討論以下調整：${known.steps[0]}` : '確認後請將雙方共識以書面保留。'}`
  }
  return {
    problemSummary,
    laws: known?.laws ?? [],
    reason,
    steps,
    message,
    reviewed: Boolean(known),
    summary: steps[0]!,
  }
}

/** Contract headings come from evidence, never from the statute number or a sample. */
export function contractSectionLabel(risk: ContractAssessment, pages: string[]): string {
  if (risk.pageIndex === null || !risk.focusText) return ''
  const page = pages[risk.pageIndex]
  if (!page) return ''
  const offset = page.indexOf(risk.focusText)
  if (offset < 0) return ''
  const prefix = [
    ...pages.slice(0, risk.pageIndex),
    page.slice(0, offset + risk.focusText.length),
  ].join('\n')
  const headings = [
    ...prefix.matchAll(
      /(?:^|\n)\s*(第[一二三四五六七八九十百\d]+條|[一二三四五六七八九十]+[、．])[^\n]*/g,
    ),
  ]
  const heading = headings.at(-1)?.[1]
  return heading ? (heading.startsWith('第') ? heading : `契約第${heading.slice(0, -1)}節`) : ''
}
