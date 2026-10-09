<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Activity,
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  CircleHelp,
  Crown,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  AlertTriangle,
  Copy,
} from 'lucide-vue-next'
import { signOut } from '@/src/composables/useAuth'
import { useLandlordWorkspace } from '@/src/composables/useLandlordWorkspace'
import {
  useLandlordSettings,
  type LandlordMemberRole,
} from '@/src/composables/useLandlordSettings'
import { landlordRequest } from '@/src/services/landlordApiClient'
import { publicSettings } from '@/src/composables/usePublicSettings'

const route = useRoute()
const router = useRouter()
const { properties, tenants, rooms, activeTenants, loading } = useLandlordWorkspace()
const {
  state,
  session,
  completeness,
  saveProfile,
  saveNotifications,
  inviteMember,
  changeMemberRole,
  removeMember,
} = useLandlordSettings()

const section = computed(() => String(route.params.section || 'account'))
const message = ref('')
const errorMessage = ref('')
const saving = ref(false)
const inviteError = ref('')
const inviteLink = ref('')
const supportEmail = computed(() => publicSettings.value?.supportEmail || '')
const auditFilter = ref('全部')
const profileForm = reactive({
  displayName: state.displayName,
  phone: state.phone,
  workspaceName: state.workspaceName,
})
const notificationForm = reactive({
  emailNotifications: state.emailNotifications,
  rentReminders: state.rentReminders,
  contractReminders: state.contractReminders,
  repairNotifications: state.repairNotifications,
  reminderDays: state.reminderDays,
})
const inviteForm = reactive<{ email: string; role: LandlordMemberRole }>({
  email: '',
  role: 'manager',
})

const meta: Record<string, { title: string; description: string; icon: typeof UserRound }> = {
  account: { title: '帳號與工作區', description: '管理身份、聯絡方式與房東工作區名稱。', icon: UserRound },
  team: { title: '團隊成員', description: '管理能進入工作區的成員及其權限。', icon: Users },
  plan: { title: '方案權益與功能', description: '查看目前方案、使用額度與可使用功能。', icon: Crown },
  notifications: { title: '通知與提醒', description: '決定何時、透過什麼方式接收房務提醒。', icon: Bell },
  data: { title: '資料匯出與備份', description: '建立房務資料備份，方便整理及交接。', icon: Database },
  activity: { title: '操作紀錄', description: '追蹤設定與工作區的重要異動。', icon: Activity },
  support: { title: '支援與說明', description: '查看常見問題並取得協助。', icon: CircleHelp },
  legal: { title: '隱私權與服務條款', description: '了解資料使用方式及平台規範。', icon: BookOpen },
  security: { title: '登入與安全', description: '檢查帳號驗證、登入裝置與安全狀態。', icon: ShieldCheck },
}
const currentMeta = computed(() => meta[section.value] ?? meta.account!)
const initials = computed(() => state.displayName.slice(0, 1) || '房')
const categories = computed(() => ['全部', ...new Set(state.audit.map((event) => event.category))])
const filteredAudit = computed(() => auditFilter.value === '全部' ? state.audit : state.audit.filter((event) => event.category === auditFilter.value))
const occupiedRooms = computed(() => rooms.value.filter((room) => room.status === 'rented').length)

watch(section, () => {
  message.value = ''
  errorMessage.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

// 設定是從伺服器非同步讀進來的：讀到之後（或切換工作區之後）把表單重設成伺服器上的值
watch(() => [state.loaded, state.displayName, state.phone, state.workspaceName, state.reminderDays], () => {
  Object.assign(profileForm, { displayName: state.displayName, phone: state.phone, workspaceName: state.workspaceName })
  Object.assign(notificationForm, {
    emailNotifications: state.emailNotifications,
    rentReminders: state.rentReminders,
    contractReminders: state.contractReminders,
    repairNotifications: state.repairNotifications,
    reminderDays: state.reminderDays,
  })
}, { immediate: true })

async function attempt(action: () => Promise<void>, success: string): Promise<void> {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await action()
    flash(success)
  } catch (cause) {
    errorMessage.value = cause instanceof Error ? cause.message : '儲存失敗，請稍後重試。'
  } finally {
    saving.value = false
  }
}

function flash(text: string) {
  message.value = text
  window.setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 2800)
}

function submitProfile() {
  return attempt(() => saveProfile(profileForm), '帳號與工作區資料已儲存。')
}

function submitNotifications() {
  return attempt(() => saveNotifications(notificationForm), '通知偏好已更新。')
}

