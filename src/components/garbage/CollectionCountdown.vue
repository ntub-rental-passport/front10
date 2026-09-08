<script setup lang="ts">
import { computed } from 'vue'
import {
  COLLECTION_LABELS,
  collectionSchedules,
  nextCollection,
  countdownLabel,
  nextTimeLabel,
  type CollectionKind,
} from '@/src/utils/garbage-countdown'
import type { GarbageStop } from '@/src/utils/garbage'
const props = defineProps<{ stops: GarbageStop[]; now: Date; compact?: boolean }>()
const kinds: CollectionKind[] = ['garbage', 'recycling', 'food']
const schedules = computed(() =>
  kinds.map((kind) => ({ kind, values: collectionSchedules(props.stops, kind) })),
)
const rows = computed(() =>
  schedules.value.map(({ kind, values }) => ({ kind, next: nextCollection(values, props.now) })),
)
</script>
<template>
  <div class="collection-countdown" :class="{ compact }" aria-label="各類清運下一班倒數">
    <div v-for="row in rows" :key="row.kind" class="collection-countdown-row" :class="row.kind">
      <span class="collection-kind">{{ COLLECTION_LABELS[row.kind] }}</span>
      <div>
        <strong>{{ countdownLabel(row.next, now) }}</strong
        ><small>{{
          row.next
            ? `${row.next.active ? '表定' : '下一班'} ${nextTimeLabel(row.next)}`
            : '尚無獨立班表'
        }}</small>
      </div>
    </div>
    <p v-if="!compact" class="helper">
      依臺北時間計算同站點的下一次表定收運；一般清運依現有班表，回收／廚餘需獨立資料。非 GPS
      抵達預測。
    </p>
  </div>
</template>
<style scoped>
.collection-countdown {
  display: grid;
  gap: 7px;
  margin: 12px 0;
}
.collection-countdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 11px;
  border-radius: 9px;
  background: #f6f5fb;
  font-size: 12px;
}
.collection-kind {
  white-space: nowrap;
  color: #66627d;
}
.collection-kind:before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6555b7;
  margin-right: 6px;
}
.recycling .collection-kind:before {
  background: #159c79;
}
.food .collection-kind:before {
  background: #d39925;
}
.collection-countdown-row > div {
  text-align: right;
}
.collection-countdown strong {
  display: block;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #5146a5;
}
.collection-countdown small {
  display: block;
  font-size: 10px;
  color: #858399;
}
.compact .collection-countdown-row {
  padding: 5px 8px;
  font-size: 11px;
}
.compact small {
  font-size: 9px;
}
</style>
