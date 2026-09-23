import { describe, expect, it } from 'vitest'

import {
  SCHEDULE_STATUS_HINT,
  SCHEDULE_STATUS_LABEL,
  SCHEDULE_STATUS_TONE,
  canCancel,
  fromDateTimeLocal,
  maxScheduleValue,
  minScheduleValue,
  scheduleLeadText,
  scheduleResultText,
  toDateTimeLocal,
  type ScheduleStatus,
  type ScheduledNotif,
} from './notif-schedule'

const NOW = new Date('2026-09-23T12:00:00+08:00')

function item(over: Partial<ScheduledNotif> = {}): ScheduledNotif {
  return {
    id: 'sn-1',
    createdBy: 'admin@example.com',
    title: '系統維護預告',
    body: '今晚維護',
    category: '系統',
    channels: ['email'],
    recipient: { kind: 'role', role: 'user' },
    recipientLabel: '全部租客',
    sourceLabel: '系統維護預告',
    scheduledAt: '2026-09-24T09:00:00+08:00',
    createdAt: '2026-09-23T10:00:00+08:00',
    status: 'pending',
    sentAt: null,
    result: null,
    ...over,
  }
}

describe('scheduleLeadText', () => {
  const at = (iso: string) => scheduleLeadText(iso, NOW)

  it('未來用「後」，過去用「前」', () => {
    expect(at('2026-09-23T15:00:00+08:00')).toBe('3 小時後')
    expect(at('2026-09-23T09:00:00+08:00')).toBe('3 小時前')
  })

  it('一小時內用分鐘，一天以上用天', () => {
    expect(at('2026-09-23T12:30:00+08:00')).toBe('30 分鐘後')
    expect(at('2026-09-26T12:00:00+08:00')).toBe('3 天後')
  })

  it('不到一分鐘不寫「0 分鐘後」', () => {
    expect(at('2026-09-23T12:00:30+08:00')).toBe('即將送出')
    expect(at('2026-09-23T11:59:30+08:00')).toBe('剛過時間')
  })
})

describe('canCancel', () => {
  it('只有還沒開始送的能取消', () => {
    expect(canCancel('pending')).toBe(true)
  })

  it('已經在送或已結束的都不能取消，否則畫面會說已取消但信照樣寄出去', () => {
    const closed: ScheduleStatus[] = ['sending', 'sent', 'failed', 'missed', 'cancelled']
    for (const status of closed) expect(canCancel(status)).toBe(false)
  })
})

describe('scheduleResultText', () => {
  it('還沒有結果時回空字串，不編「0 人」', () => {
    expect(scheduleResultText(item())).toBe('')
  })

  it('全部成功只講人數', () => {
    expect(scheduleResultText(item({ result: { email: { sent: 30, failed: 0 } } }))).toBe('30 人已寄出')
  })

  it('部分失敗時兩個數字都講出來', () => {
    expect(scheduleResultText(item({ result: { email: { sent: 27, failed: 3 } } }))).toBe(
      '27 人已寄出・3 人失敗',
    )
  })

  it('全部失敗講清楚是全部', () => {
    expect(scheduleResultText(item({ result: { email: { sent: 0, failed: 5 } } }))).toBe(
      '5 人全部失敗',
    )
  })
})

describe('狀態的色調與說明', () => {
  it('pending 是 idle 不是 warn —— 排程正常等著，管理員不用動手', () => {
    expect(SCHEDULE_STATUS_TONE.pending).toBe('idle')
    expect(SCHEDULE_STATUS_TONE.cancelled).toBe('idle')
  })

  it('失敗與未送出是 danger，送出是 ok', () => {
    expect(SCHEDULE_STATUS_TONE.failed).toBe('danger')
    expect(SCHEDULE_STATUS_TONE.missed).toBe('danger')
    expect(SCHEDULE_STATUS_TONE.sent).toBe('ok')
  })

  it('每個狀態都有中文標籤，畫面不會印出 pending 這種內部值', () => {
    const all: ScheduleStatus[] = ['pending', 'sending', 'sent', 'failed', 'missed', 'cancelled']
    for (const status of all) expect(SCHEDULE_STATUS_LABEL[status]).toBeTruthy()
  })

  it('missed 一定要解釋，不然只看到沒頭沒尾的「未送出」', () => {
    expect(SCHEDULE_STATUS_HINT.missed).toContain('不會補送')
  })
})

describe('datetime-local 轉換', () => {
  it('來回轉換之後仍是同一個時刻', () => {
    const local = '2026-12-31T09:30'
    const iso = fromDateTimeLocal(local)
    expect(toDateTimeLocal(new Date(iso))).toBe(local)
  })

  it('帶上時區偏移量，後端才不會把本地時間當成 UTC 而差八小時', () => {
    const iso = fromDateTimeLocal('2026-12-31T09:30')
    expect(iso).toMatch(/[+-]\d{2}:\d{2}$/)
    expect(iso.startsWith('2026-12-31T09:30')).toBe(true)
  })

  it('格式不對就丟錯，不要回一個 Invalid Date 讓後端收到 null', () => {
    expect(() => fromDateTimeLocal('不是時間')).toThrow()
  })

  it('最小值在現在之後，最大值在一年內', () => {
    expect(minScheduleValue(NOW) > toDateTimeLocal(NOW)).toBe(true)
    const max = new Date(maxScheduleValue(NOW)).getTime() - NOW.getTime()
    expect(max).toBeLessThanOrEqual(366 * 24 * 60 * 60 * 1000)
  })
})
