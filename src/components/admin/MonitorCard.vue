<script setup lang="ts">
/** 單一監控項目：未連接時顯示空狀態，數值使用前景色以避免警示色文字對比不足。 */
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { PlugZap } from 'lucide-vue-next'
import InfoTip from './InfoTip.vue'
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
        <CardTitle class="inline-flex items-center gap-1.5 text-sm font-medium">
          {{ reading.label }}
          <InfoTip :text="reading.description" />
        </CardTitle>
      </div>
      <StatusDot class="shrink-0" :tone="tone" :label="stateLabel" emphasize />
    </CardHeader>

    <CardContent class="px-5 pb-5">
      <template v-if="reading.connected">
        <p class="text-3xl font-black leading-none tabular-nums">{{ reading.value }}</p>
        <p v-if="reading.detail" class="mt-2 text-xs text-muted-foreground">{{ reading.detail }}</p>
      </template>

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
