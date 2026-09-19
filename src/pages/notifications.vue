<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import MaintenanceStatusPanel from '@/src/components/maintenance/MaintenanceStatusPanel.vue'
import LevelBadge from '@/src/components/admin/LevelBadge.vue'
import { useNotifications, type InboxItem } from '@/src/composables/useNotifications'
import { formatDateTime } from '@/src/utils/admin-format'
import { notifSourceLabels } from '@/src/mocks/admin/notifications'
import type { NotifSourceType } from '@/src/mocks/admin-seed'

const { inboxItems, unreadCount, markRead, markAllRead } = useNotifications()

const sourceColors: Record<NotifSourceType, string> = {
  system: 'bg-slate-100 text-slate-700',
  landlord: 'bg-blue-50 text-blue-700',
  admin: 'bg-violet-50 text-violet-700',
  roommate: 'bg-emerald-50 text-emerald-700',
}

type FilterTab = 'all' | 'platform' | 'landlord' | 'roommate'

const activeTab = ref<FilterTab>('all')

const platformSources: NotifSourceType[] = ['system', 'admin']

const filterTabs: { value: FilterTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'platform', label: '系統與管理' },
  { value: 'landlord', label: '房東' },
  { value: 'roommate', label: '室友' },
]

const filteredItems = computed(() => {
  if (activeTab.value === 'all') return inboxItems.value
  if (activeTab.value === 'platform') {
    return inboxItems.value.filter((item) => item.sourceType && platformSources.includes(item.sourceType))
  }
  return inboxItems.value.filter((item) => item.sourceType === activeTab.value)
})

const tabCounts = computed(() => {
  const counts: Record<FilterTab, number> = { all: 0, platform: 0, landlord: 0, roommate: 0 }
  for (const item of inboxItems.value) {
    if (!item.read) {
      counts.all++
      if (item.sourceType && platformSources.includes(item.sourceType)) counts.platform++
      else if (item.sourceType === 'landlord') counts.landlord++
      else if (item.sourceType === 'roommate') counts.roommate++
    }
  }
  return counts
})

function unreadAccent(item: InboxItem): string {
  if (item.source !== 'announcement' || !item.level) return 'border-l-primary'
  return item.level === 'urgent'
    ? 'border-l-destructive'
    : item.level === 'warning'
      ? 'border-l-amber-400'
      : 'border-l-primary'
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">通知中心</h1>
        <p class="text-muted-foreground">系統公告、房東訊息、管理員通知與室友動態都在這裡。</p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="unreadCount > 0" variant="default">{{ unreadCount }} 則未讀</Badge>
        <Button variant="outline" size="sm" :disabled="unreadCount === 0" @click="markAllRead">
          全部標為已讀
        </Button>
      </div>
    </div>

    <MaintenanceStatusPanel />

    <!-- 分類篩選 -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="tab in filterTabs"
        :key="tab.value"
        type="button"
        :class="[
          'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
          activeTab === tab.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
        ]"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
        <span
          v-if="tabCounts[tab.value] > 0"
          :class="[
            'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
            activeTab === tab.value
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-destructive text-destructive-foreground',
          ]"
        >
          {{ tabCounts[tab.value] }}
        </span>
      </button>
    </div>

    <!--
      維護狀態不是通知，所以就算收件匣是空的，只要有功能維護中，上面的
      MaintenanceStatusPanel 一樣會顯示，畫面同時出現狀態區塊與這則空狀態
      是刻意的，不要因為想讓畫面「看起來乾淨」而改動這個條件。
    -->
    <div
      v-if="filteredItems.length === 0"
      class="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-muted-foreground"
    >
      {{ activeTab === 'all' ? '目前沒有任何通知。' : '此分類沒有通知。' }}
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in filteredItems"
        :key="item.key"
        :class="[
          'rounded-2xl border p-4 transition-colors',
          item.read
            ? 'border-slate-200 bg-white'
            : ['cursor-pointer border-l-4 bg-primary/5', unreadAccent(item)],
        ]"
        @click="markRead(item)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p
            :class="[
              'text-sm',
              item.read ? 'font-medium text-muted-foreground' : 'font-bold text-slate-900',
            ]"
          >
            {{ item.title }}
          </p>
          <span class="text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <LevelBadge
            v-if="item.source === 'announcement' && item.level"
            :level="item.level"
            prefixed
          />
          <Badge
            v-if="item.sourceType"
            variant="secondary"
            :class="sourceColors[item.sourceType]"
          >
            {{ notifSourceLabels[item.sourceType] }}
          </Badge>
        </div>

        <p class="mt-2 text-sm text-muted-foreground">{{ item.body }}</p>

        <div v-if="item.actionUrl" class="mt-3">
          <Button
            variant="outline"
            size="sm"
            as-child
            class="gap-1.5"
          >
            <RouterLink :to="item.actionUrl">
              {{ item.actionLabel ?? '查看詳情' }}
              <ArrowUpRight class="h-3.5 w-3.5" />
            </RouterLink>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
