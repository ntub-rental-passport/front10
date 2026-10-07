<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, Building2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HandoverProperty } from '@/src/composables/useHandover'

const props = defineProps<{
  phase?: 'baseline' | 'checkout'
  title: string
  properties: HandoverProperty[]
  property: HandoverProperty | null
  total: number
  done: number
  busy: boolean
}>()
defineEmits<{ select: [id: string]; back: [] }>()
const percentage = computed(() =>
  props.total ? Math.round(Math.min(1, Math.max(0, props.done / props.total)) * 100) : 0,
)
const circumference = 2 * Math.PI * 44
const counters = computed(() => [
  { label: '點交項目', value: props.total },
  { label: '已完成項目', value: props.done },
  { label: '未完成項目', value: Math.max(0, props.total - props.done) },
])
</script>

<template>
  <div class="handover-header space-y-6">
    <header class="handover-title-row">
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        <span class="hidden sm:inline">{{ title }}</span
        ><span class="sm:hidden">{{ phase === 'checkout' ? '退租點交' : title }}</span>
      </h1>
      <div class="handover-property">
        <Select
          :disabled="busy"
          :model-value="property?.id ?? ''"
          @update:model-value="(value) => $emit('select', String(value))"
        >
          <SelectTrigger
            aria-label="目前租屋處"
            class="h-11 w-full min-w-0 bg-card"
            :title="property ? `${property.alias}（${property.address}）` : '目前租屋處'"
          >
            <Building2 class="mr-2 h-4 w-4 shrink-0 text-primary" />
            <span class="min-w-0 flex-1 truncate text-left"
              ><SelectValue placeholder="請選擇租屋處"
            /></span>
          </SelectTrigger>
          <SelectContent
            ><SelectItem v-for="entry in properties" :key="entry.id" :value="entry.id"
              >{{ entry.alias }}（{{ entry.address }}）</SelectItem
            ></SelectContent
          >
        </Select>
      </div>
    </header>
    <nav class="mobile-phase-tabs sm:hidden" aria-label="點交階段">
      <RouterLink to="/app/handover/baseline" :class="{ active: phase !== 'checkout' }"
        >入住前</RouterLink
      >
      <RouterLink to="/app/handover/checkout" :class="{ active: phase === 'checkout' }"
        >退租時</RouterLink
      >
    </nav>
    <section
      v-if="property"
      class="handover-summary rounded-xl border bg-card p-5 shadow-sm sm:p-6"
      aria-label="點交進度摘要"
    >
      <div class="handover-completion">
        <div
          class="completion-ring"
          role="progressbar"
          aria-label="點交完成率"
          :aria-valuenow="percentage"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuetext="`${percentage}%，已完成 ${done} / ${total} 項`"
        >
          <svg viewBox="0 0 104 104" aria-hidden="true">
            <circle
              cx="52"
              cy="52"
              r="44"
              fill="none"
              stroke="currentColor"
              stroke-width="9"
              class="text-primary/10"
            />
            <circle
              cx="52"
              cy="52"
              r="44"
              fill="none"
              stroke="currentColor"
              stroke-width="9"
              stroke-linecap="round"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="circumference * (1 - percentage / 100)"
              :opacity="percentage ? 1 : 0"
              transform="rotate(-90 52 52)"
              class="text-primary"
            />
          </svg>
          <strong class="absolute inset-0 flex items-center justify-center text-2xl font-bold"
            >{{ percentage }}%</strong
          >
        </div>
        <div class="min-w-0 space-y-2">
          <div class="text-sm text-muted-foreground">點交完成率</div>
          <p class="text-lg font-semibold tabular-nums">已完成 {{ done }} / {{ total }} 項</p>
        </div>
      </div>
      <div class="handover-counters grid grid-cols-3 divide-x">
        <div v-for="counter in counters" :key="counter.label" class="min-w-0 px-2 text-center">
          <div class="text-xs text-muted-foreground sm:text-sm">{{ counter.label }}</div>
          <div
            class="mt-2 whitespace-nowrap text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
          >
            {{ counter.value
            }}<span class="ml-1 text-xs font-normal text-muted-foreground">項</span>
          </div>
        </div>
      </div>
      <div class="handover-actions">
        <Button class="w-full" @click="$emit('back')"
          ><ArrowLeft class="mr-1 h-4 w-4" />返回總覽</Button
        >
        <slot name="actions" />
      </div>
    </section>
    <Button v-else variant="outline" @click="$emit('back')"
      ><ArrowLeft class="mr-1 h-4 w-4" />返回總覽</Button
    >
  </div>
</template>

<style scoped>
.handover-header {
  container-type: inline-size;
}
.handover-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.handover-property {
  width: 100%;
  min-width: 0;
}
.handover-summary {
  display: grid;
  gap: 1.5rem;
  align-items: center;
}
.handover-completion {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.completion-ring {
  position: relative;
  width: 106px;
  height: 106px;
  flex-shrink: 0;
}
.handover-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
@container (min-width: 620px) {
  .handover-property {
    width: 360px;
    max-width: 45%;
  }
  .handover-summary {
    grid-template-columns: 1fr 1.25fr;
  }
  .handover-actions {
    grid-column: 1 / -1;
    justify-self: end;
    width: 320px;
  }
}
@container (min-width: 1060px) {
  .handover-summary {
    grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.45fr) 160px;
  }
  .handover-counters {
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }
  .handover-actions {
    grid-column: auto;
    grid-template-columns: 1fr;
    width: auto;
    justify-self: stretch;
  }
}
@media (max-width: 639px) {
  .handover-header {
    gap: 0.75rem;
    display: flex;
    flex-direction: column;
  }
  .handover-header > * {
    margin-block: 0;
  }
  .handover-title-row {
    flex-wrap: nowrap;
    gap: 0.5rem;
  }
  .handover-title-row h1 {
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .handover-property {
    width: 48%;
  }
  .handover-property :deep(button) {
    font-size: 0.75rem;
    padding-inline: 0.5rem;
  }
  .handover-property :deep(svg:first-child) {
    display: none;
  }
  .handover-summary {
    padding: 1rem;
    gap: 1rem;
  }
  .completion-ring {
    width: 88px;
    height: 88px;
  }
  .handover-completion {
    justify-content: center;
  }
  .mobile-phase-tabs {
    display: flex;
    border-radius: 0.75rem;
    background: var(--muted);
    padding: 0.25rem;
  }
  .mobile-phase-tabs a {
    flex: 1;
    text-align: center;
    padding: 0.5rem;
    font-size: 0.875rem;
    border-radius: 0.5rem;
  }
  .mobile-phase-tabs .active {
    color: var(--primary);
    background: var(--background);
    font-weight: 600;
  }
}
</style>
