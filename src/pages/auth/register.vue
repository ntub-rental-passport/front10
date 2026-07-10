<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Checkbox } from '@/components/ui/checkbox/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  BadgeCheck,
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  House,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Ticket,
  UserRound,
} from 'lucide-vue-next'
import {
  needsNicknameSetup,
  registerWithGoogle,
  resolveRoleHome,
  startEmailRegistration,
} from '@/src/composables/useAuth'
import {
  authIdentityOptions,
  getAuthIdentity,
  type AuthIdentity,
} from '@/src/constants/auth-identity'
import {
  authPasswordNumberPattern,
  authPasswordSpecialPattern,
  authPasswordUppercasePattern,
  isStrongPassword,
  isValidAuthEmail,
  type FieldState,
} from '@/src/constants/auth-validation'

interface PasswordRule {
  id: string
  label: string
  met: boolean
}

const router = useRouter()
const route = useRoute()
const form = ref({
  email: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
})
const agreeToTerms = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errorMessage = ref('')
const hasSubmitted = ref(false)
const selectedIdentity = ref<AuthIdentity>(getAuthIdentity(route.query.role))

const selectedOption = computed(
  () => authIdentityOptions.find((option) => option.value === selectedIdentity.value) ?? authIdentityOptions[0],
)

const loginLink = computed(() => ({
  path: '/login',
  query: {
    role: selectedIdentity.value,
  },
}))

const roleSummary = computed(() =>
  selectedIdentity.value === 'tenant'
    ? '開始管理租屋，更高效、更安心。'
    : '開始管理物件與租客，更高效、更安心。',
)

const passwordRules = computed<PasswordRule[]>(() => {
  const password = form.value.password

  return [
    {
      id: 'length',
      label: '8-20 個字元',
      met: password.length >= 8 && password.length <= 20,
    },
    {
      id: 'uppercase',
      label: '至少一個大寫字母',
      met: authPasswordUppercasePattern.test(password),
    },
    {
      id: 'number',
      label: '至少一個數字',
      met: authPasswordNumberPattern.test(password),
    },
    {
      id: 'special',
      label: '至少一個特殊符號',
      met: authPasswordSpecialPattern.test(password),
    },
  ]
})

const emailState = computed<FieldState>(() => {
  if (!form.value.email.trim()) {
    return hasSubmitted.value ? 'error' : 'default'
  }

  return isValidAuthEmail(form.value.email) ? 'valid' : 'error'
})

const passwordState = computed<FieldState>(() => {
  if (!form.value.password) {
    return hasSubmitted.value ? 'error' : 'default'
  }

  return isStrongPassword(form.value.password) ? 'valid' : 'error'
})

const confirmPasswordState = computed<FieldState>(() => {
  if (!form.value.confirmPassword) {
    return hasSubmitted.value ? 'error' : 'default'
  }

  return form.value.confirmPassword === form.value.password ? 'valid' : 'error'
})

const emailMessage = computed(() => {
  if (emailState.value === 'valid') return '格式正確'
  if (emailState.value === 'error') {
    return form.value.email.trim()
      ? '請輸入有效的電子信箱格式（例如：name@example.com）'
      : '請先輸入電子信箱。'
  }
  return ''
})

const passwordMessage = computed(() => {
  if (passwordState.value === 'valid') return '密碼強度：強'
  if (passwordState.value === 'error') {
    return form.value.password
      ? '密碼至少需要 8 個字元，並包含大寫字母、數字與特殊符號。'
      : '請先輸入密碼。'
  }
  return ''
})

const confirmPasswordMessage = computed(() => {
  if (confirmPasswordState.value === 'valid') return '密碼一致'
  if (confirmPasswordState.value === 'error') {
    return form.value.confirmPassword ? '兩次輸入的密碼不一致。' : '請再次輸入密碼。'
  }
  return ''
})

function getInputStateClass(state: FieldState): string {
  if (state === 'valid') return 'auth-input--valid'
  if (state === 'error') return 'auth-input--error'
  return 'auth-input--default'
}

