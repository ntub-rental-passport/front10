import { createRandom, intBetween, weightedPick } from './helpers'
import { seedRentals, type Rental } from './rentals'
import { seedAdminUsers, type AdminUser } from './users'

/**
 * 押金對帳記錄。
 *
 * 平台沒有金流串接，不持有也不撥付押金，能掌握的只有租約雙方各自聲明的金額。
 * 因此這裡不做退還流程的狀態機，只保留兩造聲明並比對是否相符。
 */
export interface DepositRecord {
  id: string
  address: string
  landlordUserId: string
  tenantUserId: string
  monthlyRent: number
  /** 房東聲明已收金額 */
  landlordDeclared: number
  /** 租客聲明已付金額，尚未聲明時為 null */
  tenantDeclared: number | null
}

export function seedDepositRecords(
  users: AdminUser[] = seedAdminUsers(),
  rentals: Rental[] = seedRentals(users),
): DepositRecord[] {
  const random = createRandom(778104)

  // 不是每份租約都完成押金對帳，取約七成
  return rentals
    .filter(() => random() < 0.7)
    .map((rental, index) => {
      // 押金常見是一到兩個月租金
      const months = weightedPick(random, { one: 30, two: 70 }) === 'one' ? 1 : 2
      const landlordDeclared = rental.monthlyRent * months

      const outcome = weightedPick(random, { matched: 66, mismatched: 20, pending: 14 })
      let tenantDeclared: number | null
      if (outcome === 'pending') {
        tenantDeclared = null
      } else if (outcome === 'matched') {
        tenantDeclared = landlordDeclared
      } else {
        // 不符的落差多半是少報一個月或少報幾千元，不會是隨機數字
        tenantDeclared =
          weightedPick(random, { month: 55, partial: 45 }) === 'month'
            ? Math.max(0, landlordDeclared - rental.monthlyRent)
            : Math.max(0, landlordDeclared - intBetween(random, 10, 60) * 100)
      }

      return {
        id: `dr-${index + 1}`,
        address: rental.address,
        landlordUserId: rental.landlordUserId,
        tenantUserId: rental.tenantUserId,
        monthlyRent: rental.monthlyRent,
        landlordDeclared,
        tenantDeclared,
      }
    })
}
