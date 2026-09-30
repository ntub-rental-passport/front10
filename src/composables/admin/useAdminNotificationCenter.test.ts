import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminNotification } from '@/src/mocks/admin/admin-notifications'

const api = vi.hoisted(() => ({
  fetchAdminNotifications: vi.fn(),
  sendAdminNote: vi.fn(),
  markAdminNotificationRead: vi.fn(async () => {}),
  markAdminNotificationUnread: vi.fn(async () => {}),
  markAllAdminNotificationsRead: vi.fn(async () => {}),
}))

vi.mock('@/src/services/adminNotificationsApi', () => api)

function item(id: string, read = false): AdminNotification {
  return { id, source: 'alert', title: id, body: '內容', createdAt: '2026-09-30T01:00:00.000Z', read }
}

async function loaded() {
  const module = await import('./useAdminNotificationCenter')
  await module.loadAdminNotificationCenter()
  return { module, center: module.useAdminNotificationCenter() }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  api.fetchAdminNotifications.mockResolvedValue([item('a'), item('b', true)])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAdminNotificationCenter', () => {
  it('標已讀、標回未讀先改畫面再送後端，未讀數跟著變', async () => {
    const { center } = await loaded()
    expect(center.unreadCount.value).toBe(1)
    center.markRead('a')
    expect(center.unreadCount.value).toBe(0)
    expect(api.markAdminNotificationRead).toHaveBeenCalledWith('a')
    center.markUnread('b')
    expect(api.markAdminNotificationUnread).toHaveBeenCalledWith('b')
    expect(center.unreadCount.value).toBe(1)
  })

  it('狀態沒變就不送', async () => {
    const { center } = await loaded()
    center.markRead('b')
    center.markUnread('a')
    expect(api.markAdminNotificationRead).not.toHaveBeenCalled()
    expect(api.markAdminNotificationUnread).not.toHaveBeenCalled()
  })

  it('全部已讀', async () => {
    const { center } = await loaded()
    center.markAllRead()
    expect(center.unreadCount.value).toBe(0)
    expect(api.markAllAdminNotificationsRead).toHaveBeenCalledTimes(1)
  })

  it('送出的備註放在最前面；後端拒絕時把理由丟回給畫面', async () => {
    api.sendAdminNote.mockResolvedValueOnce({ ...item('note'), source: 'admin-note', senderName: '系統管理員' })
    const { center } = await loaded()
    await center.sendNote('交接', '記得看監控')
    expect(center.items.value[0].id).toBe('note')

    api.sendAdminNote.mockRejectedValueOnce(new Error('備註的標題與內容都要填。'))
    await expect(center.sendNote('', '')).rejects.toThrow('都要填')
  })

  it('輪詢偶爾失敗一次時保留手上的清單', async () => {
    vi.useFakeTimers()
    const { module, center } = await loaded()
    api.fetchAdminNotifications.mockResolvedValue(null)
    module.startAdminNotificationPolling()
    await vi.advanceTimersByTimeAsync(60_000)
    module.stopAdminNotificationPolling()
    expect(center.items.value.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(center.loadState.value).toBe('ready')
  })
})
