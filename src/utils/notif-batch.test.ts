import { describe, expect, it } from 'vitest'
import { groupIntoBatches, inferBatchId, migrateNotifBatches, singleRecipientOf } from './notif-batch'
import type { UserNotification } from '@/src/mocks/admin/notifications'

function make(overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    id: 'nm-x',
    batchId: 'nb-x',
    recipientLabel: '指定使用者',
    sourceLabel: '',
    userEmail: 'a@example.com',
    title: '標題',
    body: '內文',
    category: '系統',
    channels: ['inapp'],
    deliveryStatus: { inapp: 'sent' },
    createdAt: '2026-08-01T00:00:00.000Z',
    read: false,
    ...overrides,
  }
}

describe('inferBatchId', () => {
  it('同標題同時間推出同一個批次 id', () => {
    const a = make({ title: '維護預告', createdAt: '2026-08-01T10:00:00.000Z' })
    const b = make({ title: '維護預告', createdAt: '2026-08-01T10:00:00.000Z' })
    expect(inferBatchId(a)).toBe(inferBatchId(b))
  })

  it('標題不同就是不同批次', () => {
    const a = make({ title: '維護預告' })
    const b = make({ title: '帳單提醒' })
    expect(inferBatchId(a)).not.toBe(inferBatchId(b))
  })

  it('時間不同就是不同批次', () => {
    const a = make({ createdAt: '2026-08-01T10:00:00.000Z' })
    const b = make({ createdAt: '2026-08-01T10:00:01.000Z' })
    expect(inferBatchId(a)).not.toBe(inferBatchId(b))
  })
})

describe('migrateNotifBatches', () => {
  it('沒有 batchId 的舊資料會依標題與時間補上，同一次發送歸成一批', () => {
    const list = [
      make({ id: 'nm-1', userEmail: 'a@example.com', batchId: undefined as unknown as string }),
      make({ id: 'nm-2', userEmail: 'b@example.com', batchId: undefined as unknown as string }),
    ]
    const migrated = migrateNotifBatches(list)
    expect(migrated[0].batchId).toBeTruthy()
    expect(migrated[0].batchId).toBe(migrated[1].batchId)
  })

  it('已經有 batchId 就不覆蓋', () => {
    const migrated = migrateNotifBatches([make({ batchId: 'nb-keep' })])
    expect(migrated[0].batchId).toBe('nb-keep')
  })

  it('不動其他欄位', () => {
    const original = make({ read: true, userEmail: 'keep@example.com' })
    const migrated = migrateNotifBatches([original])
    expect(migrated[0].read).toBe(true)
    expect(migrated[0].userEmail).toBe('keep@example.com')
  })
})

describe('groupIntoBatches', () => {
  it('一次群發只產生一列，收件人收在批次裡', () => {
    const list = [
      make({ id: 'nm-1', batchId: 'nb-1', userEmail: 'a@example.com' }),
      make({ id: 'nm-2', batchId: 'nb-1', userEmail: 'b@example.com' }),
      make({ id: 'nm-3', batchId: 'nb-1', userEmail: 'c@example.com' }),
    ]
    const batches = groupIntoBatches(list)
    expect(batches).toHaveLength(1)
    expect(batches[0].recipients).toHaveLength(3)
  })

  it('批次由新到舊排序', () => {
    const batches = groupIntoBatches([
      make({ batchId: 'nb-old', createdAt: '2026-08-01T00:00:00.000Z' }),
      make({ batchId: 'nb-new', createdAt: '2026-08-09T00:00:00.000Z' }),
    ])
    expect(batches.map((b) => b.batchId)).toEqual(['nb-new', 'nb-old'])
  })

  it('保留收件人條件標籤', () => {
    const batches = groupIntoBatches([make({ recipientLabel: '全部租客' })])
    expect(batches[0].recipientLabel).toBe('全部租客')
  })

  it('舊資料沒有標籤時，依批次大小回推', () => {
    const single = groupIntoBatches([make({ batchId: 'nb-1', recipientLabel: '' })])
    expect(single[0].recipientLabel).toBe('指定使用者')

    const many = groupIntoBatches([
      make({ id: 'nm-1', batchId: 'nb-2', recipientLabel: '' }),
      make({ id: 'nm-2', batchId: 'nb-2', recipientLabel: '' }),
    ])
    expect(many[0].recipientLabel).toBe('角色群發')
  })

  it('空清單得到空結果', () => {
    expect(groupIntoBatches([])).toEqual([])
  })
})

describe('singleRecipientOf', () => {
  it('只有一位收件人時回傳該筆紀錄', () => {
    const batches = groupIntoBatches([make({ id: 'nm-1', batchId: 'nb-1', userEmail: 'a@example.com' })])
    expect(singleRecipientOf(batches[0])?.userEmail).toBe('a@example.com')
  })

  it('多位收件人時回傳 null', () => {
    const batches = groupIntoBatches([
      make({ id: 'nm-1', batchId: 'nb-1', userEmail: 'a@example.com' }),
      make({ id: 'nm-2', batchId: 'nb-1', userEmail: 'b@example.com' }),
    ])
    expect(singleRecipientOf(batches[0])).toBeNull()
  })
})
