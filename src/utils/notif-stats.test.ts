import { describe, expect, it } from 'vitest'

import type { NotifBatch } from './notif-batch'
import type { UserNotification } from '@/src/mocks/admin/notifications'
import {
  batchChannelStats,
  batchReadStat,
  channelBadgeClass,
  channelBadgeText,
  sampleValueFor,
  sampleValuesFor,
  templateUsage,
  type ChannelStat,
} from './notif-stats'

function recipient(over: Partial<UserNotification> = {}): UserNotification {
  return {
    id: 'un-1',
    userEmail: 'a@example.com',
    title: 't',
    body: 'b',
    category: '系統',
    channels: ['inapp'],
    deliveryStatus: { inapp: 'sent' },
    batchId: 'nb-1',
    recipientLabel: '全部使用者',
    sourceLabel: '租約到期提醒',
    createdAt: '2026-09-15T10:00:00.000Z',
    read: false,
    ...over,
  } as UserNotification
}

function batch(over: Partial<NotifBatch> = {}): NotifBatch {
  return {
    batchId: 'nb-1',
    title: 't',
    category: '系統',
    channels: ['inapp'],
    recipientLabel: '全部使用者',
    createdAt: '2026-09-15T10:00:00.000Z',
    recipients: [recipient()],
    ...over,
  }
}

describe('batchChannelStats', () => {
  it('分別數出每個管道的已送／待送／失敗', () => {
    const stats = batchChannelStats(
      batch({
        channels: ['inapp', 'email'],
        recipients: [
          recipient({ deliveryStatus: { inapp: 'sent', email: 'pending' } }),
          recipient({ deliveryStatus: { inapp: 'sent', email: 'failed' } }),
          recipient({ deliveryStatus: { inapp: 'sent', email: 'pending' } }),
        ],
      }),
    )
    expect(stats.find((s) => s.channel === 'inapp')).toMatchObject({ sent: 3, pending: 0, failed: 0 })
    expect(stats.find((s) => s.channel === 'email')).toMatchObject({ sent: 0, pending: 2, failed: 1 })
  })

  it('部分失敗看得出來 —— 這是取代 recipients[0] 的整個理由', () => {
    // 原本拿第一個人的狀態代表整批：第一個人成功，後面兩個失敗也會顯示「已送」
    const stats = batchChannelStats(
      batch({
        channels: ['email'],
        recipients: [
          recipient({ deliveryStatus: { email: 'sent' } }),
          recipient({ deliveryStatus: { email: 'failed' } }),
          recipient({ deliveryStatus: { email: 'failed' } }),
        ],
      }),
    )
    expect(stats[0]!.failed).toBe(2)
  })

  it('只統計該批次實際啟用的管道', () => {
    const stats = batchChannelStats(batch({ channels: ['inapp'] }))
    expect(stats.map((s) => s.channel)).toEqual(['inapp'])
  })

  it('收件者缺這個管道的狀態時不計入總數，不要當成 0 筆已送', () => {
    const stats = batchChannelStats(
      batch({
        channels: ['email'],
        recipients: [recipient({ deliveryStatus: {} }), recipient({ deliveryStatus: { email: 'sent' } })],
      }),
    )
    expect(stats[0]).toMatchObject({ sent: 1, total: 1 })
  })
})

describe('batchReadStat', () => {
  it('數出讀過的人數', () => {
    const stat = batchReadStat(
      batch({ recipients: [recipient({ read: true }), recipient({ read: false }), recipient({ read: true })] }),
    )
    expect(stat).toEqual({ read: 2, total: 3 })
  })

  it('沒人讀過就是 0，不是隱藏', () => {
    expect(batchReadStat(batch({ recipients: [recipient({ read: false })] }))).toEqual({
      read: 0,
      total: 1,
    })
  })
})

