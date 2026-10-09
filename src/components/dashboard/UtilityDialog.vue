<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'
import type { CycleView } from '@/src/utils/dashboard-contract'
import { cleanUtilityEntry, utilityFields, utilityFieldLabels, utilityMethods, utilityPreview, type UtilityDetails, type UtilityEntry } from '@/src/utils/utility-billing'
import { formatCurrency, formatDate } from '@/src/utils/rent-format'
import { formatIso, startOfToday } from '@/src/utils/rent-format'
import ElectricityEntryEditor from './ElectricityEntryEditor.vue'
import { fetchUtilityContext } from '@/src/services/dashboardApi'
import { utilityReceivable, type UtilityContext } from '@/src/utils/utility-billing'

const props = defineProps<{ open: boolean; targetCycle: CycleView | null; saving: boolean; error: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; save: [value: UtilityDetails] }>()
const kinds = [{ key: 'water', label: '水費' }] as const
const context = ref<UtilityContext>({ previous: 0, rate: null, initial: true })
const contextLoading = ref(false), contextError = ref(''), ocrBusy = ref(false)
let requestVersion = 0
const form = ref<UtilityDetails>({ electricity: { method: 'pending' }, water: { method: 'pending' } })
const fromAmount = (amount: number | null): UtilityEntry => amount == null ? { method: 'pending' } : { method: 'amount', amount }
watch(() => [props.open, props.targetCycle?.cycle.id], async () => {
  const version = ++requestVersion
  const cycle = props.targetCycle?.cycle
  if (!props.open || !cycle) return
  form.value = cycle.utilityDetails ? JSON.parse(JSON.stringify(cycle.utilityDetails)) : {
    electricity: fromAmount(cycle.electricityAmount), water: fromAmount(cycle.waterAmount),
  }
  form.value.electricity.recorded_on ||= formatIso(startOfToday())
  form.value.electricity.payer ||= 'landlord_collect'
  form.value.water.payer ||= 'landlord_collect'
  contextError.value = ''; contextLoading.value = true
  try {
    const result = await fetchUtilityContext(cycle.id)
    if (version !== requestVersion) return
    context.value = result
    if (!cycle.paidAt && form.value.electricity.method === 'meter') form.value.electricity.previous = result.previous
  } catch (error) {
    if (version === requestVersion) contextError.value = error instanceof Error ? error.message : '無法取得上期讀數，請重新開啟。'
  } finally { if (version === requestVersion) contextLoading.value = false }
}, { immediate: true })
const previews = computed(() => ({ electricity: utilityPreview(form.value.electricity), water: utilityPreview(form.value.water) }))
const invalid = computed(() => Boolean(previews.value.electricity.error || previews.value.water.error || contextLoading.value || contextError.value || ocrBusy.value))
const readonly = computed(() => Boolean(props.targetCycle?.cycle.paidAt))
const total = computed(() => (props.targetCycle?.cycle.rentAmount ?? 0) + (utilityReceivable(form.value.electricity) ?? 0) + (utilityReceivable(form.value.water) ?? 0))
const incomplete = computed(() => utilityReceivable(form.value.electricity) == null || utilityReceivable(form.value.water) == null)
const waterFields = computed(() => utilityFields[form.value.water.method].filter(field =>
  !(field === 'amount' && form.value.water.payer !== 'landlord_collect')))
