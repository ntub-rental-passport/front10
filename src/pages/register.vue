<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { LockKeyhole, Mail, UserRoundPlus } from 'lucide-vue-next'
import { registerWithGoogle, startEmailRegistration } from '@/src/composables/useAuth'

const router = useRouter()
const form = ref({
  email: '',
  password: '',
})

async function handleRegister(): Promise<void> {
  const pendingRegistration = startEmailRegistration(
    form.value.email || 'new-user@rentmate.tw',
    form.value.password || 'password123',
  )

  await router.push({
    path: '/verify-email',
    query: { email: pendingRegistration.email },
  })
}

async function handleGoogleRegister(): Promise<void> {
  registerWithGoogle(form.value.email || 'google-user@rentmate.tw')
  await router.push('/welcome')
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="註冊後將建立你的 RentMate 帳號並進入租客工作區。">
    <div class="space-y-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Register</p>
        <h2 class="mt-3 text-3xl font-black">建立你的 RentMate 帳號</h2>

      </div>
    </div>

    <div class="mt-8 space-y-6">
      <Button
        type="button"
        variant="outline"
        class="h-12 w-full rounded-xl border-border/80 bg-background text-base"
        @click="handleGoogleRegister"
      >
        <img
          src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
          alt="Google"
          class="mr-3 h-5 w-5 shrink-0"
        />
        使用 Google 快速註冊
      </Button>

      <div class="flex items-center gap-3 text-sm text-muted-foreground">
        <div class="h-px flex-1 bg-border" />
        <span>或使用 Email 註冊</span>
        <div class="h-px flex-1 bg-border" />
      </div>
    </div>

    <form class="mt-6 space-y-6" @submit.prevent="handleRegister">
      <div class="space-y-1.5">
        <Label for="register-email" class="font-semibold text-foreground">電子信箱</Label>
        <div class="relative">
          <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="register-email" v-model="form.email" type="email" placeholder="name@example.com" class="h-12 rounded-xl pl-11" />
        </div>
      </div>

      <div class="space-y-1.5">
        <Label for="register-password" class="font-semibold text-foreground">密碼</Label>
        <div class="relative">
          <LockKeyhole class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="register-password" v-model="form.password" type="password" placeholder="至少 8 碼" class="h-12 rounded-xl pl-11" />
        </div>
      </div>

      <div class="flex flex-col gap-3 pt-2">
        <Button type="submit" size="lg" class="h-12 w-full rounded-xl px-8 text-base">
          <UserRoundPlus class="h-4 w-4" />
          建立帳號並驗證信箱
        </Button>
        <Button as-child size="lg" variant="outline" class="h-12 w-full rounded-xl px-8 text-base">
          <RouterLink to="/login">已有帳號，前往登入</RouterLink>
        </Button>
      </div>
    </form>
  </AuthShell>
</template>
