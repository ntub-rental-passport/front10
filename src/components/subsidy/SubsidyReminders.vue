<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { subsidyReminders } from '@/src/services/subsidyReminderApi'
import { SCHEDULE_STATUS_LABEL, type ScheduledNotif } from '@/src/utils/notif-schedule'

const applicationDate = ref('')
const days = ref(14)
const items = ref<ScheduledNotif[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
async function refresh() {
  items.value = await subsidyReminders()
}
async function run(action: () => Promise<unknown>, success = '') {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await action()
    await refresh()
    message.value = success
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失敗，請稍後再試。'
  } finally {
    busy.value = false
  }
}
onMounted(() => run(async () => {}))
</script>

<template>
  <section class="reminders">
    <h2>記錄申請日期，提醒自己回官網確認</h2>
    <p>
      在政府網站完成送出後，再記下申請日期。系統僅保存日期與提醒設定，不記錄案件狀態、證件號碼或補件內容。
    </p>
    <form
      @submit.prevent="
        run(
          () => subsidyReminders('POST', { applicationDate, days }),
          '已儲存，屆時將寄送至 RentMate 通知中心。',
        )
      "
    >
      <label
        >已完成送出的日期<input v-model="applicationDate" type="date" :max="today" required
      /></label>
      <label
        >多久後提醒<select v-model="days">
          <option :value="7">7 天後</option>
          <option :value="14">14 天後</option>
          <option :value="30">30 天後</option>
        </select></label
      >
      <p>
        於所選日期後的第 {{ days }} 天上午
        9:00（台灣時間），發送一次站內通知。這不是官方審查時程；目前不提供手機或瀏覽器背景推播。
      </p>
      <button :disabled="busy" type="submit">{{ busy ? '處理中…' : '儲存申請日期與提醒' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <h3>我的提醒</h3>
    <p v-if="!items.length && !busy && !error">尚未設定提醒。</p>
    <ul>
      <li v-for="item in items" :key="item.id">
        <strong>{{ item.sourceLabel }}</strong>
        <span>{{ formatDate(item.scheduledAt) }} · {{ SCHEDULE_STATUS_LABEL[item.status] }}</span>
        <span v-if="item.status === 'missed' || item.status === 'failed'"
          >這則提醒未成功送出，請自行到官網確認，或重新設定。</span
        >
        <button
          v-if="item.status === 'pending'"
          :disabled="busy"
          type="button"
          @click="run(() => subsidyReminders('DELETE', undefined, item.id), '已取消提醒。')"
        >
          取消提醒
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h2 {
  font-size: 23px;
  font-weight: 700;
  margin-bottom: 12px;
}
h3 {
  margin-top: 24px;
  font-weight: 700;
}
p {
  color: #627088;
  margin: 12px 0;
  line-height: 1.8;
}
form {
  display: grid;
  gap: 14px;
}
label {
  display: grid;
  gap: 6px;
}
input,
select {
  border: 1px solid #d5daea;
  border-radius: 8px;
  padding: 12px;
  width: 100%;
}
button {
  background: #5146a0;
  color: white;
  padding: 10px 16px;
  border-radius: 9px;
  cursor: pointer;
  justify-self: start;
}
button:disabled {
  opacity: 0.55;
  cursor: wait;
}
li {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-bottom: 1px solid #e2e6ef;
}
span {
  color: #627088;
}
[role='alert'] {
  color: #a23424;
}
</style>
