<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Card, CardContent } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Search } from 'lucide-vue-next'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AuditActionType } from '@/src/mocks/admin-seed'

const { events } = useAdminAudit()

const keyword = ref('')
const actionFilter = ref<'all' | AuditActionType>('all')
const fromDate = ref('')
const toDate = ref('')

const actionTypes: AuditActionType[] = [
  '登入',
  '使用者管理',
  '審核',
  '知識庫',
  'AI品質',
  '訂閱',
  '系統',
  '資料存取',
]

const filteredEvents = computed(() =>
  events.value.filter((event) => {
    if (actionFilter.value !== 'all' && event.action !== actionFilter.value) return false

    const text = keyword.value.trim().toLowerCase()
    if (text && !`${event.actor} ${event.target} ${event.detail}`.toLowerCase().includes(text)) return false

    if (fromDate.value && event.at < new Date(`${fromDate.value}T00:00:00`).toISOString()) {
      return false
    }
    if (toDate.value && event.at > new Date(`${toDate.value}T23:59:59.999`).toISOString()) {
      return false
    }
    return true
  }),
)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">稽核紀錄查詢</h1>
      <p class="mt-1 text-muted-foreground">
        所有管理操作、系統事件與資料存取紀錄；後台操作會即時寫入。
      </p>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="space-y-4 pt-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋操作者、對象或詳情" class="pl-9" />
          </div>
          <Select v-model="actionFilter">
            <SelectTrigger class="w-40">
              <SelectValue placeholder="動作類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部動作</SelectItem>
              <SelectItem v-for="action in actionTypes" :key="action" :value="action">
                {{ action }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="space-y-1">
            <Label for="audit-from" class="text-xs text-muted-foreground">起始日</Label>
            <Input id="audit-from" v-model="fromDate" type="date" class="w-40" />
          </div>
          <div class="space-y-1">
            <Label for="audit-to" class="text-xs text-muted-foreground">結束日</Label>
            <Input id="audit-to" v-model="toDate" type="date" class="w-40" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-44">時間</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>動作</TableHead>
              <TableHead>對象</TableHead>
              <TableHead>詳情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="event in filteredEvents" :key="event.id">
              <TableCell class="text-muted-foreground">{{ formatDateTime(event.at) }}</TableCell>
              <TableCell class="font-medium">{{ event.actor }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{ event.action }}</Badge>
              </TableCell>
              <TableCell>{{ event.target }}</TableCell>
              <TableCell class="text-muted-foreground">{{ event.detail }}</TableCell>
            </TableRow>
            <TableRow v-if="filteredEvents.length === 0">
              <TableCell colspan="5" class="py-8 text-center text-muted-foreground">
                沒有符合條件的紀錄。
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
