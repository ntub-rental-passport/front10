/**
 * 登入失敗鎖定。
 *
 * 目前完全在前端以 localStorage 計數，清除瀏覽器資料即可繞過 ——
 * 它擋的是誤打密碼的真人，不是攻擊者。真正的鎖定必須由後端記錄失敗次數。
 * 設定頁上有對應的說明，不要讓人誤以為這是安全機制。
 *
 * 判定邏輯抽成純函式，之後改由後端回傳狀態時，這層介面可以原樣保留。
 */

const STORAGE_KEY = 'rentmate-login-attempts'

export interface AttemptRecord {
  /** 連續失敗次數，成功登入後歸零。 */
  failures: number
  /** 最後一次失敗的時間（epoch 毫秒）。 */
  lastFailedAt: number
}

export interface LockoutPolicy {
  loginMaxAttempts: number
  loginLockoutMinutes: number
}

export interface LockoutState {
  locked: boolean
  /** 尚未鎖定時，還剩幾次機會。 */
  remainingAttempts: number
  /** 已鎖定時，還要等幾分鐘（無條件進位，至少 1）。 */
  unlocksInMinutes: number
}

export function evaluateLockout(
  record: AttemptRecord | null,
  policy: LockoutPolicy,
  now: number = Date.now(),
): LockoutState {
  const maxAttempts = Math.max(1, Math.floor(policy.loginMaxAttempts))

  if (!record || record.failures <= 0) {
    return { locked: false, remainingAttempts: maxAttempts, unlocksInMinutes: 0 }
  }

  if (record.failures < maxAttempts) {
    return {
      locked: false,
      remainingAttempts: maxAttempts - record.failures,
      unlocksInMinutes: 0,
    }
  }

  const lockoutMs = policy.loginLockoutMinutes * 60_000
  const elapsed = now - record.lastFailedAt

  // 鎖定時間已過，重新給滿次數
  if (elapsed >= lockoutMs) {
    return { locked: false, remainingAttempts: maxAttempts, unlocksInMinutes: 0 }
  }

  return {
    locked: true,
    remainingAttempts: 0,
    unlocksInMinutes: Math.max(1, Math.ceil((lockoutMs - elapsed) / 60_000)),
  }
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readAll(): Record<string, AttemptRecord> {
  if (!canUseStorage()) return {}
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, AttemptRecord>
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return {}
  }
}

function writeAll(records: Record<string, AttemptRecord>): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function normalizeKey(email: string): string {
  return email.trim().toLowerCase()
}

export function getAttemptRecord(email: string): AttemptRecord | null {
  return readAll()[normalizeKey(email)] ?? null
}

export function recordFailure(email: string, now: number = Date.now()): AttemptRecord {
  const records = readAll()
  const key = normalizeKey(email)
  const previous = records[key]

  // 已鎖定後又失敗時重新計時，避免鎖定期間反覆嘗試卻不延長
  const next: AttemptRecord = {
    failures: (previous?.failures ?? 0) + 1,
    lastFailedAt: now,
  }

  records[key] = next
  writeAll(records)
  return next
}

export function clearAttempts(email: string): void {
  const records = readAll()
  delete records[normalizeKey(email)]
  writeAll(records)
}
