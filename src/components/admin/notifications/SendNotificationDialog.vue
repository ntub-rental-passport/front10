<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import { X } from 'lucide-vue-next'
import { useAdminNotifications, type NotifRecipient } from '@/src/composables/admin/useAdminNotifications'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { extractVariables, renderTemplate } from '@/src/utils/notif-template'
import { confirmSendCopy } from '@/src/utils/notif-confirm'
import type { NotifCategory, NotifChannel, NotifTemplate } from '@/src/mocks/admin-seed'

/**
 * 發送通知的完整流程（選內容、選收件人、二次確認），三個入口共用：
 * 模板列表的「發送」、使用者詳情頁、使用者列表的列操作。
 *
 * `template` 有值時代表「從某個模板的發送按鈕點進來」，內容鎖定該模板，不提供切換成
 * 自由撰寫或換模板的選項——那是另一個模板的事，不該在這個對話框裡臨時改主意。
 * `template` 未給時（使用者詳情頁／使用者列表）才需要讓管理員自己選「套用模板」或「自由撰寫」。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    template?: NotifTemplate | null
    presetEmails?: string[]
  }>(),
  {
    template: null,
    presetEmails: () => [],
  },
)

const emit = defineEmits<{
  'update:open': [boolean]
  sent: [{ count: number; recipientNames: string[] }]
}>()

const { templates, sendFromTemplate, sendOneOff, resolveRecipients } = useAdminNotifications()
const { users } = useAdminUsers()

const nonAdminUsers = computed(() => users.value.filter((user) => user.role !== 'admin'))

function nameFor(email: string): string {
  return users.value.find((user) => user.email === email)?.nickname ?? email
}

const CHANNEL_OPTIONS: { key: NotifChannel; label: string }[] = [
  { key: 'inapp', label: '站內' },
  { key: 'email', label: 'Email' },
  { key: 'push', label: '推播' },
]

// 預覽與確認框顯示管道時要用中文，不能直接印出 inapp／email 這種內部值
const CHANNEL_LABELS: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

const CATEGORY_OPTIONS: NotifCategory[] = ['系統', '租約', '補貼', '帳務']

/* -------------------- 內容：套模板 / 自由撰寫 -------------------- */

const mode = ref<'template' | 'oneoff'>('template')
const canPickMode = computed(() => !props.template)

const selectedTemplateId = ref('')
/** 真正要送出的模板：外部鎖定的優先，否則用畫面上選的 */
const activeTemplate = computed<NotifTemplate | null>(() => {
  if (props.template) return props.template
  return templates.value.find((item) => item.id === selectedTemplateId.value) ?? null
})
const effectiveMode = computed<'template' | 'oneoff'>(() => (props.template ? 'template' : mode.value))

const sendVars = ref<Record<string, string>>({})

const sendVariableNames = computed(() =>
  activeTemplate.value ? extractVariables(`${activeTemplate.value.title} ${activeTemplate.value.body}`) : [],
)

// 只把「有填」的變數交給 renderTemplate；留空的會保留 {{變數}} 原樣，方便看出遺漏
const filledVars = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(sendVars.value)) {
    if (value.trim() !== '') result[name] = value
  }
  return result
})

// 模板換了（外部鎖定的模板本身不會變，只有畫面選的會變）就重置變數輸入，避免殘留上一個模板的欄位值
watch(
  activeTemplate,
  (item) => {
    const vars = item ? extractVariables(`${item.title} ${item.body}`) : []
    const initial: Record<string, string> = {}
    for (const name of vars) initial[name] = ''
    sendVars.value = initial
  },
  { immediate: true },
)

const oneoffTitle = ref('')
const oneoffBody = ref('')
const oneoffCategory = ref<NotifCategory>('系統')
const oneoffChannels = ref<NotifChannel[]>([])

function oneoffChannelOn(channel: NotifChannel): boolean {
  return oneoffChannels.value.includes(channel)
}

function setOneoffChannel(channel: NotifChannel, on: boolean): void {
  if (on) {
    if (!oneoffChannels.value.includes(channel)) oneoffChannels.value.push(channel)
  } else {
    oneoffChannels.value = oneoffChannels.value.filter((item) => item !== channel)
  }
}

const previewTitle = computed(() =>
  effectiveMode.value === 'template' && activeTemplate.value
    ? renderTemplate(activeTemplate.value.title, filledVars.value)
    : oneoffTitle.value,
)
const previewBody = computed(() =>
  effectiveMode.value === 'template' && activeTemplate.value
    ? renderTemplate(activeTemplate.value.body, filledVars.value)
    : oneoffBody.value,
)
const previewCategory = computed(() =>
  effectiveMode.value === 'template' ? activeTemplate.value?.category ?? '' : oneoffCategory.value,
)
const previewChannels = computed<NotifChannel[]>(() =>
  effectiveMode.value === 'template' ? activeTemplate.value?.channels ?? [] : oneoffChannels.value,
)

