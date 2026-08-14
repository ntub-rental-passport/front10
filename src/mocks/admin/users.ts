import { createRandom, daysAgo, intBetween, monthsAgo, weightedPick } from './helpers'

export type AdminUserRole = 'user' | 'landlord' | 'admin'
export type AdminUserStatus = 'active' | 'suspended'
export type AdminRole = 'super' | 'admin'

export interface AdminUser {
  id: string
  email: string
  nickname: string | null
  role: AdminUserRole
  adminRole: AdminRole | null
  status: AdminUserStatus
  emailVerified: boolean
  registeredAt: string
}

/**
 * 固定不變的核心帳號。
 *
 * 其他資料（工單、押金、訂閱）與測試都會指名這幾個 id，所以它們手寫、不由亂數產生。
 */
function coreUsers(): AdminUser[] {
  return [
    { id: 'u-admin-1', email: 'admin@rentmate.tw', nickname: '系統管理員', role: 'admin', adminRole: 'super', status: 'active', emailVerified: true, registeredAt: daysAgo(360) },
    { id: 'u-admin-2', email: 'staff@rentmate.tw', nickname: '陳小管', role: 'admin', adminRole: 'admin', status: 'active', emailVerified: true, registeredAt: daysAgo(348) },
    { id: 'u-landlord-1', email: 'chen.landlord@example.com', nickname: '陳房東', role: 'landlord', adminRole: null, status: 'active', emailVerified: true, registeredAt: daysAgo(320) },
    { id: 'u-landlord-2', email: 'lin.house@example.com', nickname: '林太太', role: 'landlord', adminRole: null, status: 'active', emailVerified: true, registeredAt: daysAgo(295) },
    { id: 'u-tenant-1', email: 'amy.wang@example.com', nickname: '小艾', role: 'user', adminRole: null, status: 'active', emailVerified: true, registeredAt: daysAgo(280) },
    { id: 'u-tenant-2', email: 'ben.liu@example.com', nickname: '阿賓', role: 'user', adminRole: null, status: 'active', emailVerified: true, registeredAt: daysAgo(240) },
    { id: 'u-tenant-3', email: 'cindy.chang@example.com', nickname: null, role: 'user', adminRole: null, status: 'active', emailVerified: false, registeredAt: daysAgo(14) },
    { id: 'u-tenant-4', email: 'derek.wu@example.com', nickname: '小德', role: 'user', adminRole: null, status: 'suspended', emailVerified: true, registeredAt: daysAgo(210) },
    { id: 'u-tenant-5', email: 'elaine.ho@example.com', nickname: '伊蓮', role: 'user', adminRole: null, status: 'active', emailVerified: true, registeredAt: daysAgo(180) },
  ]
}

const SURNAMES = ['王', '林', '張', '李', '陳', '黃', '吳', '蔡', '劉', '楊', '許', '鄭', '謝', '洪', '曾']
const GIVEN_NAMES = [
  '雅婷', '家豪', '怡君', '志豪', '淑芬', '俊傑', '欣怡', '建宏', '美玲', '柏翰',
  '佩珊', '冠廷', '思妤', '宗翰', '瑋婷', '彥廷', '曉薇', '文彬', '筱涵', '承翰',
  '孟儒', '育瑄', '哲瑋', '婉婷', '柏勳', '若涵', '仲翔', '雅雯', '子軒', '宜庭',
]
const EMAIL_STEMS = [
  'yating', 'chiahao', 'yichun', 'chihhao', 'shufen', 'chunchieh', 'hsinyi', 'chienhung',
  'meiling', 'pohan', 'peishan', 'kuanting', 'sszuyu', 'tsunghan', 'weiting', 'yenting',
  'hsiaowei', 'wenpin', 'hsiaohan', 'chenghan', 'mengju', 'yuhsuan', 'chewei', 'wanting',
  'pohsun', 'johan', 'chunghsiang', 'yawen', 'tzuhsuan', 'yiting',
]

/** 每月新註冊人數，由遠到近逐月成長 —— 平台在長大，不是暴衝 */
const MONTHLY_SIGNUPS = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8]

export function seedAdminUsers(): AdminUser[] {
  const random = createRandom(20260814)
  const users = coreUsers()
  let index = 0

  MONTHLY_SIGNUPS.forEach((count, monthIndex) => {
    // monthIndex 0 是 11 個月前，最後一個是本月
    const monthOffset = MONTHLY_SIGNUPS.length - 1 - monthIndex

    for (let n = 0; n < count; n += 1) {
      // 本月只到今天為止，不要產生未來的註冊日
      const maxDay = monthOffset === 0 ? new Date().getDate() : 28
      const dayOfMonth = intBetween(random, 1, maxDay)
      const registeredAt = monthsAgo(monthOffset, dayOfMonth)
      const registeredDaysAgo = Math.floor(
        (Date.now() - new Date(registeredAt).getTime()) / 86400000,
      )
      const stem = EMAIL_STEMS[index % EMAIL_STEMS.length]
      const nickname = `${SURNAMES[index % SURNAMES.length]}${GIVEN_NAMES[index % GIVEN_NAMES.length]}`

      // 房東約佔兩成；停用與未驗證維持少數，才像真實情況
      const role: AdminUserRole = weightedPick(random, { user: 78, landlord: 22 })
      const status: AdminUserStatus = weightedPick(random, { active: 93, suspended: 7 })

      users.push({
        id: `u-gen-${index + 1}`,
        email: `${stem}${index + 1}@example.com`,
        nickname,
        role,
        adminRole: null,
        status,
        // 註冊未滿 3 天的帳號還沒驗證信箱，符合實際節奏
        emailVerified: registeredDaysAgo > 3 ? weightedPick(random, { yes: 92, no: 8 }) === 'yes' : false,
        registeredAt,
      })
      index += 1
    }
  })

  return users
}

/** 供其他 seed 使用：所有房東與租客的 id */
export function landlordIds(users: AdminUser[]): string[] {
  return users.filter((user) => user.role === 'landlord').map((user) => user.id)
}

export function tenantIds(users: AdminUser[]): string[] {
  return users.filter((user) => user.role === 'user').map((user) => user.id)
}
