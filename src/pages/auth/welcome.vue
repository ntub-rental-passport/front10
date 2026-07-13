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
    errorMessage.value = '請先輸入您想顯示的暱稱。'
    return
  }

  errorMessage.value = ''
  finishNicknameSetup(nickname.value)
  await router.push('/app')
}
</script>

<template>
  <AuthShell content-width-class="max-w-lg" footer-note="完成這一步後，我們會帶您進入 RentMate 租客工作區。">
    <div class="space-y-4 pt-4 lg:pt-0">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.32em] text-primary/70">Welcome</p>
        <h2 class="mt-4 text-4xl font-black tracking-tight text-foreground">歡迎加入 RentMate</h2>
        <p class="mt-3 text-base leading-7 text-muted-foreground">
          只差最後一步，設定您的顯示名稱後，就能開始使用租客專屬功能。
        </p>
      </div>
    </div>

    <div class="mt-8 rounded-[1.75rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-3 text-primary">
        <div class="rounded-full bg-primary/10 p-2.5">
          <Sparkles class="h-5 w-5" />
        </div>
        <div>
          <p class="font-semibold text-foreground">建立您的暱稱</p>
          <p class="text-sm text-muted-foreground">這個名稱會顯示在您的個人介面與合作功能中。</p>
        </div>
      </div>

      <form class="space-y-5" @submit.prevent="handleStart">
        <div class="space-y-1.5">
          <Label for="welcome-nickname" class="font-semibold text-foreground">顯示名稱</Label>
          <div class="relative">
            <UserRound class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="welcome-nickname"
              v-model="nickname"
              placeholder="例如：小安"
              class="h-12 rounded-[1rem] pl-11"
            />
          </div>
          <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
        </div>

        <Button type="submit" size="lg" class="h-12 w-full rounded-[1rem] text-base">
          開始使用
        </Button>
      </form>
    </div>
  </AuthShell>
</template>
