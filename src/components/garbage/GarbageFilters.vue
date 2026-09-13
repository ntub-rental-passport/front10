<script setup lang="ts">
import { CalendarDays, Clock3, Search } from 'lucide-vue-next'
import { TAIPEI_DISTRICTS, NEW_TAIPEI_DISTRICTS, type GarbageCity } from '@/src/utils/garbage'
defineProps<{ villages: string[]; roads: string[]; count: number; showCity?: boolean }>()
const city = defineModel<GarbageCity>('city', { default: '臺北市' })
defineEmits<{ submit: []; reset: [] }>()
const district = defineModel<string>('district', { required: true })
const village = defineModel<string>('village', { required: true })
const road = defineModel<string>('road', { required: true })
const date = defineModel<string>('date', { required: true })
const start = defineModel<string>('start', { required: true })
const end = defineModel<string>('end', { required: true })
</script>
<template>
  <form class="filter-panel panel" @submit.prevent="$emit('submit')">
    <div class="section-heading">
      <h2>查詢條件</h2>
      <button type="button" class="text-button" @click="$emit('reset')">重設</button>
    </div>
    <label v-if="showCity"
      >縣市<select v-model="city">
        <option>臺北市</option>
        <option>新北市</option>
      </select></label
    >
    <label
      >行政區<select v-model="district">
        <option value="">全部行政區</option>
        <option v-for="d in city === '臺北市' ? TAIPEI_DISTRICTS : NEW_TAIPEI_DISTRICTS" :key="d">
          {{ d }}
        </option>
      </select></label
    >
    <label
      >里別<select v-model="village">
        <option value="">全部里別</option>
        <option v-for="v in villages" :key="v">{{ v }}</option>
      </select></label
    >
    <label
      >道路／地址關鍵字<input
        v-model="road"
        list="garbage-roads"
        placeholder="例如：和平東路" /><datalist id="garbage-roads">
        <option v-for="r in roads" :key="r" :value="r" /></datalist
    ></label>
    <label
      ><CalendarDays :size="15" />清運班表日期<input v-model="date" type="date" required
    /></label>
    <div>
      <label>清運時間</label>
      <div class="time-inputs">
        <input v-model="start" type="time" aria-label="開始時間" /><span>至</span
        ><input v-model="end" type="time" aria-label="結束時間" />
      </div>
    </div>
    <p class="helper">留白查詢全天；24:xx 表示班表日期的隔日凌晨。</p>
    <button class="primary-button" type="submit">
      <Search :size="17" />查看 {{ count }} 筆結果
    </button>
    <div class="schedule-note">
      <Clock3 :size="17" />
      <p>
        {{
          city === '臺北市' ? '一般清運週三、週日停收。' : '依各站垃圾、回收及廚餘的每週班表查詢。'
        }}<br />特殊假期、颱風及臨時調整，以環保局公告為準。
      </p>
    </div>
  </form>
</template>
