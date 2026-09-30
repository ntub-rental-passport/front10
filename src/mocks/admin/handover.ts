import { createRandom, daysAgo, intBetween, pick, weightedPick } from './helpers'
import { seedRentals, type Rental } from './rentals'
import { seedAdminUsers, type AdminUser } from './users'
import type { HandoverItem, HandoverResult, MissingPhoto } from '@/src/utils/admin-handover'

/**
 * 展示帳號的點交存證，形狀跟真實帳號從後端讀到的一樣（backend/admin/user_records.py）：
 * 每個品項一個 AI 比對結果，不含照片。真實帳號不用這份資料。
 */
export interface HandoverRecord {
  id: string
  address: string
  landlordUserId: string
  tenantUserId: string
  /** 最後一次拍照或比對的時間 */
  updatedAt: string
  items: HandoverItem[]
}

const ROOM_ITEMS: { room: string; names: string[] }[] = [
  { room: '客廳', names: ['冷氣', '沙發', '燈具', '窗簾'] },
  { room: '臥室', names: ['衣櫃', '床架', '書桌', '冷氣'] },
  { room: '廚房', names: ['流理臺', '抽油煙機', '瓦斯爐'] },
  { room: '浴室', names: ['熱水器', '馬桶', '洗手臺', '排風扇'] },
  { room: '陽台', names: ['洗衣機', '曬衣架'] },
]

const SUMMARIES: Record<HandoverResult, string[]> = {
  unchanged: ['入住與退租照片看起來狀態相同。', '沒有看到明顯差異。'],
  degraded: ['表面有輕微使用痕跡，屬一般磨損。', '顏色略為褪色，沒有破損。'],
  new_damage: ['退租照片可見入住時沒有的刮痕。', '邊角有新的缺損。'],
  missing: ['退租照片中找不到這件物品。'],
  uncertain: ['兩張照片的角度不同，無法確定是否有差異。', '退租照片太暗，看不清楚細節。'],
}

function demoItem(random: () => number, id: string, room: string, name: string): HandoverItem {
  // 多數品項比對過而且沒事；少數還沒比對（多半是還沒拍退租照）
  if (random() < 0.08) {
    const missingPhoto = weightedPick<'checkout' | 'baseline' | 'ready'>(random, {
      checkout: 70,
      baseline: 10,
      ready: 20,
    })
    return {
      id,
      room,
      name,
      result: null,
      summary: null,
      confidence: null,
      missingPhoto: missingPhoto === 'ready' ? null : (missingPhoto as MissingPhoto),
    }
  }
  const result = weightedPick<HandoverResult>(random, {
    unchanged: 70,
    degraded: 14,
    new_damage: 9,
    missing: 2,
    uncertain: 5,
  })
  return {
    id,
    room,
    name,
    result,
    summary: pick(random, SUMMARIES[result]),
    confidence: intBetween(random, 60, 95) / 100,
    missingPhoto: null,
  }
}

export function seedHandoverRecords(
  users: AdminUser[] = seedAdminUsers(),
  rentals: Rental[] = seedRentals(users),
): HandoverRecord[] {
  const random = createRandom(613477)

  // 只有已退租的租約才會點交，這裡取約三成
  return rentals
    .filter(() => random() < 0.3)
    .map((rental, index) => {
      const rooms = ROOM_ITEMS.filter(() => random() < 0.75)
      const items: HandoverItem[] = []

      for (const group of rooms.length > 0 ? rooms : [ROOM_ITEMS[0]]) {
        const names = group.names.filter(() => random() < 0.7)
        for (const name of names.length > 0 ? names : [group.names[0]]) {
          items.push(demoItem(random, `hi-${index + 1}-${items.length + 1}`, group.room, name))
        }
      }

      return {
        id: `hr-${index + 1}`,
        address: rental.address,
        landlordUserId: rental.landlordUserId,
        tenantUserId: rental.tenantUserId,
        updatedAt: daysAgo(intBetween(random, 3, 120)),
        items,
      }
    })
}

/** 供其他 seed 需要時取一個房間名稱 */
export function pickRoom(random: () => number): string {
  return pick(random, ROOM_ITEMS).room
}
