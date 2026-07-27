export interface SystemSettings {
  siteName: string
  supportEmail: string
  maintenanceMode: boolean
  maintenanceMessage: string
  pageSize: number
  maxUploadMb: number
  defaultAiQuota: number
}

export function seedSettings(): SystemSettings {
  return {
    siteName: 'RentMate 租隊友',
    supportEmail: 'support@rentmate.tw',
    maintenanceMode: false,
    maintenanceMessage: '系統維護中，預計 30 分鐘後恢復，造成不便敬請見諒。',
    pageSize: 20,
    maxUploadMb: 10,
    defaultAiQuota: 3,
  }
}
