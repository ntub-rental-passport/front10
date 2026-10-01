<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, LoaderCircle } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications, type InboxItem } from '@/src/composables/useNotifications'
import {
  notificationBadge,
  notificationTarget,
  notificationTime,
} from '@/src/utils/notification-bell'

const router = useRouter()
const open = ref(false)
const now = ref(Date.now())
const { inboxItems, unreadCount, markRead, markAllRead, loading, loadError, actionError, refresh } =
  useNotifications('landlord')
const recentItems = computed(() => inboxItems.value.slice(0, 10))
const badge = computed(() => notificationBadge(unreadCount.value))

function onOpen(value: boolean): void {
  open.value = value
  if (value) {
    now.value = Date.now()
    void refresh()
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
        :aria-label="unreadCount ? `通知，${unreadCount} 則未讀` : '通知'"
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
      <p v-else-if="recentItems.length === 0" class="px-4 py-8 text-center text-sm text-[#778078]">
        目前沒有通知
      </p>
      <div v-else class="max-h-[min(32rem,70vh)] overflow-y-auto p-1.5">
        <DropdownMenuItem
          v-for="item in recentItems"
          :key="item.key"
          class="my-1 block border-l-[3px] px-3 py-3 focus:bg-[#edf2e9] data-[highlighted]:bg-[#edf2e9]"
          :class="item.read ? 'border-transparent' : 'border-[#5b8263] bg-[#edf2e9]/60'"
          @select.prevent="selectItem(item)"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold">
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
    </DropdownMenuContent>
  </DropdownMenu>
</template>