/* -------------------- 收件人：角色 / 可搜尋多選 -------------------- */

type RecipientKind = 'all' | 'user' | 'landlord' | 'users'

const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  all: '全部使用者',
  user: '全部租客',
  landlord: '全部房東',
  users: '指定使用者',
}

const recipientKind = ref<RecipientKind>('all')
const recipientEmails = ref<string[]>([])
const userSearch = ref('')

const filteredSearchUsers = computed(() => {
  const keyword = userSearch.value.trim().toLowerCase()
  return nonAdminUsers.value.filter((user) => {
    if (recipientEmails.value.includes(user.email)) return false
    if (keyword === '') return true
    return (
      user.email.toLowerCase().includes(keyword) ||
      (user.nickname ?? '').toLowerCase().includes(keyword)
    )
  })
})

function addRecipient(email: string): void {
  if (!recipientEmails.value.includes(email)) recipientEmails.value = [...recipientEmails.value, email]
  userSearch.value = ''
}

function removeRecipient(email: string): void {
  recipientEmails.value = recipientEmails.value.filter((item) => item !== email)
}

const currentRecipient = computed<NotifRecipient>(() =>
  recipientKind.value === 'users'
    ? { kind: 'users', emails: recipientEmails.value }
    : { kind: 'role', role: recipientKind.value },
)

const recipientLabel = computed(() => RECIPIENT_LABELS[recipientKind.value])

const canSend = computed(() => {
  if (recipientKind.value === 'users' && recipientEmails.value.length === 0) return false
  if (effectiveMode.value === 'template') return activeTemplate.value !== null
  return (
    oneoffTitle.value.trim() !== '' && oneoffBody.value.trim() !== '' && oneoffChannels.value.length > 0
  )
})

/* -------------------- 開關與重置 -------------------- */

// 發送框與確認框的開關各自獨立管理。兩個框不能同時開著（Dialog 遮罩是 bg-black/80，
// 疊兩層等於九成以上全黑），但關掉發送框時已填的內容要留著，使用者在確認框按取消才回得來。
const confirmOpen = ref(false)

function resetState(): void {
  mode.value = 'template'
  selectedTemplateId.value = ''
  oneoffTitle.value = ''
  oneoffBody.value = ''
  oneoffCategory.value = '系統'
  oneoffChannels.value = []
  userSearch.value = ''
  confirmOpen.value = false

  if (props.presetEmails.length > 0) {
    recipientKind.value = 'users'
    recipientEmails.value = [...props.presetEmails]
  } else {
    recipientKind.value = 'all'
    recipientEmails.value = []
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetState()
  },
)

function closeFlow(): void {
  confirmOpen.value = false
  emit('update:open', false)
}

function requestSend(): void {
  confirmOpen.value = true
}

/** 確認框按取消：退回填好的發送表單，不清掉任何已輸入的內容。 */
function cancelConfirm(): void {
  confirmOpen.value = false
}

const confirmText = computed(() => {
  if (recipientKind.value === 'users') {
    return confirmSendCopy({ kind: 'users', names: recipientEmails.value.map(nameFor) })
  }
  return confirmSendCopy({ kind: 'role', count: resolveRecipients(currentRecipient.value).length })
})

async function performSend(): Promise<void> {
  const recipient = currentRecipient.value
  let count: number

  if (effectiveMode.value === 'template') {
    if (!activeTemplate.value) return
    count = await sendFromTemplate(activeTemplate.value.id, filledVars.value, recipient)
  } else {
    count = await sendOneOff(
      {
        title: oneoffTitle.value,
        body: oneoffBody.value,
        category: oneoffCategory.value,
        channels: oneoffChannels.value,
      },
      recipient,
    )
  }

  const recipientNames = recipientKind.value === 'users' ? recipientEmails.value.map(nameFor) : []
  emit('sent', { count, recipientNames })
  closeFlow()
}
</script>

