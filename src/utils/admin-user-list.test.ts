import { describe, expect, it } from 'vitest'

import {
  USER_PAGE_SIZE,
  dropDemoDuplicates,
  isBulkSelectable,
  lastLoginText,
  paginate,
  planBulkStatus,
  runBulkStatus,
  sortUserRows,
  summarizeBulk,
} from './admin-user-list'
import type { UserDirectoryRow } from './admin-user-directory'
import type { AdminUser } from '@/src/mocks/admin/users'

function row(id: string, over: Partial<AdminUser> = {}, realAccountId?: number): UserDirectoryRow {
  return {
    realAccountId,
    user: {
      id,
      email: `${id}@example.com`,
      nickname: null,
      role: 'user',
      status: 'active',
      emailVerified: true,
      registeredAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
      ...over,
    },
    subscription: null,
    deposits: [],
    tickets: [],
    openTicketCount: 0,
    overdueTicketCount: 0,
    mismatchedDepositCount: 0,
    subscriptionExpiring: false,
    quotaExhausted: false,
  } as UserDirectoryRow
}

const real = (id: string, over: Partial<AdminUser> = {}, dbId = 1) => row(id, over, dbId)
const ids = (rows: UserDirectoryRow[]) => rows.map((r) => r.user.id)

describe('dropDemoDuplicates', () => {
  it('同 email 的展示資料被拿掉，真實帳號留下', () => {
    const realRows = [real('real-1', { email: 'admin@rentmate.tw' })]
    const demo = [row('u-admin', { email: 'admin@rentmate.tw' }), row('u-2')]
    expect(ids(dropDemoDuplicates(realRows, demo))).toEqual(['u-2'])
  })

  it('比對不分大小寫 —— Email 本來就不分', () => {
    const realRows = [real('real-1', { email: 'Admin@RentMate.tw' })]
    const demo = [row('u-admin', { email: 'admin@rentmate.tw' })]
    expect(dropDemoDuplicates(realRows, demo)).toEqual([])
  })

  it('沒有重複時原樣保留', () => {
    const demo = [row('u-1'), row('u-2')]
    expect(ids(dropDemoDuplicates([], demo))).toEqual(['u-1', 'u-2'])
  })
})

describe('sortUserRows', () => {
  it('依 email 排序，大小寫不影響', () => {
    const rows = [row('c', { email: 'Carol@x.com' }), row('a', { email: 'alice@x.com' }), row('b', { email: 'bob@x.com' })]
    expect(ids(sortUserRows(rows, 'user', 'asc'))).toEqual(['a', 'b', 'c'])
    expect(ids(sortUserRows(rows, 'user', 'desc'))).toEqual(['c', 'b', 'a'])
  })

  it('身分依權限大小：租客 < 房東 < 管理員', () => {
    const rows = [
      row('tenant', { role: 'user' }),
      row('admin', { role: 'admin' }),
      row('landlord', { role: 'landlord' }),
    ]
    expect(ids(sortUserRows(rows, 'role', 'asc'))).toEqual(['tenant', 'landlord', 'admin'])
    expect(ids(sortUserRows(rows, 'role', 'desc'))).toEqual(['admin', 'landlord', 'tenant'])
  })

  it('最後登入：沒有紀錄的不管升冪降冪都排最後，不會被當成「最久以前」', () => {
    const rows = [
      row('never'),
      row('old', { lastLoginAt: '2026-01-01T00:00:00.000Z' }),
      row('new', { lastLoginAt: '2026-09-01T00:00:00.000Z' }),
    ]
    expect(ids(sortUserRows(rows, 'lastLogin', 'desc'))).toEqual(['new', 'old', 'never'])
    expect(ids(sortUserRows(rows, 'lastLogin', 'asc'))).toEqual(['old', 'new', 'never'])
  })

  it('壞掉的時間字串當成沒有紀錄，不會變成 NaN 讓排序亂掉', () => {
    const rows = [row('bad', { lastLoginAt: 'not-a-date' }), row('ok', { lastLoginAt: '2026-09-01T00:00:00.000Z' })]
    expect(ids(sortUserRows(rows, 'lastLogin', 'desc'))).toEqual(['ok', 'bad'])
  })

  it('狀態：升冪時正常在前，降冪時停用在前', () => {
    const rows = [row('s', { status: 'suspended' }), row('a', { status: 'active' })]
    expect(ids(sortUserRows(rows, 'status', 'asc'))).toEqual(['a', 's'])
    expect(ids(sortUserRows(rows, 'status', 'desc'))).toEqual(['s', 'a'])
  })

  it('平手時維持原本順序 —— 真實帳號仍在展示資料前面', () => {
    const rows = [real('real-1'), row('demo-1'), real('real-2', {}, 2)]
    expect(ids(sortUserRows(rows, 'status', 'asc'))).toEqual(['real-1', 'demo-1', 'real-2'])
  })

  it('不改動原本的陣列', () => {
    const rows = [row('b', { email: 'b@x.com' }), row('a', { email: 'a@x.com' })]
    sortUserRows(rows, 'user', 'asc')
    expect(ids(rows)).toEqual(['b', 'a'])
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 67 }, (_, i) => i + 1)

  it('每頁 25 筆', () => {
    const p = paginate(items, 1)
    expect(USER_PAGE_SIZE).toBe(25)
    expect(p.items).toHaveLength(25)
    expect(p.pageCount).toBe(3)
    expect([p.from, p.to]).toEqual([1, 25])
  })

  it('最後一頁只有剩下的', () => {
    const p = paginate(items, 3)
    expect(p.items).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67])
    expect([p.from, p.to]).toEqual([51, 67])
  })

  it('頁碼超出範圍時夾回最後一頁，而不是回傳空頁假裝沒有資料', () => {
    // 在第 3 頁套了篩選，結果只剩 10 筆
    const p = paginate(items.slice(0, 10), 3)
    expect(p.page).toBe(1)
    expect(p.items).toHaveLength(10)
  })

  it('頁碼小於 1 或不是數字時回到第 1 頁', () => {
    expect(paginate(items, 0).page).toBe(1)
    expect(paginate(items, Number.NaN).page).toBe(1)
  })

  it('沒有資料時仍然是 1 頁，from/to 都是 0', () => {
    const p = paginate([], 1)
    expect(p.pageCount).toBe(1)
    expect([p.from, p.to]).toEqual([0, 0])
  })
})

