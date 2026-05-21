<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Label } from '@/components/ui/label/index'
import { BadgeCheck } from 'lucide-vue-next'
import { completeEmailVerification, getPendingRegistration, getVerificationHint } from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const codeDigits = ref(['', '', '', '', '', ''])
const errorMessage = ref('')
const pendingRegistration = computed(() => getPendingRegistration())
const email = computed(() =>
  typeof route.query.email === 'string' ? route.query.email : pendingRegistration.value?.email ?? 'your@email.com',
)
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
  const session = completeEmailVerification(getCode())

  if (!session) {
    errorMessage.value = '驗證碼不正確，請再試一次。'
    return
  }

  errorMessage.value = ''
  await router.push('/welcome')
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="完成信箱驗證後，就能正式開始使用 RentMate。">
    <div class="space-y-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Verify Email</p>
        <h2 class="mt-3 text-3xl font-black tracking-tight">輸入信箱驗證碼</h2>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
          我們已將 6 碼驗證碼寄到 <span class="font-semibold text-foreground">{{ email }}</span>
        </p>
      </div>
    </div>

    <div class="mt-8 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
      <div class="flex items-start gap-3">
        <BadgeCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div class="space-y-1">
          <p class="font-medium text-foreground">目前為示範流程</p>
          <p>可使用驗證碼 <span class="font-semibold text-primary">{{ getVerificationHint() }}</span> 繼續。</p>
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
            class="h-14 w-12 rounded-x0.5 border border-border/80 bg-background text-center text-xl font-bold outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-16 sm:w-14"
            @input="handleDigitInput($event, index)"
            @keydown="handleKeydown($event, index)"
          />
        </div>
        <p class="text-xs text-muted-foreground">請輸入 6 位數字驗證碼。</p>
        <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
      </div>

      <div class="flex flex-col gap-3 pt-2">
        <Button type="submit" size="lg" class="h-12 w-full rounded-x0.5 text-base">
          驗證並繼續
        </Button>
        <Button as-child size="lg" variant="outline" class="h-12 w-full rounded-x0.5 text-base">
          <RouterLink to="/register">返回註冊</RouterLink>
        </Button>
      </div>
    </form>
  </AuthShell>
</template>
