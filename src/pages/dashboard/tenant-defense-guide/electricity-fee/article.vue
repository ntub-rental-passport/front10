<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  FileText,
  HelpCircle,
  Info,
  MessageSquareText,
  Scale,
  Share2,
  ShieldCheck,
} from 'lucide-vue-next'
import TenantGuideHeader from '@/src/pages/dashboard/tenant-defense-guide/TenantGuideHeader.vue'

import heroImage from '@/src/assets/tenant-defense-guide/electricity-fee/electricity-fee-hero-16x9.png'
import calculationImage from '@/src/assets/tenant-defense-guide/electricity-fee/electricity-fee-calculation-1x1.png'
import limitImage from '@/src/assets/tenant-defense-guide/electricity-fee/unit-price-limit-check-1x1.png'
import allocationImage from '@/src/assets/tenant-defense-guide/electricity-fee/shared-electricity-allocation-1x1.png'
import complaintImage from '@/src/assets/tenant-defense-guide/electricity-fee/overcharge-evidence-complaint-1x1.png'

const openFaq = ref<number | null>(0)
const copyState = ref<'idle' | 'copied'>('idle')
const units = ref(300)
const landlordRate = ref(5)
const averageRate = ref(4.25)

const chargedTotal = computed(
  () => Math.max(0, Number(units.value) || 0) * Math.max(0, Number(landlordRate.value) || 0),
)
const referenceTotal = computed(
  () => Math.max(0, Number(units.value) || 0) * Math.max(0, Number(averageRate.value) || 0),
)
const difference = computed(() => Math.max(0, chargedTotal.value - referenceTotal.value))
const isAboveReference = computed(() => Number(landlordRate.value) > Number(averageRate.value))
const money = (value: number) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value)

const evidenceItems = [
  '租賃契約中的電費條款與簽約日期',
  '房東提供的台電帳單、平均電價與總額',
  '房間分電表期初、期末照片或錄影',
  '每期繳費通知、匯款紀錄與收據',
  '要求說明算法、退還差額的對話紀錄',
]

const actionSteps = [
  [
    '先確認新制是否適用',
    '確認是否為 2024 年 7 月 15 日起新簽的住宅租約；舊約原則上不溯及，但雙方可重新約定適用。',
  ],
  [
    '取得同一期資料',
    '把房東收費期間、房間分表度數、台電計費期間與「當期每度平均電價」放在一起核對。',
  ],
  ['用書面提出疑問', '列出計算式、差額與附件，請房東說明或更正；LINE、Email 等可留存送達與內容。'],
  [
    '申訴或申請調處',
    '協商無效，可向所在地縣市政府消保或地政單位申訴，也可撥 1950 諮詢消費爭議處理管道。',
  ],
]

const faqs = [
  [
    '租屋一度電 5 元一定違法嗎？',
    '不一定。新制不是訂一個全國固定單價，而是以租屋處電費單的「當期每度平均電價」為上限。若帳單平均電價低於 5 元，按度收 5 元就可能超過上限；若平均電價高於或等於 5 元，單看 5 元不能認定超收。',
  ],
  [
    '房東只說「台電漲價」，可以不給帳單嗎？',
    '新制要求電費資訊透明。租約約定電費由租客負擔時，房東應提供租賃標的電費資訊，或提供必要資料、授權租客向台電查詢。',
  ],
  [
    '公共走道、樓梯或洗衣機的電費可以另外收嗎？',
    '屋外公共設施電費若沒有分攤併入該電費單，房東不得另外收取；屋內公用電可依總表減去各房分表後的度數，再按契約約定合理分攤。',
  ],
  [
    '租客自己拿台電帳單去繳，也受代收上限規範嗎？',
    '若租約約定由租客自行持台電帳單向台電繳費，因不是房東代收代付，內政部說明不適用這次租屋電費代收的新制計費規定。',
  ],
  [
    '發現可能超收，可以直接少繳租金或自行抵銷嗎？',
    '不建議在權利基礎與金額尚未確認前自行扣租。先保存證據、書面要求說明與返還差額；協商不成，再透過申訴、調處或個案法律諮詢處理。',
  ],
]

