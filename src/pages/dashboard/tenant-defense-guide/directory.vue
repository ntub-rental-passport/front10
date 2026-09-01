<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, ChevronRight, FileQuestion, Search, Sparkles } from 'lucide-vue-next'

type QuestionCategory = '違約金' | '設備修繕' | '押金返還' | '租約續約' | '水電費用'

interface GuideQuestion {
  title: string
  summary: string
  category: QuestionCategory
  source: string
  to: string
}

const route = useRoute()
const router = useRouter()

const categories = ['全部', '違約金', '設備修繕', '押金返還', '租約續約', '水電費用'] as const
type CategoryFilter = (typeof categories)[number]

const questions: GuideQuestion[] = [
  {
    title: '提前解約要賠多少？違約金有沒有上限？',
    summary: '先確認租約是否允許提前終止、通知期限，以及費用的實質性質。',
    category: '違約金',
    source: '住宅租賃定型化契約與民法',
    to: '/app/contract',
  },
  {
    title: '違約金再加一筆「處理費」，房東可以重複收嗎？',
    summary: '費用名稱不是唯一判斷標準，仍要檢查是否有具體服務或實際支出。',
    category: '違約金',
    source: '租賃契約常見爭議整理',
    to: '/app/contract',
  },
  {
    title: '冷氣壞了是房東要修嗎？房東不回應怎麼辦？',
    summary: '依設備歸屬、故障原因與租約約定，整理催告、自行修繕及留證順序。',
    category: '設備修繕',
    source: '民法第 423、429、430 條',
    to: '/app/contract/air-conditioner-repair',
  },
  {
    title: '冷氣濾網沒有清洗而故障，維修費算誰的？',
    summary: '日常保養與設備自然老化要分開判斷，並確認故障原因是否可歸責租客。',
    category: '設備修繕',
    source: '民法與住宅租賃定型化契約',
    to: '/app/contract/air-conditioner-repair',
  },
  {
    title: '漏水、熱水器或冰箱故障，應該怎麼通知房東？',
    summary: '先保存現況，再用可證明送達的方式通知並給予合理修繕期限。',
    category: '設備修繕',
    source: '修繕催告程序整理',
    to: '/app/contract/air-conditioner-repair',
  },
  {
    title: '退租時牆壁有釘孔或地板刮痕，可以扣押金嗎？',
    summary: '正常使用耗損不當然等於租客應負責，仍須檢查原因、程度與合理修復費。',
    category: '押金返還',
    source: '民法第 432 條',
    to: '/app/contract/air-conditioner-repair',
  },
  {
    title: '房東可以直接用押金抵掉修繕費或欠款嗎？',
    summary: '應提出扣款依據及明細，租客可逐項核對契約、責任與實際支出。',
    category: '押金返還',
    source: '押金返還實務整理',
    to: '/app/contract',
  },
  {
    title: '租約到期後房東遲遲不退押金，可以怎麼處理？',
    summary: '完成點交、保存租金與費用繳清證明，再以書面要求房東限期返還。',
    category: '押金返還',
    source: '住宅租賃定型化契約',
    to: '/app/contract',
  },
  {
    title: '租約到期後繼續住，原租約會自動續約嗎？',
    summary: '要看雙方是否繼續履行、房東是否反對，以及租約是否另有合法約定。',
    category: '租約續約',
    source: '民法租賃規定',
    to: '/app/contract',
  },
  {
    title: '續約時房東突然調漲租金，租客一定要接受嗎？',
    summary: '續約條件原則上仍須雙方合意，應在簽名前確認租金、期間與其他費用。',
    category: '租約續約',
    source: '租約續訂實務整理',
    to: '/app/contract',
  },
  {
    title: '房東用每度固定高價收電費，這樣合法嗎？',
    summary: '先核對計費方式、用電度數、台電帳單與現行住宅租賃電費規範。',
    category: '水電費用',
    source: '住宅租賃電費規範',
    to: '/app/contract/electricity-fee',
  },
  {
    title: '公共電費可以平均分攤給所有房客嗎？',
    summary: '契約應清楚記載計費方式，房東也應提供可供核對的用電資訊。',
    category: '水電費用',
    source: '住宅租賃定型化契約',
    to: '/app/contract/electricity-fee',
  },
]

