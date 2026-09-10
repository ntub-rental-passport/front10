import { describe, expect, it } from 'vitest'

import { extractContractFieldCandidates } from '@/shared/contract-field-extraction.js'

/**
 * 內政部官方範本的實際寫法。
 *
 * 2026-09-10 發現：照官方範本填寫的合約，姓名與統一編號這兩個必填欄位
 * 一律抽不到。原因是抽取器要求標籤後「立刻」接冒號，
 * 但官方範本寫的是「姓名(名稱)：」「統一編號(身分證明文件編號)：」，
 * 中間夾著括號註記。
 *
 * 這不是罕見格式 —— 是使用者上傳的合約最可能長的樣子。
 */
const OFFICIAL_TEMPLATE = `立契約書人
出租人：
姓名（名稱）：陳大華　　簽章
統一編號（身分證明文件編號）：A123456789
戶籍地址（營業登記地址）：臺北市大安區和平東路二段88號3樓
通訊地址：臺北市大安區和平東路二段88號3樓
聯絡電話：0912-345-678

承租人：
姓名（名稱）：王小明　　簽章
統一編號（身分證明文件編號）：F221398765
戶籍地址（營業登記地址）：新北市板橋區文化路二段35號之1
通訊地址：臺北市中正區忠孝東路一段100號5樓之2
聯絡電話：0987-654-321
`

describe('官方範本格式的當事人欄位', () => {
  const fields = extractContractFieldCandidates(OFFICIAL_TEMPLATE)

  it('抽得到出租人姓名，且不含「簽章」', () => {
    expect(fields.landlord.value).toBe('陳大華')
  })

  it('抽得到承租人姓名', () => {
    expect(fields.tenant.value).toBe('王小明')
  })

  it('括號註記不會擋住統一編號', () => {
    expect(fields.landlord_id.value).toBe('A123456789')
    expect(fields.tenant_id.value).toBe('F221398765')
  })

  it('括號註記不會擋住戶籍地址', () => {
    expect(fields.landlord_registered_address.value).toContain('和平東路')
    expect(fields.tenant_registered_address.value).toContain('文化路')
  })

  it('不會把出租人與承租人的資料混在一起', () => {
    expect(fields.landlord_phone.value).toBe('0912-345-678')
    expect(fields.tenant_phone.value).toBe('0987-654-321')
  })
})

describe('其他常見寫法仍要相容', () => {
  it('標題不帶冒號', () => {
    const fields = extractContractFieldCandidates(
      '出租人\n姓名：陳大華\n統一編號：A123456789\n',
    )
    expect(fields.landlord.value).toBe('陳大華')
    expect(fields.landlord_id.value).toBe('A123456789')
  })

  it('標籤與角色寫在同一行', () => {
    const fields = extractContractFieldCandidates('出租人姓名：陳大華\n')
    expect(fields.landlord.value).toBe('陳大華')
  })

  it('簽章以外的括號內容不會被當成姓名的一部分', () => {
    const fields = extractContractFieldCandidates(
      '出租人：\n姓名（名稱）：陳大華（以下簡稱甲方）\n',
    )
    expect(fields.landlord.value).toBe('陳大華')
  })
})