describe('lastLoginText', () => {
  const now = new Date('2026-09-24T12:00:00+08:00')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('沒有資料寫「沒有登入紀錄」而不是「從未登入」—— 欄位是後來才加的', () => {
    expect(lastLoginText(null, now)).toBe('沒有登入紀錄')
    expect(lastLoginText(undefined, now)).toBe('沒有登入紀錄')
    expect(lastLoginText('壞掉的', now)).toBe('沒有登入紀錄')
  })

  it('帶時區的 UTC 字串換算正確（後端修正後的格式）', () => {
    // 台灣 12:48 登入 = UTC 04:48；兩分鐘後看，應該是「2 分鐘前」而不是「8 小時前」
    const at = new Date('2026-09-24T12:50:00+08:00')
    expect(lastLoginText('2026-09-24T04:48:00+00:00', at)).toBe('2 分鐘前')
  })

  it('依距離挑單位', () => {
    expect(lastLoginText(ago(30 * 1000), now)).toBe('剛剛')
    expect(lastLoginText(ago(5 * MIN), now)).toBe('5 分鐘前')
    expect(lastLoginText(ago(3 * HOUR), now)).toBe('3 小時前')
    expect(lastLoginText(ago(3 * DAY), now)).toBe('3 天前')
    expect(lastLoginText(ago(65 * DAY), now)).toBe('2 個月前')
    expect(lastLoginText(ago(800 * DAY), now)).toBe('2 年前')
  })

  it('時鐘不同步造成的未來時間當成剛剛，不顯示負數', () => {
    expect(lastLoginText(new Date(now.getTime() + 2 * MIN).toISOString(), now)).toBe('剛剛')
  })
})

describe('批次操作', () => {
  it('只有真實、非管理員的帳號可以勾選', () => {
    expect(isBulkSelectable(real('r'))).toBe(true)
    expect(isBulkSelectable(row('demo'))).toBe(false)
    expect(isBulkSelectable(real('admin', { role: 'admin' }))).toBe(false)
  })

  it('停用只算正常的人、啟用只算停用的人，按鈕上的數字才對得上實際動到幾位', () => {
    const plan = planBulkStatus([
      real('a', { status: 'active' }),
      real('b', { status: 'active' }, 2),
      real('c', { status: 'suspended' }, 3),
      row('demo', { status: 'active' }),
      real('adm', { role: 'admin', status: 'active' }, 4),
    ])
    expect(ids(plan.suspend)).toEqual(['a', 'b'])
    expect(ids(plan.activate)).toEqual(['c'])
  })

  it('一筆失敗不會讓其他筆被當成沒做', async () => {
    const rows = [real('a'), real('b', {}, 2), real('c', {}, 3)]
    const outcomes = await runBulkStatus(rows, async (r) => {
      if (r.user.id === 'b') throw new Error('不能停用自己')
    })
    expect(outcomes.map((o) => o.ok)).toEqual([true, false, true])
    expect(outcomes[1].reason).toBe('不能停用自己')
  })

  it('逐筆套用，不會並行（後端「最後一位管理員」的檢查才看得到前一筆的結果）', async () => {
    const order: string[] = []
    await runBulkStatus([real('a'), real('b', {}, 2)], async (r) => {
      order.push(`start ${r.user.id}`)
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(`end ${r.user.id}`)
    })
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('摘要列出失敗的是誰、為什麼；沒有暱稱就用 email', () => {
    const summary = summarizeBulk([
      { row: real('a', { nickname: '王小明' }), ok: true },
      { row: real('b', { nickname: null, email: 'b@x.com' }, 2), ok: false, reason: '不能停用自己' },
    ])
    expect(summary.succeeded).toBe(1)
    expect(summary.failed).toEqual([{ name: 'b@x.com', reason: '不能停用自己' }])
  })
})
