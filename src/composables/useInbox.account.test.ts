import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxState } from '@/src/services/inboxApi'

const mocks = vi.hoisted(() => ({
  account: 'tenant-1',
  fetch: vi.fn(),
  mark: vi.fn(),
}))
vi.mock('./useAuth', () => ({ getAuthenticatedUserId: () => mocks.account }))
vi.mock('@/src/services/inboxApi', () => ({
  fetchMyInbox: mocks.fetch,
  markInboxMessageRead: mocks.mark,
  markInboxAllRead: vi.fn().mockResolvedValue(undefined),
  markAnnouncementReadOnServer: vi.fn().mockResolvedValue(undefined),
  dismissAnnouncementOnServer: vi.fn().mockResolvedValue(undefined),
}))

function inbox(title: string): InboxState {
  return {
    messages: [
      {
        id: 'same-id',
        title,
        body: '',
        category: '系統',
        channels: ['inapp'],
        sourceType: 'system',
        createdAt: '2026-10-01T00:00:00Z',
        read: false,
      },
    ],
    readAnnouncementIds: [],
    dismissedAnnouncementKeys: [],
  }
}

beforeEach(() => {
  vi.resetModules()
  mocks.account = 'tenant-1'
  mocks.fetch.mockReset()
  mocks.mark.mockReset().mockResolvedValue(undefined)
})

describe('共用收件匣帳號隔離與失敗狀態', () => {
  it('切換帳號立即清空，舊請求較晚完成也不會覆蓋新帳號', async () => {
    let finishOld!: (value: InboxState) => void
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<InboxState>((resolve) => {
          finishOld = resolve
        }),
    )
    const { useInbox, refreshInbox } = await import('./useInbox')
    const oldRequest = refreshInbox()
    mocks.account = 'landlord-2'
    const current = useInbox()
    expect(current.state.value.messages).toEqual([])
    mocks.fetch.mockResolvedValueOnce(inbox('房東自己的通知'))
    await refreshInbox()
    finishOld(inbox('租客的私人通知'))
    await oldRequest
    expect(current.state.value.messages[0]?.title).toBe('房東自己的通知')
  })

  it('讀取失敗與空資料不同，重新讀取成功會清掉錯誤', async () => {
    mocks.fetch
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        messages: [],
        readAnnouncementIds: [],
        dismissedAnnouncementKeys: [],
      })
    const { useInbox, refreshInbox } = await import('./useInbox')
    const current = useInbox()
    await refreshInbox()
    expect(current.loadError.value).toContain('讀不到通知')
    expect(current.loading.value).toBe(false)
    await refreshInbox()
    expect(current.loadError.value).toBe('')
    expect(current.state.value.messages).toEqual([])
  })

  it('標已讀寫入失敗會提示並重新同步伺服器', async () => {
    mocks.fetch.mockResolvedValue(inbox('通知'))
    mocks.mark.mockRejectedValueOnce(new Error('offline'))
    const { useInbox, refreshInbox } = await import('./useInbox')
    const current = useInbox()
    await refreshInbox()
    current.markMessageRead('same-id')
    await vi.waitFor(() => expect(current.actionError.value).toContain('未能儲存'))
    await vi.waitFor(() => expect(current.state.value.messages[0]?.read).toBe(false))
  })
})
