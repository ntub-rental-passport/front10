<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { BookOpen, Search } from 'lucide-vue-next'

type TopicKey = 'penalty' | 'repair' | 'deposit' | 'renewal' | 'utilities'

const props = defineProps<{
  activeTopic: TopicKey
}>()

const route = useRoute()
const router = useRouter()
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')

const topics = [
  {
    key: 'penalty',
    label: '違約金',
    count: 12,
    to: '/app/contract',
    tone: 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100',
  },
  {
    key: 'repair',
    label: '設備修繕',
    count: 8,
    to: '/app/contract/air-conditioner-repair',
    tone: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  {
    key: 'deposit',
    label: '押金返還',
    count: 15,
    to: { path: '/app/tenant-guide', query: { category: '押金返還' } },
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  },
  {
    key: 'renewal',
    label: '租約續約',
    count: 10,
    to: { path: '/app/tenant-guide', query: { category: '租約續約' } },
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
  },
  {
    key: 'utilities',
    label: '水電費用',
    count: 22,
    to: '/app/contract/electricity-fee',
    tone: 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200',
  },
] as const

watch(
  () => route.query.q,
  (query) => {
    searchQuery.value = typeof query === 'string' ? query : ''
  },
)

function submitSearch(): void {
  const query = searchQuery.value.trim()
  void router.push({ path: '/app/tenant-guide', query: query ? { q: query } : {} })
}
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md"
  >
    <div class="mx-auto w-full max-w-[1540px] px-4 py-4 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <RouterLink
          to="/app/tenant-guide"
          class="flex w-fit min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"
          >
            <BookOpen aria-hidden="true" class="h-6 w-6" />
          </span>
          <span class="min-w-0">
            <strong class="block text-xl font-black tracking-tight text-slate-950 sm:text-2xl"
              >租客防禦指南</strong
            >
            <span class="mt-0.5 block truncate text-sm text-slate-500 sm:text-base"
              >快速補齊租屋常見爭議與判斷基礎</span
            >
          </span>
        </RouterLink>

        <form class="relative w-full lg:max-w-[510px]" role="search" @submit.prevent="submitSearch">
          <label for="tenant-guide-search" class="sr-only">搜尋租客指南文章</label>
          <Search
            aria-hidden="true"
            class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          />
          <input
            id="tenant-guide-search"
            v-model="searchQuery"
            name="tenant-guide-search"
            type="search"
            autocomplete="off"
            placeholder="搜尋租屋爭議、法條或關鍵字…"
            class="h-12 w-full rounded-full border border-slate-200 bg-slate-50 pl-12 pr-24 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 sm:h-14 sm:text-base"
          />
          <button
            type="submit"
            class="absolute right-1.5 top-1.5 h-9 rounded-full bg-indigo-600 px-5 text-sm font-black text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:h-11 sm:px-6 sm:text-base"
          >
            搜尋指南
          </button>
        </form>
      </div>

      <nav aria-label="租客指南文章主題" class="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
        <div class="flex min-w-max items-center gap-2.5">
          <RouterLink
            v-for="topic in topics"
            :key="topic.key"
            :to="topic.to"
            :aria-current="props.activeTopic === topic.key ? 'page' : undefined"
            class="rounded-full border px-4 py-2 text-sm font-black transition-[background-color,box-shadow,filter,transform] hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:px-5 sm:py-2.5 sm:text-base"
            :class="[
              topic.tone,
              props.activeTopic === topic.key
                ? 'shadow-sm brightness-[0.96] ring-1 ring-current/10'
                : '',
            ]"
          >
            {{ topic.label }} ({{ topic.count }})
          </RouterLink>
        </div>
      </nav>
    </div>
  </header>
</template>
