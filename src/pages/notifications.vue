<script setup lang="ts">
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { useNotifications, type InboxItem } from '@/src/composables/useNotifications'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AnnouncementLevel, NotifChannel } from '@/src/mocks/admin-seed'

const { inboxItems, unreadCount, markRead, markAllRead } = useNotifications()

const channelLabels: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

const levelLabels: Record<AnnouncementLevel, string> = {
  info: '一般',
  warning: '注意',
  urgent: '緊急',
}

// 公告依等級著色，通知維持中性色
const levelClasses: Record<AnnouncementLevel, string> = {
  info: 'border-primary/40 bg-primary/10 text-primary',
  warning: 'border-amber-300 bg-amber-50 text-amber-700',
  urgent: 'border-destructive/40 bg-destructive/10 text-destructive',
}

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
        <p class="text-muted-foreground">這裡會顯示系統公告，以及管理員發送給您的通知。</p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="unreadCount > 0" variant="default">{{ unreadCount }} 則未讀</Badge>
        <Button variant="outline" size="sm" :disabled="unreadCount === 0" @click="markAllRead">
          全部標為已讀
        </Button>
      </div>
    </div>

    <div
      v-if="inboxItems.length === 0"
      class="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-muted-foreground"
    >
      目前沒有任何通知。
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in inboxItems"
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
          <Badge
            v-if="item.source === 'announcement' && item.level"
            variant="outline"
            :class="levelClasses[item.level]"
          >
            公告 · {{ levelLabels[item.level] }}
          </Badge>
          <Badge v-else variant="secondary">{{ item.category }}</Badge>

          <Badge v-for="ch in item.channels" :key="ch" variant="secondary">
            {{ channelLabels[ch] }}
          </Badge>
        </div>

        <p class="mt-2 text-sm text-muted-foreground">{{ item.body }}</p>
      </div>
    </div>
  </div>
</template>
