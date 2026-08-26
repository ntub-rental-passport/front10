import { createRandom, daysAgo, intBetween, pick, weightedPick } from './helpers'
import { seedRentals, type Rental } from './rentals'
import { seedAdminUsers, type AdminUser } from './users'
import type { HandoverVerdict } from '@/src/utils/admin-handover'

/**
 * 點交存證的雙方判定。
 *
 * 不存照片：照片在使用者自己的瀏覽器裡，後台讀不到，放佔位圖只是假裝有。
 * 也不存 AI 判定：那個在使用者端本來就是假的，當第三方意見會誤導管理員。
 */
export interface HandoverItem {
  id: string
  room: string
  name: string
  landlordVerdict: HandoverVerdict
  /** 租客尚未確認時為 null */
  tenantVerdict: HandoverVerdict | null
}

export interface HandoverRecord {
  id: string
  address: string
  landlordUserId: string
  tenantUserId: string
  /** 退租點交的日期 */
  inspectedAt: string
  items: HandoverItem[]
}

const ROOM_ITEMS: { room: string; names: string[] }[] = [
  { room: '客廳', names: ['冷氣', '沙發', '燈具', '窗簾'] },
  { room: '臥室', names: ['衣櫃', '床架', '書桌', '冷氣'] },
  { room: '廚房', names: ['流理臺', '抽油煙機', '瓦斯爐'] },
  { room: '浴室', names: ['熱水器', '馬桶', '洗手臺', '排風扇'] },
  { room: '陽台', names: ['洗衣機', '曬衣架'] },
]

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
          // 多數品項雙方都認為完好；少數房東認為有損壞，租客未必同意
          const landlordVerdict = weightedPick<HandoverVerdict>(random, {
            intact: 74,
            damaged: 26,
          })
          const tenantVerdict =
            random() < 0.12
              ? null
              : landlordVerdict === 'damaged' && random() < 0.45
                ? 'intact'
                : landlordVerdict

          items.push({
            id: `hi-${index + 1}-${items.length + 1}`,
            room: group.room,
            name,
            landlordVerdict,
            tenantVerdict,
          })
        }
      }

      return {
        id: `hr-${index + 1}`,
        address: rental.address,
        landlordUserId: rental.landlordUserId,
        tenantUserId: rental.tenantUserId,
        inspectedAt: daysAgo(intBetween(random, 3, 120)),
        items,
      }
    })
}

/** 供其他 seed 需要時取一個房間名稱 */
export function pickRoom(random: () => number): string {
  return pick(random, ROOM_ITEMS).room
}
