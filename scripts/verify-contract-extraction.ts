import assert from 'node:assert/strict'
import { extractContractFieldCandidates } from '../src/utils/contract-field-extraction'
import { detectContractConditions } from '../shared/contract-field-schema.js'
import {
  isValidContractFieldFormat,
  isValidBuildingNumber,
  isValidLandNumber,
  isValidPersonOrEntityName,
  isValidPositiveArea,
  isValidRocDate,
  isValidTaiwanBusinessNumber,
  isValidTaiwanNationalId,
} from '../shared/contract-field-validation.js'

assert.equal(isValidContractFieldFormat('money', 'NT$18,000'), true)
assert.equal(isValidContractFieldFormat('money', '18,00'), false)
assert.equal(isValidContractFieldFormat('phone', '0912-345-678'), true)
assert.equal(isValidContractFieldFormat('phone', '123'), false)
assert.equal(isValidContractFieldFormat('party_address', '臺北市中正區忠孝東路一段 1 號'), true)
assert.equal(isValidContractFieldFormat('party_address', '123'), false)
assert.equal(isValidContractFieldFormat('rental_room', '第 3 樓 A 室'), true)
assert.equal(isValidContractFieldFormat('rental_room', '隨便填'), false)
assert.equal(isValidContractFieldFormat('payment_period', '1 個月'), true)
assert.equal(isValidContractFieldFormat('months', '3 個月租金'), true)
assert.equal(isValidContractFieldFormat('due_day', '每月 5 日前'), true)
assert.equal(isValidContractFieldFormat('due_day', '每月 40 日前'), false)
assert.equal(isValidContractFieldFormat('payment_method', '轉帳繳付'), true)
assert.equal(
  isValidContractFieldFormat('bank_account', '第一銀行，戶名：王小明，帳號：123456789'),
  true,
)
assert.equal(isValidContractFieldFormat('expense', '由承租人依帳單繳納'), true)
assert.equal(isValidContractFieldFormat('expense', '隨便填'), false)
assert.equal(isValidContractFieldFormat('signature', '已完成簽章'), true)
assert.equal(isValidContractFieldFormat('signature', '123'), false)
assert.equal(isValidContractFieldFormat('authorization_evidence', '已檢附代理授權書'), true)
assert.equal(isValidContractFieldFormat('sublease_evidence', '已檢附轉租同意書'), true)

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
assert.equal(reportResult.address.value, '桃園縣大園鄉北港村')
assert.equal(reportResult.address.sourceValue, '桃園縣大園鄉北港村')
assert.equal(reportResult.address.addressResolution?.warnings.includes('address_incomplete'), true)
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

const noisyVerticalAddress = extractContractFieldCandidates(
  [
    '第 一 條：甲方店屋所在地及使用範圍',
    '（以下簡稱為甲方）',
    '（以下簡稱為乙方）',
    '（以下簡稱為丙方）',
    '長千中正區林森南路號3提',
    '第 二 條：租賃期限',
  ].join('\n'),
)
assert.equal(noisyVerticalAddress.address.sourceValue, '長千中正區林森南路號3提')
assert.equal(noisyVerticalAddress.address.value, '臺北市中正區林森南路號3提')
assert.equal(noisyVerticalAddress.address.addressResolution?.evidenceType, 'road_inference')
assert.equal(
  noisyVerticalAddress.address.addressResolution?.warnings.includes('address_incomplete'),
  true,
)

const noisyLabelWithValidAddress = extractContractFieldCandidates(
  [
    '第 一 條：甲方 店店 屋所在地及使用範圍',
    '新北市淡水區自强路',
    '第 二 條：租賃期限經甲乙雙方洽訂',
  ].join('\n'),
)
assert.equal(noisyLabelWithValidAddress.address.sourceValue, '新北市淡水區自强路')
assert.equal(noisyLabelWithValidAddress.address.value, '新北市淡水區自强路')
assert.equal(noisyLabelWithValidAddress.address.addressResolution?.status, 'accepted')
assert.equal(
  noisyLabelWithValidAddress.address.addressResolution?.warnings.includes('address_incomplete'),
  true,
)

