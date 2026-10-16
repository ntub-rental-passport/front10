<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Label } from '@/components/ui/label/index'
import { Switch } from '@/components/ui/switch/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import {
  followPendingEmails,
  loadMessages,
  useAdminNotifications,
  TEST_SOURCE_LABEL,
} from '@/src/composables/admin/useAdminNotifications'
import { useAdminDirectory } from '@/src/composables/admin/useAdminDirectory'
import { groupIntoBatches, singleRecipientOf, type NotifBatch } from '@/src/utils/notif-batch'
import { formatDateTime } from '@/src/utils/admin-format'
import {
  batchChannelStats,
  batchReadStat,
  channelBadgeClass,
  channelBadgeText,
  excludeTestBatches,
  isTestBatch,
} from '@/src/utils/notif-stats'

const router = useRouter()
const { messages, messagesState } = useAdminNotifications()

// Email 在後端背景寄，每次打開都重讀一次，才看得到「待送」變成「已寄出」或「失敗」
onMounted(() => {
  if (messagesState.value === 'ready') void loadMessages().then(() => followPendingEmails())
})
const { rows: directoryRows } = useAdminDirectory()

const allBatches = computed(() => groupIntoBatches(messages.value))

const showTests = ref(false)
const testCount = computed(
  () => allBatches.value.filter((batch) => isTestBatch(batch, TEST_SOURCE_LABEL)).length,
)
const batches = computed(() =>
  showTests.value ? allBatches.value : excludeTestBatches(allBatches.value, TEST_SOURCE_LABEL),
)

function recipientSummary(batch: NotifBatch): string {
  const single = singleRecipientOf(batch)
  if (!single) return `${batch.recipientLabel} · ${batch.category}`
  const name = directoryRows.value.find((row) => row.user.email === single.userEmail)?.user.nickname
  return name ? `${name}（${single.userEmail}） · ${batch.category}` : `${single.userEmail} · ${batch.category}`
}

function openDetail(batch: NotifBatch): void {
  void router.push(`/admin/notifications/${batch.batchId}`)
}
</script>

<template>
  <div class="space-y-4">
    <AdminLoadNotice :state="messagesState" what="發送紀錄" @retry="loadMessages" />
    <div v-if="testCount > 0" class="flex items-center justify-end gap-2 text-sm">
      <Label for="show-tests" class="mb-0 text-foreground/70">
        顯示測試發送（{{ testCount }} 筆）
      </Label>
      <Switch id="show-tests" v-model="showTests" />
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="min-w-[10rem]">通知</TableHead>
          <TableHead class="w-24 whitespace-nowrap">人數</TableHead>
          <TableHead class="w-28 whitespace-nowrap">已讀</TableHead>
          <TableHead class="w-72 whitespace-nowrap">投遞狀態</TableHead>
          <TableHead class="w-48 whitespace-nowrap">發送時間</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="batch in batches"
          :key="batch.batchId"
          class="cursor-pointer"
          @click="openDetail(batch)"
        >
          <TableCell>
            <span class="font-medium">{{ batch.title }}</span>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ recipientSummary(batch) }}</p>
          </TableCell>
          <TableCell class="whitespace-nowrap">{{ batch.recipients.length }} 人</TableCell>

          <!-- 只有站內通知有已讀資料，Email 與推播沒有開信追蹤。 -->
          <TableCell class="whitespace-nowrap text-sm">
            <span class="font-medium tabular-nums">{{ batchReadStat(batch).read }}</span>
            <span class="text-foreground/70"> / {{ batchReadStat(batch).total }}</span>
            <span class="ml-1 text-xs text-foreground/70">站內</span>
          </TableCell>

          <TableCell class="whitespace-nowrap">
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="stat in batchChannelStats(batch)"
                :key="stat.channel"
                variant="outline"
                :class="channelBadgeClass(stat)"
              >
                {{ channelBadgeText(stat) }}
              </Badge>
            </div>
          </TableCell>
          <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
            {{ formatDateTime(batch.createdAt) }}
          </TableCell>
        </TableRow>

        <TableRow v-if="batches.length === 0 && messagesState === 'ready'">
          <TableCell colspan="5" class="py-8 text-center text-foreground/70">
            尚無發送紀錄。
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
