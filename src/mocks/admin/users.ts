import { daysAgo } from './helpers'

export type AdminUserRole = 'user' | 'landlord' | 'admin'
export type AdminUserStatus = 'active' | 'suspended'

export interface AdminUser {
  id: string
  email: string
  nickname: string | null
  role: AdminUserRole
  status: AdminUserStatus
  emailVerified: boolean
  registeredAt: string
}

export function seedAdminUsers(): AdminUser[] {
  return [
    { id: 'u-admin-1', email: 'admin@rentmate.tw', nickname: '系統管理員', role: 'admin', status: 'active', emailVerified: true, registeredAt: daysAgo(180) },
    { id: 'u-landlord-1', email: 'chen.landlord@example.com', nickname: '陳房東', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(120) },
    { id: 'u-landlord-2', email: 'lin.house@example.com', nickname: '林太太', role: 'landlord', status: 'active', emailVerified: true, registeredAt: daysAgo(75) },
    { id: 'u-tenant-1', email: 'amy.wang@example.com', nickname: '小艾', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(90) },
    { id: 'u-tenant-2', email: 'ben.liu@example.com', nickname: '阿賓', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(60) },
    { id: 'u-tenant-3', email: 'cindy.chang@example.com', nickname: null, role: 'user', status: 'active', emailVerified: false, registeredAt: daysAgo(14) },
    { id: 'u-tenant-4', email: 'derek.wu@example.com', nickname: '小德', role: 'user', status: 'suspended', emailVerified: true, registeredAt: daysAgo(200) },
    { id: 'u-tenant-5', email: 'elaine.ho@example.com', nickname: '伊蓮', role: 'user', status: 'active', emailVerified: true, registeredAt: daysAgo(30) },
  ]
}
