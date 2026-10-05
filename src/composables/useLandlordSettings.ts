import { computed, reactive } from 'vue'
import { getAuthSession } from '@/src/composables/useAuth'
import {
  LANDLORD_WORKSPACE_CHANGED_EVENT,
  activeWorkspaceOwnerId,
} from '@/src/services/landlordApiClient'
import {
  changeTeamRole,
  fetchAudit,
  fetchLandlordSettings,
  fetchTeam,
  inviteTeamMember,
  removeTeamMember,
  saveLandlordNotifications,
  saveLandlordProfile,
  type AuditEvent,
  type MemberRole,
  type TeamMember,
} from '@/src/services/landlordWorkspaceApi'

/**
 * 房東設定、操作紀錄與團隊成員：全部存在後端（/api/landlord/settings、/audit、/team）。
 *
 * 以前存在 localStorage，而且 state 只在模組載入時讀一次：換帳號登入會把前一個
 * 帳號的設定寫進下一個帳號。現在依「帳號 + 工作區」快取，切換時重新讀取；
 * 操作紀錄由伺服器在動作成功後寫入，這裡只讀不寫。
 */

export type LandlordMemberRole = MemberRole

export interface LandlordMember {
  id: string
  email: string
  name: string
  role: LandlordMemberRole
  status: 'active' | 'pending' | 'expired'
  joinedAt: string
}

export interface LandlordAuditEvent {
  id: string
  at: string
  category: string
  title: string
  detail: string
  result: 'success' | 'warning'
  actor: string
}

export interface LandlordSettingsState {
  displayName: string
  email: string
  emailVerified: boolean
  phone: string
  workspaceName: string
  emailNotifications: boolean
  rentReminders: boolean
  contractReminders: boolean
  repairNotifications: boolean
  reminderDays: number
  members: LandlordMember[]
  audit: LandlordAuditEvent[]
  loaded: boolean
  loading: boolean
  error: string
  /** 成員切換到別人的工作區時，設定與團隊只有擁有者能看。 */
  ownerOnly: boolean
}

function defaultState(): LandlordSettingsState {
  const session = getAuthSession()
  const name = session?.nickname?.trim() || session?.email.split('@')[0] || '房東'
  return {
    displayName: name,
    email: session?.email ?? '',
    emailVerified: Boolean(session?.emailVerified),
    phone: '',
    workspaceName: `${name}的房東工作區`,
    emailNotifications: true,
    rentReminders: true,
    contractReminders: true,
    repairNotifications: true,
    reminderDays: 30,
    members: [],
    audit: [],
    loaded: false,
    loading: false,
    error: '',
    ownerOnly: false,
  }
}

const state = reactive<LandlordSettingsState>(defaultState())
let loadedFor = ''
let activeLoad: Promise<void> | null = null
let listening = false

function cacheKey(): string {
  const session = getAuthSession()
  return `${session?.userId ?? session?.email ?? ''}@${activeWorkspaceOwnerId() ?? 'own'}`
}

function toMember(item: TeamMember): LandlordMember {
  return { id: String(item.id), email: item.email, name: item.name, role: item.role, status: item.status, joinedAt: item.joined_at ?? item.invited_at }
}

function toAudit(item: AuditEvent): LandlordAuditEvent {
  return { id: String(item.id), at: item.at, category: item.category, title: item.title, detail: item.detail, result: item.result, actor: item.actor }
}

function applySettings(settings: Awaited<ReturnType<typeof fetchLandlordSettings>>): void {
  Object.assign(state, {
    displayName: settings.display_name,
    email: settings.email,
    emailVerified: settings.email_verified,
    phone: settings.phone,
    workspaceName: settings.workspace_name,
    emailNotifications: settings.email_notifications,
    rentReminders: settings.rent_reminders,
    contractReminders: settings.contract_reminders,
    repairNotifications: settings.repair_notifications,
    reminderDays: settings.reminder_days,
  })
}

async function load(force = false): Promise<void> {
  const key = cacheKey()
  if (key !== loadedFor) {
    Object.assign(state, defaultState())
    loadedFor = key
  } else if (!force && (state.loaded || activeLoad)) {
    return activeLoad ?? undefined
  }
  state.loading = true
  state.error = ''
  state.ownerOnly = Boolean(activeWorkspaceOwnerId() && activeWorkspaceOwnerId() !== getAuthSession()?.userId)
  const request = (async () => {
    try {
      const [settings, audit, team] = await Promise.allSettled([fetchLandlordSettings(), fetchAudit(), fetchTeam()])
      if (key !== loadedFor) return
      if (settings.status === 'fulfilled') applySettings(settings.value)
      if (audit.status === 'fulfilled') state.audit = audit.value.items.map(toAudit)
      if (team.status === 'fulfilled') state.members = team.value.items.map(toMember)
      const failure = [settings, audit].find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined
      if (failure && !state.ownerOnly) state.error = failure.reason instanceof Error ? failure.reason.message : '設定讀取失敗'
      state.loaded = true
    } finally {
      if (key === loadedFor) state.loading = false
      activeLoad = null
    }
  })()
  activeLoad = request
  return request
}

async function reloadAudit(): Promise<void> {
  try {
    state.audit = (await fetchAudit()).items.map(toAudit)
  } catch {
    // 操作紀錄讀不到不影響剛完成的動作
  }
}

export function useLandlordSettings() {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener(LANDLORD_WORKSPACE_CHANGED_EVENT, () => void load(true))
  }
  void load()
  const session = getAuthSession()
  const completeness = computed(() => {
    const checks = [state.displayName, state.email, state.phone, state.workspaceName]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  })

  async function saveProfile(payload: { displayName: string; phone: string; workspaceName: string }): Promise<void> {
    applySettings(await saveLandlordProfile({
      display_name: payload.displayName.trim(),
      phone: payload.phone.trim(),
      workspace_name: payload.workspaceName.trim(),
    }))
    await reloadAudit()
  }

  async function saveNotifications(payload: Pick<LandlordSettingsState, 'emailNotifications' | 'rentReminders' | 'contractReminders' | 'repairNotifications' | 'reminderDays'>): Promise<void> {
    applySettings(await saveLandlordNotifications({
      email_notifications: payload.emailNotifications,
      rent_reminders: payload.rentReminders,
      contract_reminders: payload.contractReminders,
      repair_notifications: payload.repairNotifications,
      reminder_days: payload.reminderDays,
    }))
    await reloadAudit()
  }

  /** 邀請成員。回傳邀請連結（站內路徑）與對方是否已收到站內通知。 */
  async function inviteMember(email: string, role: LandlordMemberRole): Promise<{ path: string; notified: boolean }> {
    const result = await inviteTeamMember(email.trim().toLowerCase(), role)
    state.members = (await fetchTeam()).items.map(toMember)
    await reloadAudit()
    return { path: result.path, notified: result.notified }
  }

  async function changeMemberRole(id: string, role: LandlordMemberRole): Promise<void> {
    await changeTeamRole(Number(id), role)
    state.members = (await fetchTeam()).items.map(toMember)
    await reloadAudit()
  }

  async function removeMember(id: string): Promise<void> {
    await removeTeamMember(Number(id))
    state.members = state.members.filter((item) => item.id !== id)
    await reloadAudit()
  }

  return {
    state,
    session,
    completeness,
    refresh: () => load(true),
    saveProfile,
    saveNotifications,
    inviteMember,
    changeMemberRole,
    removeMember,
  }
}