async function submitInvite() {
  inviteError.value = ''
  inviteLink.value = ''
  if (!/^\S+@\S+\.\S+$/.test(inviteForm.email)) {
    inviteError.value = '請輸入有效的 Email。'
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    const result = await inviteMember(inviteForm.email, inviteForm.role)
    inviteLink.value = `${window.location.origin}${result.path}`
    flash(result.notified
      ? '邀請已建立，對方已收到站內通知；也可以把下方連結傳給對方。'
      : '邀請已建立。對方還沒有房東帳號，請把下方連結傳給對方，註冊後即可加入。')
    inviteForm.email = ''
  } catch (cause) {
    inviteError.value = cause instanceof Error ? cause.message : '邀請失敗，請稍後重試。'
  } finally {
    saving.value = false
  }
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    flash('邀請連結已複製（複製成功不代表對方已收到）。')
  } catch {
    errorMessage.value = '無法自動複製，請手動選取連結。'
  }
}

function updateRole(id: string, role: LandlordMemberRole) {
  return attempt(() => changeMemberRole(id, role), '成員權限已更新。')
}

function confirmRemove(id: string, email: string) {
  if (!window.confirm(`將 ${email} 從工作區移除？對方會立即失去存取權限。`)) return
  return attempt(() => removeMember(id), '成員已移除。')
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function exportJson() {
  // 後端組出完整資料（含所有歷史租約、帳款、收款、支出、操作紀錄），並記一筆操作紀錄
  return attempt(async () => {
    const payload = await landlordRequest<Record<string, unknown>>('/landlord/backup')
    const stamp = new Date().toLocaleDateString('sv-SE')
    downloadFile(`rentmate-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json')
  }, '完整備份已下載。')
}

function exportCsv() {
  const headers = ['租客', '棟別', '房號', '租約開始', '租約結束', '月租', '狀態']
  const lines = tenants.value.map((tenant) => [tenant.name, tenant.property_name, tenant.room_number, tenant.lease_start, tenant.lease_end, tenant.monthly_rent, tenant.lease_status].map(csvCell).join(','))
  downloadFile(`rentmate-tenants-${new Date().toLocaleDateString('sv-SE')}.csv`, `\uFEFF${headers.join(',')}\n${lines.join('\n')}`, 'text/csv;charset=utf-8')
  flash('CSV 報表已建立。')
}

async function logout() {
  signOut()
  await router.push('/login')
}

const roleLabels: Record<LandlordMemberRole, string> = {
  manager: '管理員',
  accounting: '帳務',
  viewer: '檢視者',
}
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-5">
    <header class="detail-heading">
      <RouterLink to="/landlord/settings" class="back-button" aria-label="返回設定"><ArrowLeft /></RouterLink>
      <span class="heading-icon"><component :is="currentMeta.icon" /></span>
      <div><p class="text-xs font-bold uppercase tracking-[.16em] text-[#68846d]">Settings</p><h1>{{ currentMeta.title }}</h1><p>{{ currentMeta.description }}</p></div>
    </header>

    <div v-if="message" class="success-message"><CheckCircle2 />{{ message }}</div>
    <div v-if="errorMessage || state.error" class="error-message" role="alert"><AlertTriangle />{{ errorMessage || state.error }}</div>
    <div v-if="state.ownerOnly && ['account', 'team', 'notifications'].includes(section)" class="error-message"><AlertTriangle />你目前在別人的工作區。帳號資料、團隊與通知設定只有工作區擁有者能管理；切回自己的工作區即可設定自己的帳號。</div>

    <template v-if="section === 'account'">
      <section class="profile-strip">
        <span class="avatar">{{ initials }}</span>
        <div class="min-w-0 flex-1"><h2>{{ state.displayName }}</h2><p>{{ state.email || session?.email }}</p></div>
        <div class="profile-stat"><small>登入身份</small><b>房東</b></div><div class="profile-stat"><small>資料狀態</small><b>{{ completeness }}% 完整</b></div>
      </section>
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,.8fr)]">
        <form class="panel" @submit.prevent="submitProfile">
          <div class="panel-title"><span><UserRound /></span><div><h2>身份與聯絡</h2><p>此資料用於工作區顯示及重要帳務聯絡。</p></div></div>
          <div class="form-grid">
            <label>顯示名稱<input v-model="profileForm.displayName" required /></label>
            <label>登入 Email<input :value="state.email || session?.email" disabled /><small>Email 由登入方式決定，目前不可直接修改。</small></label>
            <label>聯絡手機<input v-model="profileForm.phone" inputmode="tel" placeholder="例如 0912-345-678" /></label>
            <label>工作區名稱<input v-model="profileForm.workspaceName" required /></label>
          </div>
          <div class="panel-actions"><button class="primary-button" type="submit" :disabled="saving || state.ownerOnly"><Save />{{ saving ? '儲存中…' : '儲存變更' }}</button></div>
        </form>
        <aside class="panel progress-panel"><div class="flex items-end justify-between"><div><h2>帳戶完整度</h2><p>補齊資料，讓聯絡及交接更順暢。</p></div><strong>{{ completeness }}%</strong></div><div class="progress"><i :style="{ width: `${completeness}%` }" /></div><ul><li><Check />身份資料 <span>已完成</span></li><li :class="{ pending: !state.emailVerified }"><component :is="state.emailVerified ? Check : Mail" />登入 Email <span>{{ state.emailVerified ? '已驗證' : '待驗證' }}</span></li><li :class="{ pending: !state.phone }"><component :is="state.phone ? Check : Phone" />聯絡手機 <span>{{ state.phone ? '已新增' : '尚未新增' }}</span></li><li><Check />工作區權限 <span>擁有者</span></li></ul></aside>
      </div>
    </template>

    <template v-else-if="section === 'team'">
      <section class="summary-strip"><div><span class="summary-icon"><Building2 /></span><div><h2>{{ state.workspaceName }}</h2><p>{{ state.members.filter((member) => member.status === 'active').length + 1 }} 位成員 · {{ state.members.filter((member) => member.status !== 'active').length }} 份邀請待接受</p></div></div><div><small>你的身份</small><b>擁有者</b></div></section>
      <form class="panel" @submit.prevent="submitInvite"><div class="panel-head"><div><h2>邀請新成員</h2><p>輸入 Email 並設定角色，邀請對方加入工作區。</p></div><button class="primary-button" type="submit" :disabled="saving || state.ownerOnly"><Plus />發送邀請</button></div><p v-if="inviteError" class="form-error">{{ inviteError }}</p><div v-if="inviteLink" class="invite-link"><input :value="inviteLink" readonly aria-label="邀請連結" @focus="($event.target as HTMLInputElement).select()" /><button type="button" class="outline-button" @click="copyInviteLink"><Copy />複製連結</button><small>對方要用受邀的 Email 登入房東帳號才能接受，7 天內有效。</small></div><div class="invite-grid"><label>成員 Email<input v-model="inviteForm.email" type="email" placeholder="member@example.com" /></label><label>角色<select v-model="inviteForm.role"><option value="manager">管理員</option><option value="accounting">帳務</option><option value="viewer">檢視者</option></select></label><div class="role-help"><b>角色權限</b><p>{{ inviteForm.role === 'manager' ? '可管理房務、租客、帳務、報修與合約；不能管理團隊與帳號設定。' : inviteForm.role === 'accounting' ? '可查看所有資料，只能操作收款、支出與帳務。' : '僅能檢視工作區資料，不能編輯。' }}</p></div></div></form>
      <section class="panel flush"><div class="panel-head padded"><div><h2>成員名冊</h2><p>{{ state.members.length + 1 }} 位成員</p></div></div><div class="member-row"><span class="mini-avatar">{{ initials }}</span><span class="min-w-0 flex-1"><b>{{ state.displayName }}</b><small>{{ session?.email }}</small></span><em>擁有者 · 你</em></div><div v-for="member in state.members" :key="member.id" class="member-row"><span class="mini-avatar">{{ member.name.slice(0, 1).toUpperCase() }}</span><span class="min-w-0 flex-1"><b>{{ member.name }}</b><small>{{ member.email }}</small></span><select class="role-select" :value="member.role" :disabled="saving" :aria-label="`${member.email} 的角色`" @change="updateRole(member.id, ($event.target as HTMLSelectElement).value as LandlordMemberRole)"><option value="manager">管理員</option><option value="accounting">帳務</option><option value="viewer">檢視者</option></select><em :class="{ pending: member.status !== 'active' }">{{ member.status === 'pending' ? '待接受' : member.status === 'expired' ? '邀請已過期' : '使用中' }}</em><button class="icon-danger" :title="member.status === 'active' ? '移除成員' : '取消邀請'" :disabled="saving" @click="confirmRemove(member.id, member.email)"><Trash2 /></button></div></section>
    </template>

    <template v-else-if="section === 'notifications'">
      <section class="line-card"><span><Bell /></span><div class="flex-1"><small>通知管道</small><h2>站內通知{{ state.emailNotifications ? '＋Email' : '' }}</h2><p>提醒會送到右上角的通知鈴鐺{{ state.emailNotifications ? '，並同時寄 Email' : '' }}。租金提醒只會送給已接受邀請、綁定帳號的租客。</p></div></section>
      <form class="panel" @submit.prevent="submitNotifications"><div class="panel-title"><span><Bell /></span><div><h2>提醒偏好</h2><p>設定系統應主動提醒的房務事件。</p></div></div><div class="preference-list"><label><span><b>Email 通知</b><small>下列提醒除了站內通知，也同時寄 Email：催繳與收租提醒寄給租客，其他寄到 {{ state.email || session?.email }}。</small></span><input v-model="notificationForm.emailNotifications" type="checkbox" /></label><label><span><b>租金提醒</b><small>到期前 3 天、到期當天與逾期隔天，自動提醒已綁定帳號的租客。</small></span><input v-model="notificationForm.rentReminders" type="checkbox" /></label><label><span><b>合約到期提醒</b><small>租約剩下設定天數與 7 天時通知你；已建立續約的不提醒。</small></span><input v-model="notificationForm.contractReminders" type="checkbox" /></label><label><span><b>報修通知</b><small>租客提出新報修時通知你。</small></span><input v-model="notificationForm.repairNotifications" type="checkbox" /></label></div><label class="days-field">合約到期前<select v-model="notificationForm.reminderDays"><option :value="7">7 天</option><option :value="14">14 天</option><option :value="30">30 天</option><option :value="60">60 天</option><option :value="90">90 天</option></select>開始提醒</label><div class="panel-actions"><button class="primary-button" type="submit" :disabled="saving || state.ownerOnly"><Save />{{ saving ? '儲存中…' : '儲存通知設定' }}</button></div></form>
    </template>

    <template v-else-if="section === 'data'">
      <div class="grid gap-5 lg:grid-cols-2"><button class="export-card" :disabled="loading" @click="exportCsv"><span><FileSpreadsheet /></span><div><h2>租客 CSV 報表</h2><p>匯出租客、房號、租期、月租與目前狀態。</p><small>{{ tenants.length }} 位租客</small></div><Download /></button><button class="export-card" :disabled="loading" @click="exportJson"><span><FileJson /></span><div><h2>完整營運備份</h2><p>房屋、房間、租客、所有租約（含歷史）、帳款與收款、支出與操作紀錄。合約附件請在合約頁下載。</p><small>{{ properties.length }} 棟 · {{ rooms.length }} 間房</small></div><Download /></button></div>
      <section class="panel"><div class="panel-title"><span><Database /></span><div><h2>匯出內容摘要</h2><p>下載檔案前確認目前工作區資料範圍。</p></div></div><div class="data-summary"><span><small>棟別</small><b>{{ properties.length }}</b></span><span><small>房間</small><b>{{ rooms.length }}</b></span><span><small>目前出租</small><b>{{ occupiedRooms }}</b></span><span><small>租客資料</small><b>{{ tenants.length }}</b></span><span><small>有效租約</small><b>{{ activeTenants.length }}</b></span></div><div class="privacy-note"><ShieldCheck /><p><b>安全匯出提醒</b><br />匯出檔案可能包含個人資料，請妥善保存並只交付給有權限的人員。</p></div></section>
    </template>

    <template v-else-if="section === 'activity'">
      <section class="status-card"><ShieldCheck /><div><h2>工作區操作紀錄</h2><p>由伺服器在動作完成後記錄，包含團隊成員的操作；換裝置也看得到。</p></div><b>{{ state.audit.length }} 筆記錄</b></section><section class="panel flush"><div class="audit-tabs"><button v-for="category in categories" :key="category" :class="{ active: auditFilter === category }" @click="auditFilter = category">{{ category }}</button></div><div v-for="event in filteredAudit" :key="event.id" class="audit-row"><time>{{ new Date(event.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</time><span class="audit-icon"><Activity /></span><span class="min-w-0 flex-1"><b>{{ event.title }}</b><small>{{ event.detail }}{{ event.detail ? ' · ' : '' }}{{ event.actor }}</small></span><em :class="event.result"><Check />{{ event.result === 'success' ? '成功' : '注意' }}</em></div><div v-if="!filteredAudit.length" class="empty-state">{{ state.loading ? '正在讀取…' : '此分類目前沒有操作紀錄。' }}</div></section>
    </template>

    <template v-else-if="section === 'support'">
      <div class="grid gap-5 lg:grid-cols-2"><section class="panel"><div class="panel-title"><span><BookOpen /></span><div><h2>常見操作</h2><p>快速了解房東系統的資料關係。</p></div></div><details open><summary>為什麼租客沒有顯示在房務管理？</summary><p>房務管理只顯示目前有效租約；已到期、已退租或尚未開始的租約會依日期顯示不同狀態。</p></details><details><summary>OCR 匯入後需要檢查什麼？</summary><p>請確認棟別、房號、租約開始／結束日及金額。OCR 會協助填入，但仍以儲存前確認的資料為準。</p></details><details><summary>如何備份房東資料？</summary><p>前往「資料匯出與備份」，可下載租客 CSV 或完整 JSON 備份。</p></details><details><summary>租客怎麼加入我的租約？</summary><p>在租客管理選擇租客，按「邀請加入」產生 QR code、連結或邀請碼。租客用同一個 Email 的租客帳號接受後，帳款提醒與報修就會連到他的帳號。</p></details><details><summary>團隊成員看得到什麼？</summary><p>成員用自己的房東帳號登入，從側邊切換到你的工作區。管理員可以操作房務、租客與合約；帳務只能處理收款與支出；檢視者只能看。</p></details></section><section class="panel"><div class="panel-title"><span><Mail /></span><div><h2>意見回饋</h2><p>回報問題時，請附上發生頁面與操作步驟。</p></div></div><a v-if="supportEmail" class="primary-button w-fit" :href="`mailto:${supportEmail}?subject=RentMate 房東系統意見回饋`"><Mail />寄送意見回饋（{{ supportEmail }}）</a><p v-else class="text-sm text-[#788179]">客服信箱尚未設定。</p><div class="support-note"><b>建議提供</b><ul><li>問題發生的功能與時間</li><li>可重現問題的操作步驟</li><li>不含個資的畫面截圖</li></ul></div></section></div>
    </template>

    <template v-else-if="section === 'legal'">
      <section class="legal-hero"><BookOpen /><div><h2>法務與版本資訊</h2><p>以下內容為產品架構展示；正式上線前應由法務確認完整條款。</p></div><em>v1.2.0</em></section><div class="grid gap-5 lg:grid-cols-3"><section class="panel legal-card"><h2>隱私權政策</h2><p>說明房務、租客、租金與通知資料的蒐集、使用、保存及刪除方式。</p><ul><li>只蒐集提供服務所需資料</li><li>不出售租客名單或帳務紀錄</li><li>可申請查詢、更正或刪除</li></ul></section><section class="panel legal-card"><h2>服務條款</h2><p>說明帳號使用、資料責任、服務限制及功能異動原則。</p><ul><li>房東應合法取得租客資料</li><li>OCR 結果需由使用者確認</li><li>重要資料應定期自行備份</li></ul></section><section class="panel legal-card"><h2>版本資訊</h2><p>RentMate 房東管理後台。</p><dl><div><dt>目前版本</dt><dd>1.2.0</dd></div><div><dt>資料架構</dt><dd>2026.09</dd></div><div><dt>系統狀態</dt><dd>正常運行</dd></div></dl></section></div>
    </template>

    <template v-else-if="section === 'security'">
      <section class="status-card"><ShieldCheck /><div><h2>帳戶安全狀態正常</h2><p>目前工作階段已通過登入驗證。</p></div><em>正常</em></section><div class="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.8fr)]"><section class="panel flush"><div class="security-row"><span><Mail /></span><div><b>登入 Email</b><small>{{ session?.email }}</small></div><em>{{ session?.emailVerified ? '已驗證' : '待驗證' }}</em></div><div class="security-row"><span><KeyRound /></span><div><b>目前登入階段</b><small>此瀏覽器 · {{ new Date(session?.issuedAt || Date.now()).toLocaleString('zh-TW') }}</small></div><em>使用中</em></div><div class="security-row"><span><KeyRound /></span><div><b>帳戶密碼</b><small>變更後需使用新密碼重新登入。</small></div><RouterLink to="/change-password">修改密碼</RouterLink></div><div class="security-row"><span><Database /></span><div><b>資料備份</b><small>建議在大量異動前建立完整營運備份。</small></div><RouterLink to="/landlord/settings/data">前往備份</RouterLink></div></section><aside class="panel danger-panel"><span><LogOut /></span><h2>登出此裝置</h2><p>結束目前登入階段，不會刪除任何房務資料。</p><button class="danger-button" @click="logout"><LogOut />登出帳號</button></aside></div>
    </template>
  </div>
</template>

<style scoped>
@reference "../../index.css";
.detail-heading { @apply flex items-center gap-3 rounded-[1.6rem] border border-[#e1dbcf] bg-white/75 p-5; }.detail-heading h1 { @apply mt-0.5 text-2xl font-black sm:text-3xl; }.detail-heading p:last-child { @apply mt-1 text-sm text-[#7d857e]; }.back-button,.heading-icon { @apply grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#ded8cc] bg-[#fffdf8] text-[#56735c]; }.back-button svg,.heading-icon :deep(svg) { @apply h-5 w-5; }.heading-icon { @apply hidden rounded-xl border-0 bg-[#e7f0e6] sm:grid; }
.success-message { @apply flex items-center gap-2 rounded-xl border border-[#cbdcca] bg-[#eef7ed] px-4 py-3 text-sm font-bold text-[#507257]; }.success-message svg { @apply h-4 w-4; }
.panel,.profile-strip,.summary-strip,.plan-hero,.line-card,.status-card,.legal-hero { @apply rounded-[1.45rem] border border-[#e2dccf] bg-white/85 shadow-sm; }.panel { @apply p-5; }.panel.flush { @apply overflow-hidden p-0; }.profile-strip { @apply flex flex-wrap items-center gap-4 p-5; }.avatar { @apply grid h-16 w-16 place-items-center rounded-2xl bg-[#e3ede2] text-2xl font-black text-[#55775c]; }.profile-strip h2,.summary-strip h2,.plan-hero h2,.line-card h2 { @apply text-xl font-black; }.profile-strip p,.summary-strip p,.plan-hero p,.line-card p { @apply mt-1 text-sm text-[#7e867f]; }.profile-stat { @apply ml-auto min-w-32 border-l border-[#e7e1d6] pl-5; }.profile-stat + .profile-stat { @apply ml-0; }.profile-stat small,.profile-stat b { @apply block; }.profile-stat small { @apply text-xs text-[#899088]; }.profile-stat b { @apply mt-1 text-sm; }
.panel-title { @apply mb-5 flex items-start gap-3 border-b border-[#ece6dc] pb-4; }.panel-title > span { @apply grid h-9 w-9 place-items-center rounded-xl bg-[#e8f1e7] text-[#59795f]; }.panel-title svg { @apply h-4 w-4; }.panel-title h2,.panel-head h2,.progress-panel h2,.status-card h2,.legal-card h2 { @apply font-black; }.panel-title p,.panel-head p,.progress-panel p,.status-card p { @apply mt-1 text-xs text-[#838b84]; }
.form-grid { @apply grid gap-4 md:grid-cols-2; }.form-grid label,.invite-grid label { @apply text-sm font-bold; }.form-grid input,.invite-grid input,.invite-grid select,.days-field select { @apply mt-2 w-full rounded-xl border border-[#ddd7ca] bg-[#fffefa] px-3.5 py-3 font-normal outline-none focus:border-[#7e9b82] focus:ring-2 focus:ring-[#dfeade]; }.form-grid input:disabled { @apply bg-[#f3f1eb] text-[#8c918c]; }.form-grid label small { @apply mt-1.5 block text-[10px] font-normal text-[#929891]; }.panel-actions { @apply mt-5 flex justify-end border-t border-[#ece6dc] pt-4; }
.primary-button,.outline-button,.danger-button { @apply inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50; }.primary-button { @apply bg-[#5b8263] text-white hover:bg-[#4e7356]; }.outline-button { @apply border border-[#d9d3c6] bg-[#fffdf8] text-[#53695a] hover:bg-white; }.danger-button { @apply bg-[#b9594d] text-white hover:bg-[#a94d42]; }.primary-button svg,.danger-button svg { @apply h-4 w-4; }
.progress-panel strong { @apply text-3xl text-[#54755a]; }.progress { @apply mt-5 h-2 overflow-hidden rounded-full bg-[#e5e2da]; }.progress i,.quota i { @apply block h-full rounded-full bg-[#628367]; }.progress-panel ul { @apply mt-4 space-y-3; }.progress-panel li { @apply flex items-center gap-2 text-sm; }.progress-panel li svg { @apply h-4 w-4 text-[#5b8263]; }.progress-panel li span { @apply ml-auto text-xs text-[#7f8780]; }.progress-panel li.pending,.progress-panel li.pending svg { @apply text-[#ad7026]; }
.summary-strip { @apply flex flex-wrap items-center justify-between gap-5 p-5; }.summary-strip > div:first-child { @apply flex items-center gap-3; }.summary-strip > div:last-child { @apply min-w-40 border-l border-[#e5dfd4] pl-5; }.summary-strip small,.summary-strip b { @apply block text-xs; }.summary-strip b { @apply mt-1 text-sm; }.summary-icon { @apply grid h-12 w-12 place-items-center rounded-xl bg-[#e7f0e7] text-[#58785e]; }.summary-icon svg { @apply h-5 w-5; }.panel-head { @apply flex flex-wrap items-center justify-between gap-3; }.padded { @apply p-5; }.invite-grid { @apply mt-5 grid items-end gap-4 lg:grid-cols-[1.4fr_.75fr_1fr]; }.role-help { @apply border-l border-[#e4ded2] px-4 text-sm; }.role-help p { @apply mt-1 text-xs leading-5 text-[#7c847d]; }.form-error { @apply mt-4 rounded-lg bg-[#fff0ec] p-3 text-xs text-[#a65348]; }.member-row { @apply flex items-center gap-3 border-t border-[#ece6dc] px-5 py-4; }.member-row b,.member-row small { @apply block; }.member-row small { @apply mt-0.5 text-xs text-[#858c86]; }.member-row em { @apply rounded-full bg-[#e7f1e7] px-2.5 py-1 text-[11px] font-bold not-italic text-[#55765b]; }.member-row em.pending { @apply bg-[#fff0da] text-[#a56a23]; }.mini-avatar { @apply grid h-10 w-10 place-items-center rounded-xl bg-[#e7efe5] font-black text-[#55775c]; }.icon-danger { @apply rounded-lg p-2 text-[#ad5c52] hover:bg-[#fff0ed]; }.icon-danger svg { @apply h-4 w-4; }
.plan-hero,.line-card { @apply flex flex-wrap items-center gap-4 p-6; }.plan-hero > span,.line-card > span { @apply grid h-14 w-14 place-items-center rounded-2xl bg-[#e7f0e6] text-[#58795e]; }.plan-hero > span svg,.line-card > span svg { @apply h-6 w-6; }.plan-hero h2 em { @apply ml-2 rounded-full bg-[#e6f1e6] px-2 py-1 align-middle text-[10px] font-bold not-italic text-[#527459]; }.quota-row { @apply grid items-center gap-3 border-t border-[#ece6dc] px-5 py-4 md:grid-cols-[140px_100px_minmax(150px,1fr)_100px]; }.quota-row > span { @apply flex items-center gap-2 text-sm; }.quota-row > span svg { @apply h-4 w-4 text-[#627a66]; }.quota-row > small { @apply text-right text-xs text-[#858c86]; }.quota { @apply h-2 overflow-hidden rounded-full bg-[#e5e2da]; }.feature-grid { @apply grid gap-3 sm:grid-cols-2 lg:grid-cols-3; }.feature-grid span { @apply flex items-center gap-2 rounded-xl bg-[#f5f7f2] p-3 text-sm font-semibold; }.feature-grid svg { @apply h-4 w-4 text-[#5b8263]; }
.preference-list label { @apply flex items-center justify-between gap-4 border-b border-[#ece6dc] py-4 first:pt-0; }.preference-list b,.preference-list small { @apply block; }.preference-list b { @apply text-sm; }.preference-list small { @apply mt-1 text-xs text-[#858c86]; }.preference-list input { @apply h-5 w-5 accent-[#5b8263]; }.days-field { @apply mt-5 flex items-center gap-3 text-sm font-bold; }.days-field select { @apply mt-0 w-auto py-2; }
.export-card { @apply flex items-center gap-4 rounded-[1.45rem] border border-[#e2dccf] bg-white/85 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8cbb9] disabled:opacity-50; }.export-card > span { @apply grid h-12 w-12 place-items-center rounded-xl bg-[#e8f1e7] text-[#58795e]; }.export-card > span svg { @apply h-5 w-5; }.export-card > div { @apply min-w-0 flex-1; }.export-card h2 { @apply font-black; }.export-card p { @apply mt-1 text-xs leading-5 text-[#818981]; }.export-card small { @apply mt-3 block text-xs font-bold text-[#59795f]; }.export-card > svg { @apply h-5 w-5 text-[#819085]; }.data-summary { @apply grid overflow-hidden rounded-xl border border-[#e5dfd4] sm:grid-cols-5; }.data-summary span { @apply border-b border-[#e5dfd4] p-4 last:border-0 sm:border-b-0 sm:border-r; }.data-summary small,.data-summary b { @apply block; }.data-summary small { @apply text-xs text-[#858c86]; }.data-summary b { @apply mt-1 text-xl; }.privacy-note { @apply mt-5 flex gap-3 rounded-xl border border-[#d6e2d4] bg-[#f1f7f0] p-4 text-sm text-[#58705d]; }.privacy-note svg { @apply mt-0.5 h-5 w-5 shrink-0; }
.status-card { @apply flex items-center gap-4 p-5; }.status-card > svg { @apply h-6 w-6 text-[#5b8263]; }.status-card > div { @apply flex-1; }.status-card > b,.status-card > em { @apply rounded-full bg-[#e8f2e7] px-3 py-1.5 text-xs font-bold not-italic text-[#527459]; }.audit-tabs { @apply flex gap-1 overflow-x-auto border-b border-[#e6e0d5] p-3; }.audit-tabs button { @apply whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-[#737c74]; }.audit-tabs button.active { @apply bg-[#5b8263] text-white; }.audit-row { @apply flex items-center gap-3 border-b border-[#ece6dc] px-5 py-4; }.audit-row time { @apply w-28 shrink-0 text-xs text-[#7e867f]; }.audit-icon { @apply grid h-9 w-9 place-items-center rounded-xl bg-[#e9f1e8] text-[#5a795f]; }.audit-icon svg { @apply h-4 w-4; }.audit-row b,.audit-row small { @apply block; }.audit-row small { @apply mt-1 truncate text-xs text-[#858c86]; }.audit-row em { @apply flex items-center gap-1 text-xs font-bold not-italic text-[#58795e]; }.audit-row em.warning { @apply text-[#ad7026]; }.audit-row em svg { @apply h-3 w-3; }.empty-state { @apply grid min-h-44 place-items-center text-sm text-[#858c86]; }
details { @apply border-b border-[#ece6dc] py-4 last:border-0; } summary { @apply cursor-pointer text-sm font-bold; } details p { @apply mt-3 text-sm leading-6 text-[#747d75]; }.support-note { @apply mt-6 rounded-xl bg-[#f4f4ef] p-4 text-sm; }.support-note ul { @apply mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#7a837b]; }
.legal-hero { @apply flex items-center gap-4 p-6; }.legal-hero > svg { @apply h-7 w-7 text-[#5b8263]; }.legal-hero > div { @apply flex-1; }.legal-hero h2 { @apply text-xl font-black; }.legal-hero p { @apply mt-1 text-sm text-[#7e867f]; }.legal-hero em { @apply rounded-full bg-[#efeee8] px-3 py-1 text-xs font-bold not-italic; }.legal-card p { @apply mt-2 text-sm leading-6 text-[#747d75]; }.legal-card ul { @apply mt-4 list-disc space-y-2 pl-5 text-sm; }.legal-card dl { @apply mt-4 divide-y divide-[#ece6dc]; }.legal-card dl div { @apply flex justify-between py-3 text-sm; }.legal-card dt { @apply text-[#7e867f]; }.legal-card dd { @apply font-bold; }
.security-row { @apply flex items-center gap-3 border-b border-[#ece6dc] p-5 last:border-0; }.security-row > span { @apply grid h-10 w-10 place-items-center rounded-xl bg-[#edf2ea] text-[#5c7661]; }.security-row > span svg { @apply h-4 w-4; }.security-row > div { @apply min-w-0 flex-1; }.security-row b,.security-row small { @apply block; }.security-row small { @apply mt-1 truncate text-xs text-[#858c86]; }.security-row em { @apply rounded-full bg-[#e8f2e7] px-2.5 py-1 text-xs font-bold not-italic text-[#527459]; }.security-row a { @apply text-xs font-bold text-[#55785c] underline; }.danger-panel { @apply flex flex-col items-start; }.danger-panel > span { @apply grid h-11 w-11 place-items-center rounded-xl bg-[#fdece8] text-[#ad5a50]; }.danger-panel > span svg { @apply h-5 w-5; }.danger-panel h2 { @apply mt-4 font-black; }.danger-panel p { @apply mt-2 text-sm leading-6 text-[#7c847d]; }.danger-panel button { @apply mt-5; }
@media (max-width: 700px) { .profile-stat { @apply ml-0 border-l-0 pl-0; }.quota-row { @apply grid-cols-2; }.quota-row .quota { @apply col-span-2; }.audit-row time { @apply hidden; }.audit-row em { @apply hidden; } }
.error-message { @apply flex items-center gap-2 rounded-2xl border border-[#edc9c3] bg-[#fbe9e6] px-4 py-3 text-sm font-bold text-[#a7564b]; }.error-message :deep(svg) { @apply h-4 w-4 shrink-0; }
.invite-link { @apply mt-3 grid gap-2 rounded-2xl border border-[#d8e5d9] bg-[#f4f9f4] p-3 sm:grid-cols-[1fr_auto]; }.invite-link input { @apply w-full rounded-xl border border-[#d8e0d6] bg-white px-3 py-2 text-xs; }.invite-link small { @apply text-xs text-[#6f7a72] sm:col-span-2; }
.role-select { @apply rounded-full border border-[#ddd6c9] bg-white px-3 py-1.5 text-xs font-bold; }
.preference-list label.disabled { @apply opacity-60; }
</style>