const missingLabelWithValidAddress = extractContractFieldCandidates(
  '甲乙雙方協議\n新北市淡水區自强路\n租賃期限為一年',
)
assert.equal(missingLabelWithValidAddress.address.value, '新北市淡水區自强路')

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

const pdfTemplateParties = extractContractFieldCandidates(
  [
    '住宅租賃契約書（測試用範例）',
    '承租人聲明：已充分瞭解本契約全部內容',
    '二、立約雙方',
    '1. 出租人（房東）',
    'o 姓名：王房東',
    'o 身分證字號：A123456789',
    'o 戶籍地址：臺北市中正區康康街 1 號 5 樓',
    '2. 承租人（房客）',
    '三、租賃標的',
    'o 姓名：林小明',
    'o 身分證字號：F987654321',
    'o 戶籍地址：新北市板橋區示範路 99 號 8 樓',
    'o 通訊地址：同戶籍地址',
    'o 聯絡電話：0987-111-222',
    '立約人簽章',
    '出租人：（簽章）',
    '承租人：（簽章）',
  ].join('\n'),
)
assert.equal(pdfTemplateParties.landlord.value, '王房東')
assert.equal(pdfTemplateParties.landlord.sourceValue, '王房東')
assert.equal(pdfTemplateParties.tenant.value, '林小明')
assert.equal(pdfTemplateParties.tenant.sourceValue, '林小明')
assert.equal(pdfTemplateParties.landlord_id.value, 'A123456789')
assert.equal(pdfTemplateParties.landlord_registered_address.value, '臺北市中正區康康街 1 號 5 樓')
assert.equal(pdfTemplateParties.tenant_id.value, 'F987654321')
assert.equal(pdfTemplateParties.tenant_registered_address.value, '新北市板橋區示範路 99 號 8 樓')
assert.equal(pdfTemplateParties.tenant_mailing_address.value, '新北市板橋區示範路 99 號 8 樓')
assert.equal(pdfTemplateParties.tenant_phone.value, '0987-111-222')

assert.equal(isValidRocDate('民國 114 年 7 月 14 日'), true)
assert.equal(isValidRocDate('14天'), false)
assert.equal(isValidPersonOrEntityName('王房東'), true)
assert.equal(isValidPersonOrEntityName('123'), false)
assert.equal(isValidTaiwanNationalId('A123456789'), true)
assert.equal(isValidTaiwanNationalId('A123456788'), false)
assert.equal(isValidTaiwanBusinessNumber('24536806'), true)
assert.equal(isValidLandNumber('中正段一小段 123 地號'), true)
assert.equal(isValidLandNumber('123'), false)
assert.equal(isValidBuildingNumber('00649-000 建號'), true)
assert.equal(isValidPositiveArea('30 平方公尺'), true)
assert.equal(isValidPositiveArea('隨便填'), false)

const statutoryFields = extractContractFieldCandidates(
  [
    '本契約於民國114年1月2日經承租人攜回審閱3日。',
    '出租人簽章：王房東',
    '承租人簽章：林小明',
    '租賃住宅地址：臺北市中正區忠孝東路一段1號',
    '基地坐落中正段一小段123地號',
    '專有部分建號：456建號，面積共計30平方公尺',
    '租賃住宅部分：第2層第3室，租賃範圍面積15平方公尺',
    '租金支付方式：轉帳繳付，金融機構：第一銀行，戶名：王房東，帳號：123-456',
    '每期應繳納1個月租金',
    '押金約定為2個月租金，押金新臺幣36,000元',
    '管理費：由承租人負擔，每月1,000元',
    '水費：由承租人負擔',
    '電費：以用電度數計費，每度電費不得超過當期每度平均電價',
  ].join('\n'),
)
assert.equal(statutoryFields.review_date.value, '民國 114 年 1 月 2 日')
assert.equal(statutoryFields.review_days.value, '3 日')
assert.equal(statutoryFields.landlord_review_signature.value.includes('已載明'), true)
assert.equal(statutoryFields.land_number.value, '中正段一小段123地號')
assert.equal(statutoryFields.building_number.value, '456建號')
assert.equal(statutoryFields.exclusive_area.value, '30 平方公尺')
assert.equal(statutoryFields.rental_scope.value, '部分')
assert.equal(statutoryFields.rental_area.value, '15 平方公尺')
assert.equal(statutoryFields.payment_period.value, '1 個月')
assert.equal(statutoryFields.payment_method.value, '轉帳')
assert.equal(statutoryFields.bank_account.value.includes('帳號：123-456'), true)
assert.equal(statutoryFields.deposit_months.value, '2 個月租金')
assert.equal(statutoryFields.management_fee.value.includes('管理費'), true)
assert.equal(statutoryFields.electricity_billing.value.includes('電費'), true)

