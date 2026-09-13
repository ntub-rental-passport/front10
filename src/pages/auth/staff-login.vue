<script setup lang="ts">
<<<<<<< HEAD
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/src/components/layouts/AuthLayout.vue'
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

/*
 * 兩階段登入：帳密 → 信箱驗證碼。
 *
 * 權限判定完全在後端：前端不再查任何名冊，也不再自選身分。
 * 第一階段成功「不代表登入」，只代表後端寄出了驗證碼；
 * 沒有信箱存取權的人，即使拿到正確帳密也停在這一步。
 *
 * challengeId 只放在元件的 ref，不寫進 localStorage —— 它是
 * 「已通過帳密驗證」的憑據，留在磁碟上等於把第一道關卡的成果外洩。
 */
const router = useRouter()

const step = ref<'credentials' | 'code'>('credentials')
const email = ref('')
const password = ref('')
const code = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const challenge = ref<AdminLoginChallenge | null>(null)

// 倒數：讓使用者知道驗證碼還剩多久，過期前就能自己重來
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
=======
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { resolveRoleHome, signIn } from '@/src/composables/useAuth'
import { adminUsersCollection } from '@/src/composables/admin/useAdminUsers'
import { resolveStaffAccess, staffAccessMessages } from '@/src/utils/staff-access'

const router = useRouter()
const email = ref('')
const password = ref('')
const errorMessage = ref('')

/*
 * 這裡不再讓人自選身分。原本畫面上有「系統管理員／資料審核人員」兩顆按鈕，
 * 但 signIn() 收的就是那顆按鈕的值，email 完全不參與判斷——等於權限由使用者
 * 自己決定。改成拿 email 去使用者名冊查，是不是內部帳號由帳號本身說了算。
 */
async function handleLogin(): Promise<void> {
  errorMessage.value = ''

  if (!email.value.trim() || password.value.length < 8) {
    errorMessage.value = '請輸入內部人員信箱與至少 8 個字元的密碼。'
    return
  }

  const access = resolveStaffAccess(adminUsersCollection.value, email.value)
  if (!access.user) {
    errorMessage.value = staffAccessMessages[access.reason]
    return
  }

  const session = signIn('admin', access.user.email)
  await router.push(resolveRoleHome(session.role))
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="此入口僅供經授權的 RentMate 內部人員使用。">
    <div>
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">Internal Access</p>
      <h1 class="mt-3 text-4xl font-black tracking-tight">內部人員登入</h1>
      <p class="mt-3 text-muted-foreground">
<<<<<<< HEAD
        帳號、角色、內容與系統維護。登入需通過密碼與信箱驗證碼兩道驗證。
      </p>
    </div>

    <form v-if="step === 'credentials'" class="mt-8 space-y-5" @submit.prevent="submitCredentials">
=======
        帳號、角色、內容與系統維護。權限依帳號本身判定，正式上線時應串接後端驗證與多因素驗證。
      </p>
    </div>
    <form class="mt-8 space-y-5" @submit.prevent="handleLogin">
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
      <div class="space-y-2">
        <Label for="staff-email">內部人員信箱</Label>
        <Input
          id="staff-email"
          v-model="email"
          type="email"
<<<<<<< HEAD
          placeholder="staff@rentmate.software"
          autocomplete="username"
          :disabled="submitting"
=======
          placeholder="staff@rentmate.tw"
          autocomplete="username"
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
        />
      </div>
      <div class="space-y-2">
        <Label for="staff-password">密碼</Label>
        <Input
          id="staff-password"
          v-model="password"
          type="password"
<<<<<<< HEAD
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
=======
          placeholder="至少 8 個字元"
          autocomplete="current-password"
        />
      </div>
      <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
      <Button type="submit" size="lg" class="w-full">登入內部工作區</Button>
      <p class="text-xs leading-5 text-muted-foreground">
        目前是前端展示登入，密碼尚未驗證；後續需由 FastAPI 驗證帳密、角色與權限。
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
      </p>
    </form>
  </AuthShell>
</template>
