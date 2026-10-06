export interface AdminNavItem {
  label: string
  /**
   * 導覽列上的簡短寫法。沒有就用 label。
   *
   * 頂部列是一整排膠囊，四個字的「後台總覽」會把它撐開；但抽屜、麵包屑
   * 這些有空間的地方仍該顯示完整名稱。分成兩個欄位，是為了讓兩邊都從
   * 這一份資料取值 —— 畫面上寫死簡稱的話，哪天有人改了 label，
   * 膠囊還是會顯示舊的，而且不會有任何東西報錯。
   */
  shortLabel?: string
  path: string
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: '營運管理',
    items: [
      { label: '後台總覽', shortLabel: '總覽', path: '/admin' },
      { label: '使用者管理', path: '/admin/users' },
      { label: '報修工單', path: '/admin/maintenance-tickets' },
    ],
  },
  {
    label: '內容與通知',
    items: [
      { label: '內容管理', path: '/admin/content' },
      { label: '通知管理', path: '/admin/notifications' },
      { label: '通知中心', path: '/admin/notification-center' },
    ],
  },
  {
    label: '系統',
    items: [
      { label: '系統監控', path: '/admin/monitoring' },
      { label: '稽核紀錄', path: '/admin/audit' },
      { label: '系統設定', path: '/admin/settings' },
    ],
  },
]
