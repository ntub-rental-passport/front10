<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GarbageStop } from '@/src/utils/garbage'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog/index'
const props = defineProps<{ stop: GarbageStop | null }>()
const open = defineModel<boolean>('open', { required: true })
const kind = ref('站點位置／地址有誤')
const description = ref('')
const observed = ref('')
const issueUrl = computed(() => {
  const url = new URL('https://github.com/ntub-rental-passport/front10/issues/new')
  url.searchParams.set('title', `[垃圾清運] ${kind.value}`)
  url.searchParams.set(
    'body',
    `問題類型：${kind.value}\n站點：${props.stop?.address || '未指定，請在下方描述'}\n路線／車次：${props.stop ? props.stop.route + '／' + props.stop.trip : '未指定'}\n觀察日期：${observed.value || '未填寫'}\n\n問題描述與建議更正：\n${description.value.trim()}\n\n此為使用者回報，尚未經查核。`,
  )
  return url.href
})
</script>
<template>
  <Dialog v-model:open="open">
    <DialogContent class="garbage-page garbage-filter-dialog">
      <div class="filter-panel panel">
        <DialogTitle>回報清運資料問題</DialogTitle>
        <DialogDescription
          >先整理問題，再前往 RentMate 的 GitHub Issues
          確認送出。不會直接修改官方資料。</DialogDescription
        >
        <p v-if="stop">{{ stop.address }} · {{ stop.route }} · {{ stop.trip }}</p>
        <label
          >問題類型<select v-model="kind">
            <option>站點位置／地址有誤</option>
            <option>路線／班次資訊有誤</option>
            <option>表定清運時間有誤</option>
            <option>地圖或操作異常</option>
          </select></label
        >
        <label>觀察日期<input v-model="observed" type="date" /></label>
        <label
          >問題說明<textarea
            v-model="description"
            rows="5"
            maxlength="1500"
            placeholder="請描述站點、錯誤內容及你觀察到的情況，勿填入電話、住戶資料或其他個資。"
          />
        </label>
        <p class="helper">
          此管道需 GitHub 帳號與儲存庫存取權。內容可能公開；不會附上你的 GPS
          或登入資料。若無法存取，請洽 RentMate 管理者。
        </p>
        <a
          v-if="description.trim().length >= 10"
          class="primary-button"
          :href="issueUrl"
          target="_blank"
          rel="noopener noreferrer"
          >預覽並前往 GitHub 送出</a
        >
        <button v-else class="primary-button" disabled>請至少輸入 10 字說明</button>
      </div>
    </DialogContent>
  </Dialog>
</template>
<style scoped>
textarea {
  border: 1px solid #e5e5ef;
  border-radius: 12px;
  padding: 12px;
  width: 100%;
  resize: vertical;
  font: inherit;
}
a {
  text-align: center;
  text-decoration: none;
}
</style>
