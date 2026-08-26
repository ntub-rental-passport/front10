<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Label } from '@/components/ui/label/index'
import { BadgeCheck } from 'lucide-vue-next'
import {
  completeEmailVerification,
  getPendingRegistration,
  needsNicknameSetup,
  resendEmailVerification,
  resolveRoleHome,
} from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const codeDigits = ref(['', '', '', '', '', ''])
const errorMessage = ref('')
const successMessage = ref('')
const submitting = ref(false)
const pendingRegistration = ref(getPendingRegistration())
const now = ref(Date.now())
const timer = window.setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => window.clearInterval(timer))
const email = computed(() =>
  typeof route.query.email === 'string' ? route.query.email : pendingRegistration.value?.email ?? 'your@email.com',
)
const resendAvailableIn = computed(() => Math.max(
  0,
  Math.ceil(((pendingRegistration.value?.resendAvailableAt ?? 0) - now.value) / 1000),
))
const verificationExpiresIn = computed(() => Math.max(
  0,
  Math.ceil(((pendingRegistration.value?.expiresAt ?? 0) - now.value) / 1000),
))
const verificationExpired = computed(() => verificationExpiresIn.value === 0)
const digitInputs = ref<HTMLInputElement[]>([])

function setDigitInput(element: unknown, index: number): void {
  if (!(element instanceof HTMLInputElement)) return
  digitInputs.value[index] = element
}

function focusInput(index: number): void {
  const target = digitInputs.value[index]
  if (!target) return
  target.focus()
  target.select()
}

function getCode(): string {
  return codeDigits.value.join('')
}

async function handleDigitInput(event: Event, index: number): Promise<void> {
  const target = event.target as HTMLInputElement
  const onlyDigits = target.value.replace(/\D/g, '')
  const nextDigit = onlyDigits.slice(-1)

  codeDigits.value[index] = nextDigit
  target.value = nextDigit
  errorMessage.value = ''

  if (nextDigit && index < codeDigits.value.length - 1) {
    await nextTick()
    focusInput(index + 1)
  }
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
  event.preventDefault()
  const pastedText = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) ?? ''

  codeDigits.value = codeDigits.value.map((_, index) => pastedText[index] ?? '')

  await nextTick()
  const nextIndex = Math.min(pastedText.length, codeDigits.value.length - 1)
  focusInput(nextIndex)
}

async function handleKeydown(event: KeyboardEvent, index: number): Promise<void> {
  if (event.key === 'Backspace') {
    if (codeDigits.value[index]) {
      codeDigits.value[index] = ''
      return
    }

    if (index > 0) {
      await nextTick()
      focusInput(index - 1)
    }
    return
  }

  if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    focusInput(index - 1)
    return
  }

  if (event.key === 'ArrowRight' && index < codeDigits.value.length - 1) {
    event.preventDefault()
    focusInput(index + 1)
  }
}

async function handleVerification(): Promise<void> {
  if (verificationExpired.value) {
    errorMessage.value = '驗證碼已過期，請重新寄送驗證碼。'
    return
  }
  if (getCode().length !== 6) {
    errorMessage.value = '請輸入完整的六碼驗證碼。'
    return
  }
  submitting.value = true
  try {
    const session = await completeEmailVerification(getCode())
    if (!session) throw new Error('找不到待驗證資料，請重新註冊。')
    errorMessage.value = ''
    await router.push(needsNicknameSetup(session) ? '/welcome' : resolveRoleHome(session.role))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '驗證失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}

async function handleResend(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  submitting.value = true
  try {
    pendingRegistration.value = await resendEmailVerification()
    if (!pendingRegistration.value) throw new Error('找不到待驗證資料，請重新註冊。')
    successMessage.value = '新的驗證碼已寄出，舊驗證碼已失效。'
    codeDigits.value = ['', '', '', '', '', '']
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重新寄送失敗，請稍後再試。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell content-width-class="max-w-xl" footer-note="完成信箱驗證後，我們會依照您選擇的身分開通 RentMate 工作區。">
    <div class="space-y-4 pt-4 lg:pt-0">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.32em] text-primary/70">Verify Email</p>
        <h2 class="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-5xl">驗證您的電子信箱</h2>
        <p class="mt-3 text-base leading-7 text-muted-foreground">
          我們已經將 6 碼驗證碼寄到
          <span class="font-semibold text-foreground">{{ email }}</span>
          ，請輸入後完成驗證。
        </p>
      </div>
    </div>

    <div class="mt-8 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
      <div class="flex items-start gap-3">
        <BadgeCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div class="space-y-1">
          <p
            :class="[
              'font-medium',
              verificationExpired || verificationExpiresIn <= 30 ? 'text-destructive' : 'text-foreground',
            ]"
          >
            {{
              verificationExpired
                ? '驗證碼已過期，請重新寄送'
                : `驗證碼將在 ${verificationExpiresIn} 秒後失效`
            }}
          </p>
          <p>最多可輸入錯誤 3 次；達到上限後需要重新註冊。</p>
        </div>
      </div>
    </div>

    <form class="mt-8 space-y-6" @submit.prevent="handleVerification">
      <div class="space-y-3">
        <Label for="verify-code-0" class="font-semibold text-foreground">驗證碼</Label>
        <div class="flex justify-between gap-2 sm:gap-3" @paste="handlePaste">
          <input
            v-for="(digit, index) in codeDigits"
            :id="`verify-code-${index}`"
            :key="index"
            :ref="(element) => setDigitInput(element, index)"
            :value="digit"
            type="text"
            inputmode="numeric"
            maxlength="1"
            autocomplete="one-time-code"
            class="h-14 w-12 rounded-[1rem] border border-border/80 bg-background text-center text-xl font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-16 sm:w-14"
            @input="handleDigitInput($event, index)"
            @keydown="handleKeydown($event, index)"
          />
        </div>
        <p class="text-xs text-muted-foreground">請輸入 6 碼數字驗證碼。</p>
        <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
        <p v-if="successMessage" class="text-sm text-emerald-600">{{ successMessage }}</p>
      </div>

      <div class="flex flex-col gap-3 pt-2">
        <Button
          type="submit"
          size="lg"
          class="h-14 w-full rounded-[1rem] text-base"
          :disabled="submitting || verificationExpired"
        >
          驗證並繼續
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          class="h-14 w-full rounded-[1rem] text-base"
          :disabled="submitting || resendAvailableIn > 0"
          @click="handleResend"
        >
          {{ resendAvailableIn > 0 ? `${resendAvailableIn} 秒後可重新寄送` : '重新寄送驗證碼' }}
        </Button>
        <Button as-child size="lg" variant="outline" class="h-14 w-full rounded-[1rem] text-base">
          <RouterLink to="/register">返回註冊</RouterLink>
        </Button>
      </div>
    </form>
  </AuthShell>
</template>
