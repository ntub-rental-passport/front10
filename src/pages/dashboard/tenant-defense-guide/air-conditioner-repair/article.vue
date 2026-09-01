<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  FileText,
  Home,
  MailCheck,
  ReceiptText,
  Scale,
  Search,
  ShieldCheck,
  Snowflake,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

const guideTopics = [
  {
    key: 'penalty',
    label: '違約金',
    count: 12,
    tone: 'border-rose-200 bg-rose-50 text-rose-600',
    href: '/app/contract',
  },
  {
    key: 'repair',
    label: '設備修繕',
    count: 8,
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    href: '/app/contract/air-conditioner-repair',
  },
  {
    key: 'deposit',
    label: '押金返還',
    count: 15,
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    href: null,
  },
  {
    key: 'renewal',
    label: '租約續約',
    count: 10,
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    href: null,
  },
  {
    key: 'utilities',
    label: '水電費用',
    count: 22,
    tone: 'border-slate-200 bg-slate-100 text-slate-600',
    href: '/app/contract/electricity-fee',
  },
]
const availableTopics = guideTopics.filter((topic) => topic.href)
const upcomingTopics = guideTopics.filter((topic) => !topic.href)

const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')
const searchStatus = ref('')

function submitSearch(): void {
  const query = searchQuery.value.trim()

  if (!query) {
    searchStatus.value = '請輸入要查找的租屋問題或法條。'
    return
  }

  if (/違約|解約|押金扣款|處理費/.test(query)) {
    void router.push({ path: '/app/contract', query: { q: query, topic: 'penalty' } })
    return
  }

  if (/修繕|冷氣|設備|房東|催告|民法\s*(423|429|430)/i.test(query)) {
    searchStatus.value = `已顯示與「${query}」相關的設備修繕指南。`
    void router.replace({
      path: '/app/contract/air-conditioner-repair',
      query: { ...route.query, q: query, topic: 'repair' },
    })
    document.querySelector('#repair-article-title')?.scrollIntoView({ block: 'start' })
    return
  }

  searchStatus.value = `目前尚無「${query}」的指南，請改搜「冷氣修繕」或「提前解約」。`
  void router.replace({
    path: '/app/contract/air-conditioner-repair',
    query: { ...route.query, q: query, topic: 'repair' },
  })
}

const heroImage = new URL('./images/air-conditioner-breakdown-hero.webp', import.meta.url).href

const visualSections = [
  {
    eyebrow: '責任判斷',
    title: '先分清自然故障，還是租客不當使用',
    summary:
      '房東提供的冷氣若因老化、正常使用或機件故障而不能使用，原則上由房東修繕；若因租客自行拆裝、撞擊或其他可歸責行為造成，費用可能改由租客負擔。',
    image: new URL('./images/repair-responsibility.webp', import.meta.url).href,
    icon: Scale,
  },
  {
    eyebrow: '書面催修',
    title: '拍照錄影後，定合理期限正式通知',
    summary:
      '通知應寫明故障情形、發現日期、對居住的影響與希望完成修繕的期限。LINE、Email、簡訊或存證信函都應保存送達與回覆紀錄。',
    image: new URL('./images/written-repair-notice.webp', import.meta.url).href,
    icon: MailCheck,
  },
  {
    eyebrow: '逾期未修',
    title: '自行修繕前，先把程序與費用證據做完整',
    summary:
      '房東在合理期限內仍未處理時，租客得依法自行修繕並請求償還必要費用，或於租金中扣除；施工前後都應保留估價單、診斷、發票與照片。',
    image: new URL('./images/self-repair-expense.webp', import.meta.url).href,
    icon: ReceiptText,
  },
  {
    eyebrow: '爭議救濟',
    title: '把照片、對話、估價與付款紀錄整理成證據鏈',
    summary:
      '責任談不攏時，可攜帶租約、設備清單、故障紀錄、催告與修繕單據申請調解。若房東經催告仍逾期未修，也可依具體情況評估終止契約等權利。',
    image: new URL('./images/evidence-and-remedies.webp', import.meta.url).href,
    icon: ClipboardCheck,
  },
]

