<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { useAdminNotifications, TEST_SOURCE_LABEL } from '@/src/composables/admin/useAdminNotifications'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
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
const { messages } = useAdminNotifications()
const { users } = useAdminUsers()

// 一次發送一列。逐筆展開會讓一次 57 人的群發塞滿整頁，把先前的紀錄推出視野；
// 想看細節（收件人清單、已讀比例）改進批次詳情頁，這裡的列只負責讓人找到那一次發送。
const allBatches = computed(() => groupIntoBatches(messages.value))

// 測試發送預設不顯示，但資料還在 —— 哪天有人問「這封怎麼來的」查得到。
const showTests = ref(false)
const testCount = computed(
  () => allBatches.value.filter((batch) => isTestBatch(batch, TEST_SOURCE_LABEL)).length,
)
const batches = computed(() =>
  showTests.value ? allBatches.value : excludeTestBatches(allBatches.value, TEST_SOURCE_LABEL),
)

/**
 * 單人批次直接顯示收件人是誰，而不是「1 人 · 指定使用者」——
 * 聚合成批次原本是為了不讓群發塞滿頁面，但單人發送本來就該一眼看出發給誰。
 */
function recipientSummary(batch: NotifBatch): string {
  const single = singleRecipientOf(batch)
  if (!single) return `${batch.recipientLabel} · ${batch.category}`
  const name = users.value.find((user) => user.email === single.userEmail)?.nickname
  return name ? `${name}（${single.userEmail}） · ${batch.category}` : `${single.userEmail} · ${batch.category}`
}

function openDetail(batch: NotifBatch): void {
  void router.push(`/admin/notifications/${batch.batchId}`)
}
</script>

<template>
  <div class="space-y-4">
    <!-- 有測試發送才出現這一行；平常不要多一個永遠用不到的開關 -->
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

          <!--
            已讀是真實資料：UserNotification.read 是真欄位，租客端的 markRead
            真的會寫入。只有站內算得出來 —— Email 與推播沒有開信追蹤，
            所以文案寫「站內」而不是籠統的「已讀」。
          -->
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

        <TableRow v-if="batches.length === 0">
          <TableCell colspan="5" class="py-8 text-center text-foreground/70">
            尚無發送紀錄。
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
