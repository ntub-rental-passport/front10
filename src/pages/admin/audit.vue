<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
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
import { ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-vue-next'
import { useAuditLog } from '@/src/composables/admin/useAuditLog'
import { AUDIT_ACTION_TYPES } from '@/src/mocks/admin-seed'
import { formatDateTime } from '@/src/utils/admin-format'
import { buildAuditCsv } from '@/src/utils/admin-audit-csv'
import {
  AUDIT_SOURCE_LABELS,
  SYSTEM_ACTOR,
  actorLabel,
  emptyAuditFilter,
  filterAuditRows,
  isAuditFilterActive,
} from '@/src/utils/admin-audit-sources'
import { paginate } from '@/src/utils/admin-user-list'
import { dateKey } from '@/src/utils/date-key'

const { rows, loading, serverFailed } = useAuditLog()

const filter = reactive(emptyAuditFilter())
const filterActive = computed(() => isAuditFilterActive(filter))

function clearFilter(): void {
  Object.assign(filter, emptyAuditFilter())
}

const filteredRows = computed(() => filterAuditRows(rows.value, filter))

const page = ref(1)
const pageData = computed(() => paginate(filteredRows.value, page.value))
watch(filter, () => (page.value = 1), { deep: true })

function goToPage(target: number): void {
  page.value = target
}

/** 匯出 CSV 時加上 BOM，避免 Excel 將 UTF-8 中文誤判編碼。 */
function exportCsv(): void {
  const csv = buildAuditCsv(
    filteredRows.value.map((row) => ({
      ...row,
      actor: actorLabel(row.actor),
      source: AUDIT_SOURCE_LABELS[row.source],
    })),
    formatDateTime,
  )
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `audit-${dateKey(new Date())}.csv`
  link.click()

  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <Card class="rounded-3xl">
      <CardContent class="space-y-4 px-5 pb-5 pt-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="relative min-w-56 flex-1">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="filter.keyword" placeholder="搜尋操作者、對象或詳情" class="pl-9" />
          </div>
          <Select v-model="filter.action">
            <SelectTrigger class="w-40">
              <SelectValue placeholder="動作類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部動作</SelectItem>
              <SelectItem v-for="action in AUDIT_ACTION_TYPES" :key="action" :value="action">
                {{ action }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="space-y-1">
            <Label for="audit-from" class="text-xs text-muted-foreground">起始日</Label>
            <Input id="audit-from" v-model="filter.fromDate" type="date" class="w-40" />
          </div>
          <div class="space-y-1">
            <Label for="audit-to" class="text-xs text-muted-foreground">結束日</Label>
            <Input id="audit-to" v-model="filter.toDate" type="date" class="w-40" />
          </div>
          <Button variant="outline" class="ml-auto" @click="exportCsv">
            <Download class="mr-1 h-4 w-4" />
            匯出 CSV
          </Button>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <Button v-if="filterActive" variant="outline" size="sm" @click="clearFilter">
            <X class="mr-1 h-3.5 w-3.5" />
            清除篩選
          </Button>
          <p class="whitespace-nowrap text-sm text-muted-foreground">
            共 {{ filteredRows.length }} 筆
            <span v-if="loading">（伺服器紀錄讀取中…）</span>
          </p>
          <!-- 後端稽核紀錄由所有管理員共用；展示模組的操作只存在本機瀏覽器。 -->
          <p class="ml-auto text-xs text-muted-foreground">
            帳號、系統設定、功能停用、公告與輪播、通知模板、排程通知、管理員登入與服務狀態的紀錄保存在伺服器，所有管理員看到同一份；其他操作只存在這台瀏覽器。
          </p>
        </div>

        <p
          v-if="serverFailed && !loading"
          class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          讀不到後端的紀錄，下面只有這台瀏覽器裡的操作。
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-44 whitespace-nowrap">時間</TableHead>
              <TableHead class="whitespace-nowrap">操作者</TableHead>
              <TableHead class="whitespace-nowrap">動作</TableHead>
              <TableHead class="whitespace-nowrap">對象</TableHead>
              <TableHead class="whitespace-nowrap">詳情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="row in pageData.items" :key="row.id">
              <TableCell class="whitespace-nowrap tabular-nums text-muted-foreground">
                {{ formatDateTime(row.at) }}
              </TableCell>
              <TableCell :class="row.actor === SYSTEM_ACTOR ? 'text-foreground/70' : 'font-medium'">
                {{ actorLabel(row.actor) }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="whitespace-nowrap">{{ row.action }}</Badge>
              </TableCell>
              <TableCell>{{ row.target }}</TableCell>
              <TableCell class="text-muted-foreground">
                {{ row.detail }}
              </TableCell>
            </TableRow>
            <TableRow v-if="pageData.total === 0">
              <TableCell colspan="5" class="py-8 text-center text-muted-foreground">
                {{ loading ? '讀取中…' : filterActive ? '沒有符合條件的紀錄。' : '目前沒有任何紀錄。' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div v-if="pageData.total > 0" class="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p class="text-muted-foreground">
            第 {{ pageData.from }}–{{ pageData.to }} 筆，共 {{ pageData.total }} 筆
          </p>
          <div v-if="pageData.pageCount > 1" class="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              :disabled="pageData.page <= 1"
              @click="goToPage(pageData.page - 1)"
            >
              <ChevronLeft class="mr-1 h-4 w-4" />
              上一頁
            </Button>
            <span class="px-2 tabular-nums">{{ pageData.page }} / {{ pageData.pageCount }}</span>
            <Button
              variant="outline"
              size="sm"
              :disabled="pageData.page >= pageData.pageCount"
              @click="goToPage(pageData.page + 1)"
            >
              下一頁
              <ChevronRight class="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