const sources = [
  [
    '內政部｜租屋電費新制 7 月 15 日上路',
    'https://www.moi.gov.tw/News_Content.aspx?n=4&s=317872',
    true,
  ],
  [
    '行政院｜住宅租賃定型化契約應記載及不得記載事項',
    'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
    true,
  ],
  [
    '台電｜住宅租屋電費查詢專區',
    'https://service.taipower.com.tw/ebpps2/simplebill/tenant/simple-query-bill',
    true,
  ],
  [
    '全國法規資料庫｜消費者保護法第 17 條',
    'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=17',
    true,
  ],
  [
    '全國法規資料庫｜消費者保護法第 56-1 條',
    'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=56-1',
    true,
  ],
  [
    'HouseFeel｜2026 租屋電費整理',
    'https://www.housefeel.com.tw/article/%E7%A7%9F%E8%B3%83%E5%A5%91%E7%B4%84-%E6%96%B0%E5%88%B6/',
    false,
  ],
  [
    'HouseFeel｜2026 電費與夏季電價整理',
    'https://www.housefeel.com.tw/article/%e5%8f%b0%e9%9b%bb%e9%9b%bb%e8%b2%bb-%e5%a4%8f%e5%ad%a3%e9%9b%bb%e8%b2%bb-%e9%9b%bb%e8%b2%bb%e8%a8%88%e7%ae%97/',
    false,
  ],
] as const

async function copyArticleLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyState.value = 'copied'
    window.setTimeout(() => (copyState.value = 'idle'), 1800)
  } catch {
    copyState.value = 'idle'
  }
}
</script>

