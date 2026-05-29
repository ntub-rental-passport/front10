<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Checkbox } from '@/components/ui/checkbox/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-vue-next'
import { signIn } from '@/src/composables/useAuth'

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const router = useRouter()
const route = useRoute()

function getPostLoginTarget(): string {
  const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : null
  return redirectTarget || '/app'
}

async function handleLogin(): Promise<void> {
  signIn('user', email.value || 'guest@rentmate.tw')
  await router.push(getPostLoginTarget())
}

async function handleGoogleLogin(): Promise<void> {
  signIn('user', email.value || 'google-user@rentmate.tw')
  await router.push(getPostLoginTarget())
}
</script>

<template>
  <AuthShell>
    <div class="space-y-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Sign In</p>
        <h2 class="mt-3 text-3xl font-black tracking-tight">租客登入</h2>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">請輸入您的電子郵件與密碼以登入系統</p>
      </div>
    </div>

    <form class="mt-8 space-y-8" @submit.prevent="handleLogin">
      <div class="space-y-1.5">
        <Label for="login-email" class="mb-2 block font-semibold text-foreground">電子信箱</Label>
        <div class="relative">
          <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-email"
            v-model="email"
            type="email"
            placeholder="name@example.com"
            class="h-12 rounded-x0.5 border-border/80 bg-background pl-11"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label for="login-password" class="font-semibold text-foreground">密碼</Label>
          <span class="text-sm text-primary">忘記密碼？</span>
        </div>
        <div class="relative">
          <LockKeyhole class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="請輸入密碼"
            class="h-12 rounded-x0.5 border-border/80 bg-background pl-11 pr-12"
          />
          <button
            type="button"
            class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>
      </div>

      <label class="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Checkbox v-model:checked="rememberMe" class="rounded border-border/80" />
        記住這個登入狀態
      </label>

      <Button type="submit" size="lg" class="h-12 w-full rounded-x0.5 text-base">
        登入
      </Button>
    </form>

    <div class="mt-8 space-y-6">
      <div class="flex items-center gap-3 text-sm text-muted-foreground">
        <div class="h-px flex-1 bg-border" />
        <span>或透過社群帳號</span>
        <div class="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        class="h-12 w-full rounded-x0.5 border-border/80 bg-background text-base"
        @click="handleGoogleLogin"
      >
        <img
          src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/google/default.svg"
          alt="Google"
          class="mr-3 h-5 w-5 shrink-0"
        />
        使用 Google 帳號登入
      </Button>

      <p class="text-center text-sm text-muted-foreground">
        還沒有帳號？
        <RouterLink to="/register" class="font-semibold text-primary hover:underline">立即註冊</RouterLink>
      </p>
    </div>
  </AuthShell>
</template>
