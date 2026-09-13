<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

export interface QuotaProgressItem {
  id: string
  label: string
  percent: number
  level: 'ok' | 'warn' | 'critical'
  caption: string
  unset: boolean
}

defineProps<{
  title: string
  to: string
  items: QuotaProgressItem[]
  cornerText: string
  cornerVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
}>()

// 與 AI 使用量頁的進度條同一組配色。不使用 components/ui/progress：
// 它的 ProgressIndicator 寫死 bg-primary，沒有 props 可依狀態換色。
const barClasses = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  critical: 'bg-destructive',
} as const
</script>

<template>
  <RouterLink :to="to" class="block">
    <Card class="h-full rounded-3xl border-border/70 bg-background/90 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
        <Badge :variant="cornerVariant ?? 'secondary'">{{ cornerText }}</Badge>
      </CardHeader>
      <CardContent>
        <div class="flex h-[13.25rem] flex-col justify-center gap-6">
          <div v-for="item in items" :key="item.id" class="space-y-2">
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-sm font-medium">{{ item.label }}</span>
              <span v-if="item.unset" class="shrink-0 text-sm text-muted-foreground">未設定</span>
              <span v-else class="shrink-0 text-lg font-black tabular-nums">{{ item.percent }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                class="h-full rounded-full transition-all"
                :class="barClasses[item.level]"
                :style="{ width: `${item.unset ? 0 : item.percent}%` }"
              />
            </div>
            <p class="text-xs text-muted-foreground">{{ item.caption }}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </RouterLink>
</template>
