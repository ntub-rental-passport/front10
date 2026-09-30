import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const inboxApi = vi.hoisted(() => ({
  sendAdminNotification: vi.fn(async () => ({ batchId: 'nb-1', recipientCount: 3 })),
  fetchAdminMessages: vi.fn(async () => []),
}))
const contentApi = vi.hoisted(() => ({
  fetchTemplates: vi.fn(async () => []),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  setTemplateEnabled: vi.fn(),
}))

vi.mock('@/src/services/inboxApi', () => inboxApi)
vi.mock('@/src/services/contentApi', () => contentApi)

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('sendComposed', () => {
  it('收件人交給後端解析，回傳後端實際送出的人數', async () => {
    const { useAdminNotifications } = await import('./useAdminNotifications')
    const { sendComposed } = useAdminNotifications()

    const count = await sendComposed(
      {
        title: '停水通知', body: '週六停水', category: '系統', channels: ['inapp', 'email'],
        actionUrl: ' /app/outage ', actionLabel: '', sourceLabel: '一次性撰寫',
      },
      { kind: 'role', role: 'user' },
    )

    expect(count).toBe(3)
    expect(inboxApi.sendAdminNotification).toHaveBeenCalledWith({
      recipient: { kind: 'role', role: 'user' },
      title: '停水通知',
      body: '週六停水',
      category: '系統',
      channels: ['inapp', 'email'],
      recipientLabel: '全部租客',
      sourceLabel: '一次性撰寫',
      actionUrl: '/app/outage',
      actionLabel: undefined,
    })
  })

  it('後端拒絕時把理由丟回給畫面', async () => {
    inboxApi.sendAdminNotification.mockRejectedValueOnce(new Error('寄信（SMTP）尚未設定，不能選 Email。'))
    const { useAdminNotifications } = await import('./useAdminNotifications')
    const { sendComposed } = useAdminNotifications()
    await expect(
      sendComposed(
        { title: 't', body: 'b', category: '系統', channels: ['email'], sourceLabel: '一次性撰寫' },
        { kind: 'users', emails: ['a@example.com'] },
      ),
    ).rejects.toThrow('SMTP')
  })
})

describe('followPendingEmails', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function row(email: 'pending' | 'sent') {
    return {
      id: 'nm-1', userEmail: 'a@example.com', title: 't', body: 'b', category: '系統', channels: ['inapp', 'email'],
      deliveryStatus: { inapp: 'sent', email }, batchId: 'nb-1', recipientLabel: '指定使用者',
      sourceLabel: '一次性撰寫', createdAt: '2026-09-30T01:00:00.000Z', read: false,
    }
  }

  it('還有寄送中的 Email 就過幾秒再讀，寄完就停', async () => {
    vi.useFakeTimers()
    inboxApi.fetchAdminMessages
      .mockResolvedValueOnce([row('pending')] as never) // useAdminNotifications() 一呼叫就自動讀
      .mockResolvedValueOnce([row('pending')] as never) // 下面明確的 loadMessages()
      .mockResolvedValueOnce([row('sent')] as never) // 3 秒後再讀，寄完了
    const { followPendingEmails, loadMessages, useAdminNotifications } = await import('./useAdminNotifications')
    const { messages } = useAdminNotifications()
    await loadMessages()
    inboxApi.fetchAdminMessages.mockClear()

    followPendingEmails()
    await vi.advanceTimersByTimeAsync(3000)
    expect(inboxApi.fetchAdminMessages).toHaveBeenCalledTimes(1)
    expect(messages.value[0].deliveryStatus.email).toBe('sent')

    await vi.advanceTimersByTimeAsync(30000)
    expect(inboxApi.fetchAdminMessages).toHaveBeenCalledTimes(1)
  })
})
