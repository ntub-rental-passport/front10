<script setup lang="ts">
import { ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Textarea } from '@/components/ui/textarea/index'
import { paymentMethodOptions, type CycleStatus, type CycleView, type PaymentMethod } from '@/src/mocks/dashboard-seed'
import { formatCurrency, formatDate, formatIso, startOfToday } from '@/src/utils/rent-format'

const props = defineProps<{
  open: boolean
  targetCycle: CycleView | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [form: { paidAt: string; method: PaymentMethod; note: string; proofName: string }]
}>()

const proofInput = ref<HTMLInputElement | null>(null)
const form = ref({
  paidAt: formatIso(startOfToday()),
  method: 'bank-transfer' as PaymentMethod,
  note: '',
  proofName: '',
})

watch(
  () => props.targetCycle,
  (cycle) => {
    if (!cycle) return
    form.value = { paidAt: formatIso(startOfToday()), method: 'bank-transfer', note: '', proofName: '' }
    if (proofInput.value) proofInput.value.value = ''
  },
)

function handleProofChange(event: Event) {
  const input = event.target as HTMLInputElement
  form.value.proofName = input.files?.[0]?.name ?? ''
}

function statusBadgeClass(status: CycleStatus): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'current') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'overdue') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function statusLabel(status: CycleStatus): string {
  if (status === 'paid') return '已繳費'
  if (status === 'current') return '本期處理中'
  if (status === 'overdue') return '逾期未繳'
  return '下一期'
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-lg rounded-[1.75rem] border-slate-200 bg-white p-0">
      <div class="border-b border-slate-100 bg-[#F8FAFC] px-6 py-5">
        <DialogHeader>
          <DialogTitle class="text-xl font-semibold text-slate-900">記錄本期繳費</DialogTitle>
        </DialogHeader>
        <p class="mt-2 text-sm text-slate-500">
          {{ targetCycle ? `${targetCycle.contractTitle} · 第 ${targetCycle.cycle.periodIndex} 期` : '請確認本期付款資訊與證明。' }}
        </p>
      </div>

      <div class="space-y-5 px-6 py-6">
        <div v-if="targetCycle" class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-slate-900">應繳日 {{ formatDate(targetCycle.cycle.dueDate) }}</p>
              <p class="mt-1 text-xs text-slate-500">
                {{ targetCycle.totalAmount == null
                  ? `目前已知 ${formatCurrency(targetCycle.partialAmount)}，水電待匯入`
                  : `應繳金額 ${formatCurrency(targetCycle.totalAmount)}` }}
              </p>
            </div>
            <Badge
              variant="outline"
              :class="['rounded-full px-3 py-1 text-xs font-semibold', statusBadgeClass(targetCycle.status)]"
            >
              {{ statusLabel(targetCycle.status) }}
            </Badge>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="payment-date">繳費日期</Label>
            <Input id="payment-date" v-model="form.paidAt" type="date" class="rounded-xl" />
          </div>
          <div class="space-y-2">
            <Label for="payment-method">付款方式</Label>
            <Select v-model="form.method">
              <SelectTrigger id="payment-method" class="rounded-xl">
                <SelectValue placeholder="選擇付款方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in paymentMethodOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="payment-note">備註</Label>
          <Textarea
            id="payment-note"
            v-model="form.note"
            placeholder="例如：已轉帳給房東、已傳送收據、補上水電明細等待確認"
            class="min-h-[96px] rounded-xl"
          />
        </div>

        <div class="space-y-2">
          <Label for="payment-proof">轉帳截圖或憑證</Label>
          <Input
            id="payment-proof"
            ref="proofInput"
            type="file"
            accept="image/*,.pdf"
            class="rounded-xl"
            @change="handleProofChange"
          />
          <p class="text-xs text-slate-500">
            {{ form.proofName ? `已選擇：${form.proofName}` : '目前先記錄檔名，之後可再接正式上傳流程。' }}
          </p>
        </div>

        <div class="flex gap-3">
          <Button variant="outline" class="flex-1 rounded-xl" @click="emit('update:open', false)">
            取消
          </Button>
          <Button
            class="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            @click="emit('submit', { ...form })"
          >
            儲存繳費紀錄
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