const officialScopeFields = extractContractFieldCandidates(
  [
    '附屬建物用途：陽台，面積 5 平方公尺。',
    '車位：☑有（汽車停車位 1 個、機車停車位 1 個）□無。',
    '汽車停車位種類及編號：地下第 B1 層☑平面式停車位□機械式停車位，編號第 20 號。',
    '機車停車位：地下第 B1 層，編號第 M12 號。',
    '使用時間：☑全日□日間□夜間□其他。',
    '租賃附屬設備：☑有□無附屬設備，若有，詳如附件一租賃標的現況確認書。',
    '十九、遺留物之處理：承租人有遺留物，經催告屆期仍不取回時，視為拋棄其所有權。',
    '因本契約涉訟時，以臺灣臺北地方法院為第一審管轄法院。',
  ].join('\n'),
)
assert.equal(officialScopeFields.accessory_purpose.value, '陽台')
assert.equal(officialScopeFields.accessory_available.value, '有')
assert.equal(officialScopeFields.accessory_area.value, '5 平方公尺')
assert.equal(officialScopeFields.parking_available.value, '有')
assert.equal(officialScopeFields.car_parking_count.value, '1 個')
assert.equal(officialScopeFields.car_parking_type.value, '平面式')
assert.equal(officialScopeFields.car_parking_number.value, '第 20 號')
assert.equal(officialScopeFields.motorcycle_parking_count.value, '1 個')
assert.equal(officialScopeFields.motorcycle_parking_number.value, '第 M12 號')
assert.equal(officialScopeFields.parking_usage_time.value, '全日')
assert.equal(officialScopeFields.rental_equipment.value, '有')
assert.equal(officialScopeFields.leftover_handling.value, '已載明遺留物處理條款')
assert.equal(officialScopeFields.jurisdiction_court.value, '臺灣臺北地方法院')

const uncheckedTemplateOptions = extractContractFieldCandidates(
  [
    '租賃住宅□全部□部分：第__層□房間__間□第__室',
    '租金支付方式：□現金繳付□轉帳繳付：金融機構：__，帳號：__',
    '(一)管理費：',
    '□由出租人負擔。',
    '□由承租人負擔。',
    '(二)水費：',
    '□由出租人負擔。',
    '□由承租人負擔。',
  ].join('\n'),
)
assert.equal(uncheckedTemplateOptions.rental_scope.value, '')
assert.equal(uncheckedTemplateOptions.payment_method.value, '')
assert.equal(uncheckedTemplateOptions.management_fee.value, '')
assert.equal(uncheckedTemplateOptions.water_fee.value, '')

assert.deepEqual(detectContractConditions('出租人委託代理人簽約，並檢附授權書'), {
  agent: true,
  sublease: false,
  transfer: false,
  door_number: true,
  no_door_number: false,
  partial_scope: false,
  has_parking: false,
  has_car_parking: false,
  has_motorcycle_parking: false,
  has_accessory: false,
})
assert.equal(detectContractConditions('無門牌，房屋稅籍編號：123').door_number, false)
assert.equal(detectContractConditions('租賃住宅部分：第2層第3室').partial_scope, true)

console.log('Contract field extraction regression checks passed.')
