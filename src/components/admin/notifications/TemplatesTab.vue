<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import ActionError from '@/src/components/admin/ActionError.vue'
import AdminLoadNotice from '@/src/components/admin/AdminLoadNotice.vue'
import AdminRowActions from '@/src/components/admin/AdminRowActions.vue'
import { useExpandedRows } from '@/src/composables/admin/useExpandedRows'
import { loadTemplates, useAdminNotifications } from '@/src/composables/admin/useAdminNotifications'
import { extractVariables, renderTemplate } from '@/src/utils/notif-template'
import { groupIntoBatches } from '@/src/utils/notif-batch'
import {
  TENANT_ROUTE_GROUPS,
  TENANT_ROUTE_OPTIONS,
  DEFAULT_ACTION_LABEL,
} from '@/src/utils/tenant-route-link'
import { sampleValuesFor, templateUsage } from '@/src/utils/notif-stats'
import { formatDateTime } from '@/src/utils/admin-format'
import type { NotifCategory, NotifChannel, NotifTemplate } from '@/src/mocks/admin-seed'

const router = useRouter()
const { templates, templatesState, messages, saveTemplate, removeTemplate, toggleTemplate } =
  useAdminNotifications()
const { isExpanded, toggle } = useExpandedRows()

const variablesOf = (item: NotifTemplate) => extractVariables(`${item.title} ${item.body}`)

const batches = computed(() => groupIntoBatches(messages.value))

// 使用紀錄靠 sourceLabel 對回模板名稱 —— 模板改名之後，舊批次會對不上而顯示
// 「還沒發送過」。這是真實資料的限制，不要用模糊的模糊比對假裝它接得起來。
const usageOf = (item: NotifTemplate) => templateUsage(item.name, batches.value)

/**
 * 變數預覽：把 {{姓名}} 這類變數填上範例值，讓管理員在送出前看到真實長度的訊息。
 * 填進去的是假的示範資料，所以介面上一定要標「範例值」，
 * 否則管理員會以為那是真的收件者資料。
 */
function previewOf(item: NotifTemplate): { title: string; body: string } {
  const vars = sampleValuesFor(variablesOf(item))
  return {
    title: renderTemplate(item.title, vars),
    body: renderTemplate(item.body, vars),
  }
}

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
  /** 預設的操作按鈕。套用模板時帶進編輯器，送出前還能改。 */
  actionUrl: string
  actionLabel: string
  enabled: boolean
}

function emptyDraft(): DraftState {
  return {
    name: '',
    category: '系統',
    channels: [],
    title: '',
    body: '',
    actionUrl: '',
    actionLabel: '',
    enabled: true,
  }
}

const draft = ref<DraftState>(emptyDraft())

/** Select 不能用空字串當值（會被當成沒選），所以「不加按鈕」要有一個實際的值。 */
const NO_ACTION = '__none__'

const draftActionUrl = computed({
  get: () => (draft.value.actionUrl === '' ? NO_ACTION : draft.value.actionUrl),
  set: (value: string) => {
    draft.value.actionUrl = value === NO_ACTION ? '' : value
    if (draft.value.actionUrl !== '' && draft.value.actionLabel.trim() === '') {
      draft.value.actionLabel = DEFAULT_ACTION_LABEL
    }
  },
})

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

/** 啟用切換、刪除的錯誤顯示在清單上方；新增、編輯的錯誤留在對話框裡 */
const listError = ref('')
const dialogError = ref('')
const saving = ref(false)

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失敗，請稍後再試。'
}

async function run(action: () => Promise<void>): Promise<void> {
  listError.value = ''
  try {
    await action()
  } catch (error) {
    listError.value = messageOf(error)
  }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogError.value = ''
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
    actionUrl: item.actionUrl ?? '',
    actionLabel: item.actionLabel ?? '',
    enabled: item.enabled,
  }
  dialogError.value = ''
  dialogOpen.value = true
}

async function submit(): Promise<void> {
  if (!canSubmit()) return
  saving.value = true
  dialogError.value = ''
  try {
    await saveTemplate({
    id: draft.value.id,
    name: draft.value.name,
    category: draft.value.category,
    channels: draft.value.channels,
    title: draft.value.title,
    body: draft.value.body,
    // 只填文字沒選頁面的話按鈕不會出現，所以兩個一起清掉，不要留半截資料
    actionUrl: draft.value.actionUrl || undefined,
    actionLabel: draft.value.actionUrl ? draft.value.actionLabel || undefined : undefined,
    enabled: draft.value.enabled,
    })
    dialogOpen.value = false
  } catch (error) {
    dialogError.value = messageOf(error)
  } finally {
    saving.value = false
  }
}

const canSubmit = () =>
  draft.value.name.trim() !== '' &&
  draft.value.title.trim() !== '' &&
  draft.value.body.trim() !== '' &&
  draft.value.channels.length > 0 &&
  !saving.value

function confirmDelete(): void {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (target) void run(() => removeTemplate(target.id))
}

/* -------------------- 發送 -------------------- */
// 發送流程整個搬到 /admin/notifications/compose。這裡只負責把模板帶過去，
// 編輯器會把內容複製進來 —— 之後改的是「這一次要送的內容」，不是模板本身。

