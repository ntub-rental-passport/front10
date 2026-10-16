<script setup lang="ts">
/** 系統設定頁的維護頁預覽，內容與排版對應維護頁，配色使用後台主題。 */
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'

const props = defineProps<{
  siteName: string
  message: string
  supportEmail: string
  endsAt: string
}>()

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
