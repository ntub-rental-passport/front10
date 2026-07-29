<script setup lang="ts">
import { computed } from 'vue'
import { Info, TriangleAlert, Megaphone } from 'lucide-vue-next'
import type { Announcement } from '@/src/mocks/admin/content'

const props = defineProps<{ announcement: Announcement }>()

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
    <div class="min-w-0">
      <p class="font-semibold">{{ announcement.title }}</p>
      <p class="mt-0.5 text-sm opacity-90">{{ announcement.body }}</p>
    </div>
  </div>
</template>
