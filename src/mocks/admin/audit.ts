import { daysAgo } from './helpers'

/**
 * 稽核紀錄的動作類型，單一來源。
 *
 * 原本型別是一條 union、稽核頁的篩選選單另外手寫一份清單 —— 兩份各自增減，
 * 結果「通知中心」「報修工單」「租金補貼」都有在寫紀錄，卻篩不出來。
 * 現在篩選選單直接用這份清單。順序就是選單的順序：人、內容、營運、系統。
 */
export const AUDIT_ACTION_TYPES = [
  '登入',
  '使用者管理',
  '權限',
  '內容管理',
  '通知管理',
  '通知中心',
  '報修工單',
  '押金退還',
  '租金補貼',
  '訂閱',
  'AI品質',
  '資料存取',
  '系統設定',
  '系統',
  // 斷線、恢復、後端停機，來自後端的監控事件（見 admin-audit-sources.ts）
  '服務狀態',
] as const

export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number]

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: AuditActionType
  target: string
  detail: string
}

export function seedAuditEvents(): AuditEvent[] {
  return [
    { id: 'ev-1', at: daysAgo(0, 8), actor: 'admin@rentmate.tw', action: '登入', target: 'admin@rentmate.tw', detail: '管理員登入後台' },
    { id: 'ev-2', at: daysAgo(1, 17), actor: 'system', action: '系統', target: '點交照片批次', detail: 'TTL 到期，自動刪除 3 筆退租滿一年的點交照片' },
    { id: 'ev-3', at: daysAgo(1, 15), actor: 'admin@rentmate.tw', action: 'AI品質', target: '契約分析 #A188', detail: '低分產出人工複核：條款頁碼辨識錯誤，已回報調整提示詞' },
    { id: 'ev-4', at: daysAgo(1, 10), actor: 'amy.wang@example.com', action: '資料存取', target: '契約分析報告 #A102', detail: '使用者下載自己的契約分析 PDF' },
    { id: 'ev-5', at: daysAgo(2, 14), actor: 'admin@rentmate.tw', action: '內容管理', target: '常見問題－押金退還爭議', detail: '更新條目（v4）' },
    { id: 'ev-6', at: daysAgo(2, 9), actor: 'system', action: '訂閱', target: 'chen.landlord@example.com', detail: '訂閱將於 7 日內到期，已寄送提醒' },
    { id: 'ev-7', at: daysAgo(3, 13), actor: 'admin@rentmate.tw', action: '使用者管理', target: 'derek.wu@example.com', detail: '停用帳號：多次發布不當內容' },
    { id: 'ev-8', at: daysAgo(4, 11), actor: 'ben.liu@example.com', action: '登入', target: 'ben.liu@example.com', detail: '使用者登入' },
  ]
}

/**
 * 種子資料的 id。稽核頁要把它們標成「展示資料」—— 這 8 筆從來沒發生過，
 * 例如「derek.wu 被停用」，不標的話看起來跟真的操作一模一樣。
 *
 * 用 id 認得出來：logAction 產生的 id 是 `ev-<時間>-<亂數>`，不會跟 `ev-1` 撞。
 */
export const SEED_AUDIT_EVENT_IDS: ReadonlySet<string> = new Set(seedAuditEvents().map((event) => event.id))
