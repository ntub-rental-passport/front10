<script setup lang="ts">
/**
 * 系統設定頁的維護頁預覽：編輯文案時，旁邊直接看到使用者會看到的樣子。
 *
 * 內容與排版跟 src/pages/maintenance.vue 一致（圖示、標題、說明、恢復時間、客服信箱）；
 * 那一頁是固定的淺色底，這裡改用主題色，深色模式下才看得清楚 —— 預覽要看的是
 * 「寫了什麼、排起來怎樣」，不是逐色還原。
 */
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'

const props = defineProps<{
  siteName: string
  message: string
  supportEmail: string
  endsAt: string
}>()

// 跟維護頁同一種格式：只顯示結束時間，使用者關心的是什麼時候能用
const resumesAt = computed(() => {
  if (props.endsAt.trim() === '') return ''
  const parsed = new Date(props.endsAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
})
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="text-xs font-semibold tracking-wide text-foreground/70">使用者會看到</figcaption>
    <div class="space-y-4 rounded-2xl border bg-muted/40 px-5 py-8 text-center">
      <div class="mx-auto w-fit rounded-2xl bg-primary/10 p-3 text-primary">
        <Wrench class="h-6 w-6" aria-hidden="true" />
      </div>
      <div class="space-y-2">
        <p class="text-xl font-black tracking-tight">{{ siteName.trim() || '網站名稱' }} 維護中</p>
        <p class="text-sm text-muted-foreground">{{ message.trim() || '（還沒寫維護說明）' }}</p>
        <p v-if="resumesAt" class="text-xs text-muted-foreground">預計 {{ resumesAt }} 恢復服務</p>
        <p v-if="supportEmail.trim()" class="text-xs text-muted-foreground">
          需要協助請聯絡 <span class="text-primary underline underline-offset-4">{{ supportEmail }}</span>
        </p>
      </div>
    </div>
  </figure>
</template>
