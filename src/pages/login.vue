<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Checkbox } from '@/components/ui/checkbox/index'
import { Eye, EyeOff, House, LockKeyhole, Mail, ShieldCheck } from 'lucide-vue-next'
import { signIn } from '@/src/composables/useAuth'

type LoginRole = 'user' | 'admin'

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const loginRole = ref<LoginRole>('user')
const router = useRouter()
const route = useRoute()

const loginDestination = computed(() => (loginRole.value === 'admin' ? '/admin' : '/app'))
const loginHeading = computed(() => (loginRole.value === 'admin' ? '後台人員登入' : '租客登入'))
const loginSubtitle = computed(() =>
  loginRole.value === 'admin' ? '請輸入您的管理員帳號與密碼' : '請輸入您的電子郵件與密碼以登入系統'
)
const submitLabel = computed(() => (loginRole.value === 'admin' ? '進入後台' : '登入'))

function getPostLoginTarget(): string {
  const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : null
  return redirectTarget || loginDestination.value
}

async function handleLogin(): Promise<void> {
  signIn(loginRole.value, email.value || (loginRole.value === 'admin' ? 'admin@rentmate.tw' : 'guest@rentmate.tw'))
  await router.push(getPostLoginTarget())
}

async function handleGoogleLogin(): Promise<void> {
  signIn('user', email.value || 'google-user@rentmate.tw')
  await router.push(getPostLoginTarget())
}
</script>

<template>
  <div class="min-h-screen bg-[linear-gradient(135deg,_#f6f1ea,_#fcfaf7_45%,_#f4f5fb)]">
    <div class="grid min-h-screen lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section
        class="hidden flex-col justify-between border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_24%),linear-gradient(180deg,_rgba(78,73,173,0.98),_rgba(76,72,167,0.97)_56%,_rgba(69,66,153,0.96))] p-10 text-white lg:flex"
      >
        <RouterLink to="/" class="flex items-center gap-3 font-bold text-white/92">
          <div class="rounded-2xl bg-white/12 p-2">
            <House class="h-5 w-5" />
          </div>
          <span class="text-lg">租隊友 RentMate</span>
        </RouterLink>

        <div class="flex flex-1 items-center justify-center">
          <div class="space-y-6 text-center">
            <div class="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white shadow-[0_24px_60px_rgba(17,33,110,0.25)]">
              <House class="h-11 w-11 text-primary" />
            </div>
            <div class="space-y-3">
              <h1 class="text-3xl font-bold tracking-tight">租隊友 RentMate</h1>
              <p class="text-sm leading-7 text-white/82">一站式智慧租屋管理平台。</p>
              <p class="text-sm leading-7 text-white/82">讓租屋生活更簡單，也更有保障。</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 text-sm text-white/76">
          <ShieldCheck class="h-4 w-4 text-white/92" />
          登入後會依角色進入不同工作區。
        </div>
      </section>

      <section class="flex items-center justify-center px-6 py-8 lg:px-8">
        <Card class="w-full max-w-lg rounded-[2rem] border-border/70 bg-background/88 shadow-xl backdrop-blur-sm">
          <CardContent class="space-y-6 p-6 lg:p-7">
            <div class="space-y-2">
              <RouterLink to="/" class="inline-flex items-center gap-3 font-bold text-primary lg:hidden">
                <div class="rounded-2xl bg-primary/10 p-2">
                  <House class="h-5 w-5" />
                </div>
                <span class="text-xl">租隊友 RentMate</span>
              </RouterLink>
              <div class="space-y-1.5">
                <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Sign In</p>
                <h2 class="text-3xl font-black tracking-tight">{{ loginHeading }}</h2>
                <p class="text-sm text-muted-foreground">{{ loginSubtitle }}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 rounded-[1.5rem] border border-border/70 bg-muted/20 p-1.5">
              <button
                type="button"
                class="rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition-colors"
                :class="
                  loginRole === 'user'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                "
                @click="loginRole = 'user'"
              >
                一般使用者
              </button>
              <button
                type="button"
                class="rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition-colors"
                :class="
                  loginRole === 'admin'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                "
                @click="loginRole = 'admin'"
              >
                後台人員
              </button>
            </div>

            <form class="space-y-4" @submit.prevent="handleLogin">
              <div class="space-y-1.5">
                <Label for="login-email">{{ loginRole === 'admin' ? '管理員帳號' : '電子信箱' }}</Label>
                <div class="relative">
                  <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    v-model="email"
                    type="email"
                    :placeholder="loginRole === 'admin' ? 'admin@rentmate.tw' : 'name@example.com'"
                    class="h-12 rounded-2xl border-border/80 bg-background pl-11"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <Label for="login-password">密碼</Label>
                  <span v-if="loginRole === 'user'" class="text-sm text-primary">忘記密碼？</span>
                </div>
                <div class="relative">
                  <LockKeyhole class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="請輸入密碼"
                    class="h-12 rounded-2xl border-border/80 bg-background pl-11 pr-12"
                  />
                  <button
                    type="button"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    @click="showPassword = !showPassword"
                  >
                    <Eye v-if="!showPassword" class="h-4 w-4" />
                    <EyeOff v-else class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label v-if="loginRole === 'user'" class="flex items-center gap-3 text-sm text-muted-foreground">
                <Checkbox v-model:checked="rememberMe" class="rounded border-border/80" />
                記住這個登入狀態
              </label>

              <Button
                type="submit"
                size="lg"
                class="h-12 w-full rounded-full text-base"
                :class="loginRole === 'admin' ? 'bg-slate-800 hover:bg-slate-700' : ''"
              >
                {{ submitLabel }}
              </Button>
            </form>

            <div v-if="loginRole === 'user'" class="space-y-4">
              <div class="flex items-center gap-3 text-sm text-muted-foreground">
                <div class="h-px flex-1 bg-border" />
                <span>OR</span>
                <div class="h-px flex-1 bg-border" />
              </div>

              <Button
                v-if="loginRole === 'user'"
                type="button"
                variant="outline"
                class="h-12 w-full rounded-full border-border/80 bg-background text-base"
                @click="handleGoogleLogin"
              >
                <span class="mr-3 flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-white text-sm font-bold">
                  <span class="bg-[conic-gradient(from_210deg,_#4285f4,_#34a853,_#fbbc05,_#ea4335,_#4285f4)] bg-clip-text text-transparent">
                    G
                  </span>
                </span>
                使用 Google 帳號登入
              </Button>

              <p class="text-center text-sm text-muted-foreground">
                還沒有帳號？
                <RouterLink to="/register" class="font-semibold text-primary hover:underline">立即註冊</RouterLink>
              </p>
            </div>

            <div v-else class="rounded-[1.5rem] border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
              <p class="font-medium text-foreground">後台登入說明</p>
              <p class="mt-1.5 leading-6">
                後台帳號由系統管理員建立與維護，不提供前台自助註冊。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  </div>
</template>
