import { createRandom, daysAgo, intBetween, pick, weightedPick } from './helpers'
import { seedRentals, type Rental } from './rentals'
import { seedAdminUsers, type AdminUser } from './users'
import type { MaintenanceCategory, MaintenanceStatus } from '@/src/utils/admin-maintenance'

export interface MaintenanceEvent {
  at: string
  actor: string
  from: MaintenanceStatus | null
  to: MaintenanceStatus
  note: string
}

export interface MaintenanceTicket {
  id: string
  address: string
  tenantUserId: string
  landlordUserId: string
  category: MaintenanceCategory
  description: string
  status: MaintenanceStatus
  createdAt: string
  notifiedAt: string | null
  firstResponseAt: string | null
  completedAt: string | null
  timeline: MaintenanceEvent[]
  adminNote: string
  /** 租客或房東主動要求平台介入，不是管理員自己判斷的 */
  interventionRequested: boolean
  /** 管理員手動把工單拉進待處理佇列，用於分流以外的個別情況 */
  manuallyQueued: boolean
}

const DESCRIPTIONS: Record<MaintenanceCategory, string[]> = {
  leak: [
    '浴室天花板滲水，牆角出現黃色水漬且面積持續擴大',
    '陽台外牆滲水，下雨天室內地板會積水',
    '廚房水槽下方管線滲漏，櫃體已經發霉',
  ],
  appliance: [
    '冷氣室內機不斷滴水，牆面已經濕透',
    '熱水器點不著火，洗澡只有冷水',
    '洗衣機脫水時劇烈晃動並發出撞擊聲',
  ],
  lock: [
    '大門電子鎖電池更換後仍無法感應',
    '房門鎖芯卡死，鑰匙轉不動',
    '陽台落地窗鎖扣鬆脫，關不緊',
  ],
  pipe: [
    '浴室排水孔堵塞，積水退得很慢',
    '馬桶沖水後回堵，有異味',
    '廚房排水管有回流的水聲與臭味',
  ],
  other: [
    '客廳插座沒電，跳電後無法復歸',
    '公共樓梯間燈具不亮，夜間昏暗',
    '窗戶紗窗破損，蚊蟲跑進室內',
  ],
}

/** 依案齡決定狀態分布：新案卡在前段，舊案多半已收尾 */
function statusForAge(random: () => number, ageDays: number): MaintenanceStatus {
  if (ageDays <= 2) return weightedPick(random, { submitted: 70, notified: 30 })
  if (ageDays <= 6) return weightedPick(random, { notified: 45, in_progress: 45, submitted: 10 })
  if (ageDays <= 14) {
    return weightedPick(random, { in_progress: 45, overdue: 20, disputed: 10, completed: 25 })
  }
  if (ageDays <= 30) {
    return weightedPick(random, { completed: 45, closed: 25, overdue: 15, disputed: 15 })
  }
  return weightedPick(random, { closed: 70, completed: 25, disputed: 5 })
}

/** 狀態機的實際路徑，讓 timeline 與 status 一致 */
const PATH_TO: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  submitted: [],
  notified: ['notified'],
  in_progress: ['notified', 'in_progress'],
  overdue: ['notified', 'overdue'],
  disputed: ['notified', 'in_progress', 'disputed'],
  completed: ['notified', 'in_progress', 'completed'],
  closed: ['notified', 'in_progress', 'completed', 'closed'],
}

const STEP_NOTES: Record<MaintenanceStatus, string> = {
  submitted: '租客送出報修申請',
  notified: '系統通報房東',
  in_progress: '房東回覆已安排師傅',
  overdue: '逾期未獲房東回應，系統自動標記',
  disputed: '雙方對責任歸屬有爭議，轉由管理員介入',
  completed: '維修完成，租客確認',
  closed: '案件結案',
}

/**
 * 近 90 天的工單，越近期越密集 —— 與使用者成長同步，平台變大工單自然變多。
 */
const WEEKLY_VOLUME = [3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export function seedMaintenanceTickets(
  users: AdminUser[] = seedAdminUsers(),
  rentals: Rental[] = seedRentals(users),
): MaintenanceTicket[] {
  const random = createRandom(447019)
  const nameOf = new Map(users.map((user) => [user.id, user.nickname ?? user.email]))
  const tickets: MaintenanceTicket[] = []
  const categories = Object.keys(DESCRIPTIONS) as MaintenanceCategory[]
  let index = 0

  WEEKLY_VOLUME.forEach((count, weekIndex) => {
    // weekIndex 0 是最舊的一週
    const weeksAgo = WEEKLY_VOLUME.length - 1 - weekIndex

    for (let n = 0; n < count; n += 1) {
      const ageDays = weeksAgo * 7 + intBetween(random, 0, 6)
      const rental = pick(random, rentals)
      const category = pick(random, categories)
      const status = statusForAge(random, ageDays)
      const tenantName = nameOf.get(rental.tenantUserId) ?? rental.tenantUserId

      // 沿著狀態機把時間軸鋪出來，每步之間間隔 1–3 天且不超過今天
      const steps = PATH_TO[status]
      const timeline: MaintenanceEvent[] = [
        { at: daysAgo(ageDays), actor: tenantName, from: null, to: 'submitted', note: STEP_NOTES.submitted },
      ]
      let cursor = ageDays
      let previous: MaintenanceStatus = 'submitted'
      for (const step of steps) {
        cursor = Math.max(0, cursor - intBetween(random, 1, 3))
        timeline.push({
          at: daysAgo(cursor),
          actor: step === 'overdue' ? 'system' : 'admin',
          from: previous,
          to: step,
          note: STEP_NOTES[step],
        })
        previous = step
      }

      const atOf = (target: MaintenanceStatus): string | null =>
        timeline.find((event) => event.to === target)?.at ?? null

      // 少數案件租客或房東會主動要求平台介入，跟案齡、狀態無關，
      // 用低機率骰一次即可讓佇列在畫面上散落在不同狀態，而不是全部塞在 disputed。
      const interventionRequested = status !== 'closed' && random() < 0.04

      index += 1
      tickets.push({
        id: `mt-${index}`,
        address: rental.address,
        tenantUserId: rental.tenantUserId,
        landlordUserId: rental.landlordUserId,
        category,
        description: pick(random, DESCRIPTIONS[category]),
        status,
        createdAt: daysAgo(ageDays),
        notifiedAt: atOf('notified'),
        firstResponseAt: atOf('in_progress'),
        completedAt: atOf('completed'),
        timeline,
        adminNote: '',
        interventionRequested,
        manuallyQueued: false,
      })
    }
  })

  return tickets
}
