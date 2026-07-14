import type { AuthRole } from '@/src/composables/useAuth'

export type AuthIdentity = 'tenant' | 'landlord' | 'admin'

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
    authRole: 'user',
    loginFooterNote: '登入後將進入租客專屬工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 帳號並進入租客工作區。',
    registerButtonLabel: '以租客身分建立帳號',
  },
  {
    value: 'landlord',
    label: '房東登入',
    description: '管理我的物件與租客',
    helper: '房東專屬工作區建置中，目前登入後會先進入一般工作區。',
    authRole: 'landlord',
    loginFooterNote: '房東專屬工作區建置中，登入後將先進入一般工作區。',
    registerFooterNote: '註冊後將建立你的 RentMate 房東帳號。',
    registerButtonLabel: '以房東身分建立帳號',
  },
  {
    value: 'admin',
    label: '管理員登入',
    description: '平台營運與後台管理',
    helper: '適合平台營運人員：使用者管理、內容審核與系統監控。',
    authRole: 'admin',
    loginFooterNote: '登入後將進入系統管理員後台。',
    registerFooterNote: '管理員帳號不開放註冊。',
    registerButtonLabel: '不開放註冊',
  },
]

export const registerIdentityOptions: AuthIdentityOption[] = authIdentityOptions.filter(
  (option) => option.value !== 'admin',
)

export function getAuthIdentity(value: unknown): AuthIdentity {
  if (value === 'landlord') return 'landlord'
  if (value === 'admin') return 'admin'
  return 'tenant'
}
