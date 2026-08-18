import type { NotifChannel, UserNotification } from '@/src/mocks/admin/notifications'

/**
 * 一次發送 = 一個批次。管理員關心的是「我發過幾次通知」，
 * 而不是「有幾個人收到過通知」——群發一次 57 人若展成 57 列，
 * 先前的紀錄會全被推出視野，所以發送紀錄以批次為單位呈現。
 */
export interface NotifBatch {
  batchId: string
  title: string
  category: string
  channels: NotifChannel[]
  recipientLabel: string
  createdAt: string
  recipients: UserNotification[]
}

/**
 * 舊資料沒有 batchId。同一次發送的每一筆都是在同一個迴圈裡寫入的，
 * 標題與 createdAt 必然相同，因此用這兩者反推批次歸屬。
 */
export function inferBatchId(item: Pick<UserNotification, 'title' | 'createdAt'>): string {
  return `legacy:${item.createdAt}:${item.title}`
}

export function migrateNotifBatches(list: UserNotification[]): UserNotification[] {
  return list.map((item) => (item.batchId ? item : { ...item, batchId: inferBatchId(item) }))
}

/**
 * 收件人條件在舊資料裡沒有記錄，只能從批次大小回推：
 * 一個人的批次必定是當初挑了特定使用者，多人則是角色群發。
 */
function fallbackRecipientLabel(size: number): string {
  return size === 1 ? '指定使用者' : '角色群發'
}

/** 批次由新到舊排序，與原本逐筆紀錄的排序方向一致。 */
export function groupIntoBatches(list: UserNotification[]): NotifBatch[] {
  const batches = new Map<string, NotifBatch>()

  for (const item of list) {
    const batchId = item.batchId ?? inferBatchId(item)
    const existing = batches.get(batchId)
    if (existing) {
      existing.recipients.push(item)
      continue
    }
    batches.set(batchId, {
      batchId,
      title: item.title,
      category: item.category,
      channels: [...item.channels],
      recipientLabel: item.recipientLabel ?? '',
      createdAt: item.createdAt,
      recipients: [item],
    })
  }

  return [...batches.values()]
    .map((batch) => ({
      ...batch,
      recipientLabel: batch.recipientLabel || fallbackRecipientLabel(batch.recipients.length),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * 只有一位收件人的批次，列表直接顯示是誰比顯示「1 人・指定使用者」有意義——
 * 單人發送原本就是點名發給特定對象，聚合成批次後反而把「發給誰」藏起來了。
 * 多人批次沒有這個問題（本來就該看條件與人數），回傳 null 交給呼叫端顯示原本的摘要。
 */
export function singleRecipientOf(batch: NotifBatch): UserNotification | null {
  return batch.recipients.length === 1 ? batch.recipients[0] : null
}
