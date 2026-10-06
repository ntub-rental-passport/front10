import type { PlanKey, PlanRole } from './subscription-plans'

/** 列表以 user 表示租客角色，方案則仍用 tenant 前綴，導頁時須同時對齊兩種名稱。 */
export function planFilterQuery(
  role: PlanRole,
  planKey: PlanKey,
): { role: 'landlord' | 'user'; plan: `${PlanRole}-${PlanKey}` } {
  return { role: role === 'landlord' ? 'landlord' : 'user', plan: `${role}-${planKey}` }
}
