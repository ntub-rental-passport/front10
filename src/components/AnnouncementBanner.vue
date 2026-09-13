<script setup lang="ts">
import { computed } from 'vue'
import { Info, TriangleAlert, Megaphone, X } from 'lucide-vue-next'
import type { Announcement } from '@/src/mocks/admin/content'

const props = defineProps<{ announcement: Announcement; dismissible?: boolean }>()
// 關不關得掉、關閉狀態存哪裡是呼叫端（例如首頁）的決定——這個元件只負責
// 顯示與發出「使用者按了關閉」這個事件，不直接碰 localStorage，才能同時給
// 首頁（可關閉）與通知中心之類的地方（不可關閉）共用。
const emit = defineEmits<{ dismiss: [] }>()

const styleMap = {
  info: { wrap: 'border-primary/30 bg-primary/5 text-foreground', icon: 'text-primary', comp: Info },
  warning: { wrap: 'border-amber-300 bg-amber-50 text-amber-900', icon: 'text-amber-600', comp: TriangleAlert },
  urgent: { wrap: 'border-destructive/40 bg-destructive/5 text-destructive', icon: 'text-destructive', comp: Megaphone },
} as const

const style = computed(() => styleMap[props.announcement.level])
</script>

<template>
  <div :class="['flex items-start gap-3 rounded-2xl border p-4', style.wrap]">
    <component :is="style.comp" :class="['mt-0.5 h-5 w-5 shrink-0', style.icon]" />
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ announcement.title }}</p>
      <p class="mt-0.5 text-sm opacity-90">{{ announcement.body }}</p>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="shrink-0 rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
      aria-label="關閉公告"
      @click="emit('dismiss')"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