const lawRows = [
  {
    name: '民法第 423 條',
    point: '維持租賃物合於約定使用',
    usage: '房東不只要交付房屋，也應在租賃期間維持其合於約定使用、收益的狀態。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=423',
  },
  {
    name: '民法第 429 條',
    point: '修繕原則由出租人負擔',
    usage: '除契約另有訂定、另有習慣或屬其他例外，租賃物修繕原則由房東負責。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=429',
  },
  {
    name: '民法第 430 條',
    point: '催告後自行修繕或終止',
    usage: '房東逾合理期限未修時，租客得終止契約，或自行修繕並請求償還費用或自租金扣除。',
    href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=430',
  },
  {
    name: '住宅租賃定型化契約應記載事項第 11 點',
    point: '責任範圍應事先說明確認',
    usage: '由租客負責的修繕項目與範圍應於簽約前說明並確認；未經約明確認者，原則上由房東負責。',
    href: 'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
  },
]

const actionSteps = [
  '確認冷氣是否列在租約附件或設備清單，並查看修繕責任約定。',
  '拍攝故障影片、錯誤代碼、漏水位置及無法降溫等現況。',
  '以書面通知房東，說明故障、居住影響並給予合理修繕期限。',
  '請冷氣技師提供檢查結果或估價，釐清自然老化與人為損壞。',
  '房東逾期未修時，再評估自行修繕；施工前再次通知並保存全部單據。',
  '請求必要修繕費或依法扣租時，列明金額與依據，不要直接停付全部租金。',
  '協商不成可申請調解；房東經催告仍逾期未修時，再依法評估終止契約。',
]

const faqItems = [
  {
    question: '租屋冷氣壞掉，房東不修怎麼辦？',
    answer:
      '先用 LINE、Email、簡訊或存證信函通知房東，說明故障情況並定合理修繕期限；期限應依故障嚴重程度與維修安排判斷，例如可提出 7 日作為處理期，但法律並未固定一律為 7 日。若應由房東負責且逾期未修，租客可依民法第 430 條終止契約，或自行修繕後請求償還必要費用、依法從租金扣除。施工前後都要保存通知、估價、照片與發票。',
    sources: [
      {
        label: '民法第 430 條',
        href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=430',
      },
    ],
  },
  {
    question: '冷氣濾網沒有清洗而故障，修繕費算誰的？',
    answer:
      '日常濾網清潔通常屬於租客使用期間的基本保養，但是否要負擔維修費，仍須證明故障確實是未清洗或不當使用造成。若屬機件老化、冷媒系統或其他自然故障，原則上仍依租約與修繕責任約定判斷，不能只因濾網有灰塵就直接要求租客賠償。',
    sources: [
      {
        label: '民法第 429 條',
        href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=429',
      },
      {
        label: '住宅租賃定型化契約第 11 點',
        href: 'https://www.ey.gov.tw/Page/DFB720D019CCCB0A/478917df-7599-418f-8715-fd2716b623b4',
      },
    ],
  },
  {
    question: '退租時牆壁有釘孔或地板刮痕，可以扣押金嗎？',
    answer:
      '正常使用造成的自然耗損，例如少量釘孔、日照褪色或一般磨耗，不當然等於租客應負賠償責任；若是惡意破壞、明顯深層刮傷或超出正常使用範圍，房東才可能依實際損害請求。房東應提出修繕項目、責任原因與合理費用，不能直接用全新品價格要求全額換新。',
    sources: [
      {
        label: '民法第 432 條',
        href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=432',
      },
    ],
  },
  {
    question: '房東叫我自己修冷氣，可以直接從押金扣嗎？',
    answer:
      '不建議直接從押金扣除。押金通常在租約終止、交還房屋時結算，和民法第 430 條所稱的租金扣除不同。正確做法是先完成書面催告；房東逾合理期限仍未修時，再自行修繕並保存必要費用證明，書面請求房東償還，或依法從後續租金中扣除並清楚通知計算方式。',
    sources: [
      {
        label: '民法第 430 條',
        href: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=430',
      },
    ],
  },
]

type EquipmentOwnership = 'landlord' | 'tenant' | 'unknown'
type FailureCause = 'natural' | 'tenant' | 'unknown'
type RepairAgreement = 'landlord' | 'tenant' | 'unclear'

function queryChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback
}

