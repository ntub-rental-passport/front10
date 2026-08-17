<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Switch } from '@/components/ui/switch/index'
import { Textarea } from '@/components/ui/textarea/index'
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
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { formatDate } from '@/src/utils/admin-format'
import type { Announcement, AnnouncementAudience, AnnouncementLevel } from '@/src/mocks/admin/content'

const { announcements, saveAnnouncement, removeAnnouncement } = useAdminContent()

const levelLabels: Record<AnnouncementLevel, string> = {
  info: '一般',
  warning: '注意',
  urgent: '緊急',
}

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: '全部',
  tenant: '租客',
  landlord: '房東',
}

const dialogOpen = ref(false)
const deleteTarget = ref<Announcement | null>(null)

interface DraftState {
  id?: string
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  published: boolean
  startAt: string
  endAt: string
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString()
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return {
    title: '',
    body: '',
    level: 'info',
    audience: 'all',
    published: true,
    startAt: toDateInput(new Date().toISOString()),
    endAt: '',
  }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: Announcement): void {
  draft.value = {
    id: item.id,
    title: item.title,
    body: item.body,
    level: item.level,
    audience: item.audience,
    published: item.published,
    startAt: toDateInput(item.startAt),
    endAt: item.endAt ? toDateInput(item.endAt) : '',
  }
  dialogOpen.value = true
}

function submit(): void {
  saveAnnouncement({
    id: draft.value.id,
    title: draft.value.title,
    body: draft.value.body,
    level: draft.value.level,
    audience: draft.value.audience,
    published: draft.value.published,
    startAt: fromDateInput(draft.value.startAt),
    endAt: draft.value.endAt ? fromDateInput(draft.value.endAt) : null,
  })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeAnnouncement(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.title.trim() !== '' && draft.value.body.trim() !== '' && draft.value.startAt !== ''
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <Button @click="openCreate">新增公告</Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>標題</TableHead>
          <TableHead>等級</TableHead>
          <TableHead>受眾</TableHead>
          <TableHead>狀態</TableHead>
          <TableHead>生效期間</TableHead>
          <TableHead class="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="item in announcements" :key="item.id">
          <TableCell class="font-medium">{{ item.title }}</TableCell>
          <TableCell>{{ levelLabels[item.level] }}</TableCell>
          <TableCell>
            <Badge variant="outline">{{ audienceLabels[item.audience] }}</Badge>
          </TableCell>
          <TableCell>
            <Badge :variant="item.published ? 'default' : 'secondary'">
              {{ item.published ? '已發布' : '未發布' }}
            </Badge>
          </TableCell>
          <TableCell class="text-sm text-muted-foreground">
            {{ formatDate(item.startAt) }} ～ {{ item.endAt ? formatDate(item.endAt) : '長期' }}
          </TableCell>
          <TableCell class="text-right">
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
              <Button variant="destructive" size="sm" @click="deleteTarget = item">刪除</Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-if="announcements.length === 0">
          <TableCell colspan="6" class="py-8 text-center text-muted-foreground">尚無公告。</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯公告' : '新增公告' }}</DialogTitle>
          <DialogDescription>公告會顯示在使用者工作區頂端。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="an-title">標題</Label>
            <Input id="an-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="an-body">內容</Label>
            <Textarea id="an-body" v-model="draft.body" rows="3" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>等級</Label>
              <Select v-model="draft.level">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">一般</SelectItem>
                  <SelectItem value="warning">注意</SelectItem>
                  <SelectItem value="urgent">緊急</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>受眾</Label>
              <Select v-model="draft.audience">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="tenant">租客</SelectItem>
                  <SelectItem value="landlord">房東</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label class="mb-0">發布</Label>
            <Switch v-model="draft.published" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="an-start">開始日</Label>
              <Input id="an-start" v-model="draft.startAt" type="date" />
            </div>
            <div class="space-y-2">
              <Label for="an-end">結束日（可留空）</Label>
              <Input id="an-end" v-model="draft.endAt" type="date" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除公告？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.title }}」將被永久刪除，無法復原。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
