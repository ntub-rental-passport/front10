import { createRandom, intBetween, pick } from './helpers'
import { landlordIds, seedAdminUsers, tenantIds, type AdminUser } from './users'

/**
 * 租賃關係。
 *
 * 工單與押金都掛在「哪個租客租哪個房東的哪個地址」上，
 * 所以先把關係算出來，兩份假資料才會彼此對得起來 ——
 * 同一個地址的工單與押金會指向同一組房東與租客。
 */
export interface Rental {
  address: string
  landlordUserId: string
  tenantUserId: string
  monthlyRent: number
}

const CITIES = [
  { city: '台北市', districts: ['大安區', '中山區', '信義區', '士林區', '內湖區', '文山區', '萬華區', '松山區'] },
  { city: '新北市', districts: ['板橋區', '三重區', '中和區', '新莊區', '永和區', '淡水區', '新店區'] },
  { city: '台中市', districts: ['西屯區', '北屯區', '南屯區', '北區', '西區'] },
  { city: '高雄市', districts: ['三民區', '左營區', '鳳山區', '苓雅區'] },
  { city: '台南市', districts: ['東區', '北區', '安平區', '中西區'] },
  { city: '桃園市', districts: ['桃園區', '中壢區', '八德區'] },
  { city: '新竹市', districts: ['東區', '北區'] },
]

const ROADS = [
  '中正路', '中山路', '民生路', '光復路', '文化路', '成功路', '復興路', '信義路',
  '忠孝路', '和平路', '建國路', '南京路', '長安路', '博愛路', '自由路',
]

const SECTIONS = ['一段', '二段', '三段', '四段', '']

function makeAddress(random: () => number): string {
  const area = pick(random, CITIES)
  const district = pick(random, area.districts)
  const road = pick(random, ROADS)
  const section = pick(random, SECTIONS)
  const number = intBetween(random, 3, 320)
  const floor = intBetween(random, 2, 15)
  return `${area.city}${district}${road}${section} ${number} 號 ${floor} 樓`
}

/**
 * 每個租客配一個房東與一個地址。
 *
 * 房東遠少於租客，所以一個房東名下會有多個物件 —— 這也讓房東的詳情頁有東西可看。
 */
export function seedRentals(users: AdminUser[] = seedAdminUsers()): Rental[] {
  const random = createRandom(915237)
  const landlords = landlordIds(users)
  const tenants = tenantIds(users)

  return tenants.map((tenantUserId, index) => ({
    address: makeAddress(random),
    landlordUserId: landlords[index % landlords.length],
    tenantUserId,
    // 常見的月租區間，抓 8000–32000 並取整到百位
    monthlyRent: intBetween(random, 80, 320) * 100,
  }))
}
