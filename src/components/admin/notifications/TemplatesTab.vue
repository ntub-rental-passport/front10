<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import SendNotificationDialog from '@/src/components/admin/notifications/SendNotificationDialog.vue'
import { useExpandedRows } from '@/src/composables/admin/useExpandedRows'
import { useAdminNotifications } from '@/src/composables/admin/useAdminNotifications'
import { extractVariables } from '@/src/utils/notif-template'
import { formatDateTime } from '@/src/utils/admin-format'
import type { NotifCategory, NotifChannel, NotifTemplate } from '@/src/mocks/admin-seed'

const { templates, saveTemplate, removeTemplate, toggleTemplate } = useAdminNotifications()
const { isExpanded, toggle } = useExpandedRows()

const variablesOf = (item: NotifTemplate) => extractVariables(`${item.title} ${item.body}`)

const channelLabels: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

const CHANNEL_OPTIONS: { key: NotifChannel; label: string }[] = [
  { key: 'inapp', label: '站內' },
  { key: 'email', label: 'Email' },
  { key: 'push', label: '推播' },
]

const CATEGORY_OPTIONS: NotifCategory[] = ['系統', '租約', '補貼', '帳務']

/* -------------------- 編輯 Dialog -------------------- */

const dialogOpen = ref(false)
const deleteTarget = ref<NotifTemplate | null>(null)

interface DraftState {
  id?: string
  name: string
  category: NotifCategory
  channels: NotifChannel[]
  title: string
  body: string
  enabled: boolean
}

function emptyDraft(): DraftState {
  return {
    name: '',
    category: '系統',
    channels: [],
    title: '',
    body: '',
    enabled: true,
  }
}

const draft = ref<DraftState>(emptyDraft())

function channelOn(channel: NotifChannel): boolean {
  return draft.value.channels.includes(channel)
}

function setChannel(channel: NotifChannel, on: boolean): void {
  if (on) {
    if (!draft.value.channels.includes(channel)) draft.value.channels.push(channel)
  } else {
    draft.value.channels = draft.value.channels.filter((item) => item !== channel)
  }
}

const draftVariables = computed(() => extractVariables(`${draft.value.title} ${draft.value.body}`))

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: NotifTemplate): void {
  draft.value = {
    id: item.id,
    name: item.name,
    category: item.category,
    channels: [...item.channels],
    title: item.title,
    body: item.body,
    enabled: item.enabled,
  }
  dialogOpen.value = true
}

function submit(): void {
  saveTemplate({
    id: draft.value.id,
    name: draft.value.name,
    category: draft.value.category,
    channels: draft.value.channels,
    title: draft.value.title,
    body: draft.value.body,
    enabled: draft.value.enabled,
  })
  dialogOpen.value = false
}

const canSubmit = () =>
  draft.value.name.trim() !== '' &&
  draft.value.title.trim() !== '' &&
  draft.value.body.trim() !== '' &&
  draft.value.channels.length > 0

function confirmDelete(): void {
  if (deleteTarget.value) removeTemplate(deleteTarget.value.id)
  deleteTarget.value = null
}

/* -------------------- 發送 Dialog -------------------- */
// 實際的發送流程（含二次確認）搬進 SendNotificationDialog，這裡只保留「點哪一列的發送」的狀態。

const sendTarget = ref<NotifTemplate | null>(null)
const sendDialogOpen = ref(false)
const sentMessage = ref('')

function openSend(item: NotifTemplate): void {
  sendTarget.value = item
  sentMessage.value = ''
  sendDialogOpen.value = true
}