function readCategory(value: unknown): CategoryFilter {
  return typeof value === 'string' && categories.includes(value as CategoryFilter)
    ? (value as CategoryFilter)
    : '全部'
}

const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')
const activeCategory = ref<CategoryFilter>(readCategory(route.query.category))

const categoryCounts = computed(() =>
  categories.map((category) => ({
    category,
    count:
      category === '全部'
        ? questions.length
        : questions.filter((question) => question.category === category).length,
  })),
)

const filteredQuestions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-TW')

  return questions.filter((question) => {
    const matchesCategory =
      activeCategory.value === '全部' || question.category === activeCategory.value
    const matchesQuery =
      !query ||
      `${question.title} ${question.summary} ${question.category} ${question.source}`
        .toLocaleLowerCase('zh-TW')
        .includes(query)

    return matchesCategory && matchesQuery
  })
})

const resultCountLabel = computed(() =>
  new Intl.NumberFormat('zh-TW').format(filteredQuestions.value.length),
)

function updateUrl(): void {
  void router.replace({
    path: '/app/tenant-guide',
    query: {
      ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
      ...(activeCategory.value !== '全部' ? { category: activeCategory.value } : {}),
    },
  })
}

function selectCategory(category: CategoryFilter): void {
  activeCategory.value = category
  updateUrl()
}

function submitSearch(): void {
  updateUrl()
}

function clearFilters(): void {
  searchQuery.value = ''
  selectCategory('全部')
}
</script>

