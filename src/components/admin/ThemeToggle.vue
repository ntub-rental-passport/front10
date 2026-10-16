<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'

import { useTheme } from '@/src/composables/useTheme'

/** 深淺色切換按鈕，圖示表示目標主題，aria-label 說明目前與目標主題，外觀由呼叫端設定。 */
const { theme, toggle } = useTheme()

const isDark = computed(() => theme.value === 'dark')
const label = computed(() => (isDark.value ? '切換為淺色模式' : '切換為深色模式'))
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5"
    :aria-label="label"
    :title="label"
    :aria-pressed="isDark"
    @click="toggle"
  >
    <component :is="isDark ? Sun : Moon" class="size-3.5 shrink-0" aria-hidden="true" />
    <span>{{ isDark ? '淺色' : '深色' }}</span>
  </button>
</template>
