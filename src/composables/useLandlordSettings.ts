import { computed, reactive } from 'vue'
import { getAuthSession } from '@/src/composables/useAuth'

export type LandlordMemberRole = 'manager' | 'accounting' | 'viewer'

export interface LandlordMember {
  id: string
  email: string
  name: string
  role: LandlordMemberRole
  status: 'active' | 'pending'
  joinedAt: string
}

export interface LandlordAuditEvent {
  id: string
  at: string
  category: string
  title: string
  detail: string
  result: 'success' | 'warning'
}

export interface LandlordSettingsState {
  displayName: string
  phone: string
  workspaceName: string
  lineBound: boolean
  emailNotifications: boolean
  rentReminders: boolean
  contractReminders: boolean
  repairNotifications: boolean
  reminderDays: number
  members: LandlordMember[]
  audit: LandlordAuditEvent[]
}

const STORAGE_KEY = 'rentmate-landlord-settings-v1'

function storageKey(): string {
  return `${STORAGE_KEY}:${getAuthSession()?.email.trim().toLowerCase() || 'anonymous'}`
}

function defaultState(): LandlordSettingsState {
  const session = getAuthSession()
  const name = session?.nickname?.trim() || session?.email.split('@')[0] || '房東'
  return {
    displayName: name,
    phone: '',
    workspaceName: `${name}的房東工作區`,
    lineBound: false,
    emailNotifications: true,
    rentReminders: true,
    contractReminders: true,
    repairNotifications: true,
    reminderDays: 30,
    members: [],
    audit: [
      {
        id: 'workspace-created',
        at: new Date().toISOString(),
        category: '帳戶',
        title: '建立房東工作區',
        detail: '工作區已建立並完成基本初始化。',
        result: 'success',
      },
    ],
  }
}

function readState(): LandlordSettingsState {
  const fallback = defaultState()
  if (typeof window === 'undefined') return fallback
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey()) || '{}')
    return {
      ...fallback,
      ...stored,
      members: Array.isArray(stored.members) ? stored.members : fallback.members,
      audit: Array.isArray(stored.audit) ? stored.audit : fallback.audit,
    }
  } catch {
    return fallback
  }
}

const state = reactive<LandlordSettingsState>(readState())

function persist(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(), JSON.stringify(state))
  }
}

function log(category: string, title: string, detail: string, result: 'success' | 'warning' = 'success') {
  state.audit.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    category,
    title,
    detail,
    result,
  })
  state.audit = state.audit.slice(0, 100)
  persist()
}

export function useLandlordSettings() {
  const session = getAuthSession()
  const completeness = computed(() => {
    const checks = [state.displayName, session?.email, state.phone, state.workspaceName]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  })

  function saveProfile(payload: Pick<LandlordSettingsState, 'displayName' | 'phone' | 'workspaceName'>) {
    state.displayName = payload.displayName.trim()
    state.phone = payload.phone.trim()
    state.workspaceName = payload.workspaceName.trim()
    persist()
    log('帳戶', '更新帳號資料', '顯示名稱、聯絡手機或工作區名稱已更新。')
  }

  function saveNotifications(payload: Pick<LandlordSettingsState, 'emailNotifications' | 'rentReminders' | 'contractReminders' | 'repairNotifications' | 'reminderDays'>) {
    Object.assign(state, payload)
    persist()
    log('通知', '更新通知偏好', `合約到期提醒設定為提前 ${payload.reminderDays} 天。`)
  }

  function inviteMember(email: string, role: LandlordMemberRole) {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || state.members.some((member) => member.email === cleanEmail)) return false
    state.members.push({
      id: `${Date.now()}`,
      email: cleanEmail,
      name: cleanEmail.split('@')[0] || cleanEmail,
      role,
      status: 'pending',
      joinedAt: new Date().toISOString(),
    })
    persist()
    log('團隊', '發送成員邀請', `已邀請 ${cleanEmail} 加入工作區。`)
    return true
  }

  function removeMember(id: string) {
    const member = state.members.find((item) => item.id === id)
    state.members = state.members.filter((item) => item.id !== id)
    persist()
    if (member) log('團隊', '移除成員', `${member.email} 已從工作區移除。`, 'warning')
  }

  function toggleLine() {
    state.lineBound = !state.lineBound
    persist()
    log('通知', state.lineBound ? '完成 LINE 綁定' : '解除 LINE 綁定', state.lineBound ? 'LINE 通知已啟用。' : 'LINE 通知已停用。')
  }

  return {
    state,
    session,
    completeness,
    saveProfile,
    saveNotifications,
    inviteMember,
    removeMember,
    toggleLine,
    log,
  }
}