describe('templateUsage', () => {
  const batches: NotifBatch[] = [
    batch({
      batchId: 'nb-1',
      createdAt: '2026-09-10T10:00:00.000Z',
      recipients: [recipient({ sourceLabel: '租約到期提醒', read: true }), recipient({ sourceLabel: '租約到期提醒' })],
    }),
    batch({
      batchId: 'nb-2',
      createdAt: '2026-09-20T10:00:00.000Z',
      recipients: [recipient({ sourceLabel: '租約到期提醒', read: true })],
    }),
    batch({
      batchId: 'nb-3',
      createdAt: '2026-09-25T10:00:00.000Z',
      recipients: [recipient({ sourceLabel: '帳單待繳提醒' })],
    }),
  ]

  it('只算用這個模板送的批次', () => {
    expect(templateUsage('租約到期提醒', batches).batchCount).toBe(2)
  })

  it('最近一次取最新的，不是陣列順序的最後一筆', () => {
    expect(templateUsage('租約到期提醒', batches).lastSentAt).toBe('2026-09-20T10:00:00.000Z')
  })

  it('累計人次與已讀都跨批次加總', () => {
    const usage = templateUsage('租約到期提醒', batches)
    expect(usage.totalRecipients).toBe(3)
    expect(usage.read).toBe(2)
  })

  it('沒用過的模板回 0 與 null，不是丟錯', () => {
    expect(templateUsage('沒人用過的模板', batches)).toEqual({
      batchCount: 0,
      lastSentAt: null,
      totalRecipients: 0,
      read: 0,
    })
  })

  it('自由撰寫的批次不會被算進任何模板', () => {
    const free = [batch({ recipients: [recipient({ sourceLabel: '一次性撰寫' })] })]
    expect(templateUsage('租約到期提醒', free).batchCount).toBe(0)
  })
})

describe('sampleValueFor', () => {
  it('認得的變數給像樣的範例值', () => {
    expect(sampleValueFor('姓名')).toBe('王小明')
    expect(sampleValueFor('金額')).toContain('NT$')
  })

  it('認不得的變數用括號包起來，不留空也不亂編', () => {
    // 留空會讓句子讀起來像通順的，反而看不出那裡本來該有東西
    expect(sampleValueFor('沒看過的變數')).toBe('〔沒看過的變數〕')
  })

  it('sampleValuesFor 把整串變數一次轉成對照表', () => {
    expect(sampleValuesFor(['姓名', '未知'])).toEqual({
      姓名: '王小明',
      未知: '〔未知〕',
    })
  })
})

describe('channelBadgeText / channelBadgeClass', () => {
  const stat = (over: Partial<ChannelStat> = {}): ChannelStat => ({
    channel: 'email',
    sent: 0,
    pending: 0,
    failed: 0,
    total: 0,
    ...over,
  })

  it('全部送達時寫出人數', () => {
    expect(channelBadgeText(stat({ sent: 30, total: 30 }))).toBe('Email · 30 已送')
  })

  it('全部待送時寫「待接通」而不是假裝送出去了', () => {
    expect(channelBadgeText(stat({ pending: 30, total: 30 }))).toBe('Email · 待接通')
  })

  it('部分失敗時以失敗數為主，不會顯示成全部已送', () => {
    const s = stat({ sent: 27, failed: 3, total: 30 })
    expect(channelBadgeText(s)).toBe('Email · 3 失敗')
    expect(channelBadgeClass(s)).toContain('destructive')
  })

  it('混合已送與待送時兩個數字都講出來', () => {
    expect(channelBadgeText(stat({ sent: 10, pending: 20, total: 30 }))).toBe(
      'Email · 已送 10／待送 20',
    )
  })

  it('沒有任何收件者時不會被當成「全部已送」', () => {
    const s = stat()
    expect(channelBadgeText(s)).toBe('Email · 已送 0／待送 0')
    expect(channelBadgeClass(s)).toContain('border-dashed')
  })

  it('待送的樣式跟已送明顯不同，否則等於謊報送達', () => {
    expect(channelBadgeClass(stat({ pending: 1, total: 1 }))).toContain('border-dashed')
    expect(channelBadgeClass(stat({ sent: 1, total: 1 }))).not.toContain('border-dashed')
  })
})