function save() {
  if (!invalid.value && !props.saving && !readonly.value) emit('save', {
    electricity: cleanUtilityEntry(form.value.electricity), water: cleanUtilityEntry(form.value.water),
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="value => { if (!saving) emit('update:open', value) }">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ readonly ? '水電費明細' : '填寫水電費' }}</DialogTitle>
        <DialogDescription v-if="targetCycle">
          {{ targetCycle.contractTitle }} · 第 {{ targetCycle.cycle.periodIndex }} 期<br>
          {{ formatDate(targetCycle.cycle.periodStart) }} ～ {{ formatDate(targetCycle.cycle.periodEnd) }}
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <p class="text-sm text-slate-500">自行記錄本期費用，不需房東邀請。帳單跨月時請自行確認歸屬期數，避免重複計入。</p>
        <p v-if="readonly" class="text-sm text-amber-700">這期已標記已繳。如需修改，請先撤銷已繳紀錄。</p>
        <p v-if="contextLoading" role="status" class="text-sm text-slate-500">正在取得上期讀數…</p>
        <p v-if="contextError" role="alert" class="text-sm text-red-600">{{ contextError }}</p>
        <ElectricityEntryEditor :key="targetCycle?.cycle.id" v-model="form.electricity" :context="context" :disabled="saving || readonly || contextLoading || Boolean(contextError)" @busy="ocrBusy = $event" />
        <fieldset v-for="kind in kinds" :key="kind.key" :disabled="saving || readonly" class="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend class="px-1 font-semibold">{{ kind.label }}</legend>
          <label class="block space-y-1 text-sm">
            <span>計費方式</span>
            <select v-model="form[kind.key].method" class="w-full rounded-md border bg-white p-2">
              <option v-for="method in utilityMethods" :key="method.value" :value="method.value">{{ method.label }}</option>
            </select>
          </label>
          <label class="block space-y-1 text-sm">
            <span>繳費方式</span>
            <select v-model="form[kind.key].payer" class="w-full rounded-md border bg-white p-2">
              <option value="landlord_collect">房東代收</option>
              <option value="tenant_direct">房客自繳</option>
              <option value="landlord_absorb">房東負擔</option>
            </select>
          </label>
          <p v-if="form[kind.key].payer === 'tenant_direct'" class="text-sm text-sky-700">房客自繳：自行向自來水公司繳費，不計入應付房東金額。</p>
          <p v-if="form[kind.key].payer === 'landlord_absorb'" class="text-sm text-sky-700">房東負擔：由房東支付，不向房客收取。</p>
          <p v-if="form[kind.key].method === 'pending' && form[kind.key].payer === 'landlord_collect'" class="text-xs text-amber-700">金額尚未確認，合計會保留「待填寫」。若確定本月不出帳，請改選「本期不出帳」。</p>
          <p v-if="form[kind.key].method === 'no_bill'" class="text-xs text-slate-500">已確認本期不出水費帳單，以 0 元完成本期計算。隔月收到帳單時再記錄一次完整金額，不代表由房東負擔。</p>
          <p v-if="form[kind.key].method === 'amount' && form[kind.key].payer === 'landlord_collect'" class="text-xs text-slate-500">請填帳單最終「應繳總金額／代繳（代收）總金額」，不要只填用水費或水費項目小計。基本費、用水費、代徵費及減免／退費以帳單為準；最終應繳為 0 元時可直接填 0。固定費用則依租約約定填寫。</p>
          <details class="text-xs text-slate-500">
            <summary class="cursor-pointer text-sky-700">水費帳單怎麼填？</summary>
            <p class="mt-2">帳單可能包含基本費、用水費、營業稅、清除處理費、水源保育與回饋費、污水下水道使用費及退費調整。依最終應繳金額記錄，無須重算級距或另外加稅。</p>
            <p class="mt-1">若採隔月出帳，收到帳單時將完整金額歸入一期；另一個月選「本期不出帳」，避免兩個月重複計入同一張帳單。</p>
            <a class="mt-1 inline-block underline" href="https://www.water.gov.tw/ch/Subject/Detail/1288?nodeId=813" target="_blank" rel="noopener noreferrer">台灣自來水公司計費說明</a>
          </details>
          <p v-if="form[kind.key].method === 'meter'" class="text-xs text-slate-500">此處為約定單價的簡易計算，不含自來水公司累進級距、基本費與代徵費。若收到官方帳單，請選「帳單金額／固定費用」填最終應繳金額。</p>
          <p v-if="form[kind.key].method === 'shared'" class="text-xs text-slate-500">總額 × 我的份數 ÷ 全部份數。均分可填 1／總人數；依天數分攤可填入住天數。</p>
          <p v-if="form[kind.key].method === 'master'" class="text-xs text-slate-500">以帳單總額 ÷ 主表用量算平均單價。我的分表用量，加上公共用量按份數分攤後計費；公共用量＝主表用量 − 所有分表用量。</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="field in waterFields" :key="field" class="block space-y-1 text-sm">
              <span>{{ utilityFieldLabels[field] }}</span>
              <input v-model="form[kind.key][field]" type="number" inputmode="decimal" min="0" step="any" required class="w-full rounded-md border p-2" />
            </label>
          </div>
          <p v-if="previews[kind.key].error" role="status" class="text-sm text-amber-700">{{ previews[kind.key].error }}</p>
          <p class="text-right text-sm font-semibold">應付房東{{ kind.label }}：{{ utilityReceivable(form[kind.key]) == null ? '待填寫' : formatCurrency(utilityReceivable(form[kind.key])!) }}</p>
        </fieldset>
        <div class="rounded-xl bg-slate-50 p-3 text-sm">
          <p class="font-semibold">{{ incomplete ? '目前已知合計' : '本期合計' }}（含租金）：{{ formatCurrency(total) }}</p>
          <p class="mt-1 text-xs text-slate-500">各項費用四捨五入至元。房客自繳、房東負擔、本期不出帳或已含租金，應付房東金額皆為 0 元；房東代收且帳單待確認時保留待填寫。</p>
        </div>
        <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" :disabled="saving" @click="emit('update:open', false)">{{ readonly ? '關閉' : '取消' }}</Button>
          <Button v-if="!readonly" type="submit" :disabled="saving || invalid">{{ saving ? '儲存中…' : '儲存水電費' }}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
