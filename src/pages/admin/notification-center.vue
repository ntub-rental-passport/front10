<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Bell, MessageSquare, ShieldAlert, Undo2 } from 'lucide-vue-next'
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
import { adminNotifSourceLabels, type AdminNotifSource } from '@/src/mocks/admin/admin-notifications'
import { formatDateTime } from '@/src/utils/admin-format'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import {
  groupNotificationsByDay,
  matchesNotifFilter,
  NOTIF_SOURCE_ACCENT_CLASS,
  NOTIF_SOURCE_BADGE_CLASS,
  type NotifFilter,
} from '@/src/utils/admin-notification-center'
import { getAuthSession } from '@/src/composables/useAuth'

const { items, unreadCount, markRead, markUnread, markAllRead, sendNote } =
  useAdminNotificationCenter()

/**
 * 篩選。「未讀」不是來源、是跨來源的聚合，所以跟後面三顆來源頁籤分開放，
 * 並做得更大 —— 與工單頁的「待處理」、補貼頁的「待我處理」同一個作法。
 */
const filter = ref<NotifFilter>('unread')

const filtered = computed(() => items.value.filter((item) => matchesNotifFilter(item, filter.value)))

// 依日期分組：清單一長，「今天的還是上週的」比一個一個看時間戳快得多
const groups = computed(() => groupNotificationsByDay(filtered.value))

const sourceFilters: { value: NotifFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'alert', label: adminNotifSourceLabels.alert },
  { value: 'user-message', label: adminNotifSourceLabels['user-message'] },
  { value: 'admin-note', label: adminNotifSourceLabels['admin-note'] },
]

const sourceIcons: Record<AdminNotifSource, typeof Bell> = {
  alert: ShieldAlert,
  'user-message': MessageSquare,
  'admin-note': Bell,
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
    <!--
      左邊篩選、右邊動作。

      未讀數不再用 destructive 徽章：未讀既不是錯誤也不是危險，跟「系統告警」
      共用紅色會讓兩個紅講不同的事。數字改由「未讀」那顆頁籤承擔 ——
      那裡同時是計數與篩選入口，比一顆純顯示的徽章有用。
    -->
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <Tabs :model-value="filter" @update:model-value="(v: string) => (filter = v as NotifFilter)">
        <TabsList :class="ADMIN_TAB_LIST">
          <!-- 「未讀」是跨來源的聚合不是來源，做大並上主色，再用分隔線隔開 -->
          <TabsTrigger
            value="unread"
            class="rounded-full bg-primary/10 px-6 py-2.5 text-base font-semibold text-primary data-[state=active]:bg-primary-surface data-[state=active]:text-primary-surface-foreground data-[state=active]:shadow-sm"
          >
            未讀 {{ unreadCount }}
          </TabsTrigger>
          <div class="mx-2 h-4 w-px bg-border" aria-hidden="true" />
          <TabsTrigger
            v-for="tab in sourceFilters"
            :key="tab.value"
            :value="tab.value"
            :class="ADMIN_TAB_TRIGGER"
          >
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="unreadCount === 0" @click="markAllRead">
          全部已讀
        </Button>
        <Button size="sm" @click="openNoteDialog">發送備註</Button>
      </div>
    </div>

    <div
      v-if="filtered.length === 0"
      class="rounded-2xl border border-dashed p-10 text-center text-foreground/70"
    >
      {{ filter === 'unread' ? '沒有未讀通知。' : '這個篩選沒有符合的通知。' }}
    </div>

    <!-- 依日期分組（今天／昨天／更早），空的分組不會出現 -->
    <div v-for="group in groups" :key="group.label" class="space-y-3">
      <p class="text-xs font-semibold tracking-wide text-foreground/70">{{ group.label }}</p>
      <div
        v-for="item in group.items"
        :key="item.id"
        :class="[
          'rounded-2xl border p-4 transition-colors',
          item.read
            ? 'bg-card'
            : ['cursor-pointer border-l-4 bg-primary/5', NOTIF_SOURCE_ACCENT_CLASS[item.source]],
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
          <!--
            三種來源依輕重上色，全部用既有 token：告警紅、使用者訊息琥珀、
            內部備註灰。原本是寫死的 red-50/blue-50/violet-50，沒有 dark:
            變體，深色模式下是三塊發亮的近白方塊。見 admin-notification-center.ts。
          -->
          <Badge variant="outline" :class="NOTIF_SOURCE_BADGE_CLASS[item.source]">
            {{ adminNotifSourceLabels[item.source] }}
          </Badge>
          <span v-if="item.senderName" class="text-xs text-foreground/70">
            來自 {{ item.senderName }}
          </span>

          <!--
            標回未讀。原本點開就回不去 —— 想把它留成待辦就不能點開看內容。
            @click.stop 是必要的：外層整張卡的 click 會把它重新標成已讀。
          -->
          <button
            v-if="item.read"
            type="button"
            class="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            @click.stop="markUnread(item.id)"
          >
            <Undo2 class="size-3.5" aria-hidden="true" />
            標為未讀
          </button>
        </div>

        <p class="mt-2 text-sm text-foreground/70">{{ item.body }}</p>

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
