<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside, useEventListener } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Droplets,
  FileText,
  SlidersHorizontal,
  Wrench,
  X,
} from 'lucide-vue-next'

type DueFilter = 'all' | 'overdue' | 'today'
type TaskKind = 'rent' | 'contract' | 'utility' | 'maintenance'
type TaskBucket = 'overdue' | 'today' | 'upcoming'

type RentalTask = {
  id: number
  kind: TaskKind
  bucket: TaskBucket
  title: string
  meta: string
  timing: string
  route: string
}

const tasks: RentalTask[] = [
  {
    id: 1,
    kind: 'rent',
    bucket: 'overdue',
    title: '王曉明 · 7 月租金尚未入帳',
    meta: '松庭公寓 · 3A · NT$13,000',
    timing: '逾期 3 天',
    route: '/landlord/finance',
  },
  {
    id: 2,
    kind: 'contract',
    bucket: 'overdue',
    title: '張維哲 · 租約續約待確認',
    meta: '松庭公寓 · 4B',
    timing: '逾期 1 天',
    route: '/landlord/contracts',
  },
  {
    id: 3,
    kind: 'maintenance',
    bucket: 'today',
    title: '浴室漏水等待安排處理',
    meta: '晴光小築 · 202 · 蔡明軒',
    timing: '今天 10:30',
    route: '/landlord/maintenance',
  },
  {
    id: 4,
    kind: 'rent',
    bucket: 'today',
    title: '陳怡君 · 付款證明待確認',
    meta: '松庭公寓 · 2A · NT$12,500',
    timing: '今天到期',
    route: '/landlord/finance',
  },
  {
    id: 5,
    kind: 'utility',
    bucket: 'upcoming',
    title: '登錄本期水電度數',
    meta: '松庭公寓 · 共 6 間房',
    timing: '3 天後',
    route: '/landlord/finance',
  },
  {
    id: 6,
    kind: 'contract',
    bucket: 'upcoming',
    title: '王雅婷 · 租約即將到期',
    meta: '松庭公寓 · 3A',
    timing: '剩餘 28 天',
    route: '/landlord/contracts',
  },
  {
    id: 7,
    kind: 'maintenance',
    bucket: 'upcoming',
    title: '冷氣清潔排程待確認',
    meta: '河畔居 · 5B · 周柏廷',
    timing: '本週五',
    route: '/landlord/maintenance',
  },
]

const kindMeta = {
  all: { label: '全部', icon: SlidersHorizontal },
  rent: { label: '收租', icon: CircleDollarSign },
  contract: { label: '合約', icon: FileText },
  utility: { label: '水電', icon: Droplets },
  maintenance: { label: '報修', icon: Wrench },
} as const

const bucketMeta = {
  overdue: { label: '已逾期', className: 'text-[#b85043]' },
  today: { label: '今天', className: 'text-[#9c6a23]' },
  upcoming: { label: '接下來 7 天', className: 'text-[#607168]' },
} as const

const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const filterOpen = ref(false)
const dueFilter = ref<DueFilter>('all')
const kindFilter = ref<keyof typeof kindMeta>('all')
const draftKind = ref<keyof typeof kindMeta>('all')

const dueTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: tasks.length },
  {
    value: 'overdue' as const,
    label: '逾期',
    count: tasks.filter((task) => task.bucket === 'overdue').length,
  },
  {
    value: 'today' as const,
    label: '今天',
    count: tasks.filter((task) => task.bucket === 'today').length,
  },
])

const visibleTasks = computed(() =>
  tasks.filter((task) => {
    const matchesDue = dueFilter.value === 'all' || task.bucket === dueFilter.value
    const matchesKind = kindFilter.value === 'all' || task.kind === kindFilter.value
    return matchesDue && matchesKind
  }),
)

const groupedTasks = computed(() =>
  (['overdue', 'today', 'upcoming'] as TaskBucket[])
    .map((bucket) => ({
      bucket,
      tasks: visibleTasks.value.filter((task) => task.bucket === bucket),
    }))
    .filter((group) => group.tasks.length),
)

function toggle(): void {
  isOpen.value = !isOpen.value
  if (!isOpen.value) filterOpen.value = false
}

function openFilters(): void {
  draftKind.value = kindFilter.value
  filterOpen.value = true
}

function applyFilters(): void {
  kindFilter.value = draftKind.value
  filterOpen.value = false
}

function clearFilters(): void {
  draftKind.value = 'all'
  kindFilter.value = 'all'
}

