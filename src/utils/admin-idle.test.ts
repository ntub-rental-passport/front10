import { describe, expect, it } from 'vitest'

import { ADMIN_IDLE_MINUTES, IDLE_WARNING_SECONDS, idleState, shouldReportActivity } from './admin-idle'

const NOW = 1_800_000_000_000
const minutesAgo = (minutes: number) => NOW - minutes * 60_000

describe('idleState', () => {
  it('剛操作過是 active', () => {
    expect(idleState(NOW, NOW)).toEqual({ phase: 'active', secondsLeft: ADMIN_IDLE_MINUTES * 60 })
  })

  it('最後一分鐘跳出提醒，並給倒數', () => {
    const state = idleState(minutesAgo(ADMIN_IDLE_MINUTES) + 30_000, NOW)
    expect(state).toEqual({ phase: 'warning', secondsLeft: 30 })
    expect(idleState(minutesAgo(ADMIN_IDLE_MINUTES - 1) - 1_000, NOW).phase).toBe('warning')
  })

  it('提醒之前都是 active', () => {
    expect(idleState(minutesAgo(ADMIN_IDLE_MINUTES) + (IDLE_WARNING_SECONDS + 1) * 1000, NOW).phase).toBe('active')
  })

  it('滿 20 分鐘就是 expired，倒數是 0', () => {
    expect(idleState(minutesAgo(ADMIN_IDLE_MINUTES), NOW)).toEqual({ phase: 'expired', secondsLeft: 0 })
    // 電腦睡了一整晚醒來：一醒來就登出，不是從頭倒數
    expect(idleState(minutesAgo(600), NOW).phase).toBe('expired')
  })

  it('最後操作時間在未來（時鐘不同步）不算閒置', () => {
    expect(idleState(NOW + 60_000, NOW).phase).toBe('active')
  })
})

describe('shouldReportActivity', () => {
  it('一分鐘最多回報一次', () => {
    expect(shouldReportActivity(NOW - 59_000, NOW)).toBe(false)
    expect(shouldReportActivity(NOW - 60_000, NOW)).toBe(true)
    expect(shouldReportActivity(0, NOW)).toBe(true)
  })
})
