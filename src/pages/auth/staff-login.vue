<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/layouts/AuthLayout.vue'
import DesktopOnlyNotice from '@/src/components/DesktopOnlyNotice.vue'
import { useAdminDeviceGate } from '@/src/composables/useDeviceGate'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  completeAdminSignIn,
  resolveRoleHome,
  startAdminSignIn,
  type AdminLoginChallenge,
} from '@/src/composables/useAuth'
import { recordLogin } from '@/src/composables/admin/useAdminUsers'

/* 權限由後端判定且須完成信箱驗證碼驗證才算登入，challengeId 是通過帳密的憑據，只能留在 ref，不可寫入 localStorage。 */
const router = useRouter()
const { blocked: deviceBlocked } = useAdminDeviceGate()
const route = useRoute()

const logoutNotice = computed(() => {
  if (route.query.reason === 'idle') return '你已經閒置超過 20 分鐘，為了保護後台已自動登出，請重新登入。'
  if (route.query.reason === 'expired') return '這次登入已經失效（可能在別處登出，或系統更新），請重新登入。'
  return ''
})

const step = ref<'credentials' | 'code'>('credentials')
const email = ref('')
const password = ref('')
const code = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const challenge = ref<AdminLoginChallenge | null>(null)

const now = ref(Date.now())
const ticker = window.setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => window.clearInterval(ticker))

const secondsLeft = computed(() => {
  if (!challenge.value) return 0
  return Math.max(0, Math.ceil((challenge.value.expiresAt - now.value) / 1000))
})
const countdownText = computed(() => {
  const total = secondsLeft.value
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})
const codeExpired = computed(() => step.value === 'code' && secondsLeft.value === 0)

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '登入服務暫時無法使用，請稍後再試。'
}

async function submitCredentials(): Promise<void> {
  errorMessage.value = ''

  if (!email.value.trim() || !password.value) {
    errorMessage.value = '請輸入內部人員信箱與密碼。'
    return
  }

  submitting.value = true
  try {
    challenge.value = await startAdminSignIn(email.value, password.value)
    password.value = ''
    code.value = ''
    step.value = 'code'

    // devCode 僅供本機開發自動驗證，正式環境不會回傳。
    if (challenge.value.devCode) {
      code.value = challenge.value.devCode
      await submitCode()
    }
  } catch (error) {
    // 後端對「帳號不存在／非管理員／密碼錯誤」一律回同一句話，
    // 前端原樣顯示即可，不可再自行細分，否則等於還原了列舉管道
    errorMessage.value = toErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

async function submitCode(): Promise<void> {
  errorMessage.value = ''

  if (!challenge.value) {
    restart()
    return
  }
  if (!/^\d{6}$/.test(code.value)) {
    errorMessage.value = '請輸入六位數字驗證碼。'
    return
  }

  submitting.value = true
  try {
    const session = await completeAdminSignIn(challenge.value.challengeId, code.value)
    recordLogin(session.email)
    await router.push(resolveRoleHome(session.role))
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    code.value = ''
  } finally {
    submitting.value = false
  }
}

function restart(): void {
  step.value = 'credentials'
  challenge.value = null
  password.value = ''
  code.value = ''
  errorMessage.value = ''
}
</script>

<template>
  <DesktopOnlyNotice v-if="deviceBlocked" />
  <AuthShell v-else content-width-class="max-w-lg" footer-note="此入口僅供經授權的 RentMate 內部人員使用。">
    <div>
      <!-- 淺色漸層上的 14px 文字須維持 4.5 對比，text-primary/85 才能符合。 -->
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary/85">Internal Access</p>
      <h1 class="mt-3 text-4xl font-black tracking-tight">內部人員登入</h1>
      <p class="mt-3 text-muted-foreground">
        帳號、角色、內容與系統維護。登入需通過密碼與信箱驗證碼兩道驗證。
      </p>
    </div>

    <p v-if="logoutNotice" class="mt-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm">{{ logoutNotice }}</p>

    <form v-if="step === 'credentials'" class="mt-8 space-y-5" @submit.prevent="submitCredentials">
      <div class="space-y-2">
        <Label for="staff-email">內部人員信箱</Label>
        <Input
          id="staff-email"
          v-model="email"
          type="email"
          placeholder="staff@rentmate.software"
          autocomplete="username"
          :disabled="submitting"
        />
      </div>
      <div class="space-y-2">
        <Label for="staff-password">密碼</Label>
        <Input
          id="staff-password"
          v-model="password"
          type="password"
          placeholder="請輸入密碼"
          autocomplete="current-password"
          :disabled="submitting"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
      <Button type="submit" size="lg" class="w-full" :disabled="submitting">
        {{ submitting ? '驗證中…' : '下一步' }}
      </Button>
      <p class="text-xs leading-5 text-muted-foreground">
        帳密正確後，系統會寄送六位數驗證碼到該管理員信箱，輸入正確才會完成登入。
      </p>
    </form>

    <form v-else class="mt-8 space-y-5" @submit.prevent="submitCode">
      <div class="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>
          驗證碼已寄至
          <span class="font-semibold">{{ challenge?.email }}</span>
        </p>
        <p class="mt-1 text-muted-foreground">
          <template v-if="codeExpired">驗證碼已過期，請重新登入。</template>
          <template v-else>剩餘有效時間 {{ countdownText }}</template>
        </p>
      </div>
      <div class="space-y-2">
        <Label for="staff-code">六位數驗證碼</Label>
        <Input
          id="staff-code"
          v-model="code"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          autocomplete="one-time-code"
          class="tracking-[0.5em]"
          :disabled="submitting || codeExpired"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
      <Button type="submit" size="lg" class="w-full" :disabled="submitting || codeExpired">
        {{ submitting ? '登入中…' : '登入內部工作區' }}
      </Button>
      <Button type="button" variant="ghost" size="sm" class="w-full" @click="restart">
        改用其他帳號登入
      </Button>
      <p class="text-xs leading-5 text-muted-foreground">
        若您沒有發起這次登入，代表密碼可能已外洩，請立即變更密碼並通知其他管理員。
      </p>
    </form>
  </AuthShell>
</template>
