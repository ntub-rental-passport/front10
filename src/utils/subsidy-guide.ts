export const subsidySources = {
  portal: 'https://has.nlma.gov.tw/subsidyOnline/house300e/',
  announcement: 'https://www.nlma.gov.tw/ch/legislation/law&regunu/7243',
  faq: 'https://pip.moi.gov.tw/Publicize/Info/B1020?n=%E5%95%8F%E8%88%87%E7%AD%94&y=115',
  overview: 'https://www.gov.tw/News_Content_37_561179',
}

// 115 年官方申請頁「申請標準」；金額為嚴格低於，非小於等於。
export const incomeLimits: Record<string, [number, number]> = {
  臺北市: [61137, 71327],
  新北市: [50700, 59150],
  桃園市: [50304, 58688],
  臺中市: [48231, 56270],
  臺南市: [46545, 54303],
  高雄市: [48120, 56140],
  基隆市: [46545, 54303],
  新竹市: [46545, 54303],
  新竹縣: [46545, 54303],
  苗栗縣: [46545, 54303],
  彰化縣: [46545, 54303],
  南投縣: [46545, 54303],
  雲林縣: [46545, 54303],
  嘉義市: [46545, 54303],
  嘉義縣: [46545, 54303],
  屏東縣: [46545, 54303],
  宜蘭縣: [46545, 54303],
  花蓮縣: [46545, 54303],
  臺東縣: [46545, 54303],
  澎湖縣: [46545, 54303],
  金門縣: [43023, 50194],
  連江縣: [43023, 50194],
}
export function checkIncome(
  city: string,
  annual: number | '',
  people: number | '',
  expanded: boolean,
) {
  const limits = incomeLimits[city]
  if (
    !limits ||
    annual === '' ||
    people === '' ||
    !Number.isFinite(annual) ||
    annual < 0 ||
    !Number.isInteger(people) ||
    people < 1
  )
    return null
  const monthly = annual / 12 / people
  const limit = limits[expanded ? 1 : 0]
  return { monthly, limit, passes: monthly < limit }
}
export type Answer = '' | 'yes' | 'no' | 'unknown'
export function checkHousing(
  tax: Answer,
  legal: Answer,
  residentialTax: Answer,
  use: Answer,
  oldSameAddress: boolean,
) {
  if (oldSameAddress)
    return {
      level: 'review',
      title: '舊戶同址：請確認過渡規定',
      detail:
        '114 年核定並同址帶入 115 年的部分舊戶有過渡安排。請向承辦確認是否適用；搬家後須重新檢查新屋，不能據此推論歷年款項免追繳。',
    }
  if (tax === 'no' || legal === 'no' || (residentialTax === 'no' && use === 'no'))
    return {
      level: 'risk',
      title: '房屋條件有疑慮，先向承辦查證',
      detail:
        '你填寫的資料可能不符合房屋條件。請備妥稅籍及建物證明，確認地址、樓層與適用年度；本結果不是不合格處分。',
    }
  if (tax === 'yes' && legal === 'yes' && (residentialTax === 'yes' || use === 'yes'))
    return {
      level: 'ready',
      title: '已完成這四項房屋條件自查',
      detail:
        '仍須核對實際承租範圍、租約、出租人關係及其他條件。RentMate 未連線查驗稅籍，也無法保證核准或免於追繳。',
    }
  return {
    level: 'review',
    title: '資料不足，還不能判斷',
    detail:
      '不知道很正常。先向房東索取房屋稅單、建物謄本或合法建築證明，再請地方承辦確認是否對應實際承租樓層。',
  }
}
