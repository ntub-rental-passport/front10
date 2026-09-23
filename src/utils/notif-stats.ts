import type { NotifChannel, NotifDeliveryStatus } from '@/src/mocks/admin/notifications'
import type { NotifBatch } from './notif-batch'

/**
 * 發送批次的統計。
 *
 * ## 為什麼不能看第一個收件者就好
 *
 * 發送紀錄原本是 `batch.recipients[0].deliveryStatus[ch]` —— 拿第一個人的
 * 狀態代表整批。今天所有收件者的狀態必然相同（computeDeliveryStatus 只看
 * 管道不看人），所以畫面沒說謊。
 *
 * 但它**沒有能力表達部分失敗**。哪天 Email 真的接上後端，50 人裡 3 人失敗，
 * 這張表還是會顯示「全部已送」—— 而且不會有任何地方報錯。等到真的漏報時
 * 才修，代價是那時候沒人知道畫面在說謊。
 */
export interface ChannelStat {
  channel: NotifChannel
  sent: number
  pending: number
  failed: number
  total: number
}

export function batchChannelStats(batch: NotifBatch): ChannelStat[] {
  return batch.channels.map((channel) => {
    const stat: ChannelStat = { channel, sent: 0, pending: 0, failed: 0, total: 0 }
    for (const r of batch.recipients) {
      const status: NotifDeliveryStatus | undefined = r.deliveryStatus?.[channel]
      if (!status) continue
      stat.total += 1
      stat[status] += 1
    }
    return stat
  })
}

export interface ReadStat {
  read: number
  total: number
}

/**
 * 已讀統計。
 *
 * 這是真實資料不是假指標：UserNotification.read 是真欄位，而租客端的
 * useNotifications.markRead 真的會寫入 —— 使用者在自己的通知頁點開一則，
 * 這個數字就會動。
 *
 * 只有站內通知能算已讀。Email 與推播沒有開信追蹤，而且後端根本還沒接，
 * 所以這個數字講的是「站內看過的人數」，呼叫端的文案要說清楚。
 */
export function batchReadStat(batch: NotifBatch): ReadStat {
  return {
    read: batch.recipients.filter((r) => r.read).length,
    total: batch.recipients.length,
  }
}

export interface TemplateUsage {
  /** 用這個模板送出過幾批 */
  batchCount: number
  /** 最近一次送出的時間，沒用過是 null */
  lastSentAt: string | null
  /** 累計送達的人次（同一個人被送兩次算兩次） */
  totalRecipients: number
  read: number
}

/**
 * 某個模板被用過幾次。
 *
 * sourceLabel 存的就是模板名稱（套用模板時）或「一次性撰寫」（自由撰寫時），
 * 所以從模板名稱反查得到它的所有批次。
 *
 * 這條連結本來只在批次詳情頁看得到 —— 從模板那一側沒辦法問「這個模板
 * 用過幾次」。模板列表的展開區補上這段之後才答得出來。
 *
 * 用名稱而不是 id 比對是因為資料裡只存名稱。代價是模板改名之後舊批次就
 * 對不上了 —— 那是資料結構的限制，不是這裡能修的；寧可少算也不要亂認。
 */
export function templateUsage(templateName: string, batches: NotifBatch[]): TemplateUsage {
  const mine = batches.filter((b) => b.recipients.some((r) => r.sourceLabel === templateName))
  const usage: TemplateUsage = {
    batchCount: mine.length,
    lastSentAt: null,
    totalRecipients: 0,
    read: 0,
  }
  for (const b of mine) {
    usage.totalRecipients += b.recipients.length
    usage.read += b.recipients.filter((r) => r.read).length
    if (!usage.lastSentAt || new Date(b.createdAt) > new Date(usage.lastSentAt)) {
      usage.lastSentAt = b.createdAt
    }
  }
  return usage
}

/**
 * 變數預覽用的範例值。
 *
 * 預覽的目的是讓人在送出前看到「代入之後長什麼樣」，最能擋下的錯是
 * 變數名打錯 —— 那種錯現在要等送出去、使用者收到一封寫著 {{姓名}} 的
 * 通知才會發現。
 *
 * 認不得的變數用「〔變數名〕」而不是留空或亂編一個值：留空會讓句子讀起來
 * 像是通順的，反而看不出那裡本來該有東西。
 */
const SAMPLE_VALUES: Record<string, string> = {
  姓名: '王小明',
  地址: '台北市中正區和平西路一段 12 號 3 樓',
  到期日: '2026/12/31',
  應繳日: '2026/10/05',
  撥款日: '2026/11/15',
  金額: 'NT$12,300',
  維護時間: '2026/10/01 02:00–04:00',
  檔名: '租賃契約書_王小明.pdf',
}

export function sampleValueFor(name: string): string {
  return SAMPLE_VALUES[name] ?? `〔${name}〕`
}

export function sampleValuesFor(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, sampleValueFor(n)]))
}

/* -------------------- 管道標籤的樣式與文字 -------------------- */

export const CHANNEL_LABELS: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

/**
 * pending 代表後端還沒接、實際上沒寄出去，樣式必須跟真的送達明顯不同，
 * 否則管道標籤等於在說謊。
 *
 * 發送紀錄和批次詳情共用這兩個函式，兩頁才不會對同一批資料給出不同說法。
 */
export function channelBadgeClass(stat: ChannelStat): string {
  if (stat.failed > 0) return 'border-destructive/50 bg-destructive/15 text-foreground'
  if (stat.sent === stat.total && stat.total > 0) {
    // 深色下 text-primary 疊在 bg-primary/10 上只有 3.97，小字達不到 4.5。
    // 跟通知中心的來源標籤一樣改成「底色帶色、文字用 foreground」。
    return 'border-transparent bg-primary/15 text-foreground'
  }
  return 'border-dashed border-muted-foreground/40 bg-transparent text-foreground/70'
}

export function channelBadgeText(stat: ChannelStat): string {
  const name = CHANNEL_LABELS[stat.channel]
  if (stat.failed > 0) return `${name} · ${stat.failed} 失敗`
  if (stat.sent === stat.total && stat.total > 0) return `${name} · ${stat.sent} 已送`
  if (stat.pending === stat.total && stat.total > 0) return `${name} · 待接通`
  // 混合狀態：把兩個數字都講出來，不要挑一個代表
  return `${name} · 已送 ${stat.sent}／待送 ${stat.pending}`
}