function openSend(item: NotifTemplate): void {
  void router.push({ path: '/admin/notifications/compose', query: { template: item.id } })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span />
      <Button @click="openCreate">新增模板</Button>
    </div>

    <ActionError v-if="listError" :message="listError" @dismiss="listError = ''" />
    <AdminLoadNotice :state="templatesState" what="通知模板" @retry="loadTemplates" />

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="min-w-[10rem]">名稱</TableHead>
          <TableHead class="whitespace-nowrap">分類</TableHead>
          <TableHead class="whitespace-nowrap">管道</TableHead>
          <TableHead class="whitespace-nowrap">狀態</TableHead>
          <TableHead class="whitespace-nowrap">更新時間</TableHead>
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
            <TableCell class="whitespace-nowrap text-sm text-muted-foreground">{{ item.category }}</TableCell>
            <TableCell class="whitespace-nowrap">
              <div class="flex gap-1">
                <Badge v-for="ch in item.channels" :key="ch" variant="secondary">
                  {{ channelLabels[ch] }}
                </Badge>
              </div>
            </TableCell>
            <TableCell class="whitespace-nowrap">
              <Badge :variant="item.enabled ? 'default' : 'secondary'">
                {{ item.enabled ? '已啟用' : '已停用' }}
              </Badge>
            </TableCell>
            <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
              {{ formatDateTime(item.updatedAt) }}
            </TableCell>
            <TableCell class="text-right" @click.stop>
              <AdminRowActions
                :actions="[
                  { label: '編輯', onSelect: () => openEdit(item) },
                  { label: item.enabled ? '停用' : '啟用', onSelect: () => void run(() => toggleTemplate(item.id)) },
                  { label: '刪除', danger: true, onSelect: () => (deleteTarget = item) },
                ]"
              >
                <Button size="sm" @click="openSend(item)">發送</Button>
              </AdminRowActions>
            </TableCell>
          </TableRow>

          <TableRow v-if="isExpanded(item.id)" class="hover:bg-transparent">
            <TableCell colspan="6" class="bg-muted/30">
              <div class="grid gap-5 lg:grid-cols-[1fr_260px]">
                <!-- 左：填上範例值之後的樣子 -->
                <div>
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <p class="text-xs font-medium text-foreground/70">預覽</p>
                    <span
                      v-if="variablesOf(item).length > 0"
                      class="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] text-foreground/70"
                    >
                      變數已填入範例值
                    </span>
                  </div>
                  <div class="rounded-lg border border-border bg-background p-3">
                    <p class="text-sm font-medium">{{ previewOf(item).title }}</p>
                    <p class="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                      {{ previewOf(item).body }}
                    </p>
                  </div>

                  <div
                    v-if="variablesOf(item).length > 0"
                    class="mt-2 flex flex-wrap items-center gap-1"
                  >
                    <span class="mr-1 text-xs font-medium text-foreground/70">變數</span>
                    <Badge v-for="name in variablesOf(item)" :key="name" variant="outline">
                      {{ name }}
                    </Badge>
                  </div>

                  <details class="mt-3">
                    <summary class="cursor-pointer text-xs text-foreground/70">看原始模板</summary>
                    <p class="mt-2 text-sm font-medium">{{ item.title }}</p>
                    <p class="whitespace-pre-wrap text-sm text-foreground/70">{{ item.body }}</p>
                  </details>
                </div>

                <!-- 右：這個模板實際被用過幾次 -->
                <div class="rounded-lg border border-border bg-background p-3">
                  <p class="mb-2 text-xs font-medium text-foreground/70">使用紀錄</p>
                  <dl v-if="usageOf(item).batchCount > 0" class="space-y-1.5 text-sm">
                    <div class="flex items-baseline justify-between gap-2">
                      <dt class="text-foreground/70">已發送</dt>
                      <dd class="font-medium tabular-nums">{{ usageOf(item).batchCount }} 批</dd>
                    </div>
                    <div class="flex items-baseline justify-between gap-2">
                      <dt class="text-foreground/70">累計對象</dt>
                      <dd class="font-medium tabular-nums">
                        {{ usageOf(item).totalRecipients }} 人次
                      </dd>
                    </div>
                    <div class="flex items-baseline justify-between gap-2">
                      <dt class="text-foreground/70">站內已讀</dt>
                      <dd class="font-medium tabular-nums">
                        {{ usageOf(item).read }} / {{ usageOf(item).totalRecipients }}
                      </dd>
                    </div>
                    <div class="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
                      <dt class="text-foreground/70">最後發送</dt>
                      <dd class="text-right text-xs">
                        {{ usageOf(item).lastSentAt ? formatDateTime(usageOf(item).lastSentAt!) : '—' }}
                      </dd>
                    </div>
                  </dl>
                  <p v-else class="text-sm text-foreground/70">這個模板還沒發送過。</p>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </template>

        <TableRow v-if="templates.length === 0 && templatesState === 'ready'">
          <TableCell colspan="6" class="py-8 text-center text-muted-foreground">尚無通知模板。</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- 編輯 / 新增 Dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto">
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

          <!--
            操作按鈕存在模板上：「租約到期提醒」的按鈕永遠是「查看合約」，
            每次發送重打一次沒有意義，而且遲早會有人打錯。
            只給白名單不給自由輸入 —— router 末端有 catch-all，
            打錯的連結不會 404，會無聲無息把租客丟回首頁。
          -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>操作按鈕連到哪（可不選）</Label>
              <Select v-model="draftActionUrl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_ACTION">不加按鈕</SelectItem>
                  <SelectGroup v-for="group in TENANT_ROUTE_GROUPS" :key="group">
                    <SelectLabel>{{ group }}</SelectLabel>
                    <SelectItem
                      v-for="option in TENANT_ROUTE_OPTIONS.filter((o) => o.group === group)"
                      :key="option.url"
                      :value="option.url"
                    >
                      {{ option.label }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="nt-action-label">按鈕文字</Label>
              <Input
                id="nt-action-label"
                v-model="draft.actionLabel"
                :disabled="draft.actionUrl === ''"
                :placeholder="DEFAULT_ACTION_LABEL"
              />
            </div>
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
        <ActionError v-if="dialogError" :message="dialogError" @dismiss="dialogError = ''" />

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">{{ saving ? '儲存中…' : '儲存' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>


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
