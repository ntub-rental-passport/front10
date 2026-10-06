import { computed } from 'vue'
import { useLandlordWorkspace } from './useLandlordWorkspace'
import { useLandlordSettings } from './useLandlordSettings'
import { subscriptionPlans, type PlanRole } from '@/src/utils/subscription-plans'

export interface PlanUsage {
  label: string
  used: number | null
  limit: number
  unit: string
  note: string
}

export function usePlanOverview(role: PlanRole) {
  // Paid subscriptions are not connected yet. Never infer an entitlement from a local checkout.
  const currentPlan = subscriptionPlans[role][0]!
  const workspace = role === 'landlord' ? useLandlordWorkspace() : null
  const settings = role === 'landlord' ? useLandlordSettings() : null
  const loading = computed(() => workspace?.loading.value ?? false)
  const error = computed(() => workspace?.error.value ?? '')
  const usage = computed<PlanUsage[]>(() => {
    if (workspace && settings) {
      const available =
        workspace.propertyDataReady.value && !workspace.loading.value && !workspace.error.value
      return [
        {
          label: '管理物件',
          used: available ? workspace.properties.value.length : null,
          limit: 1,
          unit: '個',
          note: '依目前房務資料計算',
        },
        {
          label: '管理房間',
          used: available ? workspace.rooms.value.length : null,
          limit: 5,
          unit: '間',
          note: '包含所有物件的房間',
        },
        {
          label: '管理者席次',
          used: 1 + settings.state.members.filter((m) => m.status === 'active').length,
          limit: 1,
          unit: '席',
          note: '含擁有者；依團隊成員名冊，不含待接受邀請',
        },
      ]
    }
    return [
      {
        label: 'AI 契約分析',
        used: null,
        limit: 1,
        unit: '次',
        note: '驗證帳號一次性贈送；使用紀錄尚未串接',
      },
      {
        label: '附件總容量',
        used: null,
        limit: 200,
        unit: 'MB',
        note: '規劃額度；用量統計尚未開放',
      },
      {
        label: '室友共享人數',
        used: null,
        limit: 3,
        unit: '人',
        note: '規劃 1 個空間，含訂閱者；用量統計尚未開放',
      },
    ]
  })
  return { currentPlan, usage, loading, error, refresh: () => workspace?.refresh() }
}
