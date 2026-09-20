<script setup lang="ts">
import { computed } from 'vue'

import {
  STATUS_CHIP_CLASS,
  STATUS_DOT_TONE_CLASS,
  shouldEmphasize,
  type StatusDotTone,
} from './status-dot'

/**
 * 狀態圓點，取代文字徽章。列表一多的時候（例如使用者管理表格），
 * 一排色點比一排文字徽章更好掃視。色彩對照表在同資料夾的 status-dot.ts。
 *
 * `emphasize` 開啟後，warn 與 danger 會變成整顆實心的 chip；ok 與 idle 維持
 * 安靜的圓點。用在健康條那種「平常不該吵、有事要跳出來」的地方。表格裡不要
 * 開 —— 一整欄實心色塊會比沒有顏色更難掃視。
 */
const props = defineProps<{
  tone: StatusDotTone
  label?: string
  emphasize?: boolean
}>()

const isChip = computed(() => Boolean(props.emphasize) && shouldEmphasize(props.tone))
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5"
    :class="isChip ? ['rounded-full px-2.5 py-1 text-sm font-medium', STATUS_CHIP_CLASS[tone]] : undefined"
  >
    <span
      class="size-2 shrink-0 rounded-full"
      :class="isChip ? 'bg-current opacity-70' : STATUS_DOT_TONE_CLASS[tone]"
      aria-hidden="true"
    />
    <span v-if="label" :class="isChip ? undefined : 'text-sm text-foreground'">{{ label }}</span>
  </span>
</template>
