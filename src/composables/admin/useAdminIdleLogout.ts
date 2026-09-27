import { computed, onMounted, onUnmounted, ref } from 'vue'
import { reportAdminActivity } from '@/src/services/adminSessionApi'
import { idleState, shouldReportActivity } from '@/src/utils/admin-idle'

/**
 * 管理員閒置登出（畫面這一半；伺服器那一半見 backend/security.py）。
 *
 * - 滑鼠、鍵盤、捲動、觸控都算「有在操作」。
 * - 最後操作時間存在 localStorage：同時開了好幾個後台分頁時，在任何一個分頁操作，
 *   其他分頁都不會各自倒數把人登出 —— 登入狀態本來就是所有分頁共用的。
 * - 一分鐘最多回報伺服器一次；伺服器回 401（已經不認這次登入）就直接登出。
 * - 最後一分鐘跳出提醒，給「繼續使用」；時間到呼叫 onLogout。
 */

export type AdminLogoutReason = 'idle' | 'expired'

const STORAGE_KEY = 'rentmate-admin-last-activity'
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
/** 寫 localStorage 的節流：pointermove 一秒幾十次，不需要每次都寫 */
const WRITE_THROTTLE_MS = 5_000

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function writeShared(time: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(time))
  } catch {
    // 無痕模式等寫不進去的情況：只剩這個分頁自己計時，伺服器那一半照樣有效
  }
}

export function useAdminIdleLogout(onLogout: (reason: AdminLogoutReason) => void) {
  const now = ref(Date.now())
  const lastActivity = ref(Date.now())
  let lastWrite = 0
  let lastReport = 0
  let loggedOut = false

  const state = computed(() => idleState(lastActivity.value, now.value))

  function logout(reason: AdminLogoutReason): void {
    if (loggedOut) return
    loggedOut = true
    onLogout(reason)
  }

  async function report(): Promise<void> {
    if ((await reportAdminActivity()) === 'logged-out') logout('expired')
  }

  function markActivity(force = false): void {
    if (loggedOut) return
    const time = Date.now()
    // 已經過了閒置期限的操作不算：時間一到就是登出，不能靠晃一下滑鼠救回來
    if (idleState(Math.max(lastActivity.value, readShared()), time).phase === 'expired') return
    lastActivity.value = time
    if (force || time - lastWrite >= WRITE_THROTTLE_MS) {
      writeShared(time)
      lastWrite = time
    }
    if (force || shouldReportActivity(lastReport, time)) {
      lastReport = time
      void report()
    }
  }

  function onActivity(): void {
    markActivity()
  }

  // 別的分頁寫了更新的操作時間
  function onStorage(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY) return
    const shared = Number(event.newValue) || 0
    if (shared > lastActivity.value) lastActivity.value = shared
  }

  let timer = 0
  function tick(): void {
    now.value = Date.now()
    const shared = readShared()
    if (shared > lastActivity.value) lastActivity.value = shared
    if (state.value.phase === 'expired') logout('idle')
  }

  onMounted(() => {
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true })
    window.addEventListener('storage', onStorage)
    // 打開後台本身就是一次操作；順便立刻跟伺服器確認這次登入還算數
    markActivity(true)
    timer = window.setInterval(tick, 1_000)
  })

  onUnmounted(() => {
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity)
    window.removeEventListener('storage', onStorage)
    window.clearInterval(timer)
  })

  return {
    warning: computed(() => state.value.phase === 'warning'),
    secondsLeft: computed(() => state.value.secondsLeft),
    /** 提醒視窗的「繼續使用」：立刻回報，不等一分鐘的節流 */
    stayActive: () => markActivity(true),
  }
}
