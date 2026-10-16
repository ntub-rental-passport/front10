<script setup lang="ts">
import { computed } from 'vue'

import {
  STATUS_CHIP_CLASS,
  STATUS_DOT_TONE_CLASS,
  shouldEmphasize,
  type StatusDotTone,
} from './status-dot'

/** 狀態圓點；emphasize 開啟時，warn 與 danger 顯示為實心 chip，ok 與 idle 維持圓點。 */
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
