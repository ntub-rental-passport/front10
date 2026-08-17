<script setup lang="ts">
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
import { formatDateTime } from '@/src/utils/admin-format'
import type { NotifChannel, NotifDeliveryStatus } from '@/src/mocks/admin-seed'

const { messages } = useAdminNotifications()

const channelLabels: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

// pending 用灰底低對比樣式，讓它一眼就跟真的已送達區分開來——
// 後端還沒接上 Email／推播，這裡不能讓管道 Badge 看起來像已經寄出去了。
function channelBadgeClass(status: NotifDeliveryStatus | undefined): string {
  if (status === 'sent') return ''
  return 'border-dashed bg-muted/50 text-muted-foreground'
}
</script>

<template>
  <div class="space-y-4">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>收件人</TableHead>
          <TableHead>標題</TableHead>
          <TableHead>分類</TableHead>
          <TableHead>管道</TableHead>
          <TableHead>時間</TableHead>
          <TableHead>狀態</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in messages" :key="item.id">
          <TableCell class="font-medium">{{ item.userEmail }}</TableCell>
          <TableCell>{{ item.title }}</TableCell>
          <TableCell><Badge variant="secondary">{{ item.category }}</Badge></TableCell>
          <TableCell>
            <div class="flex flex-wrap gap-1">
              <Badge
                v-for="ch in item.channels"
                :key="ch"
                :variant="item.deliveryStatus[ch] === 'sent' ? 'secondary' : 'outline'"
                :class="channelBadgeClass(item.deliveryStatus[ch])"
              >
                {{ channelLabels[ch] }}
                <span v-if="item.deliveryStatus[ch] !== 'sent'">・待接通</span>
              </Badge>
            </div>
          </TableCell>
          <TableCell class="text-sm text-muted-foreground">{{ formatDateTime(item.createdAt) }}</TableCell>
          <TableCell>
            <Badge :variant="item.read ? 'secondary' : 'default'">{{ item.read ? '已讀' : '未讀' }}</Badge>
          </TableCell>
        </TableRow>
        <TableRow v-if="messages.length === 0">
          <TableCell colspan="6" class="py-8 text-center text-muted-foreground">尚無發送紀錄。</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- 圖例：管道狀態不是自明的，尤其 pending 容易被誤讀成失敗，這裡明講原因 -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <Badge variant="secondary">站內</Badge>
        已送達
      </span>
      <span class="flex items-center gap-1.5">
        <Badge variant="outline" class="border-dashed bg-muted/50 text-muted-foreground">Email・待接通</Badge>
        後端尚未串接實際寄送服務，紀錄已建立但尚未真正送出
      </span>
    </div>
  </div>
</template>
