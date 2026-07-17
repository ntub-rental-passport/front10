import type { AuthRole } from '@/src/composables/useAuth'

export type AuthIdentity = 'tenant' | 'landlord'

export interface AuthIdentityOption {
  value: AuthIdentity
  label: string
  description: string
  helper: string
  authRole: AuthRole
  loginFooterNote: string
  registerFooterNote: string
  registerButtonLabel: string
}

export const authIdentityOptions: AuthIdentityOption[] = [
  {
    value: 'tenant',
    label: '租客登入',
    description: '管理我的租約與付款',
    helper: '適合查看租約、付款紀錄與租屋服務。',
    authRole: 'tenant',
    loginFooterNote: '登入後將進入租客專屬工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 帳號並進入租客工作區。',
    registerButtonLabel: '以租客身分建立帳號',
  },
  {
    value: 'landlord',
    label: '房東登入',
    description: '管理我的物件與租客',
    helper: '適合管理房源、租客與營運資訊。',
    authRole: 'landlord',
    loginFooterNote: '登入後將進入房東專屬管理工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 帳號並進入房東管理工作區。',
    registerButtonLabel: '以房東身分建立帳號',
  },
]

export function getAuthIdentity(value: unknown): AuthIdentity {
  return value === 'landlord' ? 'landlord' : 'tenant'
}
