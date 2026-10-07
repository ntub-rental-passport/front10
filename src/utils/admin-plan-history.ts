import type { UserDirectoryRow } from './admin-user-directory'
import type { PlanKey, PlanRole } from './subscription-plans'
import { isInTrial, planRoleOf, TRIAL_DAYS } from './admin-plans'
import { lastTwelveMonths } from './admin-chart-months'

export interface PlanCountMonth {
  month: string
  label: string
  counts: Record<PlanKey, number>
}

// 方案異動未儲存，歷史人數由目前的訂閱記錄近似推算。
export function monthlyPlanCounts(
  rows: UserDirectoryRow[],
  role: PlanRole,
  now: Date,
): PlanCountMonth[] {
  return lastTwelveMonths(now).map(({ month, label, end }, index) => {
    const snapshot = index === 11 ? now : new Date(end.getTime() - 1)
    const counts: Record<PlanKey, number> = { free: 0, plus: 0, pro: 0 }
    for (const row of rows) {
      if (planRoleOf(row.user.role) !== role || new Date(row.user.registeredAt) > snapshot) {
        continue
      }
      const sub = row.subscription?.role === role ? row.subscription : null
      let plan: PlanKey = 'free'
      if (sub && (sub.active || snapshot < new Date(sub.expiresAt))) {
        const trialStart = sub.trialEndsAt
          ? new Date(new Date(sub.trialEndsAt).getTime() - TRIAL_DAYS * 24 * 60 * 60 * 1000)
          : null
        if (trialStart && trialStart <= snapshot && isInTrial(sub.trialEndsAt, snapshot)) {
          plan = 'plus'
        } else if (!(sub.planKey !== 'free' && snapshot < new Date(sub.startedAt))) {
          plan = sub.planKey
        }
      }
      counts[plan] += 1
    }
    return { month, label, counts }
  })
}
