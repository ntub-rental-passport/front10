import assert from 'node:assert/strict'
import {
  getAdministrativeDatasetSummary,
  resolveTaiwanAddress,
  validateTaiwanAddressInput,
} from '../shared/taiwan-address-resolver.js'

const summary = getAdministrativeDatasetSummary()
assert.equal(summary.countyCount, 22)
assert.equal(summary.divisionCount, 368)

const historicalTaoyuan = resolveTaiwanAddress('大園鄉北港村', {
  contractText: '租期自民國102年10月1日起',
})
assert.equal(historicalTaoyuan.normalizedAddress, '桃園縣大園鄉北港村')
assert.equal(historicalTaoyuan.county?.source, 'administrative_inference')
assert.equal(historicalTaoyuan.status, 'inferred')
assert.equal(historicalTaoyuan.referenceDate, '2013-10-01')

const explicitHistoricalTaoyuan = resolveTaiwanAddress('桃園縣大園鄉北港村')
assert.equal(explicitHistoricalTaoyuan.normalizedAddress, '桃園縣大園鄉北港村')
assert.equal(explicitHistoricalTaoyuan.county?.source, 'google_ocr')

const uniqueTamsui = resolveTaiwanAddress('淡水區自強路')
assert.equal(uniqueTamsui.normalizedAddress, '新北市淡水區自強路')
assert.equal(uniqueTamsui.county?.source, 'administrative_inference')
assert.equal(uniqueTamsui.confidence, 'high')

const explicitTamsui = resolveTaiwanAddress('新北市淡水區自強路')
assert.equal(explicitTamsui.normalizedAddress, '新北市淡水區自強路')
assert.equal(explicitTamsui.status, 'accepted')

const roadResolvedZhongzheng = resolveTaiwanAddress('中正區林森南路10號3樓')
assert.equal(roadResolvedZhongzheng.normalizedAddress, '臺北市中正區林森南路10號3樓')
assert.equal(roadResolvedZhongzheng.evidenceType, 'road_inference')
assert.equal(roadResolvedZhongzheng.confidence, 'medium')

const ambiguousZhongzheng = resolveTaiwanAddress('中正區忠孝路')
assert.equal(ambiguousZhongzheng.status, 'ambiguous')
assert.equal(ambiguousZhongzheng.county, null)
assert.equal(ambiguousZhongzheng.warnings.includes('ambiguous_district'), true)

const conflict = resolveTaiwanAddress('桃園市淡水區自強路')
assert.equal(conflict.status, 'conflict')
assert.equal(conflict.warnings.includes('county_district_conflict'), true)

const invalidManualAddress = validateTaiwanAddressInput('新北市大園區北港村')
assert.equal(invalidManualAddress.valid, false)
assert.equal(invalidManualAddress.code, 'county_district_conflict')
assert.equal(invalidManualAddress.message.includes('新北市'), true)
assert.equal(invalidManualAddress.message.includes('大園區'), true)

const unknownManualAddress = validateTaiwanAddressInput('火星市宇宙區銀河路1號')
assert.equal(unknownManualAddress.valid, false)
assert.equal(unknownManualAddress.code, 'administrative_division_not_found')

const validManualAddress = validateTaiwanAddressInput('桃園市大園區北港里')
assert.equal(validManualAddress.valid, true)

const validContractFiveAddress = validateTaiwanAddressInput('台北市中正區林森南路10號3樓')
assert.equal(validContractFiveAddress.valid, true)
assert.equal(validContractFiveAddress.resolution.county?.value, '臺北市')
assert.equal(validContractFiveAddress.resolution.district?.value, '中正區')

console.log('Taiwan address resolver checks passed.')
