<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'

const props = defineProps<{
  title: string
  /** 未提供時整張卡不可點擊（權限不足的角色）。 */
  to?: string
  /** 主要狀態文字，例如「運作正常」。 */
  status: string
  tone: 'ok' | 'alert'
  /** 狀態下方的補充說明。 */
  detail?: string
  /** 右上角的小標，例如資料來源。 */
  cornerText?: string
}>()

const toneClasses = computed(() =>
  props.tone === 'alert'
    ? { dot: 'bg-destructive', text: 'text-destructive', ring: 'bg-destructive/15' }
    : { dot: 'bg-emerald-500', text: 'text-emerald-600', ring: 'bg-emerald-500/15' },
)
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to"
    :class="['block', to ? '' : 'cursor-default']"
  >
    <Card
      :class="[
        'h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm',
        to ? 'transition-shadow hover:shadow-md' : '',
      ]"
    >
      <CardHeader class="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
        <span
          v-if="cornerText"
          class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {{ cornerText }}
        </span>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="flex h-36 flex-col items-center justify-center gap-3">
          <span
            :class="['flex h-14 w-14 items-center justify-center rounded-full', toneClasses.ring]"
          >
            <span :class="['h-4 w-4 rounded-full', toneClasses.dot]" />
          </span>
          <span :class="['text-2xl font-black leading-none', toneClasses.text]">
            {{ status }}
          </span>
        </div>
        <p v-if="detail" class="text-center text-xs text-muted-foreground">{{ detail }}</p>
      </CardContent>
    </Card>
  </component>
</template>
