<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Droplets,
  FileText,
  LoaderCircle,
  Wrench,
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications, type InboxItem } from '@/src/composables/useNotifications'
import { useLandlordOverviewTasks } from '@/src/composables/useLandlordOverviewTasks'
import {
  bellBadgeCount,
  defaultBellTab,
  filterOverviewTasks,
  groupOverviewTasks,
  urgentTaskCount,
  type BellTab,
  type DueFilter,
} from '@/src/utils/landlord-bell'
import {
  notificationBadge,
  notificationTarget,
  notificationTime,
} from '@/src/utils/notification-bell'

const router = useRouter()
const open = ref(false)
const now = ref(Date.now())
const activeTab = ref<BellTab>('inbox')
const dueFilter = ref<DueFilter>('all')
const { inboxItems, unreadCount, markRead, markAllRead, loading, loadError, actionError, refresh } =
  useNotifications('landlord')
const {
  tasks,
  loading: tasksLoading,
  loadError: tasksLoadError,
  refresh: refreshTasks,
} = useLandlordOverviewTasks()
const recentItems = computed(() => inboxItems.value.slice(0, 10))
const urgentCount = computed(() => urgentTaskCount(tasks.value))
const badge = computed(() => notificationBadge(bellBadgeCount(unreadCount.value, tasks.value)))
const ariaLabel = computed(() =>
  unreadCount.value || urgentCount.value
    ? `通知，${unreadCount.value} 則未讀，${urgentCount.value} 件急件待辦`
    : '通知',
)
const tabs = computed(() => [
  { value: 'inbox' as const, label: '通知', count: unreadCount.value },
  { value: 'tasks' as const, label: '待辦', count: tasks.value.length },
])
const dueTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: tasks.value.length },
  {
    value: 'overdue' as const,
    label: '逾期',
    count: filterOverviewTasks(tasks.value, 'overdue').length,
  },
  {
    value: 'today' as const,
    label: '今天',
    count: filterOverviewTasks(tasks.value, 'today').length,
  },
])
const visibleTasks = computed(() => filterOverviewTasks(tasks.value, dueFilter.value))
const groupedTasks = computed(() => groupOverviewTasks(tasks.value, dueFilter.value))
const kindMeta = {
  rent: { icon: CircleDollarSign },
  contract: { icon: FileText },
  utility: { icon: Droplets },
  maintenance: { icon: Wrench },
} as const
const bucketMeta = {
  overdue: { label: '已逾期', className: 'text-[#b85043]' },
  today: { label: '今天', className: 'text-[#9c6a23]' },
  upcoming: { label: '接下來 7 天', className: 'text-[#607168]' },
} as const

function onOpen(value: boolean): void {
  open.value = value
  if (value) {
    now.value = Date.now()
    // 只在開啟時選預設分頁，重讀完成後不打斷使用者的切換。
    activeTab.value = defaultBellTab(unreadCount.value, tasks.value)
    void refresh()
    void refreshTasks()
  }
}

