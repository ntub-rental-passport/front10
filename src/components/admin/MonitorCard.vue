<script setup lang="ts">
/**
 * 單一監控項目。
 *
 * 尚未接上的項目顯示空狀態而不是數字 —— 假的健康度比沒有數字更糟，
 * 它永遠顯示正常，等真的接上後數值對不起來反而會懷疑是不是接錯。
 *
 * 顏色走 StatusDot（見 status-dot.ts）：正常是安靜的綠點，異常才整顆上色。
 * 原本連大數字也染成綠色／琥珀色 —— 琥珀色當文字在淺色模式只有 1.9 的對比，
 * 而且一排全綠的數字在一切正常時很吵。數字一律用前景色，狀態交給右上角那顆。
 */
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { PlugZap } from 'lucide-vue-next'
import StatusDot from './StatusDot.vue'
import { MONITOR_STATE_TONE, monitorStateLabels, type MonitorReading } from '@/src/utils/admin-monitoring'

const props = defineProps<{ reading: MonitorReading }>()

const tone = computed(() => MONITOR_STATE_TONE[props.reading.state])
const stateLabel = computed(() => props.reading.stateLabel ?? monitorStateLabels[props.reading.state])
</script>

<template>
  <Card class="h-full rounded-3xl">
    <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
      <div class="min-w-0">
        <CardTitle class="text-sm font-medium">{{ reading.label }}</CardTitle>
        <p class="mt-1 text-xs text-muted-foreground">{{ reading.description }}</p>
      </div>
      <StatusDot class="shrink-0" :tone="tone" :label="stateLabel" emphasize />
    </CardHeader>

    <CardContent class="px-5 pb-5">
      <template v-if="reading.connected">
        <p class="text-3xl font-black leading-none tabular-nums">{{ reading.value }}</p>
        <p v-if="reading.detail" class="mt-2 text-xs text-muted-foreground">{{ reading.detail }}</p>
      </template>

      <!-- 空狀態：明說為什麼沒有數字，不用灰色數字假裝有資料 -->
      <div v-else class="flex items-start gap-2 rounded-xl border border-dashed p-3">
        <PlugZap class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p class="text-xs text-muted-foreground">{{ reading.detail }}</p>
      </div>

      <ul v-if="reading.notes?.length" class="mt-3 space-y-1 border-t pt-3 text-xs text-foreground/70">
        <li v-for="note in reading.notes" :key="note">{{ note }}</li>
      </ul>
    </CardContent>
  </Card>
</template>
