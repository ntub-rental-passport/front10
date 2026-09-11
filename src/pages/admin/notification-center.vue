<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Bell, MessageSquare, ShieldAlert } from 'lucide-vue-next'
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
import { Textarea } from '@/components/ui/textarea/index'
import { useAdminNotificationCenter } from '@/src/composables/admin/useAdminNotificationCenter'
import { adminNotifSourceLabels, type AdminNotifSource, type AdminNotification } from '@/src/mocks/admin/admin-notifications'
import { formatDateTime } from '@/src/utils/admin-format'
import { getAuthSession } from '@/src/composables/useAuth'

const { items, unreadCount, markRead, markAllRead, sendNote } = useAdminNotificationCenter()

const sourceIcons: Record<AdminNotifSource, typeof Bell> = {
  alert: ShieldAlert,
  'user-message': MessageSquare,
  'admin-note': Bell,
}

const sourceBadgeClass: Record<AdminNotifSource, string> = {
  alert: 'bg-red-50 text-red-700 border-red-200',
  'user-message': 'bg-blue-50 text-blue-700 border-blue-200',
  'admin-note': 'bg-violet-50 text-violet-700 border-violet-200',
}

function accentClass(item: AdminNotification): string {
  if (item.read) return ''
  if (item.source === 'alert') return 'border-l-destructive'
  if (item.source === 'user-message') return 'border-l-blue-500'
  return 'border-l-violet-500'
}

const noteDialogOpen = ref(false)
const noteTitle = ref('')
const noteBody = ref('')

function openNoteDialog(): void {
  noteTitle.value = ''
  noteBody.value = ''
  noteDialogOpen.value = true
}

function submitNote(): void {
  if (!noteTitle.value.trim() || !noteBody.value.trim()) return
  const session = getAuthSession()
  sendNote(noteTitle.value.trim(), noteBody.value.trim(), session?.nickname ?? session?.email ?? '管理員')
  noteDialogOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">通知中心</h1>
        <p class="text-muted-foreground">系統告警、使用者訊息與管理員內部備註。</p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="unreadCount > 0" variant="destructive">{{ unreadCount }} 則未讀</Badge>
        <Button variant="outline" size="sm" :disabled="unreadCount === 0" @click="markAllRead">
          全部已讀
        </Button>
        <Button size="sm" @click="openNoteDialog">發送備註</Button>
      </div>
    </div>

    <div
      v-if="items.length === 0"
      class="rounded-2xl border border-dashed p-10 text-center text-muted-foreground"
    >
      目前沒有任何通知。
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in items"
        :key="item.id"
        :class="[
          'rounded-2xl border p-4 transition-colors',
          item.read
            ? 'bg-card'
            : ['cursor-pointer border-l-4 bg-primary/5', accentClass(item)],
        ]"
        @click="markRead(item.id)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <component
              :is="sourceIcons[item.source]"
              class="h-4 w-4 shrink-0 text-muted-foreground"
            />
            <p
              :class="[
                'text-sm',
                item.read ? 'font-medium text-muted-foreground' : 'font-bold',
              ]"
            >
              {{ item.title }}
            </p>
          </div>
          <span class="text-xs text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" :class="sourceBadgeClass[item.source]">
            {{ adminNotifSourceLabels[item.source] }}
          </Badge>
          <span v-if="item.senderName" class="text-xs text-muted-foreground">
            來自 {{ item.senderName }}
          </span>
        </div>

        <p class="mt-2 text-sm text-muted-foreground">{{ item.body }}</p>

        <div v-if="item.actionUrl" class="mt-3">
          <Button variant="outline" size="sm" as-child class="gap-1.5">
            <RouterLink :to="item.actionUrl">
              {{ item.actionLabel ?? '查看詳情' }}
              <ArrowUpRight class="h-3.5 w-3.5" />
            </RouterLink>
          </Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="noteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>發送內部備註</DialogTitle>
          <DialogDescription>備註會出現在所有管理員的通知中心。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="note-title">標題</Label>
            <Input id="note-title" v-model="noteTitle" placeholder="簡述備註主旨" />
          </div>
          <div class="space-y-2">
            <Label for="note-body">內容</Label>
            <Textarea id="note-body" v-model="noteBody" rows="4" placeholder="詳細說明" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="noteDialogOpen = false">取消</Button>
          <Button :disabled="!noteTitle.trim() || !noteBody.trim()" @click="submitNote">送出</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
