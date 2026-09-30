<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PlanBenefits from '@/src/components/PlanBenefits.vue'
import { useLandlordWorkspace } from '@/src/composables/useLandlordWorkspace'
import { BadgeCheck, Check, ChevronDown, CreditCard, Crown, ShieldCheck, Sparkles, X } from 'lucide-vue-next'

type PlanKey = 'free' | 'plus' | 'pro'
interface Plan { key: PlanKey; name: string; monthlyPrice: number; description: string; features: string[]; propertyLimit: number | null; roomLimit: number | null; featured?: boolean }

const { properties, rooms, loading, propertyError, propertyDataReady, refresh } = useLandlordWorkspace()
const billingCycle = ref<'monthly' | 'yearly'>('monthly')
const currentPlan = ref<PlanKey>('free')
const selectedPlan = ref<PlanKey | null>(null)
const cardHolder = ref('')
const cardNumber = ref('')
const expiry = ref('')
const cvc = ref('')
const agreed = ref(false)
const paymentSuccess = ref<PlanKey | null>(null)
const showComparison = ref(false)
const plans: Plan[] = [
  { key: 'free', propertyLimit: 1, roomLimit: 5, name: 'Free', monthlyPrice: 0, description: '剛開始管理出租物件所需要的基本工具。', features: ['最多 1 個物件', '最多 5 間房間', '租客與租約管理', '基本收支紀錄'] },
  { key: 'plus', propertyLimit: 5, roomLimit: 30, name: 'Plus', monthlyPrice: 299, description: '讓日常管理更省時，適合成長中的房東。', features: ['最多 5 個物件', '最多 30 間房間', '租金到期提醒', '維修工單與進度追蹤', '匯出收支報表'], featured: true },
  { key: 'pro', propertyLimit: null, roomLimit: null, name: 'Pro', monthlyPrice: 599, description: '完整的營運協作功能，專為專業出租管理而設。', features: ['不限物件與房間數', '多人團隊協作', '自訂通知與權限', '進階營運報表', '優先客服支援'] },
]
const comparisonRows = [
  { label: '可管理物件', free: '最多 1 個', plus: '最多 5 個', pro: '不限' },
  { label: '可管理房間', free: '最多 5 間', plus: '最多 30 間', pro: '不限' },
  { label: '租約與租客管理', free: '基本功能', plus: '完整功能', pro: '完整功能' },
  { label: '租金到期提醒', free: '—', plus: '包含', pro: '包含' },
  { label: '維修工單追蹤', free: '—', plus: '包含', pro: '包含' },
  { label: '收支與營運報表', free: '基本紀錄', plus: '可匯出報表', pro: '進階分析報表' },
  { label: '團隊協作與權限', free: '—', plus: '—', pro: '包含' },
  { label: '客服支援', free: '一般支援', plus: '優先支援', pro: '專屬優先支援' },
]
const currentPlanInfo = computed(() => plans.find(plan => plan.key === currentPlan.value)!)
const usage = computed(() => [
  { label: '管理物件', used: properties.value.length, limit: currentPlanInfo.value.propertyLimit, unit: '個' },
  { label: '管理房間', used: rooms.value.length, limit: currentPlanInfo.value.roomLimit, unit: '間' },
])
const selectedPlanInfo = computed(() => plans.find(plan => plan.key === selectedPlan.value))
const price = (plan: Plan) => billingCycle.value === 'yearly' ? Math.round(plan.monthlyPrice * 0.83) : plan.monthlyPrice
const cycleLabel = computed(() => billingCycle.value === 'yearly' ? '年繳（每月）' : '月繳')
const isCardNumberValid = computed(() => cardNumber.value.replace(/\s/g, '').length === 16)
const isExpiryValid = computed(() => {
  if (!/^\d{2}\/\d{2}$/.test(expiry.value)) return false
  const [month, year] = expiry.value.split('/').map(Number)
  if (month < 1 || month > 12) return false
  const now = new Date()
  const expiryDate = new Date(2000 + year, month, 1)
  return expiryDate > now
})
const isCvcValid = computed(() => /^\d{3,4}$/.test(cvc.value))
const canPay = computed(() => Boolean(cardHolder.value.trim() && isCardNumberValid.value && isExpiryValid.value && isCvcValid.value && agreed.value))
function choosePlan(plan: Plan) { if (plan.key === currentPlan.value) return; paymentSuccess.value = null; if (plan.key === 'free') { currentPlan.value = 'free'; selectedPlan.value = null; return }; selectedPlan.value = plan.key }
function completePayment() { if (selectedPlan.value && canPay.value) { currentPlan.value = selectedPlan.value; paymentSuccess.value = selectedPlan.value; selectedPlan.value = null; cardHolder.value = ''; cardNumber.value = ''; expiry.value = ''; cvc.value = ''; agreed.value = false } }
function formatCardNumber() { cardNumber.value = cardNumber.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') }
function formatExpiry() { const value = expiry.value.replace(/\D/g, '').slice(0, 4); expiry.value = value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value }
</script>

<template>
  <div class="subscription-page mx-auto max-w-[1440px] space-y-6">
    <div v-if="paymentSuccess" class="payment-success" role="status"><BadgeCheck class="h-5 w-5" /><span><b>{{ plans.find(plan => plan.key === paymentSuccess)?.name }} 方案示範已切換</b><small>僅預覽方案權益，本次操作不會扣款或變更正式訂閱。</small></span><button aria-label="關閉成功提示" @click="paymentSuccess = null"><X class="h-4 w-4" /></button></div>
    <RouterLink to="/landlord/settings" class="inline-flex text-sm font-bold text-[#56795d] hover:underline">← 返回設定</RouterLink>
    <header><h1 class="text-3xl font-black tracking-tight">方案與權益</h1><p class="mt-2 text-sm text-[#778078]">掌握目前權益與使用情況，依管理需求選擇合適方案。</p></header>
    <section class="overview-card" aria-labelledby="current-plan-heading">
      <div class="overview-summary">
        <span class="overview-icon"><Crown class="h-6 w-6" /></span>
        <p class="text-xs font-bold tracking-wider text-[#637166]">目前方案</p>
        <div class="mt-2 flex flex-wrap items-center gap-3"><h2 id="current-plan-heading" class="text-3xl font-black">{{ currentPlanInfo.name }}</h2><span class="overview-badge">方案展示</span></div>
        <p class="mt-3 text-sm leading-6 text-[#637166]">{{ currentPlanInfo.description }}</p>
        <a href="#available-plans" class="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#456b4b] hover:underline">查看其他方案 <span aria-hidden="true">↓</span></a>
      </div>
      <div class="overview-benefits"><h3 class="text-sm font-bold">已包含的權益</h3><ul class="mt-4 grid gap-4 sm:grid-cols-2"><li v-for="feature in currentPlanInfo.features" :key="feature" class="flex items-start gap-2 text-sm text-[#58645b]"><Check class="mt-0.5 h-4 w-4 shrink-0 text-[#5b8263]" />{{ feature }}</li></ul><p class="mt-6 border-t border-[#e2e7dc] pt-4 text-xs leading-5 text-[#7b8177]">預設顯示 Free。方案切換僅供預覽，不會變更正式訂閱或扣款。</p></div>
    </section>
    <section class="rounded-3xl border border-[#e2dccf] bg-white/80 p-5 sm:p-6" aria-labelledby="usage-heading" :aria-busy="loading">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="usage-heading" class="text-lg font-black">使用額度</h2><p class="mt-1 text-sm text-[#778078]">依目前工作區資料計算，刪除物件或房間後釋出額度。</p></div>
        <button class="rounded-xl border border-[#d9dfd4] px-4 py-2 text-sm disabled:opacity-50" :disabled="loading" @click="refresh">{{ loading ? '更新中…' : '重新整理' }}</button>
      </div>
      <p v-if="propertyError" role="alert" class="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{{ propertyError }} {{ propertyDataReady ? '以下為最近一次成功載入的資料。' : '目前無法取得使用額度。' }}</p>
      <p v-if="!propertyDataReady && !propertyError" role="status" class="py-6 text-sm text-[#778078]">正在載入使用額度…</p>
      <div v-if="propertyDataReady" class="mt-5 grid gap-4 sm:grid-cols-2">
        <article v-for="item in usage" :key="item.label" class="rounded-2xl bg-[#f5f7f1] p-4">
          <div class="flex items-center justify-between gap-3"><h3 class="text-sm font-bold">{{ item.label }}</h3><span class="text-xs font-semibold" :class="item.limit !== null && item.used >= item.limit ? 'text-amber-800' : 'text-[#637166]'">{{ item.limit === null ? '不限量' : item.used > item.limit ? '已超額' : item.used === item.limit ? '已額滿' : '使用中' }}</span></div>
          <p class="mt-3"><strong class="text-2xl">{{ item.used }}</strong><span class="ml-2 text-sm text-[#637166]">/ {{ item.limit === null ? '不限' : item.limit }} {{ item.unit }}</span></p>
          <template v-if="item.limit !== null">
            <progress class="usage-progress mt-4 h-2 w-full" :class="{ full: item.used >= item.limit }" :aria-label="item.label + '使用額度'" :max="item.limit" :value="Math.min(item.used, item.limit)" />
            <p class="mt-2 text-xs" :class="item.used >= item.limit ? 'text-amber-800' : 'text-[#637166]'">{{ item.used > item.limit ? `已超出 ${item.used - item.limit} ${item.unit}，可比較下方方案` : item.used === item.limit ? '額度已用完，可比較下方方案' : `剩餘 ${item.limit - item.used} ${item.unit}` }}</p>
          </template>
          <p v-else class="mt-4 text-xs text-[#637166]">此方案無數量上限</p>
        </article>
      </div>
    </section>
    <PlanBenefits :current-plan="currentPlan" />
    <section id="available-plans" class="plan-options-heading" aria-labelledby="available-plans-heading">
      <div><h2 id="available-plans-heading" class="text-xl font-black">探索其他方案</h2><p class="mt-1 text-sm text-[#778078]">比較管理規模與功能，找到適合你的選擇。</p></div>
      <div class="billing-toggle" role="group" aria-label="價格計費週期"><button :aria-pressed="billingCycle === 'monthly'" :class="{ active: billingCycle === 'monthly' }" @click="billingCycle = 'monthly'">月繳</button><button :aria-pressed="billingCycle === 'yearly'" :class="{ active: billingCycle === 'yearly' }" @click="billingCycle = 'yearly'">年繳 <b>省約 17%</b></button></div>
    </section>
    <section class="grid gap-5 lg:grid-cols-3"><article v-for="plan in plans" :key="plan.key" class="plan-card" :class="{ featured: plan.featured, current: currentPlan === plan.key }"><div v-if="plan.featured" class="popular"><Crown class="h-3.5 w-3.5" /> 適合成長中房東</div><div class="flex items-start justify-between gap-3"><div><h2>{{ plan.name }}</h2><p>{{ plan.description }}</p></div><span class="plan-icon" :class="plan.key"><Sparkles v-if="plan.key !== 'free'" class="h-4 w-4" /><ShieldCheck v-else class="h-4 w-4" /></span></div><div class="price"><strong>{{ plan.monthlyPrice ? `NT$ ${price(plan).toLocaleString()}` : '免費' }}</strong><span v-if="plan.monthlyPrice">／月</span></div><p class="yearly-note">{{ plan.monthlyPrice && billingCycle === 'yearly' ? `年繳 NT$ ${(price(plan) * 12).toLocaleString()}，已含優惠` : plan.monthlyPrice ? cycleLabel : '永久免費使用' }}</p><button class="plan-action" :class="{ selected: currentPlan === plan.key }" :disabled="currentPlan === plan.key" @click="choosePlan(plan)"><Check v-if="currentPlan === plan.key" class="h-4 w-4" />{{ currentPlan === plan.key ? '目前使用中' : plan.key === 'free' ? '切換至 Free' : `選擇 ${plan.name}` }}</button><ul><li v-for="feature in plan.features" :key="feature"><Check class="h-4 w-4" />{{ feature }}</li></ul></article></section>
    <section class="overflow-hidden rounded-[1.5rem] border border-[#e2dccf] bg-white/80 shadow-[0_8px_22px_rgba(66,72,60,.04)]"><button class="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6" type="button" :aria-expanded="showComparison" aria-controls="plan-comparison" @click="showComparison = !showComparison"><span><b class="block text-lg font-black text-[#29372e]">查看完整功能比較</b><small class="mt-1 block text-sm text-[#788079]">依管理規模與所需功能，快速選出適合的方案。</small></span><ChevronDown class="h-5 w-5 shrink-0 text-[#56795d] transition-transform" :class="{ 'rotate-180': showComparison }" /></button><div id="plan-comparison" v-if="showComparison" class="overflow-x-auto border-t border-[#ece7dc]"><table class="comparison-table min-w-[640px] w-full text-sm"><caption class="sr-only">Free、Plus 與 Pro 方案功能比較</caption><thead class="bg-[#f5f7f1] text-[#526057]"><tr><th class="px-5 py-3.5 text-left font-bold sm:px-6">功能</th><th class="px-4 py-3.5 text-center font-bold">Free</th><th class="px-4 py-3.5 text-center font-bold text-[#52775a]">Plus</th><th class="px-4 py-3.5 text-center font-bold text-[#8b6328]">Pro</th></tr></thead><tbody><tr v-for="row in comparisonRows" :key="row.label" class="border-t border-[#eee9df] text-[#59655c]"><th class="px-5 py-3.5 text-left font-semibold sm:px-6">{{ row.label }}</th><td class="px-4 py-3.5 text-center">{{ row.free }}</td><td class="px-4 py-3.5 text-center">{{ row.plus }}</td><td class="px-4 py-3.5 text-center">{{ row.pro }}</td></tr></tbody></table></div></section>
    <section class="included-card"><div><ShieldCheck /><span><b>所有方案均受保護</b><small>採用加密傳輸與安全付款機制，保障帳務與出租資料。</small></span></div><RouterLink to="/landlord/settings/support" class="text-sm font-bold text-[#56795d] hover:underline">常見問題 →</RouterLink></section>
    <div v-if="selectedPlan && selectedPlanInfo" class="fixed inset-0 z-50 grid place-items-center bg-[#233129]/45 p-4" @click.self="selectedPlan = null"><section class="payment-dialog"><button class="close-button" aria-label="關閉付款視窗" @click="selectedPlan = null"><X class="h-5 w-5" /></button><div class="payment-heading"><span><CreditCard class="h-5 w-5" /></span><div><p>安全付款</p><h2>訂閱 {{ selectedPlanInfo.name }} 方案</h2></div></div><div class="payment-summary"><span>{{ selectedPlanInfo.name }} · {{ cycleLabel }}</span><strong>NT$ {{ price(selectedPlanInfo).toLocaleString() }}<small>／月</small></strong></div><form class="space-y-4" @submit.prevent="completePayment"><label>持卡人姓名<input v-model="cardHolder" autocomplete="cc-name" placeholder="王小明" /></label><label>卡號<div class="input-icon"><CreditCard class="h-4 w-4" /><input v-model="cardNumber" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="1234 5678 9012 3456" @input="formatCardNumber" /></div></label><div class="grid grid-cols-2 gap-3"><label>有效期限<input v-model="expiry" inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY" @input="formatExpiry" /></label><label>安全碼<input v-model="cvc" inputmode="numeric" autocomplete="cc-csc" maxlength="3" placeholder="CVC" /></label></div><label class="agreement"><input v-model="agreed" type="checkbox" />我同意服務條款與自動續訂規則。</label><button class="pay-button" type="submit" :disabled="!canPay">確認付款 NT$ {{ price(selectedPlanInfo).toLocaleString() }}</button></form><p class="payment-note"><ShieldCheck class="h-3.5 w-3.5" /> 此為付款介面示範，不會實際扣款。</p></section></div>
  </div>
</template>

<style scoped>
.overview-card { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.5fr); overflow: hidden; border: 1px solid #dce3d5; border-radius: 24px; background: #fffefa; }
.overview-summary { padding: 28px; background: linear-gradient(135deg, #eaf2e7, #f4f6ef); }
.overview-icon { display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 20px; border: 1px solid #d5e1d0; border-radius: 14px; background: #ffffffa6; color: #55775c; }
.overview-badge { border-radius: 999px; padding: 4px 9px; background: #ffffffa6; color: #64755f; font-size: 11px; font-weight: 600; }
.overview-benefits { align-self: center; padding: 28px; }
.plan-options-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding-top: 12px; scroll-margin-top: 24px; }
.usage-progress { appearance: none; overflow: hidden; border: 0; border-radius: 999px; background: #e2e7dc; color: #628367; }
.usage-progress::-webkit-progress-bar { background: #e2e7dc; border-radius: 999px; }
.usage-progress::-webkit-progress-value { background: #628367; border-radius: 999px; }
.usage-progress::-moz-progress-bar { background: #628367; border-radius: 999px; }
.usage-progress.full { color: #b7843c; }
.usage-progress.full::-webkit-progress-value { background: #b7843c; }
.usage-progress.full::-moz-progress-bar { background: #b7843c; }
.comparison-table tbody tr:nth-child(even) { background: #f8f9f4; }
.comparison-table th:first-child { position: sticky; left: 0; background: #f8f9f4; }
@media (max-width: 640px) { .overview-card { grid-template-columns: 1fr; } .overview-summary, .overview-benefits { padding: 22px; } }

@reference "../../index.css";
.current-plan-card { @apply flex items-center gap-3 rounded-2xl border border-[#dfd9cc] bg-white/80 px-4 py-3; }.current-plan-card>span { @apply grid h-10 w-10 place-items-center rounded-xl bg-[#e5f1e5] text-[#55775c]; }.current-plan-card small,.current-plan-card strong { @apply block; }.current-plan-card small { @apply text-xs text-[#7d877e]; }.current-plan-card strong { @apply mt-0.5 text-sm; }.current-plan-card em { @apply ml-2 rounded-full bg-[#e7f2e8] px-2 py-1 text-[11px] font-bold not-italic text-[#52775a]; }
.payment-success { @apply flex items-center gap-3 rounded-2xl border border-[#c9dfca] bg-[#edf7ed] px-4 py-3 text-[#456b4b]; }.payment-success>svg { @apply shrink-0; }.payment-success span { @apply flex-1; }.payment-success b,.payment-success small { @apply block; }.payment-success b { @apply text-sm; }.payment-success small { @apply mt-0.5 text-xs text-[#66816a]; }.payment-success button { @apply rounded-lg p-1.5 text-[#66816a] transition hover:bg-[#dceedd]; }
.hero { @apply flex flex-col justify-between gap-6 rounded-[1.7rem] border border-[#dbe4d8] bg-[linear-gradient(120deg,#eef5ed,#fbfaf5_62%,#f0eee4)] px-5 py-7 sm:px-9 sm:py-9 md:flex-row md:items-end; }.eyebrow { @apply inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[#56775b]; }.hero h2 { @apply mt-3 text-2xl font-black tracking-tight sm:text-3xl; }.hero p { @apply mt-2 max-w-2xl text-sm leading-6 text-[#637166]; }.billing-toggle { @apply flex shrink-0 rounded-xl border border-[#d9dfd4] bg-white/75 p-1; }.billing-toggle button { @apply rounded-lg px-3 py-2 text-xs font-bold text-[#788078] transition sm:px-4; }.billing-toggle button.active { @apply bg-[#5b8263] text-white shadow-sm; }.billing-toggle b { @apply ml-1 rounded-full bg-[#e4f1e5] px-1.5 py-0.5 text-[10px] text-[#52745a]; }.billing-toggle .active b { @apply bg-white/20 text-white; }
.plan-card { @apply relative overflow-hidden rounded-[1.5rem] border border-[#e2dccf] bg-white/85 p-6 shadow-[0_8px_22px_rgba(66,72,60,.04)]; }.plan-card.featured { @apply border-[#7d9b81] bg-[#fcfdf9] shadow-[0_16px_32px_rgba(76,112,83,.13)]; }.plan-card.current { @apply ring-2 ring-[#bed4c0]; }.popular { @apply absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl bg-[#5b8263] px-3 py-1.5 text-[11px] font-bold text-white; }.plan-card h2 { @apply text-2xl font-black tracking-tight; }.plan-card p { @apply mt-2 min-h-10 text-sm leading-5 text-[#788079]; }.plan-icon { @apply grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf1e9] text-[#65736a]; }.plan-icon.plus { @apply bg-[#e4f1e5] text-[#52775a]; }.plan-icon.pro { @apply bg-[#f2eadc] text-[#9a6b2d]; }.price { @apply mt-7 flex items-end gap-1; }.price strong { @apply text-3xl font-black tracking-tight; }.price span { @apply mb-1 text-sm text-[#7d857e]; }.plan-card .yearly-note { @apply mt-1 min-h-5 text-xs text-[#719075]; }.plan-action { @apply mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#bcd1be] bg-white py-3 text-sm font-bold text-[#53765a] transition hover:bg-[#edf5ed]; }.plan-action.selected { @apply border-[#5b8263] bg-[#5b8263] text-white; }.plan-card ul { @apply mt-6 space-y-3 border-t border-[#ece7dc] pt-5; }.plan-card li { @apply flex items-center gap-2 text-sm text-[#58645b]; }.plan-card li svg { @apply shrink-0 text-[#5e8965]; }
.included-card { @apply flex flex-col gap-4 rounded-[1.3rem] border border-[#e2dccf] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between; }.included-card>div { @apply flex items-center gap-3; }.included-card>div>svg { @apply h-10 w-10 rounded-xl bg-[#e7f2e8] p-2.5 text-[#567b5d]; }.included-card b,.included-card small { @apply block; }.included-card b { @apply text-sm; }.included-card small { @apply mt-1 text-xs text-[#818881]; }.included-card button { @apply text-sm font-bold text-[#56795d]; }
.payment-dialog { @apply relative w-full max-w-[490px] rounded-[1.5rem] bg-[#fffdfa] p-6 shadow-2xl sm:p-7; }.close-button { @apply absolute right-4 top-4 rounded-lg p-2 text-[#7c847d] hover:bg-[#f1f1ec]; }.payment-heading { @apply flex items-center gap-3; }.payment-heading>span { @apply grid h-11 w-11 place-items-center rounded-xl bg-[#e5f1e5] text-[#55775c]; }.payment-heading p { @apply text-xs font-bold uppercase tracking-[.14em] text-[#718274]; }.payment-heading h2 { @apply mt-1 text-xl font-black; }.payment-summary { @apply mt-6 flex items-center justify-between rounded-xl bg-[#f3f5ef] px-4 py-3 text-sm text-[#637066]; }.payment-summary strong { @apply text-base text-[#29372e]; }.payment-summary small { @apply text-xs font-normal text-[#7d877e]; }.payment-dialog label { @apply block text-xs font-bold text-[#59655c]; }.payment-dialog input:not([type='checkbox']) { @apply mt-1.5 w-full rounded-xl border border-[#ddd9d0] bg-white px-3 py-2.5 text-sm text-[#29372e] outline-none transition placeholder:text-[#abb0aa] focus:border-[#719176] focus:ring-2 focus:ring-[#dceadc]; }.input-icon { @apply relative; }.input-icon svg { @apply absolute left-3 top-[calc(50%-2px)] h-4 w-4 -translate-y-1/2 text-[#8b948b]; }.input-icon input { @apply pl-9; }.agreement { @apply flex items-center gap-2 text-xs font-medium text-[#6f776f]; }.agreement input { @apply h-4 w-4 accent-[#5b8263]; }.pay-button { @apply w-full rounded-xl bg-[#5b8263] py-3 text-sm font-bold text-white shadow-[0_8px_16px_rgba(76,112,83,.18)] transition hover:bg-[#4f7557] disabled:cursor-not-allowed disabled:bg-[#bdc7bb] disabled:shadow-none; }.payment-note { @apply mt-4 flex items-center justify-center gap-1 text-center text-[11px] text-[#838a83]; }

.subscription-page { @apply pb-8; }
.plan-card { @apply transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_35px_rgba(66,72,60,.1)]; }
.plan-card.current { @apply shadow-[0_14px_30px_rgba(76,112,83,.12)]; }
.payment-dialog { max-height: min(760px, calc(100vh - 2rem)); overflow-y: auto; border: 1px solid rgba(255,255,255,.78); }
.payment-dialog::before { content: ''; position: absolute; inset: 0 0 auto; height: 5px; border-radius: 1.5rem 1.5rem 0 0; background: linear-gradient(90deg, #55775c, #9dbba1); }
.payment-summary { border: 1px solid #e1e9df; background: linear-gradient(135deg, #f7faf5, #edf5ed); }
.payment-dialog input:not([type='checkbox']) { min-height: 46px; }
.payment-dialog input:not([type='checkbox']):focus { box-shadow: 0 0 0 4px rgba(113,145,118,.13); }
.pay-button:not(:disabled) { transform: translateZ(0); }
.pay-button:not(:disabled):active { transform: scale(.985); }
@media (max-width: 640px) { .payment-dialog { border-radius: 1.25rem; padding: 1.5rem; } .payment-summary { margin-top: 1.25rem; } }
</style>
