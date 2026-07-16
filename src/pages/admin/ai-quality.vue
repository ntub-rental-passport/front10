<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Star } from 'lucide-vue-next'
import {
  aiTypeLabels,
  needsReview,
  useAdminAiQuality,
} from '@/src/composables/admin/useAdminAiQuality'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AiOutputRecord } from '@/src/mocks/admin-seed'

const { records, stats, markReviewed } = useAdminAiQuality()

const reviewTarget = ref<AiOutputRecord | null>(null)
const reviewNote = ref('')

function openReview(record: AiOutputRecord): void {
  reviewTarget.value = record
  reviewNote.value = ''
}

function submitReview(): void {
  if (!reviewTarget.value) return
  markReviewed(reviewTarget.value.id, reviewNote.value)
  reviewTarget.value = null
  reviewNote.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">AI 產出品質監控</h1>
      <p class="mt-1 text-muted-foreground">
        追蹤契約分析與談判腳本的使用者評分；評分 2 分以下自動列為需人工複核。
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">平均評分</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.avgRating }} / 5</CardContent>
      </Card>
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">重新生成率</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.regenRate }}</CardContent>
      </Card>
      <Card class="rounded-[1.5rem]">
        <CardHeader class="pb-2"><CardTitle class="text-sm font-medium">低分率（≤2 分）</CardTitle></CardHeader>
        <CardContent class="text-3xl font-black">{{ stats.lowRate }}</CardContent>
      </Card>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>類型</TableHead>
              <TableHead>使用者</TableHead>
              <TableHead>評分</TableHead>
              <TableHead>重新生成</TableHead>
              <TableHead>建立時間</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="record in records" :key="record.id">
              <TableCell class="font-medium">{{ aiTypeLabels[record.type] }}</TableCell>
              <TableCell>{{ record.userEmail }}</TableCell>
              <TableCell>
                <span v-if="record.rating !== null" class="inline-flex items-center gap-1">
                  <Star class="h-4 w-4 fill-amber-400 text-amber-400" />
                  {{ record.rating }}
                </span>
                <span v-else class="text-muted-foreground">未評分</span>
              </TableCell>
              <TableCell>{{ record.regenerations }} 次</TableCell>
              <TableCell>{{ formatDateTime(record.createdAt) }}</TableCell>
              <TableCell>
                <Badge v-if="needsReview(record)" variant="destructive">需人工複核</Badge>
                <Badge v-else-if="record.reviewed" variant="default">已複核</Badge>
                <Badge v-else variant="secondary">正常</Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button
                  v-if="needsReview(record)"
                  variant="outline"
                  size="sm"
                  @click="openReview(record)"
                >
                  複核
                </Button>
                <span
                  v-else-if="record.reviewNote"
                  class="text-xs text-muted-foreground"
                  :title="record.reviewNote"
                >
                  備註：{{ record.reviewNote }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog
      :open="reviewTarget !== null"
      @update:open="(open: boolean) => { if (!open) reviewTarget = null }"
    >
      <DialogContent v-if="reviewTarget">
        <DialogHeader>
          <DialogTitle>人工複核</DialogTitle>
          <DialogDescription>
            {{ aiTypeLabels[reviewTarget.type] }}｜{{ reviewTarget.userEmail }}｜評分
            {{ reviewTarget.rating }}
          </DialogDescription>
        </DialogHeader>
        <Textarea v-model="reviewNote" rows="4" placeholder="複核備註（選填）：問題原因、後續處理" />
        <DialogFooter>
          <Button variant="outline" @click="reviewTarget = null">取消</Button>
          <Button @click="submitReview">標記已複核</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
