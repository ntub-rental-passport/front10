<script setup lang="ts">
/**
 * 巡邏指標卡。
 *
 * 總覽頁上半的卡片都是「要你去做什麼」，下半的圖表卡是「給你看現況」。
 * 兩者刻意長得不一樣：這張矮、左邊有一條色帶、右上角有箭頭，
 * 讓「可以點進去處理」這件事用形狀說出來，而不是只靠文字。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  value: number
  unit: string
  caption: string
  to: string
  /** alert 代表有東西待處理，quiet 代表目前是零 */
  tone?: 'alert' | 'quiet'
}>()

const isAlert = computed(() => props.tone === 'alert' && props.value > 0)
</script>

<template>
  <RouterLink
    :to="to"
    class="group relative flex items-stretch gap-4 overflow-hidden rounded-3xl border border-border/70 bg-background/90 py-4 pl-0 pr-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  >
    <span
      class="w-1.5 shrink-0 rounded-r-full transition-colors"
      :class="isAlert ? 'bg-destructive' : 'bg-primary/25'"
      aria-hidden="true"
    />

    <span class="min-w-0 flex-1">
      <span class="block text-sm text-muted-foreground">{{ label }}</span>
      <span class="mt-1 flex items-baseline gap-1">
        <span
          class="text-3xl font-black leading-none tabular-nums"
          :class="isAlert ? 'text-destructive' : 'text-foreground'"
        >
          {{ value }}
        </span>
        <span class="text-sm text-muted-foreground">{{ unit }}</span>
      </span>
      <span class="mt-1 block truncate text-xs text-muted-foreground">{{ caption }}</span>
    </span>

    <ArrowUpRight
      class="h-4 w-4 shrink-0 self-start text-muted-foreground/40 transition-colors group-hover:text-foreground"
      aria-hidden="true"
    />
  </RouterLink>
</template>
