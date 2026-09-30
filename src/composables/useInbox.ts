/**
 * 租客收件匣的共用狀態：自己的站內通知，以及公告的已讀、關閉狀態，全部存在後端。
 *
 * 通知中心（useNotifications）與首頁公告橫幅（useAnnouncementDismissal）共用這一份。
 * 標已讀、關閉公告都先改畫面再送後端：寫不進去的話下次重新讀取會回到伺服器的狀態，
 * 最壞只是某則又變回未讀，不值得讓使用者等一趟網路。
 */
import { ref } from 'vue'
import {
  dismissAnnouncementOnServer,
  fetchMyInbox,
  markAnnouncementReadOnServer,
  markInboxAllRead,
  markInboxMessageRead,
  type InboxState,
} from '@/src/services/inboxApi'

const EMPTY: InboxState = { messages: [], readAnnouncementIds: [], dismissedAnnouncementKeys: [] }

const state = ref<InboxState>({ ...EMPTY })
let inflight: Promise<void> | null = null

/** 每次打開通知中心或首頁都重讀一次：管理員剛發的通知要看得到 */
export function refreshInbox(): Promise<void> {
  if (inflight) return inflight
  inflight = fetchMyInbox()
    .then((result) => {
      if (result) state.value = result
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

function quietly(request: Promise<void>): void {
  request.catch(() => {
    // 見檔案開頭：下次重新讀取就會回到伺服器的狀態
  })
}

export function useInbox() {
  function markMessageRead(id: string): void {
    const target = state.value.messages.find((item) => item.id === id)
    if (!target || target.read) return
    state.value = {
      ...state.value,
      messages: state.value.messages.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }
    quietly(markInboxMessageRead(id))
  }

  function markAnnouncementRead(id: string): void {
    if (state.value.readAnnouncementIds.includes(id)) return
    state.value = { ...state.value, readAnnouncementIds: [...state.value.readAnnouncementIds, id] }
    quietly(markAnnouncementReadOnServer(id))
  }

  function markAllRead(announcementIds: string[]): void {
    const unreadAnnouncements = announcementIds.filter((id) => !state.value.readAnnouncementIds.includes(id))
    state.value = {
      ...state.value,
      messages: state.value.messages.map((item) => ({ ...item, read: true })),
      readAnnouncementIds: [...state.value.readAnnouncementIds, ...unreadAnnouncements],
    }
    quietly(markInboxAllRead(unreadAnnouncements))
  }

  function dismissAnnouncement(key: string): void {
    if (state.value.dismissedAnnouncementKeys.includes(key)) return
    state.value = {
      ...state.value,
      dismissedAnnouncementKeys: [...state.value.dismissedAnnouncementKeys, key],
    }
    quietly(dismissAnnouncementOnServer(key))
  }

  return { state, markMessageRead, markAnnouncementRead, markAllRead, dismissAnnouncement }
}