<template>
  <Dialog
    :open="open && !confirmOpen"
    @update:open="(o: boolean) => { if (!o && !confirmOpen) closeFlow() }"
  >
    <DialogContent class="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>發送通知</DialogTitle>
        <DialogDescription v-if="template">模板：{{ template.name }}</DialogDescription>
        <DialogDescription v-else>選擇要套用的模板，或自行撰寫一次性內容。</DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div v-if="canPickMode" class="space-y-2">
          <Label class="mb-0">發送內容</Label>
          <div class="flex gap-2">
            <Button
              type="button"
              size="sm"
              :variant="mode === 'template' ? 'default' : 'outline'"
              @click="mode = 'template'"
            >
              套用模板
            </Button>
            <Button
              type="button"
              size="sm"
              :variant="mode === 'oneoff' ? 'default' : 'outline'"
              @click="mode = 'oneoff'"
            >
              自由撰寫
            </Button>
          </div>
        </div>

        <!-- 套用模板 -->
        <template v-if="effectiveMode === 'template'">
          <div v-if="!template" class="space-y-2">
            <Label>選擇模板</Label>
            <Select
              :model-value="selectedTemplateId"
              @update:model-value="(v) => (selectedTemplateId = v as string)"
            >
              <SelectTrigger><SelectValue placeholder="請選擇模板" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in templates" :key="item.id" :value="item.id">
                  {{ item.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="activeTemplate">
            <div v-if="sendVariableNames.length > 0" class="space-y-3">
              <div v-for="name in sendVariableNames" :key="name" class="space-y-2">
                <Label :for="`send-var-${name}`">{{ name }}</Label>
                <Input :id="`send-var-${name}`" v-model="sendVars[name]" />
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground">此模板未使用變數</p>
          </template>
        </template>

        <!-- 自由撰寫 -->
        <div v-else class="space-y-4">
          <div class="space-y-2">
            <Label for="oo-title">標題</Label>
            <Input id="oo-title" v-model="oneoffTitle" />
          </div>
          <div class="space-y-2">
            <Label for="oo-body">內文</Label>
            <Textarea id="oo-body" v-model="oneoffBody" rows="4" />
          </div>
          <div class="space-y-2">
            <Label>分類</Label>
            <Select v-model="oneoffCategory">
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
                  :model-value="oneoffChannelOn(ch.key)"
                  @update:model-value="(v: boolean) => setOneoffChannel(ch.key, v)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 收件人 -->
        <div class="space-y-2">
          <Label>收件人</Label>
          <Select
            :model-value="recipientKind"
            @update:model-value="(v) => (recipientKind = v as RecipientKind)"
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部使用者</SelectItem>
              <SelectItem value="user">全部租客</SelectItem>
              <SelectItem value="landlord">全部房東</SelectItem>
              <SelectItem value="users">指定使用者</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="recipientKind === 'users'" class="space-y-2">
          <Label>選擇使用者</Label>
          <div v-if="recipientEmails.length > 0" class="flex flex-wrap gap-1.5">
            <Badge v-for="email in recipientEmails" :key="email" variant="secondary" class="gap-1 pr-1">
              {{ nameFor(email) }}
              <button
                type="button"
                class="rounded-full p-0.5 hover:bg-muted-foreground/20"
                :aria-label="`移除 ${nameFor(email)}`"
                @click="removeRecipient(email)"
              >
                <X class="h-3 w-3" />
              </button>
            </Badge>
          </div>
          <Input v-model="userSearch" placeholder="搜尋 Email 或暱稱" />
          <div class="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border p-1">
            <button
              v-for="user in filteredSearchUsers"
              :key="user.id"
              type="button"
              class="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              @click="addRecipient(user.email)"
            >
              <span class="font-medium">{{ user.nickname ?? user.email }}</span>
              <span v-if="user.nickname" class="text-xs text-muted-foreground">{{ user.email }}</span>
            </button>
            <p v-if="filteredSearchUsers.length === 0" class="px-2 py-4 text-center text-sm text-muted-foreground">
              沒有符合的使用者
            </p>
          </div>
        </div>

        <div class="space-y-1 rounded-xl border bg-muted/30 p-3 text-sm">
          <p class="text-xs font-medium text-muted-foreground">即時預覽</p>
          <p class="font-bold">{{ previewTitle }}</p>
          <p class="text-muted-foreground">{{ previewBody }}</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeFlow">取消</Button>
        <Button :disabled="!canSend" @click="requestSend">發送</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 發送二次確認：文案依收件人類型而定，見 notif-confirm.ts -->
  <!-- Esc 或點外面關掉確認框時，也要退回發送表單而不是把整個流程丟掉 -->
  <Dialog :open="confirmOpen" @update:open="(o: boolean) => { if (!o) cancelConfirm() }">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>確認發送</DialogTitle>
        <DialogDescription>{{ confirmText }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between rounded-xl border px-3 py-2">
          <span class="text-muted-foreground">收件人</span>
          <span class="font-semibold">{{ recipientLabel }}</span>
        </div>
        <div class="space-y-1 rounded-xl border bg-muted/30 p-3">
          <p class="text-xs font-medium text-muted-foreground">
            {{ effectiveMode === 'template' ? `模板：${activeTemplate?.name ?? ''}` : '自由撰寫' }}
            · {{ previewCategory }}
          </p>
          <p class="font-bold">{{ previewTitle }}</p>
          <p class="text-muted-foreground">{{ previewBody }}</p>
          <div v-if="previewChannels.length > 0" class="flex flex-wrap gap-1 pt-1">
            <Badge v-for="ch in previewChannels" :key="ch" variant="outline">
              {{ CHANNEL_LABELS[ch] }}
            </Badge>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="cancelConfirm">取消</Button>
        <Button @click="performSend">確認發送</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
