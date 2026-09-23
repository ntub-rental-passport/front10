/**
 * 「這封會送給誰」。
 *
 * 原本的發送對話框選完「全部租客」之後，要一路按到二次確認框才看得到人數。
 * 純數字防得了「按錯條件」，防不了「這批人對不對」—— 所以這裡連前幾個人
 * 的名字一起算出來，讓人在轟炸 128 個人之前有機會發現自己選成了房東。
 *
 * ## 兩份名單，同一套規則
 *
 * 立即發送算的是後台那份 localStorage 示範資料；排程發送算的是後端 MySQL
 * 的真實帳號（GET /api/admin/users）。兩邊的欄位長得不一樣，但「誰算租客」
 * 的規則必須一致，否則畫面說 128 人、實際送給 130 人。
 *
 * 所以這個檔案只認一種中間格式（AudienceCandidate），由呼叫端各自轉進來。
 * 規則本身對齊後端的 scheduled_notification_service._default_resolve：
 * 停用帳號不算、admin 不算。
 */

export type AudienceKind = 'all' | 'user' | 'landlord'

export interface AudienceCandidate {
  email: string
  name?: string | null
  /** 這個人的角色。後端是一個陣列，後台示範資料是單一字串，都轉成陣列進來 */
  roles: string[]
  /** 停用的帳號不會收到通知 —— 後端 _default_resolve 濾掉 status != 'active' */
  active: boolean
}

export interface AudienceMember {
  email: string
  /** 有暱稱就用暱稱，沒有就用 email —— 不要顯示成空白 */
  display: string
}

export interface Audience {
  total: number
  /** 前幾位，給畫面展開用 */
  preview: AudienceMember[]
  /** preview 以外還有幾位 */
  rest: number
}

export const AUDIENCE_LABEL: Record<AudienceKind, string> = {
  all: '全部使用者',
  user: '全部租客',
  landlord: '全部房東',
}

/**
 * 管理員永遠不算在廣播對象裡。
 *
 * 不是因為他們不重要，而是因為「全部使用者」在後台的語意一直是
 * 「所有一般使用者」（resolveRecipients 從一開始就先濾掉 admin）。
 * 讓廣播把管理員自己也炸一遍，只會讓人以後不敢按那顆按鈕。
 */
export function matchesAudience(candidate: AudienceCandidate, kind: AudienceKind): boolean {
  if (!candidate.active) return false
  if (candidate.roles.includes('admin')) return false
  if (kind === 'all') return true
  return candidate.roles.includes(kind)
}

export function buildAudience(
  candidates: AudienceCandidate[],
  kind: AudienceKind,
  previewSize = 10,
): Audience {
  const matched = candidates.filter((candidate) => matchesAudience(candidate, kind))
  return {
    total: matched.length,
    preview: matched.slice(0, previewSize).map((candidate) => ({
      email: candidate.email,
      display: candidate.name?.trim() || candidate.email,
    })),
    rest: Math.max(0, matched.length - previewSize),
  }
}

/** 指定使用者：名單就是挑好的那幾個，不套角色規則。 */
export function namedAudience(
  emails: string[],
  nameOf: (email: string) => string | null | undefined,
  previewSize = 10,
): Audience {
  return {
    total: emails.length,
    preview: emails.slice(0, previewSize).map((email) => ({
      email,
      display: nameOf(email)?.trim() || email,
    })),
    rest: Math.max(0, emails.length - previewSize),
  }
}

/**
 * 一行摘要：「全部租客 · 128 人」。
 *
 * 0 人要特別講，因為那代表按下發送什麼都不會發生 ——
 * 顯示「全部房東 · 0 人」總比讓人按了之後一臉茫然好。
 */
export function audienceSummary(audience: Audience, label: string): string {
  return audience.total === 0 ? `${label} · 沒有符合的收件人` : `${label} · ${audience.total} 人`
}

/** 展開時的那一行：「王小明、李小美、⋯ 等 128 人」。 */
export function audiencePreviewText(audience: Audience): string {
  if (audience.total === 0) return ''
  const names = audience.preview.map((member) => member.display).join('、')
  return audience.rest > 0 ? `${names} 等 ${audience.total} 人` : names
}
