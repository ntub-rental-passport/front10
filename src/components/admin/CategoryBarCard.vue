<script setup lang="ts">
/**
 * 分類橫條卡。
 *
 * 刻意不用 canvas 圖表：分類少、標籤是中文，橫條配上對齊的數字比甜甜圈好讀，
 * 也讓整頁不是清一色的 Chart.js 畫布。條的顏色用同色相明度階梯表達排序。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { chartSeries } from '@/src/constants/admin-chart'

export interface CategoryBarItem {
  label: string
  value: number
}

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    items: CategoryBarItem[]
    to?: string
    /** 由大到小排序後再畫，讓明度階梯與量體一致 */
    sorted?: boolean
  }>(),
  { sorted: true },
)

const rows = computed(() => {
  const items = props.sorted ? [...props.items].sort((a, b) => b.value - a.value) : props.items
  const max = Math.max(1, ...items.map((item) => item.value))
  const colors = chartSeries(items.length)
  return items.map((item, index) => ({
    ...item,
    percent: Math.round((item.value / max) * 100),
    color: colors[index],
  }))
})

const total = computed(() => props.items.reduce((sum, item) => sum + item.value, 0))
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    :class="['block h-full', to ? 'group' : '']"
  >
    <Card
      :class="[
        'h-full rounded-3xl border-border/70 bg-background/90 shadow-sm',
        to ? 'transition-shadow group-hover:shadow-md' : '',
      ]"
    >
      <CardHeader class="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
          <p v-if="description" class="mt-1 text-xs text-muted-foreground">{{ description }}</p>
        </div>
        <span class="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          共 {{ total }}
        </span>
      </CardHeader>
      <CardContent class="space-y-3 pt-2">
        <div v-for="row in rows" :key="row.label" class="space-y-1.5">
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-muted-foreground">{{ row.label }}</span>
            <span class="font-semibold tabular-nums">{{ row.value }}</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full transition-[width] duration-500"
              :style="{ width: `${row.percent}%`, backgroundColor: row.color }"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  </component>
</template>
