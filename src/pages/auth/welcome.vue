<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/src/components/auth-layout.vue'
import { Button } from '@/components/ui/button/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Sparkles, UserRound } from 'lucide-vue-next'
import { finishNicknameSetup } from '@/src/composables/useAuth'

const router = useRouter()
const nickname = ref('')
const errorMessage = ref('')

async function handleStart(): Promise<void> {
  if (!nickname.value.trim()) {
    errorMessage.value = '請先輸入你希望我們怎麼稱呼你。'
    return
  }

  errorMessage.value = ''
  finishNicknameSetup(nickname.value)
  await router.push('/app')
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="設定好稱呼後，就可以開始整理你的租屋生活。">
    <div class="space-y-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Welcome</p>
        <h2 class="mt-3 text-3xl font-black tracking-tight">歡迎使用 RentMate</h2>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">設定一個你喜歡的名字，開始你的租屋管理之旅！</p>
      </div>
    </div>

    <div class="mt-8 rounded-[1.75rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-3 text-primary">
        <div class="rounded-full bg-primary/10 p-2.5">
          <Sparkles class="h-5 w-5" />
        </div>
        <div>
          <p class="font-semibold text-foreground">想怎麼稱呼你？</p>
          <p class="text-sm text-muted-foreground">暱稱之後隨時可以更改，不用擔心</p>
        </div>
      </div>

      <form class="space-y-5" @submit.prevent="handleStart">
        <div class="space-y-1.5">
          <Label for="welcome-nickname" class="font-semibold text-foreground">你的暱稱</Label>
          <div class="relative">
            <UserRound class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="welcome-nickname"
              v-model="nickname"
              placeholder="例如：小美"
              class="h-12 rounded-x0.5 pl-11"
            />
          </div>
          <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
        </div>

        <Button type="submit" size="lg" class="h-12 w-full rounded-x0.5 text-base">
          開始使用
        </Button>
      </form>
    </div>
  </AuthShell>
</template>
