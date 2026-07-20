<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  Download,
  FileLock2,
  Headphones,
  KeyRound,
  Languages,
  Laptop,
  LockKeyhole,
  LogOut,
  Mail,
  MessageSquareText,
  PencilLine,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch/index'
import {
  finishNicknameSetup,
  getAuthSession,
  signOut,
  type AuthRole,
} from '@/src/composables/useAuth'

const router = useRouter()
const session = getAuthSession()

const displayName = ref(session?.nickname || '王小明')
const draftName = ref(displayName.value)
const email = ref(session?.email || 'user@example.com')
const phone = ref('0912-345-678')
const draftPhone = ref(phone.value)
const isEditing = ref(false)
const pushNotifications = ref(true)
const emailNotifications = ref(true)
const twoFactorEnabled = ref(true)
const deleteConfirming = ref(false)
const feedback = ref('')
let feedbackTimer: ReturnType<typeof setTimeout> | undefined

const roleLabels: Record<AuthRole, string> = {
  tenant: '一般租客',
  landlord: '房東',
  admin: '管理員',
  reviewer: '審核人員',
}

const roleLabel = computed(() => roleLabels[session?.role || 'tenant'])
const initials = computed(() => displayName.value.trim().slice(0, 1).toUpperCase() || 'R')

function showFeedback(message: string): void {
  feedback.value = message
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedback.value = ''
  }, 2400)
}

function toggleEdit(): void {
  if (isEditing.value) {
    draftName.value = displayName.value
    draftPhone.value = phone.value
  }
  isEditing.value = !isEditing.value
}

function saveProfile(): void {
  const cleanName = draftName.value.trim()
  const cleanPhone = draftPhone.value.trim()
  if (!cleanName || !cleanPhone) {
    showFeedback('請完整填寫暱稱與手機號碼')
    return
  }

  displayName.value = cleanName
  phone.value = cleanPhone
  finishNicknameSetup(cleanName)
  isEditing.value = false
  showFeedback('個人資料已更新')
}

function handleSignOut(): void {
  signOut()
  void router.replace('/login')
}

function handleDeleteAccount(): void {
  if (!deleteConfirming.value) {
    deleteConfirming.value = true
    return
  }
  deleteConfirming.value = false
  showFeedback('帳戶刪除申請流程尚未啟用，請聯絡客服')
}

onMounted(() => {
  const storedPush = window.localStorage.getItem('rentmate-push-notifications')
  const storedEmail = window.localStorage.getItem('rentmate-email-notifications')
  if (storedPush !== null) pushNotifications.value = storedPush === 'true'
  if (storedEmail !== null) emailNotifications.value = storedEmail === 'true'
})

function persistNotification(type: 'push' | 'email', value: boolean): void {
  window.localStorage.setItem(`rentmate-${type}-notifications`, String(value))
  showFeedback(value ? '通知已開啟' : '通知已關閉')
}
</script>

