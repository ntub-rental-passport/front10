import { describe, expect, it } from 'vitest'

import { resolvePageTitle } from './admin-page-title'

describe('resolvePageTitle', () => {
  it('靜態頁用各頁原本的 h1 文字，不是導覽標籤', () => {
    // 這三頁的 h1 比導覽標籤更具體，頂部列要用具體的那個
    expect(resolvePageTitle('/admin/audit').title).toBe('稽核紀錄查詢')
    expect(resolvePageTitle('/admin/maintenance-tickets').title).toBe('報修工單追蹤')
    expect(resolvePageTitle('/admin/subsidy').title).toBe('租金補貼審核')
  })

  it('靜態頁沒有麵包屑', () => {
    expect(resolvePageTitle('/admin/users').crumbs).toEqual([])
  })

  it('總覽是 /admin', () => {
    expect(resolvePageTitle('/admin')).toEqual({ crumbs: [], title: '後台總覽' })
  })

  it('詳情頁帶父層麵包屑', () => {
    expect(resolvePageTitle('/admin/users/42', '王小明')).toEqual({
      crumbs: ['使用者管理'],
      title: '王小明',
    })
  })

  it('詳情頁資料還沒到時用暫代標題，不是空字串', () => {
    // 空標題會讓人以為頁面壞了
    expect(resolvePageTitle('/admin/users/42').title).toBe('使用者詳情')
    expect(resolvePageTitle('/admin/notifications/nb_1').title).toBe('通知批次')
  })

  it('只有空白的標題也算沒拿到', () => {
    expect(resolvePageTitle('/admin/users/42', '   ').title).toBe('使用者詳情')
  })

  it('通知批次的父層是通知管理，不是通知中心', () => {
    expect(resolvePageTitle('/admin/notifications/nb_1').crumbs).toEqual(['通知管理'])
  })

  it('結尾多一個斜線不影響', () => {
    expect(resolvePageTitle('/admin/users/').title).toBe('使用者管理')
  })

  it('認不得的路由不顯示路徑本身', () => {
    // 把 /admin/whatever 原樣印出來對使用者沒有意義，也洩漏內部結構
    const r = resolvePageTitle('/admin/does-not-exist')
    expect(r.title).toBe('管理後台')
    expect(r.title).not.toContain('/')
  })

  it('靜態頁不會被 overrideTitle 覆蓋', () => {
    // 只有詳情頁的標題是資料驅動的；靜態頁被蓋掉代表有人用錯了
    expect(resolvePageTitle('/admin/users', '亂寫').title).toBe('使用者管理')
  })
})
