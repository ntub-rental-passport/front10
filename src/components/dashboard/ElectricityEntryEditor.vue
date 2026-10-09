<script setup lang="ts">
import { computed, ref } from 'vue'
import UtilityPhotoInput from './UtilityPhotoInput.vue'
import { utilityFields, utilityFieldLabels, utilityPreview, utilityReceivable, type UtilityEntry, type UtilityMethod, type UtilityContext } from '@/src/utils/utility-billing'
import { formatCurrency } from '@/src/utils/rent-format'
const props = defineProps<{ modelValue: UtilityEntry; context: UtilityContext; landlord?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: UtilityEntry]; busy: [value: boolean] }>()
const recognized = ref(0)
const preview = computed(() => utilityPreview(props.modelValue))
const methods = computed(() => [
  { value: 'meter', label: '依度數計費' }, { value: 'amount', label: '依台電帳單' },
  ...(props.landlord ? [{ value: 'shared', label: '平均／比例分攤' }, { value: 'master', label: '主表＋分表拆分' }] : []),
])
function changeMethod(event: Event) {
  const method = (event.target as HTMLSelectElement).value as UtilityMethod
  recognized.value = 0
  emit('update:modelValue', { method, payer: props.modelValue.payer || 'landlord_collect', recorded_on: props.modelValue.recorded_on,
    ...(['meter', 'master'].includes(method) ? { previous: props.context.previous, ...(props.context.rate != null ? { rate: props.context.rate } : {}) } : {}) })
}
function update(key: string, value: string | number) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function applyOcr(fields: { current?: number; amount?: number }) {
  if (props.disabled) return
  const key = props.modelValue.method === 'meter' || props.modelValue.method === 'master' ? 'current' : 'amount'
  if (fields[key] == null) return
  update(key, fields[key]!); recognized.value++
}
const fields = computed(() => utilityFields[props.modelValue.method].filter(key => key !== 'previous' &&
  !(key === 'amount' && props.modelValue.payer && props.modelValue.payer !== 'landlord_collect')))
</script>
<template>
  <fieldset :disabled="disabled" class="space-y-3 rounded-xl border border-slate-200 p-4">
    <legend class="px-1 font-semibold">電費</legend>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="space-y-1 text-sm"><span>計費方式</span>
        <select :value="modelValue.method" class="block w-full rounded-md border bg-white p-2" @change="changeMethod">
          <option v-if="!methods.some(m => m.value === modelValue.method)" :value="modelValue.method" disabled>{{ modelValue.method === 'pending' ? '請選擇計費方式' : '舊版計費紀錄（請重新選擇）' }}</option>
          <option v-for="method in methods" :key="method.value" :value="method.value">{{ method.label }}</option>
        </select>
      </label>
      <label class="space-y-1 text-sm"><span>繳費方式</span>
        <select :value="modelValue.payer || 'landlord_collect'" class="block w-full rounded-md border bg-white p-2" @change="update('payer', ($event.target as HTMLSelectElement).value)">
          <option value="landlord_collect">房東代收</option><option value="tenant_direct">房客自繳</option><option value="landlord_absorb">房東負擔</option>
        </select>
      </label>
      <label class="space-y-1 text-sm"><span>抄表／記錄日期</span><input :value="modelValue.recorded_on" type="date" required class="block w-full rounded-md border p-2" @input="update('recorded_on', ($event.target as HTMLInputElement).value)"></label>
    </div>
    <p v-if="modelValue.payer === 'tenant_direct'" class="text-sm text-sky-700">房客自繳：自行與台電結算，不計入應付房東金額。</p>
    <p v-if="modelValue.payer === 'landlord_absorb'" class="text-sm text-sky-700">房東負擔：由房東支付，不向房客收取。</p>
    <div v-if="['meter', 'master'].includes(modelValue.method)" class="rounded-lg bg-slate-50 p-3 text-sm">
      <label v-if="context.initial && !disabled" class="block space-y-1">首次起始讀數<input :value="modelValue.previous" type="number" min="0" step="any" required inputmode="decimal" class="block w-full rounded-md border bg-white p-2" @input="update('previous', ($event.target as HTMLInputElement).value)"><span class="block text-xs text-slate-500">請填入住或上次結算時的電表讀數；只需設定一次，後續由系統帶入。</span></label>
      <p v-else>上期讀數：<strong>{{ modelValue.previous ?? context.previous }}</strong>（系統帶入）</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <label v-for="field in fields" :key="field" class="space-y-1 text-sm"><span>{{ utilityFieldLabels[field] }}</span><input :value="modelValue[field]" type="number" min="0" step="any" required inputmode="decimal" class="block w-full rounded-md border p-2" @input="update(field, ($event.target as HTMLInputElement).value)"></label>
    </div>
    <p v-if="modelValue.method === 'meter'" class="text-sm text-slate-600">（{{ modelValue.current || '本期' }} − {{ modelValue.previous ?? context.previous }}）× {{ modelValue.rate || '單價' }} ＝ {{ preview.amount == null ? '待填寫' : formatCurrency(preview.amount) }}</p>
    <p v-if="modelValue.method === 'shared'" class="text-xs text-slate-500">總額 × 我的份數 ÷ 全部份數；均分填 1／戶數，也可依入住天數分攤。</p>
    <p v-if="modelValue.method === 'master'" class="text-xs text-slate-500">平均單價＝帳單總額 ÷ 主表用量；公共用量＝主表 − 全部分表，按份數分攤後加上本戶用量。</p>
    <UtilityPhotoInput v-if="!disabled && ['meter', 'master', 'amount'].includes(modelValue.method) && !(modelValue.method === 'amount' && modelValue.payer && modelValue.payer !== 'landlord_collect')" :mode="modelValue.method === 'amount' ? 'bill' : 'meter'" @recognized="applyOcr" @busy="emit('busy', $event)" />
    <label v-if="recognized" :key="recognized" class="flex items-start gap-2 text-sm text-sky-800"><input type="checkbox" required class="mt-1">我已對照照片，確認辨識數值正確</label>
    <p v-if="preview.error" role="status" class="text-sm text-amber-700">{{ preview.error }}</p>
    <p class="text-right text-sm font-semibold">應付房東電費：{{ utilityReceivable(modelValue) == null ? '待填寫' : formatCurrency(utilityReceivable(modelValue)!) }}</p>
  </fieldset>
</template>
