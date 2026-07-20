<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { Checkbox } from '@/components/ui/checkbox/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Bell,
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Mail,
  Wrench,
} from 'lucide-vue-next'
import rentmateLogoIcon from '@/src/assets/Logo/Rentmate-Logo-icon.png'
import {
  needsNicknameSetup,
  registerWithGoogle,
  resolveRoleHome,
  saveGoogleRegistrationContext,
  signInWithEmail,
  type EmailSignInError,
} from '@/src/composables/useAuth'
import {
  authIdentityOptions,
  getAuthIdentity,
  type AuthIdentity,
} from '@/src/constants/auth-identity'
import {
  isValidAuthEmail,
  type FieldState,
} from '@/src/constants/auth-validation'
import {
  exchangeGoogleTicket,
  getGoogleLoginUrl,
} from '@/src/services/authApi'

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const hasSubmitted = ref(false)
const loginError = ref('')
const googleLoginPending = ref(false)
const router = useRouter()
const route = useRoute()
const selectedIdentity = ref<AuthIdentity>(getAuthIdentity(route.query.role))

const selectedOption = computed(
  () => authIdentityOptions.find((option) => option.value === selectedIdentity.value) ?? authIdentityOptions[0],
)

const registerLink = computed(() => ({
  path: '/register',
  query: {
    role: selectedIdentity.value,
  },
}))

function selectIdentity(identity: AuthIdentity): void {
  selectedIdentity.value = identity
  void router.replace({
    query: {
      ...route.query,
      role: identity,
    },
  })
}

function getPostLoginTarget(): string {
  const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : null
  return redirectTarget || resolveRoleHome(selectedOption.value.authRole)
}

const googleLoginUrl = computed(() =>
  getGoogleLoginUrl(selectedOption.value.authRole, getPostLoginTarget()),
)

const emailState = computed<FieldState>(() => {
  if (!hasSubmitted.value) return 'default'
  if (!email.value.trim() || !isValidAuthEmail(email.value)) return 'error'
  return 'default'
})

const passwordState = computed<FieldState>(() => {
  if (!hasSubmitted.value) return 'default'
  return password.value ? 'default' : 'error'
})

const emailMessage = computed(() => {
  if (emailState.value !== 'error') return ''
  return email.value.trim()
    ? '請輸入有效的電子信箱格式（例如：name@example.com）'
    : '請先輸入電子信箱。'
})

const passwordMessage = computed(() =>
  passwordState.value === 'error' ? '請先輸入密碼。' : '',
)

function getInputStateClass(state: FieldState): string {
  if (state === 'error') return 'auth-input--error'
  return 'auth-input--default'
}

const loginErrorMessages: Record<EmailSignInError, string> = {
  'account-not-found': '找不到此帳號，請先完成註冊。',
  'invalid-password': '密碼不正確，請重新輸入。',
  'role-mismatch': '此帳號的租客／房東身分與目前選擇不符。',
  'email-not-verified': '此帳號尚未完成電子郵件驗證。',
}

async function handleLogin(): Promise<void> {
  hasSubmitted.value = true
  loginError.value = ''
  if (emailState.value === 'error' || passwordState.value === 'error') return

  const result = signInWithEmail(email.value, password.value, selectedOption.value.authRole)
  if ('error' in result) {
    loginError.value = loginErrorMessages[result.error]
    return
  }

  await router.push(getPostLoginTarget())
}

const googleOAuthErrorMessages: Record<string, string> = {
  access_denied: '你已取消 Google 登入。',
  invalid_state: 'Google 登入狀態已過期，請重新登入。',
  missing_config: '後端尚未設定 Google Client Secret。',
  verification_failed: 'Google 帳號驗證失敗，請稍後再試。',
}

async function clearGoogleOAuthQuery(): Promise<void> {
  const nextQuery = { ...route.query }
  delete nextQuery.google_ticket
  delete nextQuery.google_error
  await router.replace({ query: nextQuery })
}

async function handleGoogleOAuthReturn(): Promise<void> {
  const oauthError = typeof route.query.google_error === 'string'
    ? route.query.google_error
    : null
  const ticket = typeof route.query.google_ticket === 'string'
    ? route.query.google_ticket
    : null

  if (oauthError) {
    loginError.value = googleOAuthErrorMessages[oauthError] || 'Google 登入失敗，請重新嘗試。'
    await clearGoogleOAuthQuery()
    return
  }
  if (!ticket) return

  googleLoginPending.value = true
  loginError.value = ''
  try {
    const account = await exchangeGoogleTicket(ticket)
    if (account.registrationRequired === true) {
      saveGoogleRegistrationContext(account)
      await router.replace({
        path: '/register',
        query: { role: account.role, google: '1' },
      })
      return
    }
    const session = registerWithGoogle(account.email, account.role)
    const target = needsNicknameSetup(session)
      ? '/welcome'
      : account.redirectPath || resolveRoleHome(session.role)
    await router.replace(target)
  } catch (error) {
    loginError.value = error instanceof Error
      ? error.message
      : 'Google 登入失敗，請重新嘗試。'
    await clearGoogleOAuthQuery()
  } finally {
    googleLoginPending.value = false
  }
}