function selectIdentity(identity: AuthIdentity): void {
  selectedIdentity.value = identity
  errorMessage.value = ''
  void router.replace({
    query: {
      ...route.query,
      role: identity,
    },
  })
}

function validateRegistrationForm(): boolean {
  if (emailState.value === 'error' || passwordState.value === 'error' || confirmPasswordState.value === 'error') {
    return false
  }

  if (!agreeToTerms.value) {
    errorMessage.value = '請先閱讀並同意服務條款與隱私權政策。'
    return false
  }

  errorMessage.value = ''
  return true
}

function validateGoogleRegistration(): boolean {
  if (!agreeToTerms.value) {
    errorMessage.value = '使用 Google 註冊前，請先同意服務條款與隱私權政策。'
    return false
  }

  errorMessage.value = ''
  return true
}

async function handleRegister(): Promise<void> {
  hasSubmitted.value = true
  if (!validateRegistrationForm()) return

  const pendingRegistration = startEmailRegistration(
    form.value.email || 'new-user@rentmate.tw',
    form.value.password || 'Password123!',
    selectedOption.value.authRole,
  )

  await router.push({
    path: '/verify-email',
    query: {
      email: pendingRegistration.email,
      role: selectedIdentity.value,
    },
  })
}

async function handleGoogleRegister(): Promise<void> {
  if (!validateGoogleRegistration()) return

  const session = registerWithGoogle(
    form.value.email || `google-${selectedIdentity.value}@rentmate.tw`,
    selectedOption.value.authRole,
  )

  await router.push(needsNicknameSetup(session) ? '/welcome' : resolveRoleHome(session.role))
}
</script>

