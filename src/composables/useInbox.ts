/**
 * 租客與房東共用後端收件匣；每次換帳號都清空快取，舊請求不得覆蓋新帳號。
 * 標已讀先更新畫面，失敗時重新同步伺服器並提供操作錯誤給鈴鐺顯示。
 */
import { ref } from 'vue'
import { getAuthenticatedUserId } from './useAuth'
import {
  dismissAnnouncementOnServer,
  fetchMyInbox,
  markAnnouncementReadOnServer,
  markInboxAllRead,
  markInboxMessageRead,
  type InboxState,
} from '@/src/services/inboxApi'

function emptyState(): InboxState {
  return { messages: [], readAnnouncementIds: [], dismissedAnnouncementKeys: [] }
}

const state = ref<InboxState>(emptyState())
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
let owner = ''
let generation = 0
let inflight: Promise<void> | null = null

function syncAccount(): void {
  const account = getAuthenticatedUserId()
  if (account === owner) return
  owner = account
  generation += 1
  state.value = emptyState()
  loading.value = false
  loadError.value = ''
  actionError.value = ''
  inflight = null
}

/** 每次打開通知中心或鈴鐺都重讀；失敗不能被當成空收件匣。 */
export function refreshInbox(): Promise<void> {
  syncAccount()
  if (inflight) return inflight
  const requestGeneration = generation
  loading.value = true
  loadError.value = ''
  inflight = fetchMyInbox()
    .then((result) => {
      syncAccount()
      if (requestGeneration !== generation) return
      if (result) state.value = result
      else loadError.value = '讀不到通知，請重新讀取或重新登入。'
    })
    .catch(() => {
      syncAccount()
      if (requestGeneration === generation) loadError.value = '讀不到通知，請重新讀取或重新登入。'
    })
    .finally(() => {
      if (requestGeneration !== generation) return
      loading.value = false
      inflight = null
    })
  return inflight
}

function quietly(request: Promise<void>): void {
  const requestGeneration = generation
  actionError.value = ''
  request.catch(() => {
    syncAccount()
    if (requestGeneration !== generation) return
    actionError.value = '已讀狀態未能儲存，請重新讀取後再試一次。'
    void refreshInbox()
  })
}

export function useInbox() {
  syncAccount()
  function markMessageRead(id: string): void {
    syncAccount()
    const target = state.value.messages.find((item) => item.id === id)
    if (!target || target.read) return
    state.value = {
      ...state.value,
      messages: state.value.messages.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    }
    quietly(markInboxMessageRead(id))
  }

  function markAnnouncementRead(id: string): void {
    syncAccount()
    if (state.value.readAnnouncementIds.includes(id)) return
    state.value = { ...state.value, readAnnouncementIds: [...state.value.readAnnouncementIds, id] }
    quietly(markAnnouncementReadOnServer(id))
  }

  function markAllRead(announcementIds: string[]): void {
    syncAccount()
    const unreadAnnouncements = announcementIds.filter(
      (id) => !state.value.readAnnouncementIds.includes(id),
    )
    state.value = {
      ...state.value,
      messages: state.value.messages.map((item) => ({ ...item, read: true })),
      readAnnouncementIds: [...state.value.readAnnouncementIds, ...unreadAnnouncements],
    }
    quietly(markInboxAllRead(unreadAnnouncements))
  }

  function dismissAnnouncement(key: string): void {
    syncAccount()
    if (state.value.dismissedAnnouncementKeys.includes(key)) return
    state.value = {
      ...state.value,
      dismissedAnnouncementKeys: [...state.value.dismissedAnnouncementKeys, key],
    }
    quietly(dismissAnnouncementOnServer(key))
  }

  return {
    state,
    loading,
    loadError,
    actionError,
    markMessageRead,
    markAnnouncementRead,
    markAllRead,
    dismissAnnouncement,
  }
}
