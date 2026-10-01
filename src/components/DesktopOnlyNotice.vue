<script setup lang="ts">
/*
 * 後台只在桌面環境操作。這裡刻意不 redirect 到首頁：使用者要找的東西就在這個
 * 網址底下，把他丟走只會讓他以為系統壞了。session 也刻意保留 —— 他在電腦上開
 * 同一個網址就能直接接上，「複製目前網址」那顆鈕就是為了這個情境。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Monitor, Copy, Check, LogOut } from 'lucide-vue-next'
import { signOut } from '@/src/composables/useAuth'

const copied = ref(false)
const copyFailed = ref(false)
const router = useRouter()

async function handleSignOut(): Promise<void> {
  signOut()
  await router.push('/')
}

async function copyCurrentUrl(): Promise<void> {
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <div class="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12">
    <div class="w-full max-w-md text-center">
      <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Monitor class="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 class="mb-3 text-xl font-semibold text-foreground">後台僅支援桌面瀏覽器</h1>
      <p class="mb-2 text-sm leading-relaxed text-muted-foreground">
        管理後台可以變更使用者狀態、審核補助申請與查閱稽核紀錄，這些操作只在桌面環境進行。
      </p>
      <p class="mb-8 text-sm leading-relaxed text-muted-foreground">請在電腦上開啟同一個網址。</p>
      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          @click="copyCurrentUrl"
        >
          <component :is="copied ? Check : Copy" class="h-4 w-4" />
          {{ copied ? '已複製網址' : '複製目前網址' }}
        </button>
        <p v-if="copyFailed" class="text-xs text-muted-foreground">
          無法自動複製，請直接從瀏覽器網址列複製。
        </p>
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          @click="handleSignOut"
        >
          <LogOut class="h-4 w-4" />登出
        </button>
      </div>
    </div>
  </div>
</template>