function onSent(payload: { count: number; recipientNames: string[] }): void {
  sentMessage.value = `已成功發送給 ${payload.count} 位使用者。`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p v-if="sentMessage" class="text-sm font-medium text-emerald-600">{{ sentMessage }}</p>
      <span v-else />
      <Button @click="openCreate">新增模板</Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名稱</TableHead>
          <TableHead>分類</TableHead>
          <TableHead>管道</TableHead>
          <TableHead>狀態</TableHead>
          <TableHead>更新時間</TableHead>
          <TableHead class="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-for="item in templates" :key="item.id">
          <TableRow
            :class="['cursor-pointer', !item.enabled && 'opacity-55']"
            @click="toggle(item.id)"
          >
            <TableCell class="font-medium">
              <div class="flex items-center gap-2">
                <component
                  :is="isExpanded(item.id) ? ChevronDown : ChevronRight"
                  class="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span>{{ item.name }}</span>
              </div>
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">{{ item.category }}</TableCell>
            <TableCell>
              <div class="flex flex-wrap gap-1">
                <Badge v-for="ch in item.channels" :key="ch" variant="secondary">
                  {{ channelLabels[ch] }}
                </Badge>
              </div>
            </TableCell>
            <TableCell>
              <Badge :variant="item.enabled ? 'default' : 'secondary'">
                {{ item.enabled ? '已啟用' : '已停用' }}
              </Badge>
            </TableCell>
            <TableCell class="text-sm text-muted-foreground">
              {{ formatDateTime(item.updatedAt) }}
            </TableCell>
            <TableCell class="text-right" @click.stop>
              <AdminRowActions
                :actions="[
                  { label: '編輯', onSelect: () => openEdit(item) },
                  { label: item.enabled ? '停用' : '啟用', onSelect: () => toggleTemplate(item.id) },
                  { label: '刪除', danger: true, onSelect: () => (deleteTarget = item) },
                ]"
              >
                <Button size="sm" @click="openSend(item)">發送</Button>
              </AdminRowActions>
            </TableCell>
          </TableRow>

          <TableRow v-if="isExpanded(item.id)" class="hover:bg-transparent">
            <TableCell colspan="6" class="bg-muted/30">
              <p class="mb-1 text-xs font-medium text-muted-foreground">標題</p>
              <p class="text-sm font-medium">{{ item.title }}</p>
              <p class="mb-1 mt-3 text-xs font-medium text-muted-foreground">內文</p>
              <p class="whitespace-pre-wrap text-sm text-muted-foreground">{{ item.body }}</p>
              <div v-if="variablesOf(item).length > 0" class="mt-3 flex flex-wrap items-center gap-1">
                <span class="mr-1 text-xs font-medium text-muted-foreground">變數</span>
                <Badge v-for="name in variablesOf(item)" :key="name" variant="outline">
                  {{ name }}
                </Badge>
              </div>
            </TableCell>
          </TableRow>
        </template>

        <TableRow v-if="templates.length === 0">
          <TableCell colspan="6" class="py-8 text-center text-muted-foreground">尚無通知模板。</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- 編輯 / 新增 Dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯模板' : '新增模板' }}</DialogTitle>
          <DialogDescription>以雙大括號包住欄位名稱即可標記標題與內文中的動態變數。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="nt-name">名稱</Label>
            <Input id="nt-name" v-model="draft.name" />
          </div>
          <div class="space-y-2">
            <Label>分類</Label>
            <Select v-model="draft.category">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="cat in CATEGORY_OPTIONS" :key="cat" :value="cat">{{ cat }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label class="mb-0">管道</Label>
            <div class="grid grid-cols-3 gap-3">
              <div
                v-for="ch in CHANNEL_OPTIONS"
                :key="ch.key"
                class="flex items-center justify-between rounded-xl border px-3 py-2"
              >
                <Label class="mb-0">{{ ch.label }}</Label>
                <Switch
                  :model-value="channelOn(ch.key)"
                  @update:model-value="(v: boolean) => setChannel(ch.key, v)"
                />
              </div>
            </div>
          </div>
          <div class="space-y-2">
            <Label for="nt-title">標題</Label>
            <Input id="nt-title" v-model="draft.title" />
          </div>
          <div class="space-y-2">
            <Label for="nt-body">內文</Label>
            <Textarea id="nt-body" v-model="draft.body" rows="4" />
          </div>
          <div class="space-y-2">
            <Label class="mb-0">偵測到的變數</Label>
            <div v-if="draftVariables.length > 0" class="flex flex-wrap gap-1">
              <Badge v-for="name in draftVariables" :key="name" variant="outline">{{ name }}</Badge>
            </div>
            <p v-else class="text-sm text-muted-foreground">未使用變數</p>
          </div>
          <div class="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label class="mb-0">啟用</Label>
            <Switch v-model="draft.enabled" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 發送 Dialog：實際流程在 SendNotificationDialog，這裡只負責帶入鎖定的模板 -->
    <SendNotificationDialog v-model:open="sendDialogOpen" :template="sendTarget" @sent="onSent" />

    <!-- 刪除確認 Dialog -->
    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除模板？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.name }}」將被永久刪除，無法復原。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