<template>
  <AuthShell content-width-class="max-w-3xl" :footer-note="selectedOption.registerFooterNote">
    <div class="auth-page-header">
      <div>
        <p class="auth-page-eyebrow">Register</p>
        <h2 class="auth-page-title">建立你的 RentMate 帳號</h2>
        <p class="auth-page-subtitle">
          {{ roleSummary }}
        </p>
      </div>
    </div>

    <form class="auth-page-form" @submit.prevent="handleRegister">
      <section class="auth-form-section auth-form-section--spacious">
        <div class="auth-role-section">
          <div class="auth-role-grid">
            <button
              v-for="option in authIdentityOptions"
              :key="option.value"
              type="button"
              :aria-pressed="selectedIdentity === option.value"
              :class="[
                'auth-role-card',
                selectedIdentity === option.value ? 'auth-role-card--selected' : 'auth-role-card--idle',
              ]"
              @click="selectIdentity(option.value)"
            >
              <div class="auth-role-card__content">
                <div
                  :class="[
                    'auth-role-card__icon-shell',
                    selectedIdentity === option.value ? 'auth-role-card__icon-shell--selected' : 'auth-role-card__icon-shell--idle',
                  ]"
                >
                  <UserRound v-if="option.value === 'tenant'" class="auth-role-card__icon" />
                  <House v-else class="auth-role-card__icon" />
                </div>
                <div class="auth-role-card__text auth-role-card__text--grow">
                  <div class="auth-role-card__label-row">
                    <p class="auth-role-card__label">
                      {{ option.value === 'tenant' ? '我是租客' : '我是房東' }}
                    </p>
                    <BadgeCheck
                      v-if="selectedIdentity === option.value"
                      class="auth-role-card__badge"
                    />
                  </div>
                  <p
                    :class="[
                      'auth-role-card__description',
                      selectedIdentity === option.value ? 'auth-role-card__description--selected' : 'auth-role-card__description--idle',
                    ]"
                  >
                    {{ option.value === 'tenant' ? '尋找理想房源、輕鬆租屋' : '管理物件與租客更簡單' }}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="auth-field-block">
          <Label for="register-email" class="auth-field-label">電子信箱</Label>
          <div class="auth-input-wrap">
            <Mail class="auth-input-icon" />
            <Input
              id="register-email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="name@example.com"
              :class="['auth-input auth-input--with-status auth-input--with-leading', getInputStateClass(emailState)]"
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

        <div class="auth-field-block auth-field-block--dense">
          <Label for="register-password" class="auth-field-label">密碼</Label>
          <div class="auth-input-wrap">
            <LockKeyhole class="auth-input-icon" />
            <Input
              id="register-password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="請輸入密碼"
              :class="['auth-input auth-input--with-status auth-input--with-leading', getInputStateClass(passwordState)]"
            />
            <button
              type="button"
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
          <div class="password-rule-list">
            <div
              v-for="rule in passwordRules"
              :key="rule.id"
              :class="['password-rule-item', rule.met ? 'password-rule-item--met' : 'password-rule-item--idle']"
            >
              <ShieldCheck class="password-rule-icon" />
              <span>{{ rule.label }}</span>
            </div>
          </div>
        </div>

        <div class="auth-field-block">
          <Label for="register-confirm-password" class="auth-field-label">確認密碼</Label>
          <div class="auth-input-wrap">
            <LockKeyhole class="auth-input-icon" />
            <Input
              id="register-confirm-password"
              v-model="form.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="請再次輸入密碼"
              :class="['auth-input auth-input--with-status auth-input--with-leading', getInputStateClass(confirmPasswordState)]"
            />
            <button
              type="button"
              class="auth-input-toggle"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <EyeOff v-if="showConfirmPassword" class="auth-input-toggle-icon" />
              <Eye v-else class="auth-input-toggle-icon" />
            </button>
          </div>
          <p
            v-if="confirmPasswordMessage"
            :class="['auth-feedback', confirmPasswordState === 'valid' ? 'auth-feedback--valid' : 'auth-feedback--error']"
          >
            {{ confirmPasswordMessage }}
          </p>
        </div>

        <div class="auth-field-block">
          <Label for="register-invite-code" class="auth-field-label">
            邀請碼 / 共享物件代碼（選填）
          </Label>
          <div class="auth-input-wrap">
            <Ticket class="auth-input-icon" />
            <Input
              id="register-invite-code"
              v-model="form.inviteCode"
              type="text"
              placeholder="輸入邀請碼或共享物件代碼（選填）"
              class="auth-input auth-input--with-leading auth-input--default"
            />
          </div>
          <p class="auth-field-description auth-field-description--compact">
            租客可使用房東提供的代碼加入指定物件，房東也能透過代碼邀請租客加入同一租屋空間。
          </p>
        </div>

        <div class="auth-action-group">
          <Button type="submit" size="lg" class="auth-primary-button">
            建立帳號
          </Button>

          <div class="auth-divider">
            <div class="auth-divider-line" />
            <span>或透過以下方式註冊</span>
            <div class="auth-divider-line" />
          </div>

          <Button
            type="button"
            variant="outline"
            class="auth-secondary-button"
            @click="handleGoogleRegister"
          >
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
              alt="Google"
              class="auth-google-icon"
            />
            使用 Google 帳號註冊
          </Button>
        </div>

        <div class="auth-legal-card">
          <label class="auth-checkbox-row auth-checkbox-row--start">
            <Checkbox v-model:checked="agreeToTerms" class="auth-checkbox auth-checkbox--offset" />
            <span>
              我已閱讀並同意
              <span class="auth-inline-accent">服務條款</span>
              與
              <span class="auth-inline-accent">隱私權政策</span>
            </span>
          </label>

          <div class="auth-email-notice">
            <Mail class="auth-email-notice__icon" />
            <p>註冊完成後，我們會寄送驗證信到您的電子信箱，完成驗證後才能正式啟用帳號。</p>
          </div>

          <p v-if="errorMessage" class="auth-feedback auth-feedback--error auth-feedback--legal">{{ errorMessage }}</p>
        </div>
      </section>
    </form>

    <div class="auth-page-footer auth-page-footer--center">
      已經有帳號了？
      <RouterLink :to="loginLink" class="auth-footer-link">前往登入</RouterLink>
    </div>
  </AuthShell>
</template>

<style scoped src="./register.css"></style>
