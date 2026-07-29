import { daysAgo } from './helpers'

export type NotifChannel = 'inapp' | 'email' | 'push'
export type NotifCategory = '系統' | '租約' | '補貼' | '帳務'

export interface NotifTemplate {
  id: string
  name: string
  category: NotifCategory
  channels: NotifChannel[]
  title: string
  body: string
  enabled: boolean
  updatedAt: string
}

export interface UserNotification {
  id: string
  userEmail: string
  title: string
  body: string
  category: NotifCategory
  channels: NotifChannel[]
  createdAt: string
  read: boolean
}

export function seedNotifTemplates(): NotifTemplate[] {
  return [
    {
      id: 'nt-1',
      name: '租約到期提醒',
      category: '租約',
      channels: ['inapp', 'email'],
      title: '您的租約將於 {{到期日}} 到期',
      body: '{{姓名}} 您好，您位於 {{地址}} 的租約即將於 {{到期日}} 到期，請儘早與房東確認續約意願。',
      enabled: true,
      updatedAt: daysAgo(3),
    },
    {
      id: 'nt-2',
      name: '補貼審核通過',
      category: '補貼',
      channels: ['inapp', 'push'],
      title: '租金補貼審核通過',
      body: '{{姓名}} 您好，您申請的租金補貼已審核通過，每月核定金額為 {{金額}} 元，將於 {{撥款日}} 起撥款。',
      enabled: true,
      updatedAt: daysAgo(7),
    },
    {
      id: 'nt-3',
      name: '帳單待繳提醒',
      category: '帳務',
      channels: ['inapp', 'email', 'push'],
      title: '本期帳單 {{金額}} 元待繳',
      body: '您的本期帳單金額為 {{金額}} 元，應繳日為 {{應繳日}}，逾期將產生滯納金。',
      enabled: true,
      updatedAt: daysAgo(1),
    },
    {
      id: 'nt-4',
      name: '系統維護預告',
      category: '系統',
      channels: ['inapp'],
      title: '系統維護預告',
      body: '本平台將於 {{維護時間}} 進行系統維護，屆時暫停服務，造成不便敬請見諒。',
      enabled: true,
      updatedAt: daysAgo(5),
    },
    {
      id: 'nt-5',
      name: '合約分析完成',
      category: '系統',
      channels: ['inapp'],
      title: '合約分析完成',
      body: '您上傳的「{{檔名}}」已完成 AI 分析，可至合約專區查看結果。',
      enabled: false,
      updatedAt: daysAgo(20),
    },
  ]
}

export function seedUserNotifications(): UserNotification[] {
  return [
    {
      id: 'nm-1',
      userEmail: 'amy.wang@example.com',
      title: '本期帳單 12,400 元待繳',
      body: '您的本期帳單金額為 12,400 元，應繳日為 2026/08/10，逾期將產生滯納金。',
      category: '帳務',
      channels: ['inapp', 'email', 'push'],
      createdAt: daysAgo(1),
      read: false,
    },
    {
      id: 'nm-2',
      userEmail: 'amy.wang@example.com',
      title: '租金補貼審核通過',
      body: '小艾 您好，您申請的租金補貼已審核通過，每月核定金額為 3,200 元，將於 2026/08/15 起撥款。',
      category: '補貼',
      channels: ['inapp', 'push'],
      createdAt: daysAgo(4),
      read: false,
    },
    {
      id: 'nm-3',
      userEmail: 'amy.wang@example.com',
      title: '您的租約將於 2026/12/31 到期',
      body: '小艾 您好，您位於 台北市中正區杭州南路一段 88 號 6 樓 的租約即將於 2026/12/31 到期，請儘早與房東確認續約意願。',
      category: '租約',
      channels: ['inapp', 'email'],
      createdAt: daysAgo(12),
      read: true,
    },
    {
      id: 'nm-4',
      userEmail: 'amy.wang@example.com',
      title: '合約分析完成',
      body: '您上傳的「租賃契約_中正區.pdf」已完成 AI 分析，可至合約專區查看結果。',
      category: '系統',
      channels: ['inapp'],
      createdAt: daysAgo(25),
      read: true,
    },
  ]
}
