<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Bell } from 'lucide-vue-next'
import { useNotifications } from '@/src/composables/useNotifications'
import { notificationBadge } from '@/src/utils/notification-bell'

const { unreadCount } = useNotifications('tenant')
const badge = computed(() => notificationBadge(unreadCount.value))
</script>

<template>
  <RouterLink
    to="/app/notifications"
    :aria-label="unreadCount > 0 ? `通知中心，${unreadCount} 則未讀` : '通知中心'"
    class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Bell class="h-5 w-5" aria-hidden="true" />
    <span
      v-if="badge"
      class="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
      aria-hidden="true"
    >
      {{ badge }}
    </span>
  </RouterLink>
</template>
