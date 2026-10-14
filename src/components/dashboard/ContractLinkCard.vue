<script setup lang="ts">
/**
 * 房東平台租約 ↔ 自己存的簽約合約：對應、逐項對照、房東說明、條件變更紀錄。
 *
 * 兩份都保留、誰也不蓋掉誰。對應之後，自己那份不再出現在首頁帳務、報修與點交
 * （那些要走房東那份，房東才看得到），合約全文、風險分析、租補助手照舊用自己那份。
 */
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button/index'
import {
  fetchContractLink,
  linkOwnContract,
  unlinkOwnContract,
  type ContractLink,
  type OverlappingRental,
} from '@/src/services/utilityEvidenceApi'

const props = defineProps<{ leaseId: number }>()
const emit = defineEmits<{ changed: [] }>()

const link = ref<ContractLink | null>(null)
const busy = ref(false)
const error = ref('')
const DISMISS_KEY = 'rentmate-dismissed-rental-overlaps'

function dismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]')
  } catch {
    return []
  }
}

async function load() {
  error.value = ''
  try {
    const result = await fetchContractLink(props.leaseId)
    result.candidates = (result.candidates ?? []).filter((item) => !dismissed().includes(`${props.leaseId}:${item.rental_id}`))
    link.value = result
  } catch {
    link.value = null
  }
}
watch(() => props.leaseId, load, { immediate: true })

async function run(action: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await action()
    await load()
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失敗，請稍後重試。'
  } finally {
    busy.value = false
  }
}

function link_(item: OverlappingRental) {
  return run(() => linkOwnContract(props.leaseId, item.rental_id))
}

function unlink() {
  if (!window.confirm('取消對應後，你存的那份合約會回到首頁，帳款也不再跟它比對。')) return
  return run(() => unlinkOwnContract(props.leaseId))
}

function keep(item: OverlappingRental) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed(), `${props.leaseId}:${item.rental_id}`]))
  } catch {
    // 無痕模式寫不進去：這次先隱藏
  }
  if (link.value) link.value.candidates = (link.value.candidates ?? []).filter((entry) => entry.rental_id !== item.rental_id)
}

const fmt = (value: unknown) => (typeof value === 'number' ? value.toLocaleString('zh-TW') : String(value ?? '—'))
</script>

<template>
  <template v-if="link">
    <!-- 還沒對應：有租期重疊的自存合約就提示 -->
    <div
      v-for="item in link.linked ? [] : link.candidates ?? []"
      :key="item.rental_id"
      class="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
    >
      <p class="font-semibold">你也自己存了一份「{{ item.title }}」，租期跟這份房東租約重疊</p>
      <p class="text-xs leading-5">
        {{ item.address || '（未填地址）' }} · {{ item.start }} ～ {{ item.end }}。如果是同一個租屋處，請把它對應到這份房東租約：
        系統會逐項比對你簽約的內容和房東登記的條件，之後每期帳款也會跟合約核對，不一致的地方雙方都看得到。
      </p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" class="h-7 rounded-lg text-xs" :disabled="busy" @click="link_(item)">對應到這份房東租約</Button>
        <Button size="sm" variant="outline" class="h-7 rounded-lg text-xs" :disabled="busy" @click="keep(item)">不是同一間</Button>
      </div>
    </div>

    <!-- 已對應：對照結果 -->
    <div
      v-if="link.linked"
      :class="['space-y-2 rounded-2xl border p-4 text-sm', link.differences?.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900']"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-semibold">
          已對應你的簽約合約「{{ link.contract_title }}」·
          {{ link.differences?.length ? `${link.differences.length} 處與房東登記的不同` : '條件一致' }}
        </p>
        <button type="button" class="text-xs underline" :disabled="busy" @click="unlink">取消對應</button>
      </div>
      <table v-if="link.differences?.length" class="w-full text-xs">
        <thead><tr class="text-left"><th class="py-1">項目</th><th>你的合約</th><th>房東登記</th></tr></thead>
        <tbody>
          <tr v-for="item in link.differences" :key="item.field" class="border-t border-amber-200">
            <td class="py-1 font-semibold">{{ item.label }}</td><td>{{ fmt(item.contract) }}</td><td>{{ fmt(item.landlord) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="link.landlord_note" class="text-xs">房東說明：{{ link.landlord_note }}</p>
      <p v-else-if="link.differences?.length" class="text-xs">房東已收到通知，尚未說明。帳款與合約不符時可以在該期提出異議。</p>
      <details v-if="link.term_history?.length" class="text-xs">
        <summary class="cursor-pointer">房東修改租約條件的紀錄（{{ link.term_history.length }}）</summary>
        <p v-for="(entry, index) in link.term_history" :key="index" class="mt-1">
          {{ new Date(entry.at).toLocaleString('zh-TW') }}：{{ entry.changes.map((c) => `${c.label} ${fmt(c.before)} → ${fmt(c.after)}`).join('、') }}
        </p>
      </details>
    </div>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
  </template>
</template>
