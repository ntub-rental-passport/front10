<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileText,
  HelpCircle,
  Landmark,
  MailCheck,
  Search,
  Scale,
  Share2,
  ShieldCheck,
  WalletCards,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const guideTopics = [
  { key: 'penalty', label: '違約金', count: 12, tone: 'border-rose-200 bg-rose-50 text-rose-600' },
  { key: 'repair', label: '設備修繕', count: 8, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  { key: 'deposit', label: '押金返還', count: 15, tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  { key: 'renewal', label: '租約續約', count: 10, tone: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  { key: 'utilities', label: '水電費用', count: 22, tone: 'border-slate-200 bg-slate-100 text-slate-600' },
]

const activeTopic = ref(
  typeof route.query.topic === 'string' ? route.query.topic : 'penalty',
)
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')

function selectTopic(topic: string): void {
  activeTopic.value = topic
  void router.replace({
    path: '/app/contract',
    query: {
      ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
      topic,
    },
  })
}

function submitSearch(): void {
  const query = searchQuery.value.trim()
  void router.replace({
    path: '/app/contract',
    query: {
      ...(query ? { q: query } : {}),
      topic: activeTopic.value,
    },
  })
}

const heroImage = new URL('./images/early-termination-hero.webp', import.meta.url).href

const visualSections = [
  {
    eyebrow: '爭點 01',
    title: '違約金加處理費，可能還是同一筆違約金',
    summary:
      '租約把費用拆成「違約金」與「處理費」時，不能只看名稱。若處理費沒有具體服務、實際支出或可證明成本，仍可能被認定為同一提前解約責任的一部分。',
    image: new URL('./images/double-charge-dispute.webp', import.meta.url).href,
    icon: WalletCards,
  },
  {
    eyebrow: '爭點 02',
    title: '先看租約是否允許提前終止，以及有沒有先通知',
    summary:
      '依住宅租賃定型化契約應記載事項第 14 點，租約若約定得任意終止，且已至少提前一個月通知，通常不需支付該點所稱違約金；未先期通知而逕行終止時，違約金最高不得超過一個月租金。',
    image: new URL('./images/legal-penalty-cap.webp', import.meta.url).href,
    icon: Scale,
  },
  {
    eyebrow: '租客動作',
    title: '提前一個月用可留證據的方式通知',
    summary:
      '解約前建議用存證信函、掛號、Email 或可保存紀錄的訊息通知，內容要寫清楚租約地址、預計終止日、交屋時間，以及只同意依法負擔合理違約金。',
    image: new URL('./images/written-notice.webp', import.meta.url).href,
    icon: MailCheck,
  },
  {
    eyebrow: '押金救濟',
    title: '若房東從押金超扣，可主張返還',
    summary:
      '房東直接扣押金不代表爭議結束。租客可要求列明扣款依據，保留租約、押金收據、繳租紀錄、對話紀錄與交屋照片，必要時申請租賃爭議調處或訴訟請求返還。',
    image: new URL('./images/deposit-refund.webp', import.meta.url).href,
    icon: FileCheck2,
  },
]

const lawRows = [
  {
    name: '住宅租賃定型化契約應記載事項第 14 點',
    point: '任意終止、通知與違約金',
    usage: '租約約定得終止時，至少提前一個月通知；未先期通知而逕行終止，違約金最高不得超過一個月租金。',
    href: 'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
  },
  {
    name: '消費者保護法第 17 條',
    point: '公告應記載事項的效力',
    usage: '企業經營者使用的定型化契約違反公告事項時，相關條款可能無效；漏載的應記載事項仍構成契約內容。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=17',
  },
  {
    name: '民法第 252 條',
    point: '違約金過高可請求法院酌減',
    usage: '即使個案仍有爭議，也可作為請求降低違約金的備援主張。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=252',
  },
  {
    name: '民法第 247 條之 1、消保法第 12 條',
    point: '定型化契約顯失公平',
    usage: '若房東預先擬定條款、加重租客責任，可主張條款無效。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=247-1',
  },
]

const actionSteps = [
  '先確認租約「任意終止租約」欄位勾選得或不得，並核對通知期限。',
  '依約定期限，以存證信函、掛號或可留存紀錄的方式通知房東。',
  '交屋前整理租約、付款紀錄、押金收據與通訊紀錄。',
  '若已按期通知仍被收費，要求房東說明費用的契約依據、服務內容與實際支出。',
  '若房東已從押金扣除超額費用，要求提供扣款明細並保留請求返還權利。',
  '協商不成時，可申請租賃爭議調處，或向法院主張返還、酌減或條款無效。',
]

const qaItems = [
  {
    q: '違約金加上「違約處理費」，合計兩個月租金，這樣約定有效嗎？',
    a: '如果「違約處理費」講不出具體服務內容或實際支出，通常會被認定是違約金的一部分，兩項合計仍受一個月租金上限拘束；超過的部分，租客可以主張拒絕給付。',
  },
  {
    q: '沒有依約提前一個月通知，還能主張只賠一個月嗎？',
    a: '不一定。一個月上限是建立在租客已依約先行通知的前提下；若未先通知就逕行終止，房東可能改依實際損害另行求償，因此提前通知非常關鍵，建議務必留下可查證的書面紀錄。',
  },
  {
    q: '房東已經直接從押金裡扣兩個月費用，可以要回來嗎？',
    a: '可以主張返還。房東逕自扣款不代表爭議結束，租客可要求列明扣款依據、逐項核對契約條文與實際支出，超過合理範圍的部分可請求返還。',
  },
  {
    q: '協商不成，可以去哪裡申訴或提告？',
    a: '可先向房屋所在地的直轄市、縣市政府申請住宅租賃爭議調處；調解不成，可向法院提起訴訟，主張違約金過高請求酌減，或主張條款顯失公平而無效。',
  },
  {
    q: '違約金的計算基準是「租金」還是「押金」？',
    a: '是租金，不是押金。押金另受法規限制最高不得超過兩個月租金，跟違約金上限是不同的規範項目，實務上常被混用，簽約或協商時建議分開確認。',
  },
]

const openQaIndex = ref<number | null>(null)
function toggleQaItem(index: number): void {
  openQaIndex.value = openQaIndex.value === index ? null : index
}

const copyState = ref<'idle' | 'copied'>('idle')
async function copyArticleLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyState.value = 'copied'
    window.setTimeout(() => {
      copyState.value = 'idle'
    }, 2000)
  }
  catch {
    copyState.value = 'idle'
  }
}

const rentAmount = ref(18000)
const requestedMonths = ref(2)
const gaveRequiredNotice = ref(true)

const legalCap = computed(() => (gaveRequiredNotice.value ? 0 : rentAmount.value))
const landlordRequest = computed(() => rentAmount.value * requestedMonths.value)
const overLimitAmount = computed(() => Math.max(0, landlordRequest.value - legalCap.value))
const legalCapLabel = computed(() =>
  gaveRequiredNotice.value ? '已按期通知：通常為 0 元' : '未按期通知：最高 1 個月',
)

const reviewedAt = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date('2026-08-31T00:00:00+08:00'))

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value)
</script>

