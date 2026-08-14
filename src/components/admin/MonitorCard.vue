<script setup lang="ts">
/**
 * 單一監控項目。
 *
 * 尚未接上的項目顯示空狀態而不是數字 —— 假的健康度比沒有數字更糟，
 * 它永遠顯示正常，等真的接上後數值對不起來反而會懷疑是不是接錯。
 */
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { PlugZap } from 'lucide-vue-next'
import { monitorStateLabels, type MonitorReading } from '@/src/utils/admin-monitoring'

const props = defineProps<{ reading: MonitorReading }>()

const tone = computed(() => {
  switch (props.reading.state) {
    case 'ok':
      return { dot: 'bg-emerald-500', text: 'text-emerald-600' }
    case 'degraded':
      return { dot: 'bg-amber-500', text: 'text-amber-600' }
    case 'down':
      return { dot: 'bg-destructive', text: 'text-destructive' }
    default:
      return { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
  }
})
</script>

<template>
  <Card class="h-full rounded-3xl">
    <CardHeader class="flex flex-row items-start justify-between space-y-0 pb-2">
      <div class="min-w-0">
        <CardTitle class="text-sm font-medium">{{ reading.label }}</CardTitle>
        <p class="mt-1 text-xs text-muted-foreground">{{ reading.description }}</p>
      </div>
      <span class="flex shrink-0 items-center gap-1.5 text-xs" :class="tone.text">
        <span class="h-1.5 w-1.5 rounded-full" :class="tone.dot" aria-hidden="true" />
        {{ monitorStateLabels[reading.state] }}
      </span>
    </CardHeader>

    <CardContent>
      <template v-if="reading.connected">
        <p class="text-3xl font-black leading-none tabular-nums" :class="tone.text">
          {{ reading.value }}
        </p>
        <p v-if="reading.detail" class="mt-2 text-xs text-muted-foreground">{{ reading.detail }}</p>
      </template>

      <!-- 空狀態：明說還沒接上，不用灰色數字假裝有資料 -->
      <div v-else class="flex items-start gap-2 rounded-xl border border-dashed p-3">
        <PlugZap class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p class="text-xs text-muted-foreground">{{ reading.detail }}</p>
      </div>
    </CardContent>
  </Card>
</template>