onMounted(handleGoogleOAuthReturn)

</script>

<template>
  <div class="login-page">
    <header class="login-header">
      <RouterLink to="/" class="login-brand" aria-label="回到 RentMate 首頁">
        <img :src="rentmateLogoIcon" alt="" class="login-brand__icon" />
        <span>RentMate</span>
      </RouterLink>
    </header>

    <div class="login-title-bar">
      <h1>登入</h1>
    </div>

    <main class="login-content">
      <section class="login-panel login-panel--form">
        <div class="login-panel__inner">
          <h2 class="login-section-title">會員登入</h2>

          <form class="auth-page-form" @submit.prevent="handleLogin">
            <div class="auth-role-tabs" aria-label="選擇登入身分">
              <button
                v-for="option in authIdentityOptions"
                :key="option.value"
                type="button"
                :aria-pressed="selectedIdentity === option.value"
                :class="['auth-role-tab', { 'auth-role-tab--selected': selectedIdentity === option.value }]"
                @click="selectIdentity(option.value)"
              >
                {{ option.value === 'tenant' ? '租客' : '房東' }}
              </button>
            </div>

            <section class="auth-form-section">
        <div class="auth-field-block">
          <Label for="login-email" class="auth-field-label">電子郵件地址</Label>
          <div class="auth-input-wrap">
            <Mail class="auth-input-icon" />
            <Input
              id="login-email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="name@example.com"
              :class="['auth-input auth-input--with-status auth-input--with-leading', getInputStateClass(emailState)]"
              @input="loginError = ''"
            />
            <CircleCheckBig
              v-if="emailState === 'valid'"
              class="auth-input-status-icon auth-input-status-icon--valid"
            />
            <CircleAlert
              v-else-if="emailState === 'error'"
              class="auth-input-status-icon auth-input-status-icon--error"
            />
          </div>
          <p
            v-if="emailMessage"
            :class="['auth-feedback', emailState === 'valid' ? 'auth-feedback--valid' : 'auth-feedback--error']"
          >
            {{ emailMessage }}
          </p>
        </div>

        <div class="auth-field-block">
          <Label for="login-password" class="auth-field-label">密碼</Label>
          <div class="auth-input-wrap">
            <LockKeyhole class="auth-input-icon" />
            <Input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="請輸入密碼"
              :class="['auth-input auth-input--with-status auth-input--with-leading', getInputStateClass(passwordState)]"
              @input="loginError = ''"
            />
            <button
              type="button"
              :aria-label="showPassword ? '隱藏密碼' : '顯示密碼'"
              class="auth-input-toggle"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="auth-input-toggle-icon" />
              <Eye v-else class="auth-input-toggle-icon" />
            </button>
          </div>
          <p
            v-if="passwordMessage"
            :class="['auth-feedback', passwordState === 'valid' ? 'auth-feedback--valid' : 'auth-feedback--error']"
          >
            {{ passwordMessage }}
          </p>
        </div>

        <div class="auth-forgot-row">
          <button type="button" class="auth-inline-link">忘記密碼 / 修改密碼</button>
        </div>

        <label class="auth-checkbox-row">
          <Checkbox v-model="rememberMe" class="auth-checkbox" />
          記住這個登入狀態
        </label>

        <div class="auth-login-actions">
          <Button type="submit" size="lg" class="auth-primary-button">
            登入
          </Button>

          <div class="auth-divider" aria-hidden="true">
            <span class="auth-divider-line" />
            <span>或</span>
            <span class="auth-divider-line" />
          </div>

          <a
            :href="googleLoginUrl"
            class="auth-google-button"
            :aria-busy="googleLoginPending"
            :aria-disabled="googleLoginPending"
            @click="googleLoginPending && $event.preventDefault()"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt=""
              class="auth-google-icon"
            />
            <span>{{ googleLoginPending ? '正在完成 Google 登入…' : '使用 Google 帳號登入' }}</span>
          </a>

          <p
            v-if="loginError"
            class="auth-feedback auth-feedback--error auth-login-error"
            role="alert"
          >
            {{ loginError }}
          </p>
        </div>
            </section>
          </form>
        </div>
      </section>

      <section class="login-panel login-panel--register">
        <div class="register-promo">
          <h2>還沒有帳號？加入 RentMate</h2>
          <p class="register-promo__lead">建立帳號，輕鬆管理您的租賃事務。</p>

          <ul class="register-feature-list">
            <li>
              <FileText />
              <div><h3>合約與租期一目了然</h3><p>集中管理租約與租期，重要資訊不遺漏。</p></div>
            </li>
            <li>
              <Bell />
              <div><h3>租金提醒不錯過</h3><p>自動提醒繳租時間，守護您的權益與現金流。</p></div>
            </li>
            <li>
              <Wrench />
              <div><h3>維修管理更有效率</h3><p>報修追蹤與處理紀錄，提升租屋服務品質。</p></div>
            </li>
          </ul>

          <Button as-child class="register-promo__button">
            <RouterLink :to="registerLink">立即註冊</RouterLink>
          </Button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped src="./login.css"></style>
