<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { useAdminNotifications } from '@/src/composables/admin/useAdminNotifications'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { groupIntoBatches, singleRecipientOf, type NotifBatch } from '@/src/utils/notif-batch'
import { formatDateTime } from '@/src/utils/admin-format'
import {
  batchChannelStats,
  batchReadStat,
  channelBadgeClass,
  channelBadgeText,
} from '@/src/utils/notif-stats'

const router = useRouter()
const { messages } = useAdminNotifications()
const { users } = useAdminUsers()

// 一次發送一列。逐筆展開會讓一次 57 人的群發塞滿整頁，把先前的紀錄推出視野；
// 想看細節（收件人清單、已讀比例）改進批次詳情頁，這裡的列只負責讓人找到那一次發送。
const batches = computed(() => groupIntoBatches(messages.value))

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>通知</TableHead>
          <TableHead class="w-24">人數</TableHead>
          <TableHead class="w-28">已讀</TableHead>
          <TableHead class="w-72">投遞狀態</TableHead>
          <TableHead class="w-48">發送時間</TableHead>
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
          <TableCell>{{ batch.recipients.length }} 人</TableCell>

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

          <TableCell>
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
          <TableCell class="text-sm text-muted-foreground">
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
