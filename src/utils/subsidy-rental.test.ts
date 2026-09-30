import { describe, expect, it } from 'vitest'
import {
  buildApplicationFields,
  cityFromAddress,
  leaseCoverage,
  maskNationalId,
  toRocDate,
} from '@/src/utils/subsidy-rental'

describe('cityFromAddress', () => {
  it('取地址開頭的縣市', () => {
    expect(cityFromAddress('臺北市中正區羅斯福路一段 2 號')).toBe('臺北市')
    expect(cityFromAddress('新竹縣竹北市光明六路')).toBe('新竹縣')
  })

  it('「台」與「臺」視為同一個縣市', () => {
    expect(cityFromAddress('台中市西屯區')).toBe('臺中市')
  })

  it('新竹市與新竹縣不會互相誤判', () => {
    expect(cityFromAddress('新竹市東區')).toBe('新竹市')
  })

  it('對不到就回空字串，不猜', () => {
    expect(cityFromAddress('中正區羅斯福路')).toBe('')
    expect(cityFromAddress(null)).toBe('')
  })
})

describe('leaseCoverage', () => {
  const today = new Date(2026, 9, 1) // 115/10/01

  it('租期涵蓋全年', () => {
    expect(leaseCoverage('2025-08-01', '2027-07-31', today)).toMatchObject({
      rocYear: 115,
      monthsInYear: 12,
      activeToday: true,
    })
  })

  it('已到期的租約只算與申請年度重疊的月份', () => {
    // user 7 的測試租約：2025-02-01 ~ 2026-01-31
    expect(leaseCoverage('2025-02-01', '2026-01-31', today)).toMatchObject({
      monthsInYear: 1,
      ended: true,
      activeToday: false,
    })
  })

  it('尚未開始的租約', () => {
    expect(leaseCoverage('2026-11-01', '2027-10-31', today)).toMatchObject({
      monthsInYear: 2,
      notStarted: true,
    })
  })

  it('與申請年度完全沒有重疊', () => {
    expect(leaseCoverage('2024-01-01', '2024-12-31', today)?.monthsInYear).toBe(0)
  })

  it('日期不合理時回 null', () => {
    expect(leaseCoverage('2026-12-01', '2026-01-01', today)).toBeNull()
    expect(leaseCoverage('', '2026-01-01', today)).toBeNull()
  })
})

describe('maskNationalId', () => {
  it('只露出頭三碼與末三碼', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789')
  })
})

describe('toRocDate', () => {
  it('轉成民國日期', () => {
    expect(toRocDate('2026-02-01')).toBe('民國 115 年 2 月 1 日')
  })
})

describe('buildApplicationFields', () => {
  const rental = {
    tenant_name: '王小明',
    tenant_national_id: 'A123456789',
    address: '臺北市中正區羅斯福路一段 2 號 5 樓',
    rent_amount: 18000,
    start_date: '2025-08-01',
    end_date: '2026-07-31',
    landlord_name: '陳大文',
    building_number: '00649-000',
    land_number: null,
  }

  it('依官網填表順序列出租約上已有的欄位', () => {
    const fields = buildApplicationFields(rental)
    expect(fields.map((field) => field.key)).toEqual([
      'tenant_name',
      'tenant_national_id',
      'address',
      'rent_amount',
      'start_date',
      'end_date',
      'landlord_name',
      'building_number',
    ])
    expect(fields.find((field) => field.key === 'start_date')?.value).toBe('民國 114 年 8 月 1 日')
  })

  it('沒有值的欄位不列出', () => {
    expect(buildApplicationFields(rental).some((field) => field.key === 'land_number')).toBe(false)
  })

  it('身分證字號標為敏感欄位，檢查碼正確時沒有警告', () => {
    const id = buildApplicationFields(rental).find((field) => field.key === 'tenant_national_id')
    expect(id?.sensitive).toBe(true)
    expect(id?.warning).toBeUndefined()
  })

  it('OCR 把數字讀錯導致檢查碼不過時，先提醒回去校對', () => {
    const id = buildApplicationFields({ ...rental, tenant_national_id: 'A123456788' }).find(
      (field) => field.key === 'tenant_national_id',
    )
    expect(id?.warning).toContain('檢查碼不正確')
  })

  it('建號、地號去掉重複的後綴（官網欄位本身就叫建號／地號）', () => {
    const fields = buildApplicationFields({
      ...rental,
      building_number: '00649-000建號',
      land_number: '中正段一小段132地號',
    })
    expect(fields.find((field) => field.key === 'building_number')?.value).toBe('00649-000')
    expect(fields.find((field) => field.key === 'land_number')?.value).toBe('中正段一小段132')
  })

  it('沒有租約時回空陣列', () => {
    expect(buildApplicationFields(null)).toEqual([])
  })
})
