import { describe, expect, it } from 'vitest'

import {
  TENANT_ROUTE_GROUPS,
  TENANT_ROUTE_OPTIONS,
  actionLinkError,
  actionLinkLabel,
  isDeadRoute,
} from './tenant-route-link'

/** router.resolve() 對真實頁面會回傳該頁的 path */
const alive = (path: string) => ['/app', path]
/** 落到 catch-all —— 沒有任何真正的頁面認領這個路徑 */
const catchAll = ['/:pathMatch(.*)*']

describe('isDeadRoute', () => {
  it('匹配到真實頁面就不是死的', () => {
    expect(isDeadRoute(alive('/app/repairs'))).toBe(false)
  })

  it('落到 catch-all 就是死的 —— 那會無聲無息把使用者丟回首頁', () => {
    expect(isDeadRoute(catchAll)).toBe(true)
  })

  it('完全沒匹配也算死的，不要假設 catch-all 永遠都在', () => {
    expect(isDeadRoute([])).toBe(true)
  })
})

describe('actionLinkError', () => {
  it('兩個都沒填是合法的 —— 通知可以沒有操作按鈕', () => {
    expect(actionLinkError('', '', [])).toBeNull()
  })

  it('只填文字沒填連結要擋下來，否則那顆按鈕根本不會出現', () => {
    // 租客端是 v-if="item.actionUrl"，沒有連結就不會 render 任何東西
    expect(actionLinkError('', '查看帳單', [])).toContain('按鈕不會出現')
  })

  it('指向後台或房東端要擋下來 —— 租客沒有權限進去', () => {
    expect(actionLinkError('/admin/users', '查看', alive('/admin/users'))).toContain('/app')
    expect(actionLinkError('/landlord/maintenance', '查看', alive('/landlord/maintenance'))).toContain('/app')
  })

  it('路徑不存在時要講出是哪一條，不是只說「連結無效」', () => {
    const message = actionLinkError('/app/billing', '查看帳單', catchAll)
    expect(message).toContain('/app/billing')
    expect(message).toContain('丟回首頁')
  })

  it('正常的連結沒有錯誤', () => {
    expect(actionLinkError('/app/repairs', '查看工單', alive('/app/repairs'))).toBeNull()
  })

  it('前後空白不算填了東西', () => {
    expect(actionLinkError('   ', '   ', [])).toBeNull()
  })
})

describe('TENANT_ROUTE_OPTIONS', () => {
  it('全部都在 /app 底下 —— 通知與輪播都是給租客看的', () => {
    for (const option of TENANT_ROUTE_OPTIONS) {
      expect(option.url.startsWith('/app')).toBe(true)
    }
  })

  it('沒有重複的路徑', () => {
    const urls = TENANT_ROUTE_OPTIONS.map((item) => item.url)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('每一個都有中文說明，下拉選單不會印出原始路徑', () => {
    for (const option of TENANT_ROUTE_OPTIONS) {
      expect(option.label.trim()).not.toBe('')
      expect(option.group.trim()).not.toBe('')
    }
  })

  it('分組維持出現順序，不要每次重整就換位置', () => {
    expect(TENANT_ROUTE_GROUPS[0]).toBe('總覽')
    expect(TENANT_ROUTE_GROUPS).toContain('補貼')
  })

  it('不收那三條已知壞掉的路徑', () => {
    // /app/maintenance 與 /app/contracts 其實是房東端的路由，
    // /app/billing 整個 router 裡不存在
    const urls = TENANT_ROUTE_OPTIONS.map((item) => item.url)
    expect(urls).not.toContain('/app/billing')
    expect(urls).not.toContain('/app/maintenance')
    expect(urls).not.toContain('/app/contracts')
  })

  it('查得到路徑對應的中文名稱', () => {
    expect(actionLinkLabel('/app/repairs')).toBe('報修工單')
    expect(actionLinkLabel('/app/billing')).toBeNull()
  })
})