<template>
  <div class="min-h-full overflow-x-hidden bg-slate-100 text-slate-950">
    <a
      href="#question-directory"
      class="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 font-bold text-indigo-700 shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 motion-reduce:transition-none"
    >
      跳到問題總目錄
    </a>

    <header
      class="relative isolate overflow-hidden bg-[linear-gradient(120deg,_#627bea,_#655fc8_58%,_#7954ad)] px-4 pb-28 pt-6 text-white sm:px-6 lg:px-8"
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -left-28 top-16 h-80 w-80 rounded-full bg-white/5"
      />
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-24 -top-32 h-[34rem] w-[34rem] rounded-full bg-white/5"
      />

      <div class="relative mx-auto max-w-6xl">
        <nav aria-label="麵包屑導覽">
          <RouterLink
            to="/app"
            class="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft aria-hidden="true" class="h-4 w-4" />
            返回租客防禦指南
          </RouterLink>
        </nav>

        <div class="mx-auto mt-8 max-w-3xl text-center sm:mt-10">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10"
          >
            <BookOpen aria-hidden="true" class="h-7 w-7" />
          </div>
          <h1 class="mt-5 text-balance text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            常見租屋問題 Q&amp;A
          </h1>
          <p
            class="mx-auto mt-4 max-w-2xl text-pretty text-base leading-8 text-white/90 sm:text-lg"
          >
            彙整違約金、設備修繕、押金返還、租約續約與水電費用，快速找到處理方向。
          </p>
        </div>
      </div>
    </header>

    <main
      id="question-directory"
      tabindex="-1"
      class="relative mx-auto -mt-16 max-w-6xl px-4 pb-12 outline-none sm:px-6 lg:px-8"
    >
      <section
        aria-label="搜尋與分類"
        class="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-indigo-950/10 sm:p-5"
      >
        <form class="relative" role="search" @submit.prevent="submitSearch">
          <label for="question-search" class="sr-only">搜尋常見租屋問題</label>
          <Search
            aria-hidden="true"
            class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          />
          <input
            id="question-search"
            v-model="searchQuery"
            name="question-search"
            type="search"
            autocomplete="off"
            placeholder="例如：冷氣不修、提前解約、押金…"
            class="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-28 text-base text-slate-900 outline-none transition-[border-color,background-color,box-shadow] placeholder:text-slate-400 focus-visible:border-indigo-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-100"
          />
          <button
            type="submit"
            class="absolute right-1.5 top-1.5 inline-flex h-11 touch-manipulation items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <Search aria-hidden="true" class="h-4 w-4" />
            搜尋
          </button>
        </form>

        <div class="mt-4 flex flex-wrap justify-center gap-2" aria-label="問題分類">
          <button
            v-for="item in categoryCounts"
            :key="item.category"
            type="button"
            :aria-pressed="activeCategory === item.category"
            class="min-h-10 touch-manipulation rounded-full border px-4 py-2 text-sm font-bold transition-[border-color,background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            :class="
              activeCategory === item.category
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
            "
            @click="selectCategory(item.category)"
          >
            {{ item.category }} ({{ item.count }})
          </button>
        </div>
      </section>

      <section aria-labelledby="directory-stats-heading" class="mt-6 grid gap-3 sm:grid-cols-3">
        <h2 id="directory-stats-heading" class="sr-only">總目錄統計</h2>
        <div class="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm">
          <p class="text-3xl font-black tabular-nums text-indigo-600">{{ questions.length }}</p>
          <p class="mt-1 text-sm text-slate-500">問題雛形</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm">
          <p class="text-3xl font-black tabular-nums text-indigo-600">5</p>
          <p class="mt-1 text-sm text-slate-500">問題分類</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm">
          <p class="text-3xl font-black text-indigo-600">持續更新</p>
          <p class="mt-1 text-sm text-slate-500">租屋資訊</p>
        </div>
      </section>

      <section aria-labelledby="all-questions-heading" class="mt-8">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="flex items-center gap-2 text-sm font-bold text-indigo-600">
              <Sparkles aria-hidden="true" class="h-4 w-4" />
              問題資料庫
            </p>
            <h2 id="all-questions-heading" class="mt-1 text-2xl font-black tracking-tight">
              {{ activeCategory === '全部' ? '所有租屋問題' : activeCategory }}
            </h2>
          </div>
          <p class="shrink-0 text-sm text-slate-500">共 {{ resultCountLabel }} 筆結果</p>
        </div>

        <ol v-if="filteredQuestions.length" class="mt-5 space-y-3">
          <li v-for="(question, index) in filteredQuestions" :key="question.title">
            <RouterLink
              :to="question.to"
              class="group flex min-h-28 touch-manipulation items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none sm:gap-5 sm:p-5"
            >
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,_#6982eb,_#7146b7)] text-base font-black tabular-nums text-white shadow-sm"
              >
                {{ index + 1 }}
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block text-pretty text-base font-black leading-7 text-slate-900 sm:text-lg"
                >
                  {{ question.title }}
                </span>
                <span class="mt-1 block text-pretty text-sm leading-6 text-slate-500">
                  快速解答：{{ question.summary }}
                </span>
                <span class="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600"
                  >
                    {{ question.category }}
                  </span>
                  <span class="text-xs text-slate-400">資料來源：{{ question.source }}</span>
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                class="h-5 w-5 shrink-0 text-slate-300 transition-[color,transform] group-hover:translate-x-1 group-hover:text-indigo-500 motion-reduce:transform-none motion-reduce:transition-none"
              />
            </RouterLink>
          </li>
        </ol>

        <div
          v-else
          class="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"
        >
          <FileQuestion aria-hidden="true" class="mx-auto h-10 w-10 text-slate-300" />
          <h3 class="mt-4 text-lg font-black text-slate-800">找不到符合條件的問題</h3>
          <p class="mt-2 text-sm text-slate-500">請縮短關鍵字，或切換到「全部」分類後再搜尋。</p>
          <button
            type="button"
            class="mt-5 min-h-11 touch-manipulation rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            @click="clearFilters"
          >
            清除搜尋條件
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