<template>
  <div class="account-page">
    <header class="page-header">
      <div>
        <h1>我的帳戶</h1>
        <p>管理您的個人資料、帳戶設定與隱私安全。</p>
      </div>
      <div class="header-user" aria-label="目前登入的使用者">
        <button
          class="notification-button"
          type="button"
          aria-label="查看通知"
          @click="showFeedback('目前沒有新的通知')"
        >
          <Bell :size="21" />
          <span class="notification-count">3</span>
        </button>
        <div class="mini-avatar">{{ initials }}</div>
        <strong>{{ displayName }}</strong>
        <ChevronRight :size="18" class="header-chevron" />
      </div>
    </header>

    <section class="account-grid" aria-label="帳戶設定">
      <article class="account-card profile-card">
        <div class="profile-summary">
          <div class="avatar-wrap" aria-hidden="true">
            <span>{{ initials }}</span>
            <div class="avatar-badge"><CircleUserRound :size="15" /></div>
          </div>
          <div class="profile-identity">
            <div class="name-line">
              <h2>{{ displayName }}</h2>
              <span class="pill pill-purple">{{ roleLabel }}</span>
            </div>
            <div class="email-line">
              <span>{{ email }}</span>
              <span v-if="session?.emailVerified !== false" class="pill pill-green">已驗證</span>
            </div>
            <p>加入時間：2024/11/20</p>
            <p class="security-score">
              安全性評分：<span><ShieldCheck :size="15" /> 中等</span>
            </p>
          </div>
          <button class="outline-button edit-button" type="button" @click="toggleEdit">
            <PencilLine :size="16" />
            {{ isEditing ? '取消編輯' : '編輯個人資料' }}
          </button>
        </div>

        <form v-if="isEditing" class="edit-form" @submit.prevent="saveProfile">
          <label>
            <span>暱稱</span>
            <input v-model="draftName" autocomplete="name" />
          </label>
          <label>
            <span>手機號碼</span>
            <input v-model="draftPhone" autocomplete="tel" inputmode="tel" />
          </label>
          <button class="primary-button" type="submit">儲存變更</button>
        </form>

        <div v-else class="card-section">
          <h3><UserRound :size="20" /> 帳戶資訊</h3>
          <button class="info-row" type="button" @click="toggleEdit">
            <UserRound :size="19" />
            <span class="row-label">暱稱</span>
            <span class="row-value">{{ displayName }}</span>
            <ChevronRight :size="19" />
          </button>
          <button class="info-row" type="button" @click="toggleEdit">
            <Phone :size="19" />
            <span class="row-label">手機號碼</span>
            <span class="row-value">{{ phone }}</span>
            <span class="pill pill-green">已驗證</span>
            <ChevronRight :size="19" />
          </button>
          <button class="info-row" type="button" @click="showFeedback('電子郵件變更功能尚未開放')">
            <Mail :size="19" />
            <span class="row-label">電子郵件（帳號）</span>
            <span class="row-value truncate">{{ email }}</span>
            <span class="pill pill-green">已驗證</span>
            <ChevronRight :size="19" />
          </button>
          <button class="info-row" type="button" @click="showFeedback('您的身分驗證已完成')">
            <ShieldCheck :size="19" />
            <span class="row-label">身分驗證</span>
            <span class="row-value">已完成</span>
            <ChevronRight :size="19" />
          </button>
        </div>
      </article>

      <article class="account-card security-card">
        <div class="card-heading">
          <div class="heading-icon"><ShieldCheck :size="24" /></div>
          <div>
            <h2>安全與登入</h2>
            <p>保護您的帳戶安全</p>
          </div>
        </div>
        <button class="setting-row" type="button" @click="showFeedback('密碼變更流程尚未啟用')">
          <LockKeyhole :size="20" />
          <span><strong>修改密碼</strong><small>定期更新密碼以保護帳戶安全</small></span>
          <ChevronRight :size="20" />
        </button>
        <div class="setting-row">
          <ShieldCheck :size="20" />
          <span><strong>兩步驟驗證</strong><small>加強帳戶登入安全性</small></span>
          <Switch
            v-model="twoFactorEnabled"
            aria-label="兩步驟驗證"
            @update:model-value="
              showFeedback(twoFactorEnabled ? '兩步驟驗證已開啟' : '兩步驟驗證已關閉')
            "
          />
        </div>
        <div class="login-history">
          <div class="history-header">
            <strong>最近登入紀錄</strong>
            <button type="button" @click="showFeedback('已顯示全部登入紀錄')">查看全部</button>
          </div>
          <div class="device-row">
            <Laptop :size="18" />
            <span
              ><strong>Windows · Chrome <em>目前裝置</em></strong
              ><small>台灣 台北市</small></span
            >
            <time>2024/11/20 10:32</time>
          </div>
          <div class="device-row">
            <Smartphone :size="18" />
            <span><strong>iPhone 15 · Safari</strong><small>台灣 台中市</small></span>
            <time>2024/11/18 21:15</time>
          </div>
          <button class="device-logout" type="button" @click="showFeedback('其他裝置已登出')">
            <LogOut :size="17" /> 登出其他裝置
          </button>
        </div>
      </article>

      <div class="side-stack">
        <article class="account-card compact-card">
          <div class="card-heading">
            <div class="heading-icon"><Bell :size="24" /></div>
            <div>
              <h2>通知設定</h2>
              <p>管理您接收的通知類型與方式</p>
            </div>
          </div>
          <div class="setting-row compact-row">
            <Bell :size="20" />
            <span><strong>推播通知</strong><small>租金、停水停電、租補等提醒</small></span>
            <Switch
              v-model="pushNotifications"
              aria-label="推播通知"
              @update:model-value="persistNotification('push', pushNotifications)"
            />
          </div>
          <div class="setting-row compact-row">
            <Mail :size="20" />
            <span><strong>電子郵件通知</strong><small>接收帳戶重要通知</small></span>
            <Switch
              v-model="emailNotifications"
              aria-label="電子郵件通知"
              @update:model-value="persistNotification('email', emailNotifications)"
            />
          </div>
        </article>

        <article class="account-card compact-card support-card">
          <div class="card-heading">
            <div class="heading-icon"><Headphones :size="24" /></div>
            <div>
              <h2>支援與服務</h2>
              <p>取得幫助與各項服務協助</p>
            </div>
          </div>
          <button class="support-row" type="button" @click="showFeedback('正在為您連結客服中心')">
            <MessageSquareText :size="20" /><span
              ><strong>客服中心</strong><small>聯繫客服人員取得協助</small></span
            ><ChevronRight :size="20" />
          </button>
          <button class="support-row" type="button" @click="showFeedback('正在開啟常見問題')">
            <MessageSquareText :size="20" /><span
              ><strong>常見問題</strong><small>查看常見問題與解答</small></span
            ><ChevronRight :size="20" />
          </button>
          <button
            class="support-row"
            type="button"
            @click="showFeedback('感謝您的意見，我們會持續改進')"
          >
            <PencilLine :size="20" /><span
              ><strong>意見回饋</strong><small>告訴我們如何改進服務</small></span
            ><ChevronRight :size="20" />
          </button>
        </article>
      </div>

      <article class="account-card more-card">
        <div class="card-heading">
          <div class="heading-icon"><KeyRound :size="24" /></div>
          <div>
            <h2>更多設定</h2>
            <p>管理其他帳戶相關設定</p>
          </div>
        </div>
        <div class="more-grid">
          <button type="button" @click="showFeedback('目前語言：繁體中文')">
            <Languages :size="21" /><span
              ><strong>語言設定</strong><small>目前語言：繁體中文</small></span
            ><ChevronRight :size="19" />
          </button>
          <button type="button" @click="showFeedback('正在開啟隱私權政策')">
            <FileLock2 :size="21" /><span
              ><strong>隱私權政策</strong><small>查看我們的隱私權政策條款</small></span
            ><ChevronRight :size="19" />
          </button>
          <button type="button" @click="showFeedback('帳戶資料匯出準備中')">
            <Download :size="21" /><span
              ><strong>資料匯出</strong><small>下載您的帳戶資料</small></span
            ><ChevronRight :size="19" />
          </button>
        </div>
      </article>

      <article class="account-card danger-card">
        <div class="card-heading danger-heading">
          <div class="heading-icon"><AlertTriangle :size="24" /></div>
          <div>
            <h2>危險操作</h2>
            <p>這些操作可能會影響您的帳戶資料，請謹慎執行</p>
          </div>
        </div>
        <div class="delete-row">
          <Trash2 :size="21" />
          <span
            ><strong>刪除帳戶</strong
            ><small>刪除帳戶後，租約、帳單、點交紀錄與個人資料將無法復原。</small></span
          >
          <button type="button" @click="handleDeleteAccount">
            {{ deleteConfirming ? '確認刪除？' : '刪除帳戶' }}
          </button>
        </div>
      </article>

      <aside class="security-banner">
        <div class="banner-icon"><ShieldCheck :size="25" /></div>
        <div>
          <strong>提升帳戶安全，守護您的租屋生活</strong>
          <p>建議您完成所有安全設定，確保帳戶及個人資料安全無虞。</p>
        </div>
        <button type="button" @click="showFeedback('您的安全設定完成度為 80%')">
          前往安全檢查
        </button>
      </aside>
    </section>

    <button class="signout-button" type="button" @click="handleSignOut">
      <LogOut :size="18" /> 登出帳戶
    </button>

    <Transition name="toast">
      <div v-if="feedback" class="feedback-toast" role="status">
        <Check :size="18" /> {{ feedback }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.account-page {
  --account-primary: #4f46e5;
  --account-primary-dark: #3730a3;
  --account-ink: #17213b;
  --account-muted: #66728d;
  --account-line: #e8eaf2;
  position: relative;
  width: 100%;
  color: var(--account-ink);
  font-size: 16px;
}

.account-page :where(button, input, small, p, span) {
  font-size: inherit;
}
button {
  font-family: inherit;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.page-header p {
  margin: 8px 0 0;
  color: var(--account-muted);
  font-size: 16px;
}
.header-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 16px;
}
.header-user strong {
  white-space: nowrap;
}
.notification-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-right: 4px;
  border: 0;
  background: transparent;
  color: var(--account-primary);
  cursor: pointer;
}
.notification-count {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 2px solid #f8f8fc;
  border-radius: 99px;
  background: #ef4444;
  color: white;
  font-size: 13px !important;
  font-weight: 700;
}
.mini-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ede9fe, #ddd6fe);
  color: var(--account-primary);
  font-size: 18px;
  font-weight: 800;
}
.header-chevron {
  transform: rotate(90deg);
  color: var(--account-muted);
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}
.account-card {
  overflow: hidden;
  border: 1px solid var(--account-line);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 5px 20px rgba(35, 42, 83, 0.055);
}
.profile-card {
  grid-column: span 4;
  padding: 24px 20px 20px;
}
.security-card {
  grid-column: span 4;
  padding: 20px;
}
.side-stack {
  grid-column: span 4;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.more-card {
  grid-column: span 7;
  padding: 20px;
}
.danger-card {
  grid-column: span 5;
  border-color: #fecaca;
  padding: 20px;
}

.profile-summary {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 18px;
  min-height: 156px;
  padding-bottom: 22px;
}
.avatar-wrap {
  position: relative;
  display: grid;
  flex: 0 0 96px;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #f5f3ff 0 25%, #ddd6fe 68%, #c7d2fe 100%);
  color: var(--account-primary);
  font-size: 38px;
  font-weight: 800;
}
.avatar-badge {
  position: absolute;
  right: 1px;
  bottom: 2px;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border: 3px solid white;
  border-radius: 50%;
  background: #eef2ff;
}
.profile-identity {
  min-width: 0;
  padding-top: 6px;
}
.name-line,
.email-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.name-line h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  font-weight: 800;
}
.email-line {
  margin-top: 8px;
  color: #405071;
  font-size: 16px;
}
.profile-identity p {
  margin: 8px 0 0;
  color: #405071;
  font-size: 16px;
}
.security-score span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 99px;
  background: #fff7df;
  padding: 3px 9px;
  color: #d97706;
  font-size: 13px;
  font-weight: 700;
}
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 25px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 13px !important;
  font-weight: 700;
  white-space: nowrap;
}
.pill-purple {
  background: #eeecff;
  color: #6556dd;
}
.pill-green {
  background: #e5f8ef;
  color: #159669;
}
.outline-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  border-radius: 9px;
  padding: 8px 13px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.outline-button {
  border: 1px solid #8b80f9;
  background: white;
  color: var(--account-primary);
}
.edit-button {
  position: absolute;
  top: 0;
  right: 0;
}
.primary-button {
  border: 1px solid var(--account-primary);
  background: var(--account-primary);
  color: white;
}

