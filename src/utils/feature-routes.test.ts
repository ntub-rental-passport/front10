import { describe, expect, it } from 'vitest'

import { featureKeyForPath } from './feature-routes'

describe('契約分析（合約 OCR）', () => {
  it('主路徑 /app/contract 對應 contract-analysis', () => {
    expect(featureKeyForPath('/app/contract')).toBe('contract-analysis')
  })

  it('子路徑 /app/contract/editor 也對應 contract-analysis', () => {
    expect(featureKeyForPath('/app/contract/editor')).toBe('contract-analysis')
  })

  it('子路徑 /app/contract/combined 也對應 contract-analysis', () => {
    expect(featureKeyForPath('/app/contract/combined')).toBe('contract-analysis')
  })

  it('兄弟路由 /app/contract-analysis 同樣對應 contract-analysis', () => {
    expect(featureKeyForPath('/app/contract-analysis')).toBe('contract-analysis')
  })
})

describe('租金補貼', () => {
  it('主路徑 /app/subsidy 對應 subsidy', () => {
    expect(featureKeyForPath('/app/subsidy')).toBe('subsidy')
  })

  it('子路徑 /app/subsidy/apply 也對應 subsidy', () => {
    expect(featureKeyForPath('/app/subsidy/apply')).toBe('subsidy')
  })
})

describe('垃圾清運', () => {
  it('主路徑 /app/garbage 對應 garbage', () => {
    expect(featureKeyForPath('/app/garbage')).toBe('garbage')
  })

  it('子路徑 /app/garbage/schedule 也對應 garbage', () => {
    expect(featureKeyForPath('/app/garbage/schedule')).toBe('garbage')
  })
})

describe('點交存證', () => {
  it('主路徑 /app/handover 對應 handover', () => {
    expect(featureKeyForPath('/app/handover')).toBe('handover')
  })

  it('子路徑 /app/handover/checkout 也對應 handover', () => {
    expect(featureKeyForPath('/app/handover/checkout')).toBe('handover')
  })
})

describe('停水停電通報', () => {
  it('主路徑 /app/outage 對應 outage', () => {
    expect(featureKeyForPath('/app/outage')).toBe('outage')
  })

  it('子路徑 /app/outage/notifications 也對應 outage', () => {
    expect(featureKeyForPath('/app/outage/notifications')).toBe('outage')
  })
})

describe('備忘錄', () => {
  it('主路徑 /app/notes 對應 notes', () => {
    expect(featureKeyForPath('/app/notes')).toBe('notes')
  })

  it('子路徑 /app/notes/roommates 也對應 notes', () => {
    expect(featureKeyForPath('/app/notes/roommates')).toBe('notes')
  })
})

describe('不可關閉的路徑一律回 null', () => {
  it('首頁 /app', () => {
    expect(featureKeyForPath('/app')).toBeNull()
  })

  it('通知中心 /app/notifications（維護公告登在這裡，不能被關掉）', () => {
    expect(featureKeyForPath('/app/notifications')).toBeNull()
  })

  it('我的帳戶 /app/account', () => {
    expect(featureKeyForPath('/app/account')).toBeNull()
  })
})

describe('相似但不同的路徑不該被誤匹配', () => {
  it('/app/contracts-archive 不會被誤判成 contract-analysis 的子路徑', () => {
    expect(featureKeyForPath('/app/contracts-archive')).toBeNull()
  })

  it('/app/notes-export 不會被誤判成 notes 的子路徑', () => {
    expect(featureKeyForPath('/app/notes-export')).toBeNull()
  })

  it('/app/outage-history 不會被誤判成 outage 的子路徑', () => {
    expect(featureKeyForPath('/app/outage-history')).toBeNull()
  })

  it('/app/subsidy-faq 不會被誤判成 subsidy 的子路徑', () => {
    expect(featureKeyForPath('/app/subsidy-faq')).toBeNull()
  })

  it('/app/handover-guide 不會被誤判成 handover 的子路徑', () => {
    expect(featureKeyForPath('/app/handover-guide')).toBeNull()
  })

  it('/app/garbage-map 不會被誤判成 garbage 的子路徑', () => {
    expect(featureKeyForPath('/app/garbage-map')).toBeNull()
  })
})
