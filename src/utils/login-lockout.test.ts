import { describe, expect, it } from 'vitest'
import { evaluateLockout, type AttemptRecord, type LockoutPolicy } from './login-lockout'

const MINUTE = 60_000
const NOW = 1_800_000_000_000

const policy: LockoutPolicy = { loginMaxAttempts: 5, loginLockoutMinutes: 15 }

function record(failures: number, minutesAgo = 0): AttemptRecord {
  return { failures, lastFailedAt: NOW - minutesAgo * MINUTE }
}

describe('evaluateLockout', () => {
  it('沒有紀錄時給滿次數', () => {
    expect(evaluateLockout(null, policy, NOW)).toEqual({
      locked: false,
      remainingAttempts: 5,
      unlocksInMinutes: 0,
    })
  })

  it('失敗一次後剩餘次數遞減', () => {
    expect(evaluateLockout(record(1), policy, NOW).remainingAttempts).toBe(4)
  })

  it('失敗達上限前一次仍未鎖定', () => {
    const state = evaluateLockout(record(4), policy, NOW)
    expect(state.locked).toBe(false)
    expect(state.remainingAttempts).toBe(1)
  })

  it('失敗達上限即鎖定', () => {
    const state = evaluateLockout(record(5), policy, NOW)
    expect(state.locked).toBe(true)
    expect(state.remainingAttempts).toBe(0)
    expect(state.unlocksInMinutes).toBe(15)
  })

  it('鎖定期間回報剩餘分鐘數（無條件進位）', () => {
    expect(evaluateLockout(record(5, 10), policy, NOW).unlocksInMinutes).toBe(5)
    expect(evaluateLockout(record(5, 14.5), policy, NOW).unlocksInMinutes).toBe(1)
  })

  it('鎖定時間過後自動解鎖並回復滿次數', () => {
    const state = evaluateLockout(record(5, 15), policy, NOW)
    expect(state.locked).toBe(false)
    expect(state.remainingAttempts).toBe(5)
  })

  it('超過鎖定時間很久也一樣解鎖', () => {
    expect(evaluateLockout(record(99, 999), policy, NOW).locked).toBe(false)
  })

  it('失敗次數為 0 的殘留紀錄視為沒有紀錄', () => {
    expect(evaluateLockout(record(0), policy, NOW).remainingAttempts).toBe(5)
  })

  it('上限設定小於 1 時以 1 為準，避免設定錯誤導致永遠無法登入', () => {
    const state = evaluateLockout(null, { ...policy, loginMaxAttempts: 0 }, NOW)
    expect(state.remainingAttempts).toBe(1)
  })

  it('尊重自訂的鎖定分鐘數', () => {
    const strict: LockoutPolicy = { loginMaxAttempts: 3, loginLockoutMinutes: 60 }
    expect(evaluateLockout(record(3), strict, NOW).unlocksInMinutes).toBe(60)
    expect(evaluateLockout(record(3, 59), strict, NOW).unlocksInMinutes).toBe(1)
    expect(evaluateLockout(record(3, 60), strict, NOW).locked).toBe(false)
  })
})
