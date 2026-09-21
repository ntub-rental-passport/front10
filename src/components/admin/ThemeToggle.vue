<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'

import { useTheme } from '@/src/composables/useTheme'

/**
 * 深淺色開關。
 *
 * 圖示畫的是**按下去會變成什麼**（目前淺色就顯示月亮），而不是目前是什麼 ——
 * 一顆按鈕上的圖示，使用者的直覺是「這是它要做的事」。aria-label 把兩件事
 * 都講清楚，因為螢幕閱讀器使用者看不到旁邊的顏色。
 *
 * 外觀（內距、hover、文字色）由呼叫端給：側欄是深紫底、行動抽屜是淺色底，
 * 兩邊的 hover 不可能共用同一組值。
 */
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
