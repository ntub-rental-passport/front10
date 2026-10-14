<script setup lang="ts">
/** 租客對某筆帳款金額提出異議（通常是跟簽約合約不符）。房東會收到通知並決定採用或維持。 */
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog/index'
import { Button } from '@/components/ui/button/index'
import type { CycleView } from '@/src/utils/dashboard-contract'
import { formatCurrency } from '@/src/utils/rent-format'
import { disputeCharge, type ChargeMismatch } from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ open: boolean; targetCycle: CycleView | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; changed: [] }>()

const mismatches = computed<ChargeMismatch[]>(() => props.targetCycle?.cycle.contractMismatch ?? [])
const chargeId = ref<number | null>(null)
const amount = ref<number | null>(null)
const note = ref('')
const busy = ref(false)
const error = ref('')
const done = ref('')

const disputes = computed(() =>
  [...(props.targetCycle?.cycle.rentEvidence ?? []), ...(props.targetCycle?.cycle.utilityEvidence ?? [])]
    .filter((item) => item.kind === 'charge_dispute'),
)
const statusLabel = { open: '等待房東處理', accepted: '房東已採用你主張的金額', kept: '房東維持原金額' }

watch(() => props.open, (open) => {
  if (!open) return
  const first = mismatches.value[0]
  chargeId.value = first?.chargeId ?? props.targetCycle?.cycle.rentChargeId ?? null
  // 金額預設帶入合約上的數字；電費單價不符時要租客自己算出主張的金額
  amount.value = first?.label === '租金' ? first.contract : null
  note.value = first ? `${first.label}：合約為 ${first.contract}，房東開立 ${first.landlord}` : ''
  error.value = ''
  done.value = ''
}, { immediate: true })

async function submit() {
  if (!chargeId.value || amount.value === null || !note.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await disputeCharge(chargeId.value, amount.value, note.value.trim())
    done.value = '已送出，房東會收到通知。'
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '送出失敗，請稍後重試。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[1.5rem]">
      <DialogHeader>
        <DialogTitle>對帳款提出異議</DialogTitle>
        <DialogDescription>
          {{ targetCycle ? `${targetCycle.contractTitle} · 第 ${targetCycle.cycle.periodIndex} 期` : '' }}
        </DialogDescription>
      </DialogHeader>
      <section v-if="mismatches.length" class="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <p class="font-semibold">跟你的簽約合約不符：</p>
        <p v-for="item in mismatches" :key="`${item.chargeId}-${item.label}`">
          {{ item.chargeTitle }}・{{ item.label }}：合約 {{ item.contract }}，房東開立 {{ item.landlord }}
        </p>
      </section>
      <section v-if="disputes.length" class="space-y-1 text-xs">
        <p v-for="item in disputes" :key="item.id" class="rounded-lg border p-2">
          主張 {{ formatCurrency(item.amount ?? 0) }}・{{ statusLabel[item.status] }}
          <template v-if="item.response">・房東回覆：{{ item.response }}</template>
        </p>
      </section>
      <form class="space-y-2" @submit.prevent="submit">
        <label class="block text-sm">對哪一筆
          <select v-model.number="chargeId" class="mt-1 w-full rounded-md border p-2">
            <option v-if="targetCycle?.cycle.rentChargeId" :value="targetCycle.cycle.rentChargeId">租金</option>
            <option v-if="targetCycle?.cycle.electricityChargeId" :value="targetCycle.cycle.electricityChargeId">電費</option>
          </select>
        </label>
        <label class="block text-sm">你認為應收的金額（元）
          <input v-model.number="amount" type="number" min="0" required class="mt-1 w-full rounded-md border p-2" />
        </label>
        <label class="block text-sm">理由
          <textarea v-model="note" rows="3" maxlength="1000" required class="mt-1 w-full rounded-md border p-2" />
        </label>
        <Button type="submit" class="w-full rounded-xl" :disabled="busy || amount === null || !note.trim()">{{ busy ? '送出中…' : '送出異議' }}</Button>
      </form>
      <p v-if="done" role="status" class="text-sm text-emerald-700">{{ done }}</p>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
    </DialogContent>
  </Dialog>
</template>
