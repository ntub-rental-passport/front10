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
import type { NotifChannel } from '@/src/mocks/admin-seed'

const { messages } = useAdminNotifications()

const channelLabels: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
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
              <Badge v-for="ch in item.channels" :key="ch" variant="secondary">
                {{ channelLabels[ch] }}
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
  </div>
</template>
