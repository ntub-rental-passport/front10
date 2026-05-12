<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { BadgeCheck, MailCheck } from 'lucide-vue-next'
import { completeEmailVerification, getPendingRegistration, getVerificationHint } from '@/src/composables/useAuth'

const route = useRoute()
const router = useRouter()
const code = ref('')
const errorMessage = ref('')
const pendingRegistration = computed(() => getPendingRegistration())
const email = computed(() =>
  typeof route.query.email === 'string' ? route.query.email : pendingRegistration.value?.email ?? 'your@email.com',
)

async function handleVerification(): Promise<void> {
  const session = completeEmailVerification(code.value)

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
      <div class="space-y-1.5">
        <Label for="verify-code" class="font-semibold text-foreground">驗證碼</Label>
        <div class="relative">
          <MailCheck class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="verify-code"
            v-model="code"
            inputmode="numeric"
            maxlength="6"
            placeholder="請輸入 6 碼驗證碼"
            class="h-12 rounded-x0 pl-11 tracking-[0.35em]"
          />
        </div>
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
