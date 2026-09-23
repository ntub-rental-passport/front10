<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { CalendarClock, Info, RefreshCw } from 'lucide-vue-next'
import StatusDot from '@/src/components/admin/StatusDot.vue'
import { useNow } from '@/src/composables/useNow'
import { formatDateTime } from '@/src/utils/admin-format'
import {
  SCHEDULE_STATUS_HINT,
  SCHEDULE_STATUS_LABEL,
  SCHEDULE_STATUS_TONE,
  canCancel,
  scheduleLeadText,
  scheduleResultText,
  type ScheduledNotif,
} from '@/src/utils/notif-schedule'
import {
  cancelScheduled,
  listScheduled,
  type ScheduleCapabilities,
} from '@/src/services/scheduledNotificationApi'

/**
 * 排程發送。這一頁是整個通知功能裡唯一真的靠後端的部分 ——
 * 後端每 20 秒醒來一次，到時間就真的寄出 Email，不需要有人開著後台。
 */

const router = useRouter()
const now = useNow()

const items = ref<ScheduledNotif[]>([])
const capabilities = ref<ScheduleCapabilities | null>(null)
const loading = ref(true)
/**
 * 連不上後端跟「沒有排程」必須是兩種畫面。
 * 後端掛掉時顯示「目前沒有排程」，等於告訴管理員「你排的東西不見了」。
 */
const unavailable = ref(false)
const actionError = ref('')

let controller: AbortController | undefined

async function refresh(): Promise<void> {
  controller?.abort()
  controller = new AbortController()
  const listing = await listScheduled(controller.signal)
  loading.value = false
  if (!listing) {
    unavailable.value = true
    return
  }
  unavailable.value = false
  items.value = listing.items
  capabilities.value = listing.capabilities
}

void refresh()

// 每到整分重新讀一次：後端每 20 秒送一批，狀態會自己往前走，
// 畫面不跟著更新的話會停在「待送出」而其實早就寄出去了。
watch(now, () => void refresh())

onBeforeUnmount(() => controller?.abort())

const unsupported = computed(() => {
  const reasons = capabilities.value?.unsupportedReason ?? {}
  const labels: Record<string, string> = { inapp: '站內', push: '推播' }
  return Object.entries(reasons).map(([key, reason]) => ({
    label: labels[key] ?? key,
    reason,
  }))
})

async function onCancel(item: ScheduledNotif): Promise<void> {
  actionError.value = ''
  try {
    await cancelScheduled(item.id)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '取消失敗。'
  }
  await refresh()
}

</script>

<template>
  <div class="space-y-4">
    <!--
      這段說明不是裝飾。排程跟「立即發送」走的是完全不同的路徑（後端 vs 瀏覽器），
      能送的管道也不一樣，不講清楚的話管理員會以為兩者一樣。
    -->
    <div class="rounded-xl border border-border bg-muted/30 p-4">
      <div class="flex items-start gap-3">
        <Info class="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
        <div class="space-y-1.5 text-sm">
          <p class="font-medium">排程由後端執行，不需要開著後台。</p>
          <p class="text-foreground/70">
            到了預定時間，後端會自己把 Email 寄出去 —— 半夜、沒人登入的時候都算數。
          </p>
          <p v-for="row in unsupported" :key="row.label" class="text-foreground/70">
            <span class="font-medium text-foreground">{{ row.label }}不支援排程：</span>
            {{ row.reason }}
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <p v-if="actionError" class="text-sm font-medium text-destructive">{{ actionError }}</p>
      <Button variant="outline" size="sm" class="ml-auto" @click="refresh">
        <RefreshCw class="mr-2 h-4 w-4" />
        重新整理
      </Button>
      <!-- 跟立即發送共用同一個編輯器，只是預設落在「排程」 -->
      <Button
        :disabled="unavailable"
        @click="router.push({ path: '/admin/notifications/compose', query: { when: 'schedule' } })"
      >
        <CalendarClock class="mr-2 h-4 w-4" />
        排程發送
      </Button>
    </div>

    <!-- 連不上後端：明講是連線問題，不要偽裝成空清單 -->
    <div
      v-if="unavailable"
      class="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-sm"
    >
      <p class="font-medium">讀不到排程清單。</p>
      <p class="mt-1 text-foreground/70">
        可能是後端沒有啟動，或是登入狀態已失效。這不代表你排的通知不見了 ——
        排程存在後端，重新連上之後會照常出現。
      </p>
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>通知</TableHead>
          <TableHead class="w-32">對象</TableHead>
          <TableHead class="w-56">預定時間</TableHead>
          <TableHead class="w-44">狀態</TableHead>
          <TableHead class="w-24 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in items" :key="item.id">
          <TableCell>
            <p class="font-medium">{{ item.title }}</p>
            <p class="text-xs text-foreground/70">{{ item.sourceLabel }} · {{ item.category }}</p>
          </TableCell>

          <TableCell class="whitespace-nowrap text-sm">{{ item.recipientLabel }}</TableCell>

          <TableCell class="whitespace-nowrap text-sm">
            {{ formatDateTime(item.scheduledAt) }}
            <span
              v-if="item.status === 'pending'"
              class="ml-1 text-xs text-foreground/70"
            >（{{ scheduleLeadText(item.scheduledAt, now) }}）</span>
          </TableCell>

          <TableCell>
            <StatusDot
              :tone="SCHEDULE_STATUS_TONE[item.status]"
              :label="SCHEDULE_STATUS_LABEL[item.status]"
            />
            <p v-if="scheduleResultText(item)" class="mt-0.5 text-xs text-foreground/70">
              {{ scheduleResultText(item) }}
            </p>
            <p v-if="SCHEDULE_STATUS_HINT[item.status]" class="mt-0.5 text-xs text-foreground/70">
              {{ SCHEDULE_STATUS_HINT[item.status] }}
            </p>
          </TableCell>

          <TableCell class="text-right">
            <Button
              v-if="canCancel(item.status)"
              variant="outline"
              size="sm"
              @click="onCancel(item)"
            >
              取消
            </Button>
            <span v-else class="text-xs text-foreground/70">—</span>
          </TableCell>
        </TableRow>

        <TableRow v-if="!loading && items.length === 0">
          <TableCell colspan="5" class="py-8 text-center text-foreground/70">
            目前沒有排程。按右上角「排程發送」可以指定時間寄出 Email。
          </TableCell>
        </TableRow>
        <TableRow v-else-if="loading">
          <TableCell colspan="5" class="py-8 text-center text-foreground/70">讀取中…</TableCell>
        </TableRow>
      </TableBody>
    </Table>

  </div>
</template>