function selectItem(item: InboxItem): void {
  markRead(item)
  const target = notificationTarget(item.actionUrl)
  if (!target) return
  open.value = false
  if (target.kind === 'internal') void router.push(target.url)
  else window.open(target.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <DropdownMenu :open="open" @update:open="onOpen">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="relative rounded-xl border border-[#ddd6c8] bg-white/70 p-2.5 text-[#526057] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#5b8263]"
        :aria-label="ariaLabel"
      >
        <Bell class="h-5 w-5" />
        <span
          v-if="badge"
          class="absolute -right-2 -top-2 min-w-5 rounded-full bg-[#b34a3e] px-1 text-center text-[10px] font-bold leading-5 text-white"
        >
          {{ badge }}
        </span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-[min(24rem,calc(100vw-2rem))] border-[#e2ddcf] bg-[#fbf9f2] p-0 text-[#233129]"
    >
      <div
        role="tablist"
        aria-label="通知與待辦"
        class="grid grid-cols-2 gap-2 border-b border-[#e4dfd2] p-3"
      >
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.value"
          :class="[
            'min-w-0 rounded-lg px-3 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[#5b8263]',
            activeTab === tab.value
              ? 'bg-[#23362b] text-white'
              : 'text-[#737c75] hover:bg-[#ede9df]',
          ]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }} <span class="ml-1 text-xs opacity-75">{{ tab.count }}</span>
        </button>
      </div>
      <div class="max-h-[min(32rem,70vh)] overflow-x-hidden overflow-y-auto">
        <div v-if="activeTab === 'inbox'" role="tabpanel" aria-label="通知">
          <div class="flex items-center justify-between border-b border-[#e4dfd2] px-4 py-3">
            <p class="font-bold">通知</p>
            <button
              v-if="unreadCount && !loading && !loadError"
              type="button"
              class="rounded px-2 py-1 text-xs font-semibold text-[#52775a] hover:bg-[#e7f2e8] focus-visible:ring-2 focus-visible:ring-[#5b8263]"
              @click="markAllRead"
            >
              全部已讀
            </button>
          </div>
          <p v-if="actionError" role="alert" class="px-4 py-3 text-sm text-[#a4473b]">
            {{ actionError }}
          </p>
          <div
            v-if="loading"
            role="status"
            class="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[#778078]"
          >
            <LoaderCircle class="h-4 w-4 animate-spin" />讀取通知中…
          </div>
          <div v-else-if="loadError" role="alert" class="space-y-3 px-4 py-6 text-center text-sm">
            <p class="text-[#a4473b]">{{ loadError }}</p>
            <button
              type="button"
              class="rounded-lg border border-[#bfd2c1] px-3 py-2 font-semibold text-[#52775a] hover:bg-[#e7f2e8]"
              @click="refresh"
            >
              重新讀取
            </button>
          </div>
          <p
            v-else-if="recentItems.length === 0"
            class="px-4 py-8 text-center text-sm text-[#778078]"
          >
            目前沒有通知
          </p>
          <div v-else class="p-1.5">
            <DropdownMenuItem
              v-for="item in recentItems"
              :key="item.key"
              class="my-1 block border-l-[3px] px-3 py-3 focus:bg-[#edf2e9] data-[highlighted]:bg-[#edf2e9]"
              :class="item.read ? 'border-transparent' : 'border-[#5b8263] bg-[#edf2e9]/60'"
              @select.prevent="selectItem(item)"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="min-w-0 break-words text-sm font-semibold">
                  {{ item.title }}<span v-if="!item.read" class="sr-only">，未讀</span>
                </p>
                <time :datetime="item.createdAt" class="shrink-0 text-[11px] text-[#778078]">{{
                  notificationTime(item.createdAt, now)
                }}</time>
              </div>
              <p class="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-5 text-[#778078]">
                {{ item.body }}
              </p>
              <p
                v-if="notificationTarget(item.actionUrl)"
                class="mt-1 text-xs font-semibold text-[#52775a]"
              >
                {{ item.actionLabel || '查看詳情' }} →
              </p>
            </DropdownMenuItem>
          </div>
        </div>
        <div v-else role="tabpanel" aria-label="待辦">
          <div class="border-b border-[#e5ded2] px-4 py-3">
            <div class="grid min-w-0 grid-cols-3 rounded-xl bg-[#ede9df] p-1">
              <button
                v-for="tab in dueTabs"
                :key="tab.value"
                type="button"
                :aria-pressed="dueFilter === tab.value"
                :class="[
                  'min-w-0 rounded-lg px-2 py-2 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-[#5b8263]',
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
          </div>
          <div
            v-if="tasksLoading"
            role="status"
            class="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[#778078]"
          >
            <LoaderCircle class="h-4 w-4 animate-spin" />讀取待辦中…
          </div>
          <div
            v-else-if="tasksLoadError"
            role="alert"
            class="space-y-3 px-4 py-6 text-center text-sm"
          >
            <p class="font-bold">待辦讀取失敗</p>
            <p class="break-words text-[#a4473b]">{{ tasksLoadError }}</p>
            <button
              type="button"
              class="rounded-lg border border-[#bfd2c1] px-3 py-2 font-semibold text-[#52775a] hover:bg-[#e7f2e8]"
              @click="refreshTasks"
            >
              重新讀取
            </button>
          </div>
          <div v-else class="px-4 py-2">
            <template v-if="groupedTasks.length">
              <section
                v-for="group in groupedTasks"
                :key="group.bucket"
                class="border-b border-[#ebe5da] py-3 last:border-0"
              >
                <div class="mb-2 flex items-center justify-between text-xs font-bold">
                  <span :class="bucketMeta[group.bucket].className">{{
                    bucketMeta[group.bucket].label
                  }}</span>
                  <span class="text-[#989d99]">{{ group.tasks.length }}</span>
                </div>
                <DropdownMenuItem v-for="task in group.tasks" :key="task.id" as-child>
                  <RouterLink
                    :to="task.route"
                    class="group flex gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-[#f5f5ef] focus:bg-[#edf2e9]"
                    @click="open = false"
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
                    >
                      <component :is="kindMeta[task.kind].icon" class="h-4 w-4" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-bold">{{ task.title }}</p>
                      <p class="mt-1 truncate text-xs text-[#7c847e]">{{ task.meta }}</p>
                      <p
                        :class="[
                          'mt-1.5 break-words text-xs font-semibold',
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
                </DropdownMenuItem>
              </section>
            </template>
            <div v-else class="grid min-h-52 place-items-center text-center">
              <div>
                <span
                  class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f2e8] text-[#5b8263]"
                  ><Bell class="h-5 w-5"
                /></span>
                <p class="mt-3 font-bold">
                  {{ tasks.length ? '目前沒有符合的待辦' : '目前沒有待辦' }}
                </p>
                <p class="mt-1 text-xs text-[#7c847e]">
                  {{
                    tasks.length ? '可切換分類。' : '未收帳款、即將到期的租約與報修會出現在這裡。'
                  }}
                </p>
              </div>
            </div>
          </div>
          <footer
            class="flex items-center justify-between border-t border-[#e5ded2] bg-[#fbfaf6] px-4 py-3 text-xs"
          >
            <span class="font-semibold text-[#747d76]">目前顯示 {{ visibleTasks.length }} 件</span>
            <RouterLink to="/landlord" class="font-bold text-[#557b5d]" @click="open = false">
              查看所有待辦
            </RouterLink>
          </footer>
        </div>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
