import { planFeatures, subscriptionPlans, type PlanKey, type PlanRole } from './subscription-plans'

/** 使用前台權益表的原文與分組，避免後台另編一套權益或用量敘述。 */
export function planInclusions(role: PlanRole, key: PlanKey) {
  const index = subscriptionPlans[role].findIndex((plan) => plan.key === key)
  const groups: { group: string; items: { label: string; text: string; planned: boolean }[] }[] = []
  for (const feature of planFeatures[role]) {
    let group = groups.find((item) => item.group === feature.group)
    if (!group) {
      group = { group: feature.group, items: [] }
      groups.push(group)
    }
    group.items.push({
      label: feature.label,
      text: feature.values[index]!,
      planned: !!feature.planned,
    })
  }
  return groups
}
