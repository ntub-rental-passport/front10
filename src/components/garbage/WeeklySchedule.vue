<script setup lang="ts">
import { computed } from 'vue'
import {
  collectionSchedules,
  COLLECTION_LABELS,
  type CollectionKind,
} from '@/src/utils/garbage-countdown'
import type { GarbageStop } from '@/src/utils/garbage'
const props = defineProps<{ stops: GarbageStop[] }>()
defineEmits<{ close: [] }>()
const kinds: CollectionKind[] = ['garbage', 'recycling', 'food']
const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
const rows = computed(() =>
  days.map((label, i) => ({
    label,
    cells: kinds.map((kind) => {
      const schedules = collectionSchedules(props.stops, kind)
      if (!schedules.length) return '尚無獨立班表'
      const times = schedules
        .filter((s) => s.days.includes((i + 1) % 7))
        .map((s) => (s.arrival === s.departure ? s.arrival : `${s.arrival}–${s.departure}`))
      return [...new Set(times)].sort().join('、') || '未安排收運'
    }),
  })),
)
</script>
<template>
  <section class="panel weekly-schedule" aria-label="站點每週班表" tabindex="-1">
    <div class="section-heading">
      <h2>{{ stops[0]?.address }} · 每週班表</h2>
      <button class="text-button" @click="$emit('close')">關閉班表</button>
    </div>
    <p class="helper">每週班表不是即時車輛狀態；新北市區間結束時間暫估為抵達後 10 分鐘，非官方離站時間。臨時調整以官方公告為準。</p>
    <div class="table-scroll">
      <table class="station-table">
        <thead>
          <tr>
            <th>星期</th>
            <th v-for="kind in kinds" :key="kind">{{ COLLECTION_LABELS[kind] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.label">
            <th>{{ row.label }}</th>
            <td v-for="(cell, i) in row.cells" :key="i">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
<style scoped>
.weekly-schedule {
  padding: 18px;
  margin-bottom: 18px;
}
h2 {
  font-size: 16px;
}
th {
  white-space: nowrap;
}
</style>
