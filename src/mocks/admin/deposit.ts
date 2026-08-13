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

export function seedDepositRecords(): DepositRecord[] {
  return [
    // 相符
    {
      id: 'dr-1',
      address: '台北市萬華區西寧南路 60 號 4 樓',
      landlordUserId: 'u-landlord-1',
      tenantUserId: 'u-tenant-1',
      monthlyRent: 15000,
      landlordDeclared: 30000,
      tenantDeclared: 30000,
    },
    {
      id: 'dr-2',
      address: '新北市永和區永和路二段 88 號 5 樓',
      landlordUserId: 'u-landlord-1',
      tenantUserId: 'u-tenant-2',
      monthlyRent: 12000,
      landlordDeclared: 24000,
      tenantDeclared: 24000,
    },

    // 不符：房東聲明比租客多 10000
    {
      id: 'dr-3',
      address: '台中市北屯區崇德路二段 168 號 7 樓',
      landlordUserId: 'u-landlord-2',
      tenantUserId: 'u-tenant-3',
      monthlyRent: 10000,
      landlordDeclared: 30000,
      tenantDeclared: 20000,
    },

    {
      id: 'dr-4',
      address: '高雄市苓雅區四維三路 12 號 8 樓',
      landlordUserId: 'u-landlord-2',
      tenantUserId: 'u-tenant-4',
      monthlyRent: 13000,
      landlordDeclared: 26000,
      tenantDeclared: 26000,
    },

    // 不符：租客只認一個月
    {
      id: 'dr-5',
      address: '台南市東區林森路一段 90 號 3 樓',
      landlordUserId: 'u-landlord-1',
      tenantUserId: 'u-tenant-5',
      monthlyRent: 9000,
      landlordDeclared: 18000,
      tenantDeclared: 9000,
    },

    {
      id: 'dr-6',
      address: '桃園市中壢區環中東路 55 號 6 樓',
      landlordUserId: 'u-landlord-2',
      tenantUserId: 'u-tenant-1',
      monthlyRent: 11000,
      landlordDeclared: 22000,
      tenantDeclared: 22000,
    },

    // 不符：租客尚未聲明
    {
      id: 'dr-7',
      address: '新竹市東區光復路二段 101 號 9 樓',
      landlordUserId: 'u-landlord-1',
      tenantUserId: 'u-tenant-3',
      monthlyRent: 14000,
      landlordDeclared: 28000,
      tenantDeclared: null,
    },

    {
      id: 'dr-8',
      address: '台北市松山區八德路四段 200 號 11 樓',
      landlordUserId: 'u-landlord-2',
      tenantUserId: 'u-tenant-5',
      monthlyRent: 16000,
      landlordDeclared: 32000,
      tenantDeclared: 32000,
    },
  ]
}