.card-section {
  border-top: 1px solid var(--account-line);
  padding-top: 16px;
}
.card-section h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
  color: #1e2a48;
  font-size: 18px;
  font-weight: 800;
}
.card-section h3 svg,
.info-row > svg:first-child {
  color: var(--account-primary);
}
.info-row {
  display: grid;
  grid-template-columns: 22px minmax(112px, auto) 1fr auto auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  border: 0;
  border-bottom: 1px solid #eff0f5;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.info-row:last-child {
  border-bottom: 0;
}
.row-label,
.row-value {
  font-size: 16px;
}
.row-label {
  font-weight: 700;
}
.row-value {
  min-width: 0;
  color: #53617d;
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  border-top: 1px solid var(--account-line);
  padding-top: 18px;
}
.edit-form label {
  display: grid;
  gap: 7px;
  color: #34425f;
  font-size: 16px;
  font-weight: 700;
}
.edit-form input {
  width: 100%;
  height: 43px;
  border: 1px solid #d9ddea;
  border-radius: 9px;
  padding: 0 12px;
  background: #fff;
  color: var(--account-ink);
  font-size: 16px;
  outline: none;
}
.edit-form input:focus {
  border-color: #8176ed;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}
.edit-form .primary-button {
  grid-column: 1 / -1;
  justify-self: end;
}

.card-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--account-line);
}
.heading-icon {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--account-primary);
}
.card-heading h2 {
  margin: 0;
  font-size: 21px;
  line-height: 1.35;
  font-weight: 800;
}
.card-heading p {
  margin: 5px 0 0;
  color: var(--account-muted);
  font-size: 14px;
  line-height: 1.45;
}
.setting-row {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  border: 0;
  border-bottom: 1px solid var(--account-line);
  background: transparent;
  color: inherit;
  text-align: left;
}
button.setting-row {
  cursor: pointer;
}
.setting-row > svg {
  color: var(--account-primary);
}
.setting-row span,
.device-row span,
.support-row span,
.more-grid span,
.delete-row span {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.setting-row strong,
.support-row strong,
.more-grid strong,
.delete-row strong {
  font-size: 16px;
  font-style: normal;
}
.setting-row small,
.device-row small,
.support-row small,
.more-grid small,
.delete-row small {
  color: var(--account-muted);
  font-size: 14px;
  line-height: 1.35;
}

.login-history {
  margin-top: 15px;
  border: 1px solid #e1e2ff;
  border-radius: 11px;
  background: linear-gradient(145deg, #fafaff, #f7f6ff);
  padding: 14px 12px 8px;
}
.history-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--account-primary);
  font-size: 14px;
}
.history-header button {
  border: 0;
  background: transparent;
  color: var(--account-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.device-row {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}
.device-row > svg {
  color: #5d6a85;
}
.device-row strong {
  font-size: 14px;
  font-weight: 650;
}
.device-row em {
  margin-left: 5px;
  border-radius: 99px;
  background: #ddf7e9;
  padding: 2px 7px;
  color: #169b69;
  font-size: 13px;
  font-style: normal;
}
.device-row time {
  color: #596784;
  font-size: 13px;
  white-space: nowrap;
}
.device-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  border: 1px solid #c7c3ff;
  border-radius: 8px;
  background: transparent;
  color: var(--account-primary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.compact-card {
  padding: 20px;
}
.compact-row {
  min-height: 74px;
}
.support-row {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 61px;
  border: 0;
  border-bottom: 1px solid var(--account-line);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.support-row:last-child {
  border-bottom: 0;
}
.support-row > svg:first-child {
  color: var(--account-primary);
}

.more-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.more-grid button {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 8px 14px;
  border: 0;
  border-right: 1px solid var(--account-line);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.more-grid button:first-child {
  padding-left: 0;
}
.more-grid button:last-child {
  border-right: 0;
  padding-right: 0;
}
.more-grid button > svg:first-child {
  color: var(--account-primary);
}

.danger-heading h2,
.danger-heading p,
.danger-heading .heading-icon {
  color: #ef4444;
}
.delete-row {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  color: #ef4444;
}
.delete-row button {
  min-height: 43px;
  border: 1px solid #ef4444;
  border-radius: 9px;
  background: white;
  padding: 8px 17px;
  color: #ef4444;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.security-banner {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 46px 1fr auto;
  align-items: center;
  gap: 14px;
  min-height: 84px;
  border: 1px solid #d9d7ff;
  border-radius: 13px;
  background: linear-gradient(100deg, #faf9ff, #f6f6ff);
  padding: 14px 20px;
}
.banner-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: #e9e7ff;
  color: var(--account-primary);
}
.security-banner strong {
  font-size: 16px;
}
.security-banner p {
  margin: 5px 0 0;
  color: var(--account-muted);
  font-size: 14px;
}
.security-banner button {
  min-height: 44px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, #4f46e5, #4338ca);
  padding: 9px 22px;
  color: white;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.signout-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  border: 0;
  background: transparent;
  color: #dc2626;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.feedback-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(390px, calc(100vw - 32px));
  min-height: 48px;
  border: 1px solid #d7d9e6;
  border-radius: 11px;
  background: #17213b;
  padding: 12px 16px;
  color: white;
  box-shadow: 0 12px 32px rgba(20, 26, 52, 0.25);
  font-size: 14px;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

button:hover {
  filter: brightness(0.98);
}
button:focus-visible {
  outline: 3px solid rgba(79, 70, 229, 0.25);
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .profile-card,
  .security-card {
    grid-column: span 6;
  }
  .side-stack {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .more-card,
  .danger-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .account-page {
    font-size: 16px;
  }
  .page-header {
    align-items: center;
  }
  .page-header h1 {
    font-size: 32px;
  }
  .header-user strong,
  .header-chevron {
    display: none;
  }
  .profile-card,
  .security-card,
  .side-stack,
  .more-card,
  .danger-card {
    grid-column: 1 / -1;
  }
  .side-stack {
    display: flex;
  }
  .profile-summary {
    flex-wrap: wrap;
    padding-top: 52px;
  }
  .profile-identity {
    flex: 1;
  }
  .edit-button {
    left: 0;
    right: auto;
  }
  .more-grid {
    grid-template-columns: 1fr;
  }
  .more-grid button,
  .more-grid button:first-child,
  .more-grid button:last-child {
    min-height: 66px;
    border-right: 0;
    border-bottom: 1px solid var(--account-line);
    padding: 8px 0;
  }
  .more-grid button:last-child {
    border-bottom: 0;
  }
  .security-banner {
    grid-template-columns: 46px 1fr;
  }
  .security-banner button {
    grid-column: 1 / -1;
    width: 100%;
  }
}

@media (max-width: 520px) {
  .page-header p {
    font-size: 14px;
  }
  .header-user {
    gap: 4px;
  }
  .notification-button {
    width: 36px;
  }
  .mini-avatar {
    width: 38px;
    height: 38px;
  }
  .profile-card,
  .security-card,
  .compact-card,
  .more-card,
  .danger-card {
    padding: 18px 15px;
  }
  .avatar-wrap {
    flex-basis: 82px;
    width: 82px;
    height: 82px;
    font-size: 32px;
  }
  .name-line h2 {
    font-size: 21px;
  }
  .info-row {
    grid-template-columns: 22px 1fr auto;
    gap: 8px;
    padding: 10px 0;
  }
  .info-row .row-value {
    grid-column: 2;
  }
  .info-row .pill {
    grid-column: 3;
    grid-row: 1;
  }
  .info-row > svg:last-child {
    grid-column: 3;
    grid-row: 2;
  }
  .edit-form {
    grid-template-columns: 1fr;
  }
  .device-row {
    grid-template-columns: 20px 1fr;
  }
  .device-row time {
    grid-column: 2;
  }
  .delete-row {
    grid-template-columns: 24px 1fr;
    padding-top: 12px;
  }
  .delete-row button {
    grid-column: 1 / -1;
    width: 100%;
  }
  .feedback-toast {
    right: 16px;
    bottom: 80px;
  }
}
</style>