onClickOutside(root, () => {
  isOpen.value = false
  filterOpen.value = false
})
useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    isOpen.value = false
    filterOpen.value = false
  }
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="relative rounded-full border border-[#dfd9cc] bg-white p-2.5 shadow-sm transition-colors hover:bg-[#f4f7f1]"
      aria-label="開啟租務中心"
      aria-controls="rental-center-panel"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <Bell class="h-4 w-4" />
      <span
        class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#f7f4ea] bg-[#b75849] px-1 text-[10px] font-black leading-none text-white"
        >{{ tasks.length }}</span
      >
    </button>

    <section
      v-if="isOpen"
      id="rental-center-panel"
      class="fixed left-4 right-4 top-20 z-50 overflow-hidden rounded-[1.45rem] border border-[#ded7ca] bg-[#fffdf8] shadow-[0_24px_70px_rgba(43,50,44,.2)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+12px)] sm:w-[430px]"
      role="dialog"
      aria-modal="false"
      aria-label="租務中心"
    >
      <header class="flex items-start justify-between border-b border-[#e5ded2] px-5 py-4">
        <div>
          <h2 class="text-lg font-black">租務中心</h2>
          <p class="mt-0.5 text-xs text-[#788078]">目前有 {{ tasks.length }} 件待處理</p>
        </div>
        <button
          class="grid h-8 w-8 place-items-center rounded-full text-[#707870] hover:bg-[#f0eee7]"
          aria-label="關閉租務中心"
          @click="isOpen = false"
        >
          <X class="h-4 w-4" />
        </button>
      </header>

      <div class="border-b border-[#e5ded2] px-4 py-3">
        <div class="flex gap-2">
          <div class="grid min-w-0 flex-1 grid-cols-3 rounded-xl bg-[#ede9df] p-1">
            <button
              v-for="tab in dueTabs"
              :key="tab.value"
              :class="[
                'rounded-lg px-2 py-2 text-xs font-bold transition-colors',
                dueFilter === tab.value
                  ? 'bg-[#23362b] text-white shadow-sm'
                  : 'text-[#737c75] hover:text-[#314038]',
              ]"
              @click="dueFilter = tab.value"
            >
              {{ tab.label }}
              <span :class="dueFilter === tab.value ? 'text-white/75' : 'text-[#959b96]'">{{
                tab.count
              }}</span>
            </button>
          </div>
          <button
            :class="[
              'inline-flex items-center gap-1.5 rounded-xl border px-3 text-xs font-bold',
              kindFilter !== 'all'
                ? 'border-[#79977e] bg-[#edf5ee] text-[#52765a]'
                : 'border-[#dfd8cb] bg-white text-[#68726b]',
            ]"
            @click="filterOpen ? (filterOpen = false) : openFilters()"
          >
            <SlidersHorizontal class="h-4 w-4" />篩選
          </button>
        </div>
        <p v-if="kindFilter !== 'all'" class="mt-2 text-xs text-[#68756c]">
          業務類型：<strong class="text-[#52765a]">{{ kindMeta[kindFilter].label }}</strong>
        </p>
      </div>

      <div v-if="filterOpen" class="border-b border-[#e5ded2] bg-[#fbfaf5] p-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-black">篩選待辦</h3>
            <p class="mt-0.5 text-xs text-[#7c847e]">依租務類型縮小目前範圍</p>
          </div>
          <button
            class="grid h-8 w-8 place-items-center rounded-full hover:bg-[#eeece5]"
            aria-label="關閉篩選"
            @click="filterOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-for="(meta, key) in kindMeta"
            :key="key"
            :class="[
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-colors',
              draftKind === key
                ? 'border-[#64866b] bg-[#e8f2e9] text-[#496c51]'
                : 'border-[#e2dbce] bg-[#fffdf9] text-[#626c65]',
            ]"
            @click="draftKind = key"
          >
            <component :is="meta.icon" class="h-4 w-4" />{{ meta.label }}
          </button>
        </div>
        <div class="mt-4 flex items-center justify-between border-t border-[#e5ded2] pt-3">
          <button
            class="text-xs font-bold text-[#717a73] hover:text-[#435047]"
            @click="clearFilters"
          >
            清除篩選</button
          ><button
            class="rounded-xl bg-[#5b8263] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#4f7557]"
            @click="applyFilters"
          >
            套用
          </button>
        </div>
      </div>

      <div class="max-h-[430px] overflow-y-auto px-4 py-2">
        <template v-if="groupedTasks.length">
          <section
            v-for="group in groupedTasks"
            :key="group.bucket"
            class="border-b border-[#ebe5da] py-3 last:border-0"
          >
            <div class="mb-2 flex items-center justify-between text-xs font-bold">
              <span :class="bucketMeta[group.bucket].className">{{
                bucketMeta[group.bucket].label
              }}</span
              ><span class="text-[#989d99]">{{ group.tasks.length }}</span>
            </div>
            <RouterLink
              v-for="task in group.tasks"
              :key="task.id"
              :to="task.route"
              class="group flex gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[#f5f5ef]"
              @click="isOpen = false"
            >
              <span
                :class="[
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                  task.kind === 'rent'
                    ? 'bg-[#fbe9e5] text-[#b65345]'
                    : task.kind === 'contract'
                      ? 'bg-[#eee9f7] text-[#755d96]'
                      : task.kind === 'utility'
                        ? 'bg-[#e5f1f5] text-[#397a91]'
                        : 'bg-[#e7f2e8] text-[#52785a]',
                ]"
                ><component :is="kindMeta[task.kind].icon" class="h-4 w-4"
              /></span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold">{{ task.title }}</p>
                <p class="mt-1 truncate text-xs text-[#7c847e]">{{ task.meta }}</p>
                <p
                  :class="[
                    'mt-1.5 text-xs font-semibold',
                    group.bucket === 'overdue' ? 'text-[#b85043]' : 'text-[#718078]',
                  ]"
                >
                  {{ task.timing }}
                </p>
              </div>
              <ChevronRight
                class="mt-2 h-4 w-4 shrink-0 text-[#9aa09b] transition-transform group-hover:translate-x-0.5"
              />
            </RouterLink>
          </section>
        </template>
        <div v-else class="grid min-h-52 place-items-center text-center">
          <div>
            <span
              class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f2e8] text-[#5b8263]"
              ><Bell class="h-5 w-5"
            /></span>
            <p class="mt-3 font-bold">目前沒有符合的待辦</p>
            <p class="mt-1 text-xs text-[#7c847e]">可切換分類或清除業務篩選。</p>
          </div>
        </div>
      </div>

      <footer
        class="flex items-center justify-between border-t border-[#e5ded2] bg-[#fbfaf6] px-5 py-3 text-xs"
      >
        <span class="font-semibold text-[#747d76]">目前顯示 {{ visibleTasks.length }} 件</span
        ><RouterLink to="/landlord" class="font-bold text-[#557b5d]" @click="isOpen = false"
          >查看所有待辦</RouterLink
        >
      </footer>
    </section>
  </div>
</template>
