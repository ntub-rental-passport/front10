<script setup lang="ts">
import { STATUS_DOT_TONE_CLASS, type StatusDotTone } from './status-dot'

/**
 * 狀態圓點，取代文字徽章。列表一多的時候（例如使用者管理表格），
 * 一排色點比一排文字徽章更好掃視。色彩對照表在同資料夾的 status-dot.ts。
 */
defineProps<{
  tone: StatusDotTone
  label?: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="size-2 rounded-full" :class="STATUS_DOT_TONE_CLASS[tone]" aria-hidden="true" />
    <span v-if="label" class="text-sm text-foreground">{{ label }}</span>
  </span>
</template>
