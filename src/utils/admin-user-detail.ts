import type { StatusDotTone } from '@/src/components/admin/status-dot'
import type { DepositMatch } from './admin-deposit'
import type { HandoverAgreement } from './admin-handover'

/**
 * 使用者詳情頁的狀態 → 顏色。
 *
 * ## 原本的問題：輕重完全顛倒
 *
 * 這一頁原本用 Badge 的 variant 表達狀態：「正常」「金額相符」「雙方一致」
 * 是 default，也就是**實心紫色** —— 整頁最搶眼的反而是「沒事」的狀態；
 * 「租客未聲明」「租客未確認」是淡灰的 secondary。
 *
 * 後台其他頁的規則剛好相反（見 status-dot.ts）：沒事的安靜，只有需要
 * 管理員動手的才整顆上色。這裡對齊那套規則。
 *
 * ## 為什麼「在等別人」是 idle 不是 warn
 *
 * warn／danger 在這個後台的意思是「你必須動手」。「租客未聲明押金」
 * 「租客未確認點交」都是在等租客，管理員能做的只有等 —— 給它們琥珀色，
 * 管理員會以為有事要處理，點進去卻發現無事可做。租補頁的政府審核步驟
 * 也是同一個原則（見 governmentStepVisual）。
 */

export function accountStatusTone(status: 'active' | 'suspended'): StatusDotTone {
  return status === 'suspended' ? 'danger' : 'ok'
}

/**
 * 押金對帳。「金額不符」是列表頁的警示條件之一（userAlertLabels），
 * 需要管理員介入協調，所以是 danger。
 */
export function depositMatchTone(match: DepositMatch): StatusDotTone {
  if (match === 'mismatched') return 'danger'
  if (match === 'pending') return 'idle'
  return 'ok'
}

/** 點交存證。與押金同一種「兩造各自認定、比對是否一致」的模式，顏色也一致。 */
export function handoverAgreementTone(agreement: HandoverAgreement): StatusDotTone {
  if (agreement === 'disputed') return 'danger'
  if (agreement === 'pending') return 'idle'
  return 'ok'
}

export interface SubscriptionFlag {
  label: string
  tone: StatusDotTone
}

/**
 * 訂閱區塊要亮出來的狀態。
 *
 * 「即將到期」「額度已用滿」都是列表頁的警示條件，是 warn（該聯絡使用者，
 * 但還不到出事）；「已停用」是既成事實，管理員沒有要做的事，是 idle。
 *
 * 「額度已用滿」原本這一頁完全沒顯示 —— 列表頁能用它篩選，點進來卻
 * 看不到是哪一條警示把他篩出來的。
 */
export function subscriptionFlags(input: {
  active: boolean
  expiringSoon: boolean
  quotaExhausted: boolean
}): SubscriptionFlag[] {
  const flags: SubscriptionFlag[] = []
  if (!input.active) {
    flags.push({ label: '已停用', tone: 'idle' })
    // 已經停用了，「即將到期」「額度用滿」都不再有意義
    return flags
  }
  if (input.expiringSoon) flags.push({ label: '即將到期', tone: 'warn' })
  if (input.quotaExhausted) flags.push({ label: '額度已用滿', tone: 'warn' })
  return flags
}
