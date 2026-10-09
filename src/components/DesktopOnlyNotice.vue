<script setup lang="ts">
/*
 * 後台整個 surface 都不提供手機操作，所以預設給登出；租客／房東只有部分頁面
 * 不提供手機操作，所以可以給返回首頁、不給登出，讓使用者繼續用其他頁面。
 * 這裡刻意不 redirect：使用者要找的東西就在這個網址底下，把他丟走只會讓他
 * 以為系統壞了。session 也刻意保留 —— 他在電腦上開同一個網址就能直接接上，
 * 「複製目前網址」那顆鈕就是為了這個情境。
 */
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Monitor, Copy, Check, LogOut } from 'lucide-vue-next'
import { signOut } from '@/src/composables/useAuth'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  showSignOut?: boolean
  homePath?: string
  /** 整頁取代時要撐滿視窗；嵌在租客／房東 layout 時，避免疊加外層 padding 而溢出。 */
  fullHeight?: boolean
}>(), {
  title: '後台僅支援桌面瀏覽器',
  description: '管理後台可以變更使用者狀態、審核補助申請與查閱稽核紀錄，這些操作只在桌面環境進行。',
  showSignOut: true,
  homePath: '',
  fullHeight: true,
})

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
  <div
    class="flex items-center justify-center bg-background px-6 py-12"
    :class="fullHeight ? 'min-h-[100dvh]' : 'min-h-full'"
  >
    <div class="w-full max-w-md text-center">
      <div class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Monitor class="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 class="mb-3 text-xl font-semibold text-foreground">{{ title }}</h1>
      <p v-if="description" class="mb-2 text-sm leading-relaxed text-muted-foreground">
        {{ description }}
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
        <!-- 通知的 action_url 或外部連結可能直接進站，history 沒有站內上一頁，
             所以用明確的首頁路徑，避免 router.back() 沒反應或跳出站外。 -->
        <RouterLink
          v-if="homePath"
          :to="homePath"
          class="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          返回首頁
        </RouterLink>
        <button
          v-if="showSignOut"
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
