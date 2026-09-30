import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchMyInbox: vi.fn(),
  markInboxMessageRead: vi.fn(async () => {}),
  markInboxAllRead: vi.fn(async () => {}),
  markAnnouncementReadOnServer: vi.fn(async () => {}),
  dismissAnnouncementOnServer: vi.fn(async () => {}),
}))

vi.mock('@/src/services/inboxApi', () => api)

function message(id: string, read = false) {
  return {
    id, title: id, body: '內容', category: '系統' as const, channels: ['inapp' as const],
    sourceType: 'admin' as const, createdAt: '2026-09-30T01:00:00.000Z', read,
  }
}

async function loaded() {
  const module = await import('./useInbox')
  await module.refreshInbox()
  return module.useInbox()
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  api.fetchMyInbox.mockResolvedValue({
    messages: [message('nm-1'), message('nm-2', true)],
    readAnnouncementIds: ['an-1'],
    dismissedAnnouncementKeys: [],
  })
})

describe('useInbox', () => {
  it('標已讀先改畫面，再送後端', async () => {
    const inbox = await loaded()
    inbox.markMessageRead('nm-1')
    expect(inbox.state.value.messages.find((item) => item.id === 'nm-1')?.read).toBe(true)
    expect(api.markInboxMessageRead).toHaveBeenCalledWith('nm-1')
  })

  it('已經讀過的不再送一次', async () => {
    const inbox = await loaded()
    inbox.markMessageRead('nm-2')
    inbox.markAnnouncementRead('an-1')
    expect(api.markInboxMessageRead).not.toHaveBeenCalled()
    expect(api.markAnnouncementReadOnServer).not.toHaveBeenCalled()
  })

  it('全部標已讀只送還沒讀過的公告', async () => {
    const inbox = await loaded()
    inbox.markAllRead(['an-1', 'an-2'])
    expect(api.markInboxAllRead).toHaveBeenCalledWith(['an-2'])
    expect(inbox.state.value.messages.every((item) => item.read)).toBe(true)
    expect(inbox.state.value.readAnnouncementIds).toEqual(['an-1', 'an-2'])
  })

  it('後端寫不進去也不會丟出錯誤打斷畫面', async () => {
    api.dismissAnnouncementOnServer.mockRejectedValueOnce(new Error('HTTP 500'))
    const inbox = await loaded()
    expect(() => inbox.dismissAnnouncement('an-1:2026-09-01T00:00:00.000Z')).not.toThrow()
    expect(inbox.state.value.dismissedAnnouncementKeys).toEqual(['an-1:2026-09-01T00:00:00.000Z'])
  })

  it('讀不到後端時保持空的收件匣', async () => {
    api.fetchMyInbox.mockResolvedValue(null)
    const inbox = await loaded()
    expect(inbox.state.value.messages).toEqual([])
  })
})
