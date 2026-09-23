import type { AdminNotifSource, AdminNotification } from '@/src/mocks/admin/admin-notifications'

/**
 * 通知中心的純邏輯。
 *
 * ## 來源徽章為什麼要分輕重
 *
 * 原本三種來源各給一個寫死的 Tailwind 色（red-50／blue-50／violet-50），
 * 有兩個問題：
 *
 * 1. **沒有 dark: 變體** —— 那些底色在深淺色都是 oklch(0.97) 的近白，
 *    深色模式下變成三塊在深紫頁面上發亮的方塊，是整個畫面最搶眼的東西。
 * 2. **三色不分輕重** —— 系統告警要人處理、使用者訊息要人回、內部備註只是
 *    留個紀錄，但畫面上「內部備註」的紫羅蘭跟「系統告警」的紅一樣跳，
 *    甚至「使用者訊息」的藍比告警還亮。
 *
 * 改成依輕重的三階，而且全部用既有 token：
 *
 *     系統告警    destructive 淡底 ＋ 紅字   要人處理
 *     使用者訊息  accent 淡底 ＋ 正常文字    有人在等回覆
 *     內部備註    muted 底 ＋ 灰字           只是紀錄
 *
 * ## 三個都是「淡底帶語意、文字保持可讀」
 *
 * 第一版讓告警用紅底＋紅字。淺色模式實測只有 **4.34** —— 紅底把紅字的對比
 * 又壓低了一截。改成 bg-destructive/5 可以到 4.71，但只剩 0.21 的餘裕，
 * 而這一輪已經被 4.21 / 4.34 / 4.44 / 4.45 這種邊緣值咬過太多次。
 *
 * 所以三個統一：底色帶語意（紅／琥珀／灰）、文字用可讀的前景色。這跟錯誤
 * 訊息方框的處理是同一條原則 —— **容器帶語意、文字保持可讀**。
 *
 * 輕重的差別由底色的濃度與邊框承擔，再加上未讀卡片左側那條色條
 * （NOTIF_SOURCE_ACCENT_CLASS），訊號夠用了。
 *
 * accent 與 destructive 都不拿來當文字色 —— 它們太亮，當文字在淺色底上分別
 * 只有 1.90 與 2.86（見 status-dot.ts）。
 *
 * 「內部備註」也不用 text-muted-foreground：它踩在 bg-muted 上實測只有 4.21，
 * 兩個 muted 本來就沒有足夠的明度差（導覽膠囊踩過同一個坑）。
 */
export const NOTIF_SOURCE_BADGE_CLASS: Record<AdminNotifSource, string> = {
  alert: 'border-destructive/50 bg-destructive/15 text-foreground',
  'user-message': 'border-accent/60 bg-accent/20 text-foreground',
  'admin-note': 'border-border bg-muted text-foreground/70',
}

/** 未讀卡片左側那條色條，與徽章同一套輕重。 */
export const NOTIF_SOURCE_ACCENT_CLASS: Record<AdminNotifSource, string> = {
  alert: 'border-l-destructive-surface',
  'user-message': 'border-l-accent',
  'admin-note': 'border-l-muted-foreground',
}

export type NotifFilter = 'unread' | 'all' | AdminNotifSource

export function matchesNotifFilter(item: AdminNotification, filter: NotifFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unread') return !item.read
  return item.source === filter
}

export interface NotifGroup {
  label: string
  items: AdminNotification[]
}

/**
 * 依日期分組成「今天／昨天／更早」。
 *
 * 清單一長，「這是今天的還是上週的」比一個一個看時間戳快得多 ——
 * 主流的通知中心幾乎都這樣分。
 *
 * 用當地時間的日界線比較，不是「距今 24 小時」：凌晨一點收到的通知屬於
 * 「今天」，不是「昨天」。使用者對日期的直覺是看日曆不是算時數。
 *
 * 空的分組不輸出 —— 一個標題底下沒有東西，只是在告訴你沒事發生。
 */
export function groupNotificationsByDay(
  items: AdminNotification[],
  now: Date = new Date(),
): NotifGroup[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOfDay(now)
  const yesterday = today - 86_400_000

  const buckets: Record<string, AdminNotification[]> = { 今天: [], 昨天: [], 更早: [] }

  for (const item of items) {
    const at = new Date(item.createdAt).getTime()
    // 解析不了的時間放進「更早」，不要讓 NaN 決定它落在哪一組
    if (Number.isNaN(at)) {
      buckets['更早']!.push(item)
      continue
    }
    const day = startOfDay(new Date(at))
    if (day >= today) buckets['今天']!.push(item)
    else if (day >= yesterday) buckets['昨天']!.push(item)
    else buckets['更早']!.push(item)
  }

  return (['今天', '昨天', '更早'] as const)
    .filter((label) => buckets[label]!.length > 0)
    .map((label) => ({ label, items: buckets[label]! }))
}
