import assert from 'node:assert/strict'
import { extractContractFieldCandidates } from '../src/utils/contract-field-extraction'

const reportReferenceText = [
  '出租人：[已遮蔽]，以下簡稱甲方',
  '承租人：[已遮蔽]，以下簡稱乙方',
  '第一條：甲方房屋所在地及使用範圍：桃園縣大園鄉北港村。',
  '第二條：租賃期限為二年，自民國一○二年十月日起，至民國一○四年九月三十日止。',
  '第三條：租金每個月新台幣伍仟元正。',
  '第四條：租金應於每月底以前繳納。',
  '第五條：押租保證金新台幣壹萬二仟元。',
  '第十八條：乙方提前遷離，賠償甲方一個月租金；甲方提前解約時，賠償乙方一個月租金及搬遷費用。',
].join('\n')

const reportResult = extractContractFieldCandidates(reportReferenceText)
assert.equal(reportResult.landlord.value, '影像遮蔽，請人工輸入')
assert.equal(reportResult.tenant.value, '影像遮蔽，請人工輸入')
assert.equal(reportResult.address.value, '桃園縣大園鄉北港村［地址不完整，後段待確認］')
assert.equal(reportResult.startDate.value, '民國 102 年 10 月［日期待確認］')
assert.equal(reportResult.endDate.value, '民國 104 年 9 月 30 日')
assert.equal(reportResult.rent.value, 'NT$5,000')
assert.equal(reportResult.dueDay.value, '每月底前')
assert.equal(reportResult.deposit.value, 'NT$12,000')
assert.equal(
  reportResult.penalty.value,
  '乙方提前終止：1 個月租金；甲方提前解約：1 個月租金及搬遷費用',
)

const pollutedDeposit = extractContractFieldCandidates('押租保證金民國102年萬仟元')
assert.equal(pollutedDeposit.deposit.value, '')

const modernContract = extractContractFieldCandidates(
  [
    '出租人（甲方）：王小明',
    '承租人（乙方）：李小華',
    '租屋地址：臺北市中正區忠孝東路一段1號',
    '租期自民國113年1月1日起至民國114年1月1日止',
    '月租金新台幣18,000元',
    '租金每月5日前繳納',
    '押金新台幣36,000元',
    '違約金新台幣18,000元',
  ].join('\n'),
)
assert.equal(modernContract.landlord.value, '王小明')
assert.equal(modernContract.tenant.value, '李小華')
assert.equal(modernContract.startDate.value, '民國 113 年 1 月 1 日')
assert.equal(modernContract.endDate.value, '民國 114 年 1 月 1 日')
assert.equal(modernContract.rent.value, 'NT$18,000')
assert.equal(modernContract.dueDay.value, '每月 5 日前')
assert.equal(modernContract.deposit.value, 'NT$36,000')
assert.equal(modernContract.penalty.value, 'NT$18,000')

console.log('Contract field extraction regression checks passed.')