const equipmentOwnership = ref<EquipmentOwnership>(
  queryChoice(route.query.equipment, ['landlord', 'tenant', 'unknown'] as const, 'landlord'),
)
const failureCause = ref<FailureCause>(
  queryChoice(route.query.cause, ['natural', 'tenant', 'unknown'] as const, 'natural'),
)
const repairAgreement = ref<RepairAgreement>(
  queryChoice(route.query.agreement, ['landlord', 'tenant', 'unclear'] as const, 'unclear'),
)

const aiDecision = computed(() => {
  if (equipmentOwnership.value === 'tenant') {
    return {
      title: '自有設備不能直接要求房東修繕',
      summary:
        '若冷氣由租客自行添購，原則上不能只憑房屋租賃關係要求房東負責，仍應核對租約與安裝約定。',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  if (equipmentOwnership.value === 'unknown') {
    return {
      title: '先確認設備歸屬',
      summary: '請查看租約附件、設備清單、點交照片或購買紀錄，再判斷修繕責任。',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  if (failureCause.value === 'tenant') {
    return {
      title: '可能由租客負擔修繕或賠償',
      summary: '若損壞可歸責於租客，房東可主張租客負擔；建議先取得第三方技師判斷。',
      className: 'border-rose-200 bg-rose-50 text-rose-900',
    }
  }

  if (failureCause.value === 'unknown') {
    return {
      title: '先請技師確認故障原因',
      summary: '責任尚不明確時，先保存故障現況並取得第三方檢查結果，不要只依雙方口頭推測。',
      className: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    }
  }

  if (repairAgreement.value === 'tenant') {
    return {
      title: '先檢查約定是否具體、且已事前確認',
      summary: '不能只看到「修繕由房客負責」就下結論，仍要核對項目、範圍與簽約時的確認程序。',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  if (repairAgreement.value === 'unclear') {
    return {
      title: '先核對租約，再書面催修',
      summary: '自然故障原則偏向房東負責，但仍應確認租約與設備清單，並以可留存紀錄的方式通知房東。',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    }
  }

  return {
    title: '原則上由房東負責修繕',
    summary: '房東提供的冷氣若屬自然老化或正常使用故障，先書面催告房東於合理期限內處理。',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
})

watch([equipmentOwnership, failureCause, repairAgreement], () => {
  void router.replace({
    path: '/app/contract/air-conditioner-repair',
    query: {
      ...route.query,
      topic: 'repair',
      equipment: equipmentOwnership.value,
      cause: failureCause.value,
      agreement: repairAgreement.value,
    },
  })
})

const repairMessage = `租屋處冷氣自＿＿月＿＿日起發生＿＿＿＿故障，已影響正常居住使用。此冷氣為租屋附屬設備，初步並無人為損壞情形，請於＿＿月＿＿日前安排檢查修繕。若逾期仍未處理，我將保留依民法第 430 條自行修繕、請求償還必要費用或依法主張其他權利，相關照片與對話紀錄均已留存。`
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

async function copyRepairMessage(): Promise<void> {
  try {
    await navigator.clipboard.writeText(repairMessage)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
}

const reviewedAt = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date('2026-08-31T00:00:00+08:00'))
</script>

<template>
  <article class="min-h-full overflow-x-hidden bg-[#f6f7fb] pb-10 text-slate-900">
    <a
      href="#repair-main-content"
      class="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 font-bold text-indigo-700 shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-reduce:transition-none"
    >
      跳到主要內容
    </a>
    <header class="relative isolate z-10 border-b border-slate-200 bg-white">
      <div class="mx-auto w-full max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"
            >
              <BookOpen aria-hidden="true" class="h-6 w-6" />
            </div>
            <div class="min-w-0">
              <p class="text-xl font-black text-slate-950 sm:text-2xl">租客防禦指南</p>
              <p class="mt-1 text-sm text-slate-500">快速補齊租屋常見爭議與判斷基礎</p>
            </div>
          </div>

          <div class="w-full xl:max-w-md">
            <form class="relative" role="search" @submit.prevent="submitSearch">
              <label for="repair-guide-search" class="sr-only">搜尋租客指南文章</label>
              <Search
                aria-hidden="true"
                class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              />
              <input
                id="repair-guide-search"
                v-model="searchQuery"
                name="guide-search"
                type="search"
                autocomplete="off"
                placeholder="例如：冷氣修繕、提前解約…"
                class="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-24 text-sm text-slate-900 outline-none transition-[border-color,background-color,box-shadow] placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100"
              />
              <button
                type="submit"
                class="absolute right-1.5 top-1.5 h-9 touch-manipulation rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                搜尋指南
              </button>
            </form>
            <p v-if="searchStatus" class="mt-2 text-sm text-slate-600" aria-live="polite">
              {{ searchStatus }}
            </p>
          </div>
        </div>

        <nav aria-label="租客指南文章主題" class="-mx-1 mt-5 overflow-x-auto px-1 pb-2 pt-1">
          <div class="flex min-w-max items-center gap-2">
            <RouterLink
              v-for="topic in availableTopics"
              :key="topic.key"
              :to="{
                path: topic.href,
                query: searchQuery.trim()
                  ? { q: searchQuery.trim(), topic: topic.key }
                  : { topic: topic.key },
              }"
              :aria-current="topic.key === 'repair' ? 'page' : undefined"
              class="touch-manipulation rounded-full border px-4 py-2 text-sm font-bold transition-[box-shadow,filter,opacity,transform] hover:-translate-y-0.5 hover:opacity-100 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500 motion-reduce:transform-none motion-reduce:transition-none"
              :class="[
                topic.tone,
                topic.key === 'repair' ? 'shadow-sm brightness-[0.98]' : 'opacity-80',
              ]"
            >
              {{ topic.label }} ({{ topic.count }})
            </RouterLink>
            <button
              v-for="topic in upcomingTopics"
              :key="topic.key"
              type="button"
              disabled
              :title="`${topic.label}指南尚未上線`"
              class="cursor-not-allowed rounded-full border px-4 py-2 text-sm font-bold opacity-45"
              :class="topic.tone"
            >
              {{ topic.label }} ({{ topic.count }}) · 尚未上線
            </button>
          </div>
        </nav>
      </div>
    </header>

    <main
      id="repair-main-content"
      tabindex="-1"
      class="mx-auto flex w-full max-w-[1380px] flex-col gap-6 px-4 py-5 outline-none sm:px-6 lg:px-8"
    >
      <div class="flex items-center justify-between gap-3">
        <RouterLink
          to="/app"
          class="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-slate-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ArrowLeft aria-hidden="true" class="h-4 w-4" />
          返回首頁
        </RouterLink>
        <Badge
          variant="outline"
          class="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700"
          >設備修繕</Badge
        >
      </div>

      <section
        aria-labelledby="repair-article-title"
        class="grid gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(380px,0.64fr)]"
      >
        <Card class="overflow-hidden rounded-[2rem] border-0 bg-white shadow-sm">
          <CardContent
            class="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.88fr)] md:p-8"
          >
            <div class="flex flex-col justify-center gap-5">
              <div class="flex flex-wrap gap-2">
                <Badge class="rounded-full bg-amber-500 px-3 py-1 text-white hover:bg-amber-500"
                  >冷氣修繕責任</Badge
                >
                <Badge
                  variant="outline"
                  class="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600"
                  >法規檢視：{{ reviewedAt }}</Badge
                >
              </div>
              <div class="space-y-4">
                <h1
                  id="repair-article-title"
                  class="scroll-mt-6 max-w-2xl text-balance text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl"
                >
                  冷氣壞了是房東要修嗎？房東不回應該怎麼辦？
                </h1>
                <p class="max-w-xl text-base leading-8 text-slate-600">
                  關鍵不是「誰住壞的」一句話，而是冷氣是否為房東提供、故障原因、租約修繕約定，以及租客有沒有完成通知與催告程序。
                </p>
              </div>
              <div class="grid gap-2 sm:grid-cols-3">
                <div class="min-w-0 rounded-2xl bg-emerald-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-emerald-600">自然故障</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black text-emerald-950">
                    原則房東修
                  </p>
                </div>
                <div class="min-w-0 rounded-2xl bg-rose-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-rose-500">人為損壞</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black text-rose-950">
                    租客可能負責
                  </p>
                </div>
                <div class="min-w-0 rounded-2xl bg-indigo-50 px-3 py-4">
                  <p class="whitespace-nowrap text-xs font-semibold text-indigo-500">處理關鍵</p>
                  <p class="mt-1 whitespace-nowrap text-base font-black text-indigo-950">
                    書面催修留證
                  </p>
                </div>
              </div>
            </div>

            <div class="relative min-h-[300px] overflow-hidden rounded-[1.5rem] bg-[#faf8f4]">
              <img
                :src="heroImage"
                alt="租客在炎熱房間中查看故障冷氣並準備聯絡房東。"
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
              <div class="rounded-2xl bg-violet-100 p-3 text-violet-700">
                <Bot aria-hidden="true" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-black">修繕責任快速判斷</h2>
                <p class="text-sm text-slate-500">依設備、故障原因與租約整理處理方向</p>
              </div>
            </div>

            <div class="space-y-4">
              <fieldset class="space-y-2">
                <legend class="text-sm font-bold text-slate-800">1. 冷氣是誰提供的？</legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in [
                      { value: 'landlord', label: '房東' },
                      { value: 'tenant', label: '租客' },
                      { value: 'unknown', label: '不確定' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer"
                  >
                    <input
                      v-model="equipmentOwnership"
                      type="radio"
                      name="equipment-ownership"
                      :value="option.value"
                      class="peer sr-only"
                    />
                    <span
                      class="flex min-h-10 touch-manipulation items-center justify-center rounded-xl border border-slate-200 px-2 text-center text-sm font-semibold text-slate-600 transition-colors hover:border-violet-300 peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-800 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2"
                      >{{ option.label }}</span
                    >
                  </label>
                </div>
              </fieldset>
              <fieldset class="space-y-2">
                <legend class="text-sm font-bold text-slate-800">2. 初步故障原因？</legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in [
                      { value: 'natural', label: '自然故障' },
                      { value: 'tenant', label: '人為損壞' },
                      { value: 'unknown', label: '待檢查' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer"
                  >
                    <input
                      v-model="failureCause"
                      type="radio"
                      name="failure-cause"
                      :value="option.value"
                      class="peer sr-only"
                    />
                    <span
                      class="flex min-h-10 touch-manipulation items-center justify-center rounded-xl border border-slate-200 px-2 text-center text-sm font-semibold text-slate-600 transition-colors hover:border-violet-300 peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-800 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2"
                      >{{ option.label }}</span
                    >
                  </label>
                </div>
              </fieldset>
              <fieldset class="space-y-2">
                <legend class="text-sm font-bold text-slate-800">3. 租約如何約定？</legend>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    v-for="option in [
                      { value: 'landlord', label: '房東修' },
                      { value: 'tenant', label: '租客修' },
                      { value: 'unclear', label: '不清楚' },
                    ]"
                    :key="option.value"
                    class="cursor-pointer"
                  >
                    <input
                      v-model="repairAgreement"
                      type="radio"
                      name="repair-agreement"
                      :value="option.value"
                      class="peer sr-only"
                    />
                    <span
                      class="flex min-h-10 touch-manipulation items-center justify-center rounded-xl border border-slate-200 px-2 text-center text-sm font-semibold text-slate-600 transition-colors hover:border-violet-300 peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-800 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2"
                      >{{ option.label }}</span
                    >
                  </label>
                </div>
              </fieldset>
            </div>

            <div
              class="mt-auto rounded-3xl border p-5"
              :class="aiDecision.className"
              aria-live="polite"
            >
              <div class="flex gap-3">
                <CheckCircle2 aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p class="font-black">{{ aiDecision.title }}</p>
                  <p class="mt-2 text-sm leading-6 opacity-80">{{ aiDecision.summary }}</p>
                </div>
              </div>
            </div>
            <p class="text-xs leading-5 text-slate-500">
              此工具只整理判斷順序，不取代租約審閱、技師鑑定或法律意見。
            </p>
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
        <Card class="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <CardContent class="space-y-5 p-6">
            <div class="flex items-center gap-3">
              <div class="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
                <Snowflake aria-hidden="true" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-black">案例問題</h2>
                <p class="text-sm text-slate-500">租屋冷氣突然故障，房東卻主張交屋時可以使用</p>
              </div>
            </div>
            <p class="rounded-3xl bg-cyan-50 p-5 text-sm leading-7 text-cyan-950">
              交屋時正常不代表租賃期間的自然故障都由租客承擔。應回到設備歸屬、故障原因、契約約定與保管義務判斷；房東負責時，租客仍要先通知並定合理期限催告。
            </p>
            <div class="space-y-3">
              <div class="flex gap-3 rounded-2xl border border-slate-100 p-4">
                <CheckCircle2 aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p class="text-sm leading-6 text-slate-600">
                  自然老化、冷媒系統或機件故障，通常偏向房東修繕責任。
                </p>
              </div>
              <div class="flex gap-3 rounded-2xl border border-slate-100 p-4">
                <CheckCircle2 aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p class="text-sm leading-6 text-slate-600">
                  責任有爭議時，第三方技師的故障原因說明比雙方口頭猜測更有用。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <CardContent class="space-y-4 p-6">
            <div class="flex items-center gap-3">
              <div class="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Home aria-hidden="true" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-black">可援引的法律依據</h2>
                <p class="text-sm text-slate-500">把法條轉成處理冷氣修繕爭議的順序</p>
              </div>
            </div>
            <div class="hidden overflow-hidden rounded-3xl border border-slate-100 md:block">
              <table class="w-full table-fixed border-collapse text-left text-sm">
                <caption class="sr-only">
                  冷氣修繕責任相關法源、重點與使用方式
                </caption>
                <thead class="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th scope="col" class="w-1/4 px-4 py-3">法源</th>
                    <th scope="col" class="w-1/4 px-4 py-3">重點</th>
                    <th scope="col" class="w-1/2 px-4 py-3">可怎麼用</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="row in lawRows" :key="row.name" class="align-top">
                    <td class="break-words px-4 py-4 font-bold text-slate-900">
                      <a
                        :href="row.href"
                        target="_blank"
                        rel="noreferrer"
                        class="rounded-sm underline decoration-slate-300 underline-offset-4 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >{{ row.name }}</a
                      >
                    </td>
                    <td class="break-words px-4 py-4 text-slate-600">{{ row.point }}</td>
                    <td class="break-words px-4 py-4 text-slate-600">{{ row.usage }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul class="space-y-3 md:hidden" aria-label="冷氣修繕責任相關法源">
              <li
                v-for="row in lawRows"
                :key="row.name"
                class="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <a
                  :href="row.href"
                  target="_blank"
                  rel="noreferrer"
                  class="font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >{{ row.name }}</a
                >
                <dl class="mt-3 space-y-2 text-sm leading-6">
                  <div>
                    <dt class="inline font-semibold text-slate-800">重點：</dt>
                    <dd class="inline text-slate-600">{{ row.point }}</dd>
                  </div>
                  <div>
                    <dt class="inline font-semibold text-slate-800">可怎麼用：</dt>
                    <dd class="inline text-slate-600">{{ row.usage }}</dd>
                  </div>
                </dl>
              </li>
            </ul>
            <div
              class="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
            >
              <AlertCircle aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                <strong>不要直接停付全部租金：</strong
                >自行修繕或扣除費用前，先完成通知、合理期限催告並保留必要費用證明，避免另生欠租爭議。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repair-guidance-heading" class="grid gap-5 md:grid-cols-2">
        <h2 id="repair-guidance-heading" class="sr-only">修繕責任處理重點</h2>
        <Card
          v-for="section in visualSections"
          :key="section.title"
          class="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
        >
          <CardContent class="grid h-full gap-4 p-5 sm:grid-cols-[190px_minmax(0,1fr)]">
            <div class="overflow-hidden rounded-3xl bg-[#faf8f1]">
              <img
                :src="section.image"
                :alt="section.title"
                class="h-full min-h-[190px] w-full object-cover"
                width="1254"
                height="1254"
                loading="lazy"
              />
            </div>
            <div class="flex min-w-0 flex-col justify-center gap-3">
              <div class="flex items-center gap-2">
                <div class="rounded-xl bg-amber-50 p-2 text-amber-700">
                  <component :is="section.icon" aria-hidden="true" class="h-4 w-4" />
                </div>
                <Badge
                  variant="outline"
                  class="rounded-full border-slate-200 bg-slate-50 text-slate-500"
                  >{{ section.eyebrow }}</Badge
                >
              </div>
              <h3 class="text-balance text-lg font-black leading-7 text-slate-950">
                {{ section.title }}
              </h3>
              <p class="text-sm leading-7 text-slate-600">{{ section.summary }}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.5fr)]">
        <Card class="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <CardContent class="space-y-5 p-6">
            <div class="flex items-center gap-3">
              <div class="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <ShieldCheck aria-hidden="true" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-xl font-black">租客催修與救濟流程</h2>
                <p class="text-sm text-slate-500">先留下程序證據，再決定修繕、扣款或終止</p>
              </div>
            </div>
            <ol class="grid gap-3 sm:grid-cols-2">
              <li
                v-for="(step, index) in actionSteps"
                :key="step"
                class="flex gap-3 rounded-3xl border border-slate-100 bg-slate-50/70 p-4"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white"
                  >{{ index + 1 }}</span
                >
                <p class="text-sm leading-6 text-slate-700">{{ step }}</p>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card
          class="overflow-hidden rounded-[2rem] border-0 bg-gradient-to-br from-cyan-700 via-indigo-600 to-violet-600 text-white shadow-sm"
        >
          <CardContent class="flex h-full flex-col gap-5 p-6">
            <div class="flex items-center gap-4">
              <div
                class="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10"
              >
                <FileText aria-hidden="true" class="h-8 w-8" />
              </div>
              <h2 class="min-w-0 text-balance text-2xl font-black">複製後即可編輯的催修文字</h2>
            </div>
            <p class="text-sm leading-7 text-white/85">
              {{ repairMessage }}
            </p>
            <div class="mt-auto space-y-3">
              <button
                type="button"
                class="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                @click="copyRepairMessage"
              >
                <Check v-if="copyState === 'copied'" aria-hidden="true" class="h-4 w-4" />
                <ClipboardCopy v-else aria-hidden="true" class="h-4 w-4" />
                {{ copyState === 'copied' ? '已複製催修文字' : '複製催修文字' }}
              </button>
              <p class="text-sm text-white/85" aria-live="polite">
                <span v-if="copyState === 'failed'">無法自動複製，請選取上方文字後手動複製。</span>
              </p>
              <a
                href="https://www.legis-pedia.com/QA/question/4230"
                target="_blank"
                rel="noreferrer"
                class="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >查看法律百科來源<ArrowRight aria-hidden="true" class="h-4 w-4"
              /></a>
              <a
                href="https://bhlaw.com.tw/landlord-repair-responsibilities-air-conditioner-maintenance-and-tenant-rights-guide/"
                target="_blank"
                rel="noreferrer"
                class="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >查看律師事務所整理<ArrowRight aria-hidden="true" class="h-4 w-4"
              /></a>
              <RouterLink
                to="/app/contract/scanner"
                class="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >前往合約 OCR<ArrowRight aria-hidden="true" class="h-4 w-4"
              /></RouterLink>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="repair-faq-heading">
        <Card class="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <CardContent class="p-6 sm:p-8 lg:p-10">
            <div class="border-b border-slate-200 pb-6">
              <p class="text-sm font-bold tracking-wide text-amber-700">常見 QA</p>
              <h2
                id="repair-faq-heading"
                class="mt-2 scroll-mt-6 text-balance text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"
              >
                租屋冷氣壞掉常見 FAQ
              </h2>
              <p class="mt-2 text-sm leading-6 text-slate-500">
                一次展開常見問題，快速核對修繕、費用與押金責任。
              </p>
            </div>

            <ol class="divide-y divide-slate-200">
              <li
                v-for="(item, index) in faqItems"
                :key="item.question"
                class="py-7 first:pt-7 last:pb-0 sm:py-8"
              >
                <h3 class="text-pretty text-lg font-black leading-8 text-slate-950 sm:text-xl">
                  <span class="mr-1 font-serif">Q{{ index + 1 }}：</span>{{ item.question }}
                </h3>
                <div class="mt-4 flex items-start gap-2 text-base leading-8 text-slate-600">
                  <span class="shrink-0 font-serif font-bold text-slate-700">A：</span>
                  <p class="text-pretty">{{ item.answer }}</p>
                </div>
                <div v-if="item.sources.length" class="mt-4 flex flex-wrap gap-2 pl-7">
                  <a
                    v-for="source in item.sources"
                    :key="source.href"
                    :href="source.href"
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex min-h-9 touch-manipulation items-center rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-200 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    {{ source.label }}
                  </a>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      <p class="px-2 text-xs leading-6 text-slate-500">
        本頁為一般法律資訊與情境摘要，不構成個案法律意見。實際責任仍須依設備歸屬、故障原因、租約內容、通知程序及具體證據判斷。
      </p>
    </main>
  </article>
</template>
