<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Checkbox } from '@/components/ui/checkbox/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { CircleAlert, CircleCheckBig, Eye, EyeOff, House, LockKeyhole, Mail, UserRound } from 'lucide-vue-next'
import { resolveRoleHome, signIn } from '@/src/composables/useAuth'
import {
  authIdentityOptions,
  getAuthIdentity,
  type AuthIdentity,
} from '@/src/constants/auth-identity'
import {
  isStrongPassword,
  isValidAuthEmail,
  type FieldState,
} from '@/src/constants/auth-validation'

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const hasSubmitted = ref(false)
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

const emailState = computed<FieldState>(() => {
  if (!email.value.trim()) {
    return hasSubmitted.value ? 'error' : 'default'
  }

  return isValidAuthEmail(email.value) ? 'valid' : 'error'
})

const passwordState = computed<FieldState>(() => {
  if (!password.value) {
    return hasSubmitted.value ? 'error' : 'default'
  }

  return isStrongPassword(password.value) ? 'valid' : 'error'
})

const emailMessage = computed(() => {
  if (emailState.value === 'valid') return '格式正確'
  if (emailState.value === 'error') {
    return email.value.trim()
      ? '請輸入有效的電子信箱格式（例如：name@example.com）'
      : '請先輸入電子信箱。'
  }
  return ''
})

const passwordMessage = computed(() => {
  if (passwordState.value === 'valid') return '密碼格式正確'
  if (passwordState.value === 'error') {
    return password.value
      ? '密碼至少需要 8 個字元，並包含大寫字母、數字與特殊符號。'
      : '請先輸入密碼。'
  }
  return ''
})

function getInputStateClass(state: FieldState): string {
  if (state === 'valid') return 'auth-input--valid'
  if (state === 'error') return 'auth-input--error'
  return 'auth-input--default'
}

async function handleLogin(): Promise<void> {
  hasSubmitted.value = true
  if (emailState.value === 'error' || passwordState.value === 'error') return

  signIn(selectedOption.value.authRole, email.value || `${selectedIdentity.value}@rentmate.tw`)
  await router.push(getPostLoginTarget())
}

async function handleGoogleLogin(): Promise<void> {
  signIn(selectedOption.value.authRole, email.value || `google-${selectedIdentity.value}@rentmate.tw`)
  await router.push(getPostLoginTarget())
}
</script>

<template>
  <AuthShell content-width-class="max-w-xl" :footer-note="selectedOption.loginFooterNote">
    <div class="auth-page-header">
      <div>
        <p class="auth-page-eyebrow">Sign In</p>
        <h2 class="auth-page-title">登入 RentMate</h2>
        <p class="auth-page-subtitle">
          歡迎回來，請先選擇身分，再登入您的 RentMate 帳號。
        </p>
      </div>
    </div>

    <form class="auth-page-form" @submit.prevent="handleLogin">
      <section class="auth-role-section">
        <div class="auth-role-copy">
          <p class="auth-role-title">選擇登入身分</p>
          <p class="auth-role-description">切換不同角色後，登入後會進入對應的工作區與操作流程。</p>
        </div>

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
              <div class="auth-role-card__text">
                <p class="auth-role-card__label">{{ option.label }}</p>
                <p
                  :class="[
                    'auth-role-card__description',
                    selectedIdentity === option.value ? 'auth-role-card__description--selected' : 'auth-role-card__description--idle',
                  ]"
                >
                  {{ option.description }}
                </p>
              </div>
            </div>
          </button>
        </div>
      </section>

      <section class="auth-form-section">
        <div class="auth-helper-card">
          {{ selectedOption.helper }}
        </div>

        <div class="auth-field-block">
          <div class="auth-field-copy">
            <Label for="login-email" class="auth-field-label">電子信箱</Label>
            <p class="auth-field-description">使用您在 RentMate 建立的信箱帳號登入。</p>
          </div>
          <div class="auth-input-wrap">
            <Mail class="auth-input-icon" />
            <Input
              id="login-email"
              v-model="email"
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

        <div class="auth-field-row">
          <Label for="login-password" class="auth-field-label">密碼</Label>
          <button type="button" class="auth-inline-link">
            忘記密碼？
          </button>
        </div>
        <div class="auth-input-wrap">
          <LockKeyhole class="auth-input-icon" />
          <Input
            id="login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
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

        <label class="auth-checkbox-row">
          <Checkbox v-model:checked="rememberMe" class="auth-checkbox" />
          記住這個登入狀態
        </label>

        <Button type="submit" size="lg" class="auth-primary-button">
          登入
        </Button>
      </section>
    </form>

    <div class="auth-page-footer">
      <div class="auth-divider">
        <div class="auth-divider-line" />
        <span>或透過社群帳號登入</span>
        <div class="auth-divider-line" />
      </div>

      <Button
        type="button"
        variant="outline"
        class="auth-secondary-button"
        @click="handleGoogleLogin"
      >
        <img
          src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
          alt="Google"
          class="auth-google-icon"
        />
        使用 Google 帳號登入
      </Button>

      <p class="auth-footer-copy">
        還沒有帳號？
        <RouterLink :to="registerLink" class="auth-footer-link">立即註冊</RouterLink>
      </p>
    </div>
  </AuthShell>
</template>

<style scoped src="./login.css"></style>
