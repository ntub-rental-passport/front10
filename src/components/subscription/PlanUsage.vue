<script setup lang="ts">
import type { PlanUsage } from '@/src/composables/usePlanOverview'
import { quotaPercent } from '@/src/utils/subscription-plans'
defineProps<{ items: PlanUsage[]; loading?: boolean; compact?: boolean }>()
</script>

<template>
  <div class="usage-list" :class="{ 'usage-list--compact': compact }">
    <div v-for="item in items" :key="item.label" class="usage-row">
      <div>
        <strong>{{ item.label }}</strong
        ><small>{{ item.note }}</small>
      </div>
      <b
        >{{ item.used ?? '—' }} <span>/ {{ item.limit }} {{ item.unit }}</span></b
      >
      <div
        class="usage-track"
        :class="{ unknown: item.used === null }"
        role="progressbar"
        :aria-label="item.label"
        :aria-valuenow="item.used === null ? undefined : quotaPercent(item.used, item.limit)!"
        :aria-valuetext="
          item.used === null
            ? loading
              ? '讀取中'
              : '尚無用量資料'
            : `已使用 ${item.used}，額度 ${item.limit} ${item.unit}`
        "
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <i
          v-if="item.used !== null"
          :class="{ full: item.used >= item.limit }"
          :style="{ width: `${quotaPercent(item.used, item.limit)}%` }"
        />
      </div>
      <small
        class="usage-remaining"
        :class="{ exceeded: item.used !== null && item.used > item.limit }"
        >{{
          item.used === null
            ? loading
              ? '讀取中…'
              : '尚無用量資料'
            : item.used > item.limit
              ? `超出 ${item.used - item.limit} ${item.unit}`
              : item.used === item.limit
                ? '已達方案額度'
                : `剩餘 ${item.limit - item.used} ${item.unit}`
        }}</small
      >
    </div>
  </div>
</template>

<style scoped>
.usage-list--compact {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.usage-list--compact .usage-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px 24px;
  border-right: 1px solid var(--plan-line);
  min-width: 0;
}
.usage-list--compact .usage-row:last-child {
  border-right: 0;
}
.usage-list--compact .usage-row > div > small,
.usage-list--compact .usage-track {
  display: none;
}
.usage-list--compact .usage-remaining {
  text-align: left;
}
@media (max-width: 520px) {
  .usage-list--compact .usage-row {
    padding: 14px 10px;
  }
  .usage-list--compact .usage-row strong {
    font-size: 11px;
  }
  .usage-list--compact .usage-row b {
    font-size: 14px;
  }
  .usage-list--compact .usage-row small {
    font-size: 10px;
  }
}
.usage-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) auto minmax(80px, 1fr) 110px;
  align-items: center;
  gap: 24px;
  padding: 22px 24px;
  border-top: 1px solid var(--plan-line);
}
.usage-row strong {
  font-size: 14px;
}
.usage-row small {
  display: block;
  color: var(--plan-muted);
  font-size: 12px;
  line-height: 1.6;
}
.usage-row b {
  font-size: 16px;
  white-space: nowrap;
}
.usage-row b span {
  font-size: 12px;
  font-weight: 400;
  color: var(--plan-muted);
}
.usage-track {
  height: 7px;
  background: #e9e8e3;
  border-radius: 8px;
  overflow: hidden;
}
.usage-track i {
  display: block;
  height: 100%;
  background: var(--plan-accent);
  border-radius: 8px;
}
.usage-track i.full {
  background: #ba7b36;
}
.usage-track.unknown {
  background: repeating-linear-gradient(120deg, #efeee9, #efeee9 5px, #e3e2dc 5px, #e3e2dc 10px);
}
.usage-remaining {
  text-align: right;
}
.usage-remaining.exceeded {
  color: #b1483f;
}
@media (max-width: 850px) {
  .usage-row {
    grid-template-columns: 1fr auto;
    gap: 12px;
  }
  .usage-track {
    grid-column: 1;
  }
  .usage-remaining {
    grid-column: 2;
  }
  .usage-row {
    padding: 20px;
  }
}
</style>
