<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { FileText, House, Mail, Phone, UserRoundPlus } from 'lucide-vue-next'
import { signIn } from '@/src/composables/useAuth'

const router = useRouter()
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
})

async function handleRegister(): Promise<void> {
  signIn('user', form.value.email || 'new-user@rentmate.tw')
  await router.push('/app')
}
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(217,215,255,0.45),_transparent_24%),linear-gradient(180deg,_#fcfbf8,_#f5f6fb)] px-6 py-10 lg:px-10 lg:py-16">
    <div class="mx-auto max-w-6xl space-y-10">
      <div class="space-y-4 text-center">
        <RouterLink to="/" class="inline-flex items-center gap-3 font-bold text-primary">
          <div class="rounded-2xl bg-primary/10 p-2">
            <FileText class="h-5 w-5" />
          </div>
          <span class="text-2xl">租隊友 RentMate</span>
        </RouterLink>
        <div class="space-y-3">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Create Account</p>
          <h1 class="text-5xl font-black tracking-tight">建立你的 RentMate 帳號</h1>
          <p class="mx-auto max-w-3xl text-lg leading-8 text-muted-foreground">
            先完成基本會員資料，之後再補上租屋處、室友與契約資訊，讓首頁與 AI 分析功能能更貼近你的租屋情境。
          </p>
        </div>
      </div>

      <Card class="overflow-hidden rounded-[2rem] border-border/60 bg-background/92 shadow-xl">
        <div class="grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <aside class="border-b border-border/60 bg-[linear-gradient(180deg,_rgba(56,59,149,0.98),_rgba(86,96,214,0.92))] p-8 text-white lg:border-b-0 lg:border-r lg:p-10">
            <div class="space-y-8">
              <div class="space-y-3">
                <p class="text-sm font-semibold uppercase tracking-[0.24em] text-white/70">Membership</p>
                <h2 class="text-3xl font-bold leading-tight">加入 RentMate，開始整理你的租屋資訊與日常任務。</h2>
              </div>

              <div class="space-y-4">
                <div class="rounded-[1.5rem] border border-white/15 bg-white/10 p-5">
                  <p class="font-semibold">契約分析與風險提醒</p>
                  <p class="mt-2 text-sm leading-7 text-white/82">
                    上傳租賃契約後，可接續使用 OCR、條文分析與 AI 摘要，快速掌握潛在風險。
                  </p>
                </div>
                <div class="rounded-[1.5rem] border border-white/15 bg-white/10 p-5">
                  <p class="font-semibold">補貼與待辦整合</p>
                  <p class="mt-2 text-sm leading-7 text-white/82">
                    將租金補貼、生活提醒與家務事項集中在同一個儀表板，減少資訊分散。
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-3 rounded-[1.5rem] border border-white/15 bg-white/10 p-5">
                <div class="rounded-full bg-white/15 p-3">
                  <House class="h-5 w-5" />
                </div>
                <p class="text-sm leading-7 text-white/82">
                  註冊後會先進入一般使用者工作區，之後可再逐步補齊租屋檔案與契約資料。
                </p>
              </div>
            </div>
          </aside>

          <CardContent class="p-8 lg:p-10">
            <div class="space-y-8">
              <div class="space-y-2">
                <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Register Form</p>
                <h2 class="text-4xl font-black tracking-tight">會員註冊</h2>
                <p class="text-muted-foreground">先建立基本資料，後續可再補上租屋處、室友與契約資訊。</p>
              </div>

              <form class="space-y-6" @submit.prevent="handleRegister">
                <div class="grid gap-5 md:grid-cols-2">
                  <div class="space-y-2">
                    <Label for="register-first-name">名字</Label>
                    <Input id="register-first-name" v-model="form.firstName" placeholder="例如：小美" class="h-12 rounded-2xl" />
                  </div>
                  <div class="space-y-2">
                    <Label for="register-last-name">姓氏</Label>
                    <Input id="register-last-name" v-model="form.lastName" placeholder="例如：陳" class="h-12 rounded-2xl" />
                  </div>
                </div>

                <div class="grid gap-5 md:grid-cols-2">
                  <div class="space-y-2">
                    <Label for="register-email">電子信箱</Label>
                    <div class="relative">
                      <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="register-email" v-model="form.email" type="email" placeholder="name@example.com" class="h-12 rounded-2xl pl-11" />
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label for="register-phone">手機號碼</Label>
                    <div class="relative">
                      <Phone class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="register-phone" v-model="form.phone" placeholder="09xx xxx xxx" class="h-12 rounded-2xl pl-11" />
                    </div>
                  </div>
                </div>

                <div class="grid gap-5 md:grid-cols-2">
                  <div class="space-y-2">
                    <Label for="register-password">密碼</Label>
                    <Input id="register-password" v-model="form.password" type="password" placeholder="至少 8 碼" class="h-12 rounded-2xl" />
                  </div>
                  <div class="space-y-2">
                    <Label for="register-password-confirm">確認密碼</Label>
                    <Input id="register-password-confirm" v-model="form.confirmPassword" type="password" placeholder="再次輸入密碼" class="h-12 rounded-2xl" />
                  </div>
                </div>

                <div class="flex flex-col gap-3 pt-2 sm:flex-row">
                  <Button type="submit" size="lg" class="h-12 rounded-full px-8 text-base">
                    <UserRoundPlus class="h-4 w-4" />
                    建立帳號
                  </Button>
                  <Button as-child size="lg" variant="outline" class="h-12 rounded-full px-8 text-base">
                    <RouterLink to="/login">已有帳號，前往登入</RouterLink>
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  </div>
</template>
