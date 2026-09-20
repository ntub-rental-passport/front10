import { computed, type ComputedRef } from 'vue'

import { useAdminAiUsage } from './useAdminAiUsage'
import { useAdminMaintenance } from './useAdminMaintenance'
import { buildQueueGroups, queueTotal, type QueueGroup } from '@/src/utils/admin-overview'

/**
 * 待辦佇列。
 *
 * ## 為什麼要抽成 composable
 *
 * 同一份佇列現在有三個消費者：頂部列的未處理數字徽章、抽屜裡的清單，以及
 * 總覽頁主角卡「今日待處理」。三邊如果各自 buildQueueGroups 一次，之後只要
 * 有人改了其中一邊的聚合參數（例如預覽筆數、或多納入一種待辦），畫面上就會
 * 出現「徽章說 18 件、抽屜列出 14 件」這種對不起來的狀況 —— 而且不會報錯。
 *
 * 底層的 useAdminMaintenance 與 useAdminAiUsage 都是模組層的
 * createAdminCollection（全域單例），所以這裡重複呼叫不會產生第二份狀態，
 * 三個消費者拿到的一定是同一批資料。
 *
 * ## 資料性質
 *
 * ⚠️ 目前整份佇列都是展示資料：工單來自 src/mocks 的 seedMaintenanceTickets，
 * 額度告急來自 seedAiUsage。這裡沒有任何後端呼叫。使用它的區塊不要標成真實
 * 資料（見各頁 data-real 的用法）。
 */
export interface AdminQueue {
  groups: ComputedRef<QueueGroup[]>
  /** 所有分組的件數總和，不是預覽筆數總和 */
  count: ComputedRef<number>
}

/** 每組在摺疊狀態下預覽幾筆明細。件數仍然是真實總數。 */
const PREVIEW_LIMIT = 3

export function useAdminQueue(): AdminQueue {
  const { ticketViews } = useAdminMaintenance()
  const { alerts } = useAdminAiUsage()

  const groups = computed(() =>
    buildQueueGroups(
      ticketViews.value.map((ticket) => ({
        id: ticket.id,
        address: ticket.address,
        tenantName: ticket.tenantName,
        status: ticket.status,
      })),
      alerts.value.map((usage) => ({
        id: `ai-${usage.provider.id}`,
        label:
          usage.daysLeft === null
            ? `${usage.provider.label}（已用 ${usage.percent}%）`
            : `${usage.provider.label}（預估 ${usage.daysLeft} 天後用盡）`,
      })),
      PREVIEW_LIMIT,
    ),
  )

  return {
    groups,
    count: computed(() => queueTotal(groups.value)),
  }
}