<template>
  <article class="min-h-full overflow-x-hidden bg-[#f7f5ef] pb-10 text-slate-900">
    <header class="relative isolate z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto w-full max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <BookOpen aria-hidden="true" class="h-6 w-6" />
            </div>
            <div class="min-w-0">
              <p class="text-xl font-black text-slate-950 sm:text-2xl">租客防禦指南</p>
              <p class="mt-1 text-sm text-slate-500">快速補齊租屋常見爭議與判斷基礎</p>
            </div>
          </div>

          <form class="relative w-full xl:max-w-md" role="search" @submit.prevent="submitSearch">
            <label for="guide-search" class="sr-only">搜尋租客指南文章</label>
            <Search aria-hidden="true" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              id="guide-search"
              v-model="searchQuery"
              name="guide-search"
              type="search"
              autocomplete="off"
              placeholder="搜尋租屋爭議、法條或關鍵字…"
              class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-24 text-sm text-slate-900 outline-none transition-[border-color,background-color,box-shadow] placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100"
            />
            <button
              type="submit"
              class="absolute right-1.5 top-1.5 h-9 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              搜尋
            </button>
          </form>
        </div>

        <nav aria-label="租客指南文章主題" class="-mx-1 mt-5 overflow-x-auto px-1 pb-2 pt-1">
          <div class="flex min-w-max items-center gap-2">
            <button
              v-for="topic in guideTopics"
              :key="topic.key"
              type="button"
              :aria-pressed="activeTopic === topic.key"
              class="rounded-full border px-4 py-2 text-sm font-bold transition-[box-shadow,filter,opacity,transform] hover:-translate-y-0.5 hover:opacity-100 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500"
              :class="[
                topic.tone,
                activeTopic === topic.key ? 'shadow-sm brightness-[0.98]' : 'opacity-80',
              ]"
              @click="selectTopic(topic.key)"
            >
              {{ topic.label }} ({{ topic.count }})
            </button>
          </div>
        </nav>
      </div>
    </header>

    <div class="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <Button as-child variant="ghost" class="rounded-full px-0 text-slate-600 hover:bg-transparent hover:text-primary">
          <RouterLink to="/app">
            <ArrowLeft aria-hidden="true" class="h-4 w-4" />
            返回首頁
          </RouterLink>
        </Button>

        <Badge variant="outline" class="rounded-full border-indigo-200 bg-white px-3 py-1 text-indigo-700">
          租客防禦指南
        </Badge>
      </div>

      <section class="grid gap-5 lg:grid-cols-[minmax(0,1.04fr)_minmax(360px,0.64fr)]">
        <Card class="overflow-hidden rounded-[2rem] border-0 bg-white shadow-sm">
          <CardContent class="grid gap-6 p-5 md:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.8fr)] md:p-8">
            <div class="flex flex-col justify-center gap-5">
              <div class="flex flex-wrap gap-2">
                <Badge class="rounded-full bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-600">違約金上限解析</Badge>
                <Badge variant="outline" class="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">法規檢視：{{ reviewedAt }}</Badge>
              </div>

              <div class="space-y-4">
                <h1 class="max-w-2xl text-balance font-serif text-3xl font-black leading-[1.15] tracking-tight text-slate-950 sm:text-4xl lg:text-[3.25rem]">
                  提前解約要賠多少？租賃專法違約金上限解析
                </h1>
                <p class="max-w-xl text-base leading-8 text-slate-600">
                  租約寫「一個月違約金」再加「一個月處理費」時，不能只看名稱。應先確認租約是否允許提前終止、是否依約先行通知，再判斷費用的實質性質與上限。
                </p>
              </div>

              <div class="grid gap-2 sm:grid-cols-3">
                <div class="min-w-0 rounded-2xl bg-indigo-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-indigo-500">按期通知</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black leading-6 text-indigo-950">通常 0 元</p>
                </div>
                <div class="min-w-0 rounded-2xl bg-rose-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-rose-500">未按期通知</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black leading-6 text-rose-950">最高 1 個月</p>
                </div>
                <div class="min-w-0 rounded-2xl bg-emerald-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-emerald-600">租客關鍵</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black leading-6 text-emerald-950">提前留證</p>
                </div>
              </div>
            </div>

            <div class="relative min-h-[280px] overflow-hidden rounded-[1.5rem] bg-[#f8f7f2]">
              <img
                :src="heroImage"
                alt="租客坐在搬家紙箱旁閱讀提前解約條款，房東在門口等待交屋。"
                class="h-full w-full object-cover"
                width="1536"
                height="1024"
                fetchpriority="high"
              />
            </div>
          </CardContent>
        </Card>

        <Card class="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <CardContent class="flex h-full flex-col gap-5 p-6">
            <div class="flex items-center gap-3">
              <div class="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
                <Calculator aria-hidden="true" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-black">違約金快速試算</h2>
                <p class="text-sm text-slate-500">用租金直接判斷是否超過上限</p>
              </div>
            </div>

            <div class="space-y-4">
              <label class="block space-y-2">
                <span class="text-sm font-semibold text-slate-700">每月租金</span>
                <input
                  v-model.number="rentAmount"
                  name="monthly-rent"
                  type="number"
                  inputmode="numeric"
                  autocomplete="off"
                  min="0"
                  step="1000"
                  class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </label>

              <label class="block space-y-2">
                <span class="text-sm font-semibold text-slate-700">房東要求月數</span>
                <input
                  v-model.number="requestedMonths"
                  name="requested-months"
                  type="number"
                  inputmode="decimal"
                  autocomplete="off"
                  min="0"
                  max="12"
                  step="0.5"
                  class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-bold outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </label>
            </div>

            <label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-indigo-950">
              <input
                v-model="gaveRequiredNotice"
                name="gave-required-notice"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-indigo-300 accent-indigo-600"
              />
              <span>
                <strong class="block">已依租約期限提前通知</strong>
                <span class="mt-1 block leading-6 text-indigo-800/80">此試算假設租約已勾選「得任意終止」。</span>
              </span>
            </label>

            <div class="mt-auto space-y-3 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div class="flex items-center justify-between gap-4 text-sm text-slate-500">
                <span>房東要求</span>
                <strong class="text-base tabular-nums text-slate-900">{{ formatCurrency(landlordRequest) }}</strong>
              </div>
              <div class="flex items-center justify-between gap-4 text-sm text-slate-500">
                <span>{{ legalCapLabel }}</span>
                <strong class="text-base tabular-nums text-emerald-700">{{ formatCurrency(legalCap) }}</strong>
              </div>
              <div class="h-px bg-indigo-100" />
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm font-semibold text-slate-600">可能超收</span>
                <strong class="text-2xl tabular-nums text-rose-600">{{ formatCurrency(overLimitAmount) }}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div class="flex w-full justify-center">
        <div class="flex w-full max-w-[860px] flex-col gap-10 pt-2">
        <!-- 案例問題 -->
        <section class="space-y-5">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <BookOpen aria-hidden="true" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-balance text-xl font-black sm:text-2xl">案例問題</h2>
              <p class="text-sm text-slate-500">資料來源：法律圈 LawChain、律果 AI 法律事務所整理</p>
            </div>
          </div>

          <blockquote class="border-l-4 border-violet-300 bg-violet-50/60 py-5 pl-5 pr-4 text-base leading-8 text-violet-950 sm:text-lg">
            承租人租約約定：租期未滿搬遷，需提前一個月告知，並賠償一個月違約金與相當於一個月租金的違約處理費。問題是，這樣合計兩個月租金的約定，是否能突破租賃專法對提前解約違約金的限制？
          </blockquote>

          <div class="space-y-3">
            <div class="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4">
              <CheckCircle2 aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <p class="text-sm leading-6 text-slate-600">若「違約處理費」沒有具體對價，只是因提前解約而收取，可能會被視為違約金。</p>
            </div>
            <div class="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4">
              <CheckCircle2 aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <p class="text-sm leading-6 text-slate-600">若租約允許任意終止且承租人已依約先行通知，應先主張不發生未通知違約金，而非直接接受一個月上限。</p>
            </div>
          </div>
        </section>

        <div class="h-px bg-slate-200" />

        <!-- 可援引的法律依據 -->
        <section class="space-y-5">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <Landmark aria-hidden="true" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-xl font-black sm:text-2xl">可援引的法律依據</h2>
              <p class="text-sm text-slate-500">把法條翻成租客看得懂的主張方向</p>
            </div>
          </div>

          <div class="overflow-hidden rounded-3xl border border-slate-100">
            <table class="w-full border-collapse text-left text-sm">
              <thead class="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th class="px-4 py-3">法條</th>
                  <th class="px-4 py-3">重點</th>
                  <th class="px-4 py-3">可怎麼用</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="row in lawRows" :key="row.name" class="align-top">
                  <td class="px-4 py-4 font-bold text-slate-900">
                    <a :href="row.href" target="_blank" rel="noreferrer" class="rounded-sm underline decoration-slate-300 underline-offset-4 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{{ row.name }}</a>
                  </td>
                  <td class="px-4 py-4 text-slate-600">{{ row.point }}</td>
                  <td class="px-4 py-4 text-slate-600">{{ row.usage }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <AlertCircle aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p><strong>法條校正：</strong>《租賃住宅市場發展及管理條例》第 7 條規範的是押金不得超過 2 個月租金，不是提前終止違約金上限；本頁改以定型化契約應記載事項第 14 點說明。</p>
          </div>
        </section>

        <div class="h-px bg-slate-200" />

        <!-- 四個關鍵爭點：改為單欄交錯圖文，順著文章往下讀 -->
        <section class="space-y-8">
          <h2 class="text-xl font-black sm:text-2xl">四個關鍵爭點</h2>

          <div
            v-for="(section, index) in visualSections"
            :key="section.title"
            class="flex flex-col gap-5 sm:flex-row sm:items-center"
            :class="index % 2 === 1 ? 'sm:flex-row-reverse' : ''"
          >
            <div class="overflow-hidden rounded-3xl bg-[#faf8f1] sm:w-[220px] sm:shrink-0">
              <img :src="section.image" :alt="section.title" class="h-full max-h-[220px] w-full object-cover" width="1254" height="1254" loading="lazy" />
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <div class="rounded-xl bg-indigo-50 p-2 text-indigo-700">
                  <component :is="section.icon" aria-hidden="true" class="h-4 w-4" />
                </div>
                <Badge variant="outline" class="rounded-full border-slate-200 bg-slate-50 text-slate-500">
                  {{ section.eyebrow }}
                </Badge>
              </div>
              <h3 class="text-balance text-lg font-black leading-7 text-slate-950">{{ section.title }}</h3>
              <p class="text-sm leading-7 text-slate-600">{{ section.summary }}</p>
            </div>
          </div>
        </section>

        <div class="h-px bg-slate-200" />

        <!-- 租客處理流程 -->
        <section class="space-y-5">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <ShieldCheck aria-hidden="true" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-xl font-black sm:text-2xl">租客處理流程</h2>
              <p class="text-sm text-slate-500">從準備解約到押金爭議，一步一步降低風險</p>
            </div>
          </div>

          <ol class="grid gap-3 sm:grid-cols-2">
            <li
              v-for="(step, index) in actionSteps"
              :key="step"
              class="flex gap-3 rounded-3xl border border-slate-100 bg-slate-50/70 p-4"
            >
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
                {{ index + 1 }}
              </span>
              <p class="text-sm leading-6 text-slate-700">{{ step }}</p>
            </li>
          </ol>
        </section>

        <!-- 回覆房東範本 -->
        <section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-6 text-white sm:p-8">
          <div class="flex items-center gap-4">
            <div class="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <FileText aria-hidden="true" class="h-8 w-8" />
            </div>
            <h2 class="min-w-0 text-balance text-xl font-black sm:text-2xl">可以直接放進回覆房東的句子</h2>
          </div>
          <p class="mt-4 text-sm leading-7 text-white/80">
            本租約既約定得提前終止，本人亦已依約於期限前通知。若仍主張違約金或違約處理費，請說明具體契約依據、服務內容與實際支出；如該等費用實質上均係因提前終止所生，亦請依住宅租賃定型化契約應記載事項及相關規定重新核算。
          </p>
          <div class="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <a
              href="https://www.legalai.law/faq/land/1331_land.html"
              target="_blank"
              rel="noreferrer"
              class="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              查看參考文章
              <ArrowRight aria-hidden="true" class="h-4 w-4" />
            </a>
            <RouterLink
              to="/app/contract/scanner"
              class="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              前往合約 OCR
              <ArrowRight aria-hidden="true" class="h-4 w-4" />
            </RouterLink>
          </div>
        </section>

        <div class="h-px bg-slate-200" />

        <!-- 常見問答（互動手風琴） -->
        <section class="space-y-5">
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
              <HelpCircle aria-hidden="true" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-xl font-black sm:text-2xl">常見問答</h2>
              <p class="text-sm text-slate-500">點擊問題展開解答</p>
            </div>
          </div>

          <div class="divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div v-for="(item, index) in qaItems" :key="item.q">
              <button
                type="button"
                class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:px-6"
                :aria-expanded="openQaIndex === index"
                @click="toggleQaItem(index)"
              >
                <span class="min-w-0 flex-1 text-sm font-bold text-slate-900 sm:text-base">{{ item.q }}</span>
                <ChevronDown
                  aria-hidden="true"
                  class="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200"
                  :class="openQaIndex === index ? 'rotate-180' : ''"
                />
              </button>

              <div
                class="grid transition-[grid-template-rows] duration-300 ease-out"
                :class="openQaIndex === index ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
              >
                <div class="overflow-hidden">
                  <p class="px-5 pb-5 text-sm leading-7 text-slate-600 sm:px-6">{{ item.a }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 分享文章 -->
        <section class="flex flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <p class="text-base font-black text-slate-900">分享這篇文章</p>
            <p class="mt-1 text-sm text-slate-500">覺得有幫助嗎？複製連結分享給正在煩惱租約的朋友。</p>
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            @click="copyArticleLink"
          >
            <Check v-if="copyState === 'copied'" aria-hidden="true" class="h-4 w-4" />
            <Share2 v-else aria-hidden="true" class="h-4 w-4" />
            {{ copyState === 'copied' ? '已複製連結' : '分享文章' }}
          </button>
        </section>

        <p class="px-1 text-xs leading-6 text-slate-500">
          本頁為一般法律資訊與操作指引，不構成個案法律意見。實際責任仍須依租約是否允許任意終止、通知約定、出租人身分及具體事實判斷。
        </p>
        </div>
      </div>
    </div>
  </article>
</template>