<template>
  <article class="min-h-full overflow-x-clip bg-[#f6f4ee] pb-12 text-slate-900">
    <TenantGuideHeader active-topic="utilities" />

    <main class="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <RouterLink
          to="/app/tenant-guide"
          class="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-700"
          ><ArrowLeft class="h-4 w-4" />返回指南目錄</RouterLink
        >
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
          @click="copyArticleLink"
        >
          <Check v-if="copyState === 'copied'" class="h-4 w-4 text-emerald-600" /><Share2
            v-else
            class="h-4 w-4"
          />{{ copyState === 'copied' ? '已複製' : '分享' }}
        </button>
      </div>

      <section class="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80">
        <div class="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(480px,1.05fr)]">
          <div class="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
            <div class="flex flex-wrap gap-2">
              <span class="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white"
                >水電費用</span
              ><span
                class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600"
                >內容查核：2026/09/01</span
              >
            </div>
            <h1
              class="mt-5 text-balance font-serif text-3xl font-black leading-[1.14] tracking-tight text-slate-950 sm:text-4xl xl:text-5xl"
            >
              租屋電費新制上路！<br />一度電 5 元合法嗎？
            </h1>
            <p class="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              答案不在「5 元」本身，而在同一期台電帳單的平均電價。用 3
              分鐘確認適用日期、計費方式、合法上限與超收後的處理順序。
            </p>
            <div class="mt-6 grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl bg-indigo-50 p-4">
                <span class="text-xs font-bold text-indigo-600">按度計費上限</span
                ><strong class="mt-1 block text-sm text-indigo-950">當期平均電價</strong>
              </div>
              <div class="rounded-2xl bg-amber-50 p-4">
                <span class="text-xs font-bold text-amber-700">非按度計費上限</span
                ><strong class="mt-1 block text-sm text-amber-950">當期帳單總額</strong>
              </div>
              <div class="rounded-2xl bg-emerald-50 p-4">
                <span class="text-xs font-bold text-emerald-700">租客關鍵</span
                ><strong class="mt-1 block text-sm text-emerald-950">取得帳單、保留證據</strong>
              </div>
            </div>
          </div>
          <div class="relative min-h-[320px] bg-[#f8f7f3] lg:min-h-[540px]">
            <img
              :src="heroImage"
              alt="租客查看電費帳單與租屋用電資訊的插畫"
              class="absolute inset-0 h-full w-full object-cover"
              width="1792"
              height="1024"
              fetchpriority="high"
            />
          </div>
        </div>
      </section>

      <section
        id="rule"
        class="scroll-mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.54fr)]"
      >
        <div class="rounded-[2rem] bg-[#172554] p-6 text-white shadow-sm sm:p-8">
          <div class="flex items-center gap-3">
            <span class="rounded-2xl bg-white/10 p-3"><Scale class="h-6 w-6" /></span>
            <div>
              <p class="text-sm font-bold text-cyan-200">先做兩個判斷</p>
              <h2 class="text-2xl font-black">5 元合法嗎？看日期，也看算法</h2>
            </div>
          </div>
          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div class="rounded-3xl bg-white/10 p-5 ring-1 ring-white/15">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300 font-black text-slate-950"
                >1</span
              >
              <h3 class="mt-4 text-lg font-black">租約何時簽？</h3>
              <p class="mt-2 text-sm leading-7 text-white/80">
                2024/7/15
                起新簽的住宅租約適用新制。先前已簽的舊約原則上不溯及，但雙方可同意重新約定。
              </p>
            </div>
            <div class="rounded-3xl bg-white/10 p-5 ring-1 ring-white/15">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full bg-amber-300 font-black text-slate-950"
                >2</span
              >
              <h3 class="mt-4 text-lg font-black">房東怎麼收？</h3>
              <p class="mt-2 text-sm leading-7 text-white/80">
                按房間電表度數收費，就比對當期平均電價；包在固定費用或用其他方式收，就比對當期帳單總額。
              </p>
            </div>
          </div>
          <div
            class="mt-5 flex gap-3 rounded-2xl bg-amber-300 p-4 text-sm leading-6 text-slate-950"
          >
            <AlertTriangle class="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>不要拿台電「最高級距單價」直接當答案。</strong
              >新制按度計費比的是租屋處該張帳單上實際列示的「當期每度平均電價」。
            </p>
          </div>
        </div>
        <div class="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80">
          <img
            :src="limitImage"
            alt="租客比對電費單價上限的插畫"
            class="aspect-square w-full object-cover"
            width="1024"
            height="1024"
            loading="lazy"
          />
          <div class="p-5">
            <p class="text-sm font-bold text-indigo-600">一句話結論</p>
            <p class="mt-2 text-lg font-black leading-8 text-slate-950">
              每度 5 元可能合法，也可能超收；必須拿同一期平均電價來比。
            </p>
          </div>
        </div>
      </section>

      <section
        id="calculator"
        class="scroll-mt-6 grid gap-5 lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]"
      >
        <div class="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80">
          <img
            :src="calculationImage"
            alt="租客依照度數與平均電價計算電費的插畫"
            class="h-full min-h-[340px] w-full object-cover"
            width="1024"
            height="1024"
            loading="lazy"
          />
        </div>
        <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
          <div class="flex items-start gap-3">
            <span class="rounded-2xl bg-indigo-100 p-3 text-indigo-700"
              ><Calculator class="h-6 w-6"
            /></span>
            <div>
              <p class="text-sm font-bold text-indigo-600">快速初篩</p>
              <h2 class="text-2xl font-black text-slate-950">租屋電費差額試算</h2>
              <p class="mt-1 text-sm text-slate-500">
                請輸入同一計費期間的資料；結果僅供核對，不是個案法律判定。
              </p>
            </div>
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-3">
            <label class="space-y-2"
              ><span class="text-sm font-bold text-slate-700">房間用電度數</span>
              <div class="relative">
                <input
                  v-model.number="units"
                  type="number"
                  min="0"
                  step="1"
                  class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-lg font-black outline-none focus:ring-4 focus:ring-indigo-100"
                /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                  >度</span
                >
              </div></label
            >
            <label class="space-y-2"
              ><span class="text-sm font-bold text-slate-700">房東每度收費</span>
              <div class="relative">
                <input
                  v-model.number="landlordRate"
                  type="number"
                  min="0"
                  step="0.01"
                  class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-lg font-black outline-none focus:ring-4 focus:ring-indigo-100"
                /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                  >元</span
                >
              </div></label
            >
            <label class="space-y-2"
              ><span class="text-sm font-bold text-slate-700">帳單當期平均電價</span>
              <div class="relative">
                <input
                  v-model.number="averageRate"
                  type="number"
                  min="0"
                  step="0.01"
                  class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-lg font-black outline-none focus:ring-4 focus:ring-indigo-100"
                /><span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                  >元</span
                >
              </div></label
            >
          </div>
          <div class="mt-6 grid gap-4 sm:grid-cols-3">
            <div class="rounded-2xl bg-slate-50 p-4">
              <span class="text-xs font-bold text-slate-500">房東計收</span
              ><strong class="mt-1 block text-xl tabular-nums text-slate-950">{{
                money(chargedTotal)
              }}</strong>
            </div>
            <div class="rounded-2xl bg-emerald-50 p-4">
              <span class="text-xs font-bold text-emerald-700">依平均電價試算</span
              ><strong class="mt-1 block text-xl tabular-nums text-emerald-950">{{
                money(referenceTotal)
              }}</strong>
            </div>
            <div :class="isAboveReference ? 'bg-rose-50' : 'bg-indigo-50'" class="rounded-2xl p-4">
              <span
                :class="isAboveReference ? 'text-rose-700' : 'text-indigo-700'"
                class="text-xs font-bold"
                >{{ isAboveReference ? '疑似超出參考額' : '未高於參考額' }}</span
              ><strong class="mt-1 block text-xl tabular-nums">{{ money(difference) }}</strong>
            </div>
          </div>
          <div
            :class="
              isAboveReference
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            "
            class="mt-5 flex gap-3 rounded-2xl border p-4 text-sm leading-6"
            aria-live="polite"
          >
            <AlertTriangle v-if="isAboveReference" class="mt-0.5 h-5 w-5 shrink-0" /><CheckCircle2
              v-else
              class="mt-0.5 h-5 w-5 shrink-0"
            />
            <p>
              {{
                isAboveReference
                  ? '房東單價高於當期平均電價，請進一步確認租約日期、帳單期別與公用電度數。'
                  : '單價未高於當期平均電價；仍應確認實際度數、總收費與公用電分攤。'
              }}
            </p>
          </div>
        </div>
      </section>

      <section id="shared" class="scroll-mt-6 grid gap-5 lg:grid-cols-2">
        <div class="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
          <div class="flex items-center gap-3">
            <span class="rounded-2xl bg-amber-100 p-3 text-amber-700"
              ><Building2 class="h-6 w-6"
            /></span>
            <div>
              <p class="text-sm font-bold text-amber-700">分租套房常見爭議</p>
              <h2 class="text-2xl font-black text-slate-950">公共用電不能一概而論</h2>
            </div>
          </div>
          <div class="mt-6 space-y-4">
            <div class="rounded-3xl border border-rose-100 bg-rose-50 p-5">
              <h3 class="flex items-center gap-2 font-black text-rose-950">
                <AlertTriangle class="h-5 w-5" />屋外公共設施
              </h3>
              <p class="mt-2 text-sm leading-7 text-rose-900/80">
                屋外公共設施電費若沒有分攤併入租屋處的台電帳單，房東不得再向租客額外收取。
              </p>
            </div>
            <div class="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <h3 class="flex items-center gap-2 font-black text-emerald-950">
                <CheckCircle2 class="h-5 w-5" />屋內共同使用區域
              </h3>
              <p class="mt-2 text-sm leading-7 text-emerald-900/80">
                可用「總表度數－各房分表度數」算出屋內公用度數，再依契約約定方式分攤，並乘上當期平均電價。
              </p>
            </div>
          </div>
          <div class="mt-5 rounded-2xl bg-slate-900 p-4 text-sm leading-7 text-white">
            <strong class="text-cyan-300">範例：</strong>總表 1,000 度、3 間房各 300
            度，屋內公用電為 100 度；若約定三房均分，每房分攤約 33.3 度。
          </div>
        </div>
        <div class="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80">
          <img
            :src="allocationImage"
            alt="分租住宅各房分表與公共用電分攤的插畫"
            class="h-full min-h-[420px] w-full object-cover"
            width="1024"
            height="1024"
            loading="lazy"
          />
        </div>
      </section>

      <section
        id="action"
        class="scroll-mt-6 overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200/80"
      >
        <div class="grid lg:grid-cols-[minmax(360px,0.7fr)_minmax(0,1fr)]">
          <div class="bg-[#eeecff] p-5 sm:p-8">
            <img
              :src="complaintImage"
              alt="租客整理電費證據並向專業人員諮詢的插畫"
              class="mx-auto aspect-square w-full max-w-xl rounded-3xl object-cover"
              width="1024"
              height="1024"
              loading="lazy"
            />
          </div>
          <div class="p-6 sm:p-8 lg:p-10">
            <div class="flex items-center gap-3">
              <span class="rounded-2xl bg-rose-100 p-3 text-rose-700"
                ><ShieldCheck class="h-6 w-6"
              /></span>
              <div>
                <p class="text-sm font-bold text-rose-600">先留證，再主張</p>
                <h2 class="text-2xl font-black text-slate-950">房東疑似超收，照這 4 步處理</h2>
              </div>
            </div>
            <ol class="mt-6 space-y-3">
              <li
                v-for="(step, index) in actionSteps"
                :key="step[0]"
                class="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white"
                  >{{ index + 1 }}</span
                >
                <div>
                  <h3 class="font-black text-slate-950">{{ step[0] }}</h3>
                  <p class="mt-1 text-sm leading-6 text-slate-600">{{ step[1] }}</p>
                </div>
              </li>
            </ol>
            <div class="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
              <h3 class="flex items-center gap-2 font-black text-indigo-950">
                <ClipboardCheck class="h-5 w-5" />建議保存的 5 類證據
              </h3>
              <ul class="mt-3 grid gap-2 sm:grid-cols-2">
                <li
                  v-for="item in evidenceItems"
                  :key="item"
                  class="flex gap-2 text-sm leading-6 text-indigo-900/80"
                >
                  <Check class="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{{ item }}
                </li>
              </ul>
            </div>
            <div
              class="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
            >
              <Info class="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                違反公告的定型化契約應記載事項，經主管機關限期改正仍不改正者，消保法第 56-1
                條規定可處 3 萬至 30 萬元；再次限期仍不改正，可處 5 萬至 50
                萬元並得按次處罰。是否成立仍由主管機關依個案認定。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-5 lg:grid-cols-3">
        <div class="rounded-[2rem] bg-indigo-600 p-6 text-white shadow-sm">
          <FileSearch class="h-8 w-8" />
          <h2 class="mt-4 text-xl font-black">查自己的租屋電費</h2>
          <p class="mt-2 text-sm leading-7 text-white/80">
            依台電說明準備租約、申請單與承諾書，完成認證後可查計費期間、平均電價、公設分攤等資料。
          </p>
          <a
            href="https://service.taipower.com.tw/ebpps2/simplebill/tenant/simple-query-bill"
            target="_blank"
            rel="noreferrer"
            class="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-indigo-700"
            >前往台電查詢專區<ArrowRight class="h-4 w-4"
          /></a>
        </div>
        <div class="rounded-[2rem] bg-amber-300 p-6 text-slate-950 shadow-sm">
          <MessageSquareText class="h-8 w-8" />
          <h2 class="mt-4 text-xl font-black">需要消費申訴協助</h2>
          <p class="mt-2 text-sm leading-7 text-slate-800">
            可撥消費者服務專線 1950，或洽所在地縣市政府消保、地政單位確認申訴與租賃爭議調處方式。
          </p>
          <a
            href="https://appeal.cpc.ey.gov.tw/WWW/Default.aspx"
            target="_blank"
            rel="noreferrer"
            class="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >線上消費申訴<ArrowRight class="h-4 w-4"
          /></a>
        </div>
        <div class="rounded-[2rem] bg-emerald-600 p-6 text-white shadow-sm">
          <FileText class="h-8 w-8" />
          <h2 class="mt-4 text-xl font-black">看租約寫了什麼</h2>
          <p class="mt-2 text-sm leading-7 text-white/85">
            核對簽約日期、按度或非按度計費、公用電分攤，以及房東提供電費資訊的方式。
          </p>
          <RouterLink
            to="/app/contract/scanner"
            class="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-emerald-700"
            >掃描租約條款<ArrowRight class="h-4 w-4"
          /></RouterLink>
        </div>
      </section>

      <section
        id="faq"
        class="scroll-mt-6 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/80 sm:p-8 lg:p-10"
      >
        <div class="flex items-center gap-3">
          <span class="rounded-2xl bg-cyan-100 p-3 text-cyan-700"
            ><HelpCircle class="h-6 w-6"
          /></span>
          <div>
            <p class="text-sm font-bold text-cyan-700">常見問題</p>
            <h2 class="text-2xl font-black text-slate-950">租屋電費 FAQ</h2>
          </div>
        </div>
        <div class="mt-6 divide-y divide-slate-200">
          <div v-for="(item, index) in faqs" :key="item[0]" class="py-2">
            <button
              type="button"
              class="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left font-black text-slate-950"
              :aria-expanded="openFaq === index"
              @click="openFaq = openFaq === index ? null : index"
            >
              <span
                ><span class="mr-2 text-indigo-600">Q{{ index + 1 }}</span
                >{{ item[0] }}</span
              ><ChevronDown
                class="h-5 w-5 shrink-0 transition-transform"
                :class="openFaq === index ? 'rotate-180' : ''"
              />
            </button>
            <div v-show="openFaq === index" class="pb-5 pl-8 pr-8 text-sm leading-7 text-slate-600">
              {{ item[1] }}
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8">
        <div class="flex items-center gap-3">
          <Info class="h-5 w-5 text-indigo-600" />
          <h2 class="text-lg font-black text-slate-950">資料來源與使用提醒</h2>
        </div>
        <p class="mt-3 text-sm leading-7 text-slate-600">
          本頁依官方規範及使用者提供的文章素材重新整理，優先以官方來源呈現。內容為一般資訊，不代替律師就個案提供的法律意見；電價、表單與申訴流程可能更新，採取行動前請再查官方最新資訊。
        </p>
        <div class="mt-4 grid gap-2 md:grid-cols-2">
          <a
            v-for="source in sources"
            :key="source[1]"
            :href="source[1]"
            target="_blank"
            rel="noreferrer"
            class="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            ><span class="flex items-center gap-2"
              ><span
                v-if="source[2]"
                class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700"
                >官方</span
              >{{ source[0] }}</span
            ><ExternalLink class="h-4 w-4 shrink-0"
          /></a>
        </div>
      </section>
    </main>
  </article>
</template>
