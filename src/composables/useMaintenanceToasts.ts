/**
 * 右下角浮出提示的佇列管理。
 *
 * 這個 composable 只管佇列的內容與觸發時機，不管畫面——畫面交給
 * MaintenanceToaster.vue，這樣佇列邏輯不綁死在單一元件上。
 *
 * 為什麼這裡要主動推播，而不是像 MaintenanceStatusPanel 一樣被動等使用者
 * 自己點進通知中心：createAdminCollection 內建跨分頁 storage 同步，管理員
 * 在另一個分頁按下關閉功能時，這裡的 watch 會立刻收到變化。這正是這個
 * 提示最有價值的時機——使用者正在用某功能，它突然被關掉，總要有人主動
 * 講一聲，不能只靠他自己點壞掉才發現。
 */

import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useFeatureOutages } from './useFeatureOutages'
import { getAuthSession } from './useAuth'
import {
  closedFeatureKeys,
  outageOf as findOutage,
  publicNoteOf,
} from '@/src/utils/admin-feature-status'
import { appendCapped, diffOutageKeys } from '@/src/utils/maintenance-toast-diff'
import { PLAN_FEATURES } from '@/src/utils/admin-entitlements'

export interface MaintenanceToast {
  id: string
  kind: 'closed' | 'reopened' | 'summary'
  title: string
  body: string
}

/** 每則提示停留多久後自動收掉 */
const TOAST_DURATION_MS = 8_000
/** 同時最多顯示幾則，超過的丟棄畫面上最舊的那則 */
const MAX_VISIBLE_TOASTS = 3
/** sessionStorage key 的前綴，實際 key 會帶上使用者 email（見下方說明） */
const SUMMARY_SHOWN_KEY_PREFIX = 'rentmate-maintenance-summary-shown:'

function createToastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mt-${crypto.randomUUID()}`
  }
  return `mt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function useMaintenanceToasts(): {
  toasts: Ref<MaintenanceToast[]>
  dismiss: (id: string) => void
} {
  const { outages } = useFeatureOutages()
  const toasts = ref<MaintenanceToast[]>([])
  const timers = new Map<string, number>()

  function clearTimer(id: string): void {
    const timer = timers.get(id)
    if (timer === undefined) return
    window.clearTimeout(timer)
    timers.delete(id)
  }

  function dismiss(id: string): void {
    clearTimer(id)
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function push(toast: MaintenanceToast): void {
    // 上限邏輯放在 appendCapped（純函式，有測試），這裡只負責把被擠掉的
    // 那幾則的計時器收乾淨，避免它們之後還跑去 dismiss 已經不存在的 id。
    const { kept, dropped } = appendCapped(toasts.value, toast, MAX_VISIBLE_TOASTS)
    for (const item of dropped) clearTimer(item.id)

    toasts.value = kept
    timers.set(
      toast.id,
      window.setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS),
    )
  }

  onMounted(() => {
    // 登入後第一次進 app 才飄摘要：key 帶入 email，換帳號登入視為新的一次，
    // 不會因為換人用同一台裝置就被前一位使用者的紀錄擋住。
    const email = getAuthSession()?.email ?? 'anon'
    const sessionKey = `${SUMMARY_SHOWN_KEY_PREFIX}${email}`
    const closedKeys = closedFeatureKeys(outages.value)

    if (closedKeys.length === 0) return
    if (canUseSessionStorage() && window.sessionStorage.getItem(sessionKey) === 'true') return

    push({
      id: createToastId(),
      kind: 'summary',
      title: `目前有 ${closedKeys.length} 項功能維護中`,
      body: '詳細說明與預計恢復時間，請至通知中心查看。',
    })

    if (canUseSessionStorage()) window.sessionStorage.setItem(sessionKey, 'true')
  })

  // 自己留一份上一輪的 key 快照，不用 watch callback 的 previous 參數。
  //
  // 原因：關閉功能是 outages.value.push(...) 原地新增一筆（見
  // useAdminFeatureOutages.closeFeature）。deep watch 對原地變動確實會觸發
  // callback，但傳進來的 next 與 previous 是**同一個陣列參考**——Vue 沒辦法
  // 幫深層變動保留變動前的值。拿它去 diff 等於自己跟自己比，永遠算不出
  // added，「暫停服務」的提示就一則都不會飄。
  //
  // 目前之所以還看得到提示，是因為變化都從跨分頁 storage 事件進來，那條
  // 路徑會整個重新指派陣列（見 createAdminCollection），剛好避開這個坑。
  // 但那是巧合不是設計：同一個分頁內若發生原地變動就會靜默失效。自己記
  // 快照就不受參考同一性影響。
  let previousKeys = closedFeatureKeys(outages.value)

  // deep: true 仍然要留，否則原地變動連 callback 都不會觸發。
  //
  // 這裡刻意不用 { immediate: true }：掛載當下的初始值不觸發 callback，
  // 第一次跑一定代表「之後發生了變化」，天生不會與 onMounted 飄的 summary
  // 提示重複，不需要另外記一個「是不是初始值」的旗標。
  watch(
    outages,
    (next) => {
      const nextKeys = closedFeatureKeys(next)
      const { added, removed } = diffOutageKeys(previousKeys, nextKeys)
      previousKeys = nextKeys

      for (const key of added) {
        const outage = findOutage(next, key)
        if (!outage) continue
        push({
          id: createToastId(),
          kind: 'closed',
          title: `${PLAN_FEATURES[key].label}暫停服務`,
          body: publicNoteOf(outage),
        })
      }

      // 只報壞消息不報好消息的話，使用者會以為只能自己一直回來試，恢復
      // 也要用同樣主動的方式講一聲，而且要用正向的樣式。
      for (const key of removed) {
        push({
          id: createToastId(),
          kind: 'reopened',
          title: `${PLAN_FEATURES[key].label}已恢復`,
          body: `${PLAN_FEATURES[key].label}已恢復正常服務。`,
        })
      }
    },
    { deep: true },
  )

  onUnmounted(() => {
    for (const timer of timers.values()) window.clearTimeout(timer)
    timers.clear()
  })

  return { toasts, dismiss }
}
