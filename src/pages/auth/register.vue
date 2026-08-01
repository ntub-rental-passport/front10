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
  getGoogleRegistrationContext,
  startGoogleEmailRegistration,
  startEmailRegistration,
} from '@/src/composables/useAuth'
import { getGoogleLoginUrl } from '@/src/services/authApi'
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
const privacyPolicyUrl = `${import.meta.env.BASE_URL}rentmate-privacy-policy.pdf`
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
const googleRegistration = ref(getGoogleRegistrationContext())
const submitting = ref(false)

if (googleRegistration.value) {
  selectedIdentity.value = googleRegistration.value.role
  form.value.email = googleRegistration.value.email
}

const selectedOption = computed(
  () => authIdentityOptions.find((option) => option.value === selectedIdentity.value) ?? authIdentityOptions[0],
)

const loginLink = computed(() => ({
  path: '/login',
  query: {
    role: selectedIdentity.value,
  },
}))

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
  if (googleRegistration.value) return
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

  submitting.value = true
  try {
    const pendingRegistration = await startEmailRegistration(
      form.value.email,
      form.value.password,
      selectedOption.value.authRole,
      form.value.inviteCode,
    )
    await router.push({
      path: '/verify-email',
      query: { email: pendingRegistration.email, role: selectedIdentity.value },
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '無法開始註冊，請稍後再試。'
  } finally {
    submitting.value = false
  }
}

async function handleGoogleRegister(): Promise<void> {
  if (!validateGoogleRegistration()) return
  if (!googleRegistration.value) {
    submitting.value = true
    window.location.assign(getGoogleLoginUrl(selectedOption.value.authRole, '/register'))
    return
  }

  submitting.value = true
  try {
    const pendingRegistration = await startGoogleEmailRegistration(
      googleRegistration.value,
      form.value.inviteCode,
    )
    await router.push({
      path: '/verify-email',
      query: { email: pendingRegistration.email, role: selectedIdentity.value },
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '無法開始 Google 註冊，請稍後再試。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell content-width-class="max-w-xl" :footer-note="selectedOption.registerFooterNote">
    <div class="auth-page-header">
      <div>
        <p class="auth-page-eyebrow">Register</p>
        <h2 class="auth-page-title">建立你的 RentMate 帳號</h2>
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
              :disabled="Boolean(googleRegistration)"
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
              :disabled="Boolean(googleRegistration)"
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

        <div v-if="!googleRegistration" class="auth-field-block auth-field-block--dense">
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

        <div v-if="!googleRegistration" class="auth-field-block">
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
          <Button v-if="!googleRegistration" type="submit" size="lg" class="auth-primary-button" :disabled="submitting">
            建立帳號
          </Button>

          <div v-if="!googleRegistration" class="auth-divider">
            <div class="auth-divider-line" />
            <span>或透過以下方式註冊</span>
            <div class="auth-divider-line" />
          </div>

          <Button
            type="button"
            variant="outline"
            class="auth-secondary-button"
            :disabled="submitting"
            @click="handleGoogleRegister"
          >
            <img
              src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
              alt="Google"
              class="auth-google-icon"
            />
            {{
              submitting
                ? '處理中…'
                : googleRegistration
                  ? '寄送 Google 帳號驗證碼'
                  : '使用 Google 帳號註冊'
            }}
          </Button>

          <p
            v-if="errorMessage"
            role="alert"
            class="auth-feedback auth-feedback--error text-center"
          >
            {{ errorMessage }}
          </p>
        </div>

        <div class="auth-legal-card">
          <label class="auth-checkbox-row auth-checkbox-row--start">
            <Checkbox
              v-model="agreeToTerms"
              class="auth-checkbox auth-checkbox--offset"
              @update:model-value="errorMessage = ''"
            />
            <span>
              我已閱讀並同意
              <span class="auth-inline-accent">服務條款</span>
              與
              <a
                :href="privacyPolicyUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="auth-inline-accent"
                aria-label="在新分頁開啟 RentMate 隱私權政策 PDF"
                @click.stop
              >
                隱私權政策
              </a>
            </span>
          </label>

          <div class="auth-email-notice">
            <Mail class="auth-email-notice__icon" />
            <p>註冊完成後，我們會寄送驗證信到您的電子信箱，完成驗證後才能正式啟用帳號。</p>
          </div>
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
