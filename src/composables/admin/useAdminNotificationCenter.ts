/**
 * 管理員通知中心：系統告警與內部備註，存在後端（backend/admin/admin_notifications.py）。
 *
 * 告警由後端自己產生（服務斷線與恢復、排程通知寄送失敗），沒人開著後台也會記下來；
 * 後台版面掛著時每 60 秒重讀一次，右上角的未讀數才會跟著變。
 * 標已讀、標回未讀先改畫面再送後端：寫不進去的話下次重讀會回到伺服器的狀態。
 */
import { computed, ref } from 'vue'
import {
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAdminNotificationUnread,
  markAllAdminNotificationsRead,
  sendAdminNote,
} from '@/src/services/adminNotificationsApi'
import type { AdminNotification } from '@/src/mocks/admin/admin-notifications'

const POLL_MS = 60_000

const notifications = ref<AdminNotification[]>([])
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let pollTimer: ReturnType<typeof setInterval> | null = null

export async function loadAdminNotificationCenter(): Promise<void> {
  if (loadState.value !== 'ready') loadState.value = 'loading'
  const result = await fetchAdminNotifications()
  if (result) {
    notifications.value = result
    loadState.value = 'ready'
  } else if (loadState.value !== 'ready') {
    // 已經讀到過的話保留手上的清單：輪詢偶爾失敗一次不必讓整頁變成「讀不到」
    loadState.value = 'error'
  }
}

/** AdminLayout 掛上去時開始，卸下時停止 */
export function startAdminNotificationPolling(): void {
  stopAdminNotificationPolling()
  void loadAdminNotificationCenter()
  pollTimer = setInterval(() => void loadAdminNotificationCenter(), POLL_MS)
}

export function stopAdminNotificationPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function setRead(id: string, read: boolean): boolean {
  const target = notifications.value.find((item) => item.id === id)
  if (!target || target.read === read) return false
  notifications.value = notifications.value.map((item) => (item.id === id ? { ...item, read } : item))
  return true
}

function quietly(request: Promise<void>): void {
  request.catch(() => {
    // 見檔案開頭：下次重讀就會回到伺服器的狀態
  })
}

export function useAdminNotificationCenter() {
  if (loadState.value === 'idle') void loadAdminNotificationCenter()

  const items = computed(() => notifications.value)
  const unreadCount = computed(() => notifications.value.filter((item) => !item.read).length)

  function markRead(id: string): void {
    if (setRead(id, true)) quietly(markAdminNotificationRead(id))
  }

  /**
   * 標回未讀。
   *
   * 原本點開一則就回不去了 —— 想把它留成待辦就不能點開看內容，
   * 這讓「已讀」變成一個不小心就會踩到的單向操作。
   * 主流的通知中心（Linear、GitHub）都允許切回未讀。
   */
  function markUnread(id: string): void {
    if (setRead(id, false)) quietly(markAdminNotificationUnread(id))
  }

  function markAllRead(): void {
    if (unreadCount.value === 0) return
    notifications.value = notifications.value.map((item) => ({ ...item, read: true }))
    quietly(markAllAdminNotificationsRead())
  }

  /** 發給所有管理員的內部備註。寄件人由後端從登入的帳號決定。失敗時丟出後端給的理由 */
  async function sendNote(title: string, body: string): Promise<void> {
    const created = await sendAdminNote(title, body)
    notifications.value = [created, ...notifications.value.filter((item) => item.id !== created.id)]
  }

  return { items, unreadCount, loadState, markRead, markUnread, markAllRead, sendNote }
}
