<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { ArrowLeft, ChevronDown, ChevronRight, Send, X } from 'lucide-vue-next'
import NotifPreviewCard from '@/src/components/admin/notifications/NotifPreviewCard.vue'
import { useAdminNotifications, TEST_SOURCE_LABEL, ONE_OFF_SOURCE_LABEL, type NotifRecipient } from '@/src/composables/admin/useAdminNotifications'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { useNow } from '@/src/composables/useNow'
import { useRegisterAdminPageTitle } from '@/src/composables/admin/useAdminPageTitle'
import { getAuthSession } from '@/src/composables/useAuth'
import { fetchAdminAccounts, type AdminAccount } from '@/src/services/adminUsersApi'
import { createScheduled } from '@/src/services/scheduledNotificationApi'
import { extractVariables, renderTemplate } from '@/src/utils/notif-template'
import {
  TENANT_ROUTE_GROUPS,
  TENANT_ROUTE_OPTIONS,
  DEFAULT_ACTION_LABEL,
  actionLinkError,
} from '@/src/utils/tenant-route-link'
import {
  AUDIENCE_LABEL,
  audiencePreviewText,
  audienceSummary,
  buildAudience,
  namedAudience,
  type AudienceCandidate,
  type AudienceKind,
} from '@/src/utils/notif-audience'
import { clearDraft, readDraft, writeDraft } from '@/src/utils/notif-draft'
import {
  fromDateTimeLocal,
  maxScheduleValue,
  minScheduleValue,
  toDateTimeLocal,
} from '@/src/utils/notif-schedule'
import type { NotifCategory, NotifChannel } from '@/src/mocks/admin-seed'

/**
 * 發送通知的編輯器。
 *
 * 原本是一顆按鈕 + 一個 max-h-[85vh] 的捲動對話框，裡面塞了五個不相關的
 * 區塊，而「即時預覽」在最底下 —— 套一個有三個變數的模板之後預覽就掉到
 * 摺線以下，等於盲寫。排程又是另一個對話框，兩邊已經開始漂移。
 *
 * 改成整頁之後：左邊編輯、右邊釘住一張租客真的會看到的卡片，立即與排程
 * 收進同一個「何時送出」。
 *
 * ## 一個不能藏起來的差異
 *
 * 立即發送寫的是 localStorage，收件人是後台那份示範資料；
 * 排程由後端執行，收件人是 MySQL 裡真正註冊過的帳號。
 * 切換「何時送出」會**換掉收件人是誰**。這件事必須顯示在畫面上 ——
 * 藏起來不會讓它消失，只會讓管理員在不知情的狀況下送錯人。
 */

const route = useRoute()
const router = useRouter()
const now = useNow()

const { templates, sendComposed, resolveRecipients } = useAdminNotifications()
const { users } = useAdminUsers()

const CATEGORY_OPTIONS: NotifCategory[] = ['系統', '租約', '補貼', '帳務']
const CHANNEL_OPTIONS: { key: NotifChannel; label: string }[] = [
  { key: 'inapp', label: '站內' },
  { key: 'email', label: 'Email' },
  { key: 'push', label: '推播' },
]
const CHANNEL_LABELS: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}
const RECIPIENT_OPTIONS = [
  { value: 'all', label: '全部使用者' },
  { value: 'user', label: '全部租客' },
  { value: 'landlord', label: '全部房東' },
  { value: 'users', label: '指定使用者' },
] as const
type RecipientKind = (typeof RECIPIENT_OPTIONS)[number]['value']

/** 「不加按鈕」在 Select 裡要有一個實際的值，空字串會被當成沒選 */
const NO_ACTION = '__none__'

/** 放在 script 而不是直接寫進 template：雙大括號會被 Vue 當成插值語法。 */
const VARIABLE_EXAMPLE = '{{變數}}'

/* -------------------- 表單狀態 -------------------- */

const templateId = ref('')
const title = ref('')
const body = ref('')
const category = ref<NotifCategory>('系統')
const channels = ref<NotifChannel[]>(['inapp'])
const actionUrl = ref('')
const actionLabel = ref('')
const vars = ref<Record<string, string>>({})

const recipientKind = ref<RecipientKind>('all')
const recipientEmails = ref<string[]>([])
const userSearch = ref('')

const when = ref<'now' | 'schedule'>('now')
const scheduledAt = ref('')

const confirmOpen = ref(false)
const sending = ref(false)
const error = ref('')
const success = ref('')
const audienceOpen = ref(false)
const restoredAt = ref('')

/* -------------------- 頁面標題 -------------------- */
// ⚠️ 一定要放在上面那些 ref 之後：這個 composable 裡的 watch 是 immediate，
// 會在 setup 當下就讀 when.value，放在宣告之前會踩到 TDZ 而整頁掛掉
// （而且 vue-tsc 不會報）。
useRegisterAdminPageTitle(
  computed(() => route.path),
  computed(() => (when.value === 'schedule' ? '排程發送' : '發送通知')),
)

/* -------------------- 模板 -------------------- */

const enabledTemplates = computed(() => templates.value.filter((item) => item.enabled))

const appliedTemplate = computed(
  () => enabledTemplates.value.find((item) => item.id === templateId.value) ?? null,
)

/**
 * 套用模板＝把內容**複製**進來，之後就是在編輯一則訊息。
 *
 * 原本的對話框是相反的：套了模板就只能填變數，正文動不了，送出時再從模板
 * 重新 render。那代表「這次想多加一句話」做不到，只能去改模板本身 ——
 * 而改模板會影響之後所有人。
 */
function applyTemplate(id: string): void {
  templateId.value = id
  const template = enabledTemplates.value.find((item) => item.id === id)
  if (!template) return
  title.value = template.title
  body.value = template.body
  category.value = template.category
  channels.value = [...template.channels]
  actionUrl.value = template.actionUrl ?? ''
  actionLabel.value = template.actionLabel ?? ''
}

const variableNames = computed(() => extractVariables(`${title.value} ${body.value}`))

// 只把「有填」的變數交給 renderTemplate：留空的會保留 {{變數}} 原樣，
// 預覽上一眼就看得出哪一個忘了填。
const filledVars = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(vars.value)) {
    if (value.trim() !== '') result[name] = value
  }
  return result
})

const renderedTitle = computed(() => renderTemplate(title.value, filledVars.value))
const renderedBody = computed(() => renderTemplate(body.value, filledVars.value))
const missingVars = computed(() => variableNames.value.filter((name) => !filledVars.value[name]))

/* -------------------- 操作按鈕 -------------------- */

const actionUrlValue = computed({
  get: () => (actionUrl.value === '' ? NO_ACTION : actionUrl.value),
  set: (value: string) => {
    actionUrl.value = value === NO_ACTION ? '' : value
    if (actionUrl.value !== '' && actionLabel.value.trim() === '') {
      actionLabel.value = DEFAULT_ACTION_LABEL
    }
  },
})

function optionsInGroup(group: string) {
  return TENANT_ROUTE_OPTIONS.filter((item) => item.group === group)
}

/**
 * 用**活的** router 驗連結，不是比對一份寫死的清單。
 *
 * router 末端有 `{ path: '/:pathMatch(.*)*', redirect: '/' }`，所以死連結
 * 不會出現 404，而是無聲無息把租客丟回首頁。白名單防得了手打，防不了
 * 路由之後被改名 —— seed 裡的 /app/maintenance 就是那樣來的。
 */
const actionIssue = computed(() => {
  const url = actionUrl.value.trim()
  const matched = url === '' ? [] : router.resolve(url).matched.map((record) => record.path)
  return actionLinkError(url, actionLabel.value, matched)
})

/* -------------------- 收件人 -------------------- */

const realUsers = ref<AdminAccount[] | null>(null)
const realUsersLoading = ref(false)
let realUsersController: AbortController | undefined

// 排程的收件人由後端從 users 表算，所以排程模式必須用真實帳號那份名單。
// 只在切到排程時才去拉，立即發送用不到。
watch(
  when,
  async (value) => {
    if (value !== 'schedule' || realUsers.value !== null) return
    realUsersLoading.value = true
    realUsersController?.abort()
    realUsersController = new AbortController()
    realUsers.value = await fetchAdminAccounts(realUsersController.signal)
    realUsersLoading.value = false
  },
  { immediate: true },
)

onBeforeUnmount(() => realUsersController?.abort())

const isSchedule = computed(() => when.value === 'schedule')

/** 目前這個模式下「候選人」是誰。兩份名單欄位不同，統一轉成同一種格式。 */
const candidates = computed<AudienceCandidate[]>(() => {
  if (isSchedule.value) {
    return (realUsers.value ?? []).map((row) => ({
      email: row.email,
      name: row.displayName,
      roles: row.roles,
      active: row.status === 'active',
    }))
  }
  return users.value.map((user) => ({
    email: user.email,
    name: user.nickname,
    roles: [user.role],
    active: user.status === 'active',
  }))
})

const audienceUnavailable = computed(
  () => isSchedule.value && realUsers.value === null && !realUsersLoading.value,
)

const audience = computed(() => {
  if (recipientKind.value === 'users') {
    return namedAudience(recipientEmails.value, (email) =>
      candidates.value.find((item) => item.email === email)?.name,
    )
  }
  return buildAudience(candidates.value, recipientKind.value as AudienceKind)
})

const recipientLabel = computed(() =>
  recipientKind.value === 'users' ? '指定使用者' : AUDIENCE_LABEL[recipientKind.value as AudienceKind],
)

const pickableUsers = computed(() => {
  const keyword = userSearch.value.trim().toLowerCase()
  return candidates.value
    .filter((item) => item.active && !item.roles.includes('admin'))
    .filter((item) => !recipientEmails.value.includes(item.email))
    .filter((item) => {
      if (keyword === '') return true
      return (
        item.email.toLowerCase().includes(keyword) ||
        (item.name ?? '').toLowerCase().includes(keyword)
      )
    })
    .slice(0, 50)
})

function nameFor(email: string): string {
  return candidates.value.find((item) => item.email === email)?.name?.trim() || email
}

function addRecipient(email: string): void {
  if (!recipientEmails.value.includes(email)) {
    recipientEmails.value = [...recipientEmails.value, email]
  }
  userSearch.value = ''
}

function removeRecipient(email: string): void {
  recipientEmails.value = recipientEmails.value.filter((item) => item !== email)
}

// 切換模式時把挑好的人清掉：兩邊是不同的名單，留著會變成「後端沒有這個人」
watch(when, () => {
  if (recipientEmails.value.length > 0) recipientEmails.value = []
})

/**
 * 切到排程時把管道收斂成只有 Email。
 *
 * 不做這件事會變成死路：套了模板之後站內是開的，切到排程後「站內不支援」
 * 擋住發送，但那顆開關在排程模式是 disabled —— 管理員關不掉它，只能切回
 * 立即發送關掉再切回來。自己收斂掉，比要求對方猜出這個順序好。
 */
watch(when, (value) => {
  if (value === 'schedule') channels.value = ['email']
})

/* -------------------- 管道 -------------------- */

function channelOn(channel: NotifChannel): boolean {
  return channels.value.includes(channel)
}

function setChannel(channel: NotifChannel, on: boolean): void {
  channels.value = on
    ? [...new Set([...channels.value, channel])]
    : channels.value.filter((item) => item !== channel)
}

/* -------------------- 草稿 -------------------- */

const restored = readDraft()
if (restored) {
  templateId.value = restored.templateId
  title.value = restored.title
  body.value = restored.body
  category.value = (CATEGORY_OPTIONS as string[]).includes(restored.category)
    ? (restored.category as NotifCategory)
    : '系統'
  channels.value = restored.channels.filter((item): item is NotifChannel =>
    CHANNEL_OPTIONS.some((option) => option.key === item),
  )
  actionUrl.value = restored.actionUrl
  actionLabel.value = restored.actionLabel
  recipientKind.value = (RECIPIENT_OPTIONS.some((o) => o.value === restored.recipientKind)
    ? restored.recipientKind
    : 'all') as RecipientKind
  recipientEmails.value = restored.recipientEmails
  when.value = restored.when
  scheduledAt.value = restored.scheduledAt
  vars.value = restored.vars
  restoredAt.value = restored.savedAt
}

// query 帶進來的 preset 蓋過草稿：管理員是「從模板列按發送」進來的，
// 他要的是那個模板，不是上次沒寫完的東西。
const presetTemplate = route.query.template
if (typeof presetTemplate === 'string' && presetTemplate !== '') {
  applyTemplate(presetTemplate)
  restoredAt.value = ''
}
const presetTo = route.query.to
if (typeof presetTo === 'string' && presetTo !== '') {
  recipientKind.value = 'users'
  recipientEmails.value = [presetTo]
  restoredAt.value = ''
}
if (route.query.when === 'schedule') when.value = 'schedule'

if (scheduledAt.value === '') {
  const next = new Date(now.value.getTime() + 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  scheduledAt.value = toDateTimeLocal(next)
}

// 變數輸入框要跟著內容裡實際出現的變數走
watch(
  variableNames,
  (names) => {
    const next: Record<string, string> = {}
    for (const name of names) next[name] = vars.value[name] ?? ''
    vars.value = next
  },
  { immediate: true },
)

const draftSnapshot = computed(() => ({
  templateId: templateId.value,
  title: title.value,
  body: body.value,
  category: category.value,
  channels: channels.value,
  actionUrl: actionUrl.value,
  actionLabel: actionLabel.value,
  recipientKind: recipientKind.value,
  recipientEmails: recipientEmails.value,
  when: when.value,
  scheduledAt: scheduledAt.value,
  vars: vars.value,
}))

watch(draftSnapshot, (snapshot) => writeDraft(snapshot), { deep: true })

function discardDraft(): void {
  clearDraft()
  restoredAt.value = ''
  templateId.value = ''
  title.value = ''
  body.value = ''
  category.value = '系統'
  channels.value = ['inapp']
  actionUrl.value = ''
  actionLabel.value = ''
  recipientEmails.value = []
  vars.value = {}
}

/* -------------------- 送出 -------------------- */

const minValue = computed(() => minScheduleValue(now.value))
const maxValue = computed(() => maxScheduleValue(now.value))

const blockingIssue = computed<string | null>(() => {
  if (renderedTitle.value.trim() === '' || renderedBody.value.trim() === '') {
    return '標題與內文都要填。'
  }
  if (actionIssue.value) return actionIssue.value
  if (isSchedule.value) {
    // 排程由後端寄 Email，站內與推播後端送不出去（收件匣在瀏覽器裡）
    if (!channels.value.includes('email')) return '排程只送得出 Email，請把 Email 管道打開。'
    if (channels.value.some((item) => item !== 'email')) {
      return '排程不支援站內與推播：站內收件匣存在瀏覽器，後端在排程時間寫不進去。'
    }
    if (scheduledAt.value === '') return '請選擇預定時間。'
    if (audienceUnavailable.value) return '讀不到後端的帳號清單，無法確認會送給誰。'
  } else if (channels.value.length === 0) {
    return '請至少選擇一種管道。'
  }
  if (audience.value.total === 0) return '目前沒有符合條件的收件人。'
  return null
})

const canSend = computed(() => blockingIssue.value === null && !sending.value)

const currentRecipient = computed<NotifRecipient>(() =>
  recipientKind.value === 'users'
    ? { kind: 'users', emails: recipientEmails.value }
    : { kind: 'role', role: recipientKind.value as 'all' | 'user' | 'landlord' },
)

const sourceLabel = computed(() => appliedTemplate.value?.name ?? ONE_OFF_SOURCE_LABEL)

function composed(overrideSource?: string) {
  return {
    title: renderedTitle.value,
    body: renderedBody.value,
    category: category.value,
    channels: channels.value,
    actionUrl: actionUrl.value,
    actionLabel: actionLabel.value,
    sourceLabel: overrideSource ?? sourceLabel.value,
  }
}

/**
 * 先寄給我自己。
 *
 * 走的是跟正式發送完全一樣的路徑：真的建立一筆 UserNotification、真的產生
 * 一個批次、真的進發送紀錄。所以它驗得到的是「這條路走得通、資料長對」。
 *
 * ⚠️ 它**看不到租客端的實際畫面**。租客收件匣是 /app/notifications，
 * router 的 meta.roles 只放行 tenant，管理員身分會被導回 /admin
 * （實測過）。所以文案不能寫「到通知中心看實際效果」—— 後台的通知中心
 * 是另一個獨立的 collection，根本不會顯示這筆。
 *
 * 要真的看到租客端長怎樣，只能用租客帳號登入。右邊那張預覽卡是為此存在的
 * 替代方案，而它是複製品不是同一個元件，這點也已經寫在 NotifPreviewCard 裡。
 */
async function sendToSelf(): Promise<void> {
  const email = getAuthSession()?.email
  if (!email) {
    error.value = '找不到目前登入的帳號，無法測試發送。'
    return
  }
  error.value = ''
  success.value = ''
  sending.value = true
  try {
    await sendComposed(composed(TEST_SOURCE_LABEL), { kind: 'users', emails: [email] })
    success.value =
      `已建立一筆真的通知給 ${email}，在發送紀錄打開「顯示測試發送」看得到。` +
      '（租客收件匣只有租客身分進得去，所以這裡看不到租客端畫面。）'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '測試發送失敗。'
  } finally {
    sending.value = false
  }
}

async function performSend(): Promise<void> {
  confirmOpen.value = false
  error.value = ''
  success.value = ''
  sending.value = true
  try {
    if (isSchedule.value) {
      await createScheduled({
        title: renderedTitle.value,
        body: renderedBody.value,
        category: category.value,
        channels: ['email'],
        recipient:
          recipientKind.value === 'users'
            ? { kind: 'users', emails: recipientEmails.value }
            : { kind: 'role', role: recipientKind.value },
        recipientLabel: recipientLabel.value,
        sourceLabel: sourceLabel.value,
        scheduledAt: fromDateTimeLocal(scheduledAt.value),
      })
      clearDraft()
      void router.push({ path: '/admin/notifications', query: { tab: 'schedule' } })
      return
    }

    const count = await sendComposed(composed(), currentRecipient.value)
    clearDraft()
    void router.push({ path: '/admin/notifications', query: { tab: 'log', sent: String(count) } })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '發送失敗。'
    sending.value = false
  }
}

const confirmCount = computed(() =>
  recipientKind.value === 'users'
    ? recipientEmails.value.length
    : isSchedule.value
      ? audience.value.total
      : resolveRecipients(currentRecipient.value).length,
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/admin/notifications')">
        <ArrowLeft class="mr-1.5 h-4 w-4" />
        返回通知管理
      </Button>
    </div>

    <!-- 草稿回復：安靜地講一句，並給一顆清空 -->
    <div
      v-if="restoredAt"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm"
    >
      <span>已回復上次未送出的內容。</span>
      <Button variant="outline" size="sm" class="ml-auto" @click="discardDraft">清空重寫</Button>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <!-- ============ 左：編輯 ============ -->
      <div class="space-y-6">
        <section class="space-y-4 rounded-2xl border border-border p-5">
          <h2 class="text-sm font-semibold">內容</h2>

          <div class="space-y-2">
            <Label>套用模板（可不選）</Label>
            <Select
              :model-value="templateId"
              @update:model-value="(v) => applyTemplate(v as string)"
            >
              <SelectTrigger><SelectValue placeholder="自由撰寫" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in enabledTemplates" :key="item.id" :value="item.id">
                  {{ item.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-foreground/70">
              套用後文字可以再改 —— 改的是這一次要送的內容，不會動到模板本身。
            </p>
          </div>

          <div class="space-y-2">
            <Label for="c-title">標題</Label>
            <Input id="c-title" v-model="title" placeholder="例如：系統維護預告" />
          </div>

          <div class="space-y-2">
            <Label for="c-body">內文</Label>
            <Textarea id="c-body" v-model="body" rows="6" />
          </div>

          <div v-if="variableNames.length > 0" class="space-y-3 rounded-xl bg-muted/40 p-3">
            <p class="text-xs font-medium text-foreground/70">
              變數（留空會在通知裡原樣顯示成 <code>{{ VARIABLE_EXAMPLE }}</code>）
            </p>
            <div v-for="name in variableNames" :key="name" class="space-y-1.5">
              <Label :for="`c-var-${name}`" class="text-xs">{{ name }}</Label>
              <Input :id="`c-var-${name}`" v-model="vars[name]" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>分類</Label>
              <Select v-model="category">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="item in CATEGORY_OPTIONS" :key="item" :value="item">
                    {{ item }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label class="mb-0">管道</Label>
              <div class="space-y-1.5">
                <div
                  v-for="ch in CHANNEL_OPTIONS"
                  :key="ch.key"
                  class="flex items-center justify-between rounded-lg border border-border px-3 py-1.5"
                >
                  <Label class="mb-0 text-sm">{{ ch.label }}</Label>
                  <Switch
                    :model-value="channelOn(ch.key)"
                    :disabled="isSchedule && ch.key !== 'email'"
                    @update:model-value="(v: boolean) => setChannel(ch.key, v)"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-4 rounded-2xl border border-border p-5">
          <div>
            <h2 class="text-sm font-semibold">操作按鈕</h2>
            <p class="mt-1 text-xs text-foreground/70">
              租客點了會直接到那一頁。不加的話這則通知只能讀，沒有下一步。
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>連到哪一頁</Label>
              <Select v-model="actionUrlValue">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_ACTION">不加按鈕</SelectItem>
                  <SelectGroup v-for="group in TENANT_ROUTE_GROUPS" :key="group">
                    <SelectLabel>{{ group }}</SelectLabel>
                    <SelectItem
                      v-for="option in optionsInGroup(group)"
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
              <Label for="c-action-label">按鈕文字</Label>
              <Input
                id="c-action-label"
                v-model="actionLabel"
                :disabled="actionUrl === ''"
                :placeholder="DEFAULT_ACTION_LABEL"
              />
            </div>
          </div>
        </section>

        <section class="space-y-4 rounded-2xl border border-border p-5">
          <h2 class="text-sm font-semibold">收件人</h2>

          <Select
            :model-value="recipientKind"
            @update:model-value="(v) => (recipientKind = v as RecipientKind)"
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in RECIPIENT_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <div v-if="recipientKind === 'users'" class="space-y-2">
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
            <div class="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1">
              <button
                v-for="person in pickableUsers"
                :key="person.email"
                type="button"
                class="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                @click="addRecipient(person.email)"
              >
                <span class="font-medium">{{ person.name || person.email }}</span>
                <span v-if="person.name" class="text-xs text-foreground/70">{{ person.email }}</span>
              </button>
              <p v-if="pickableUsers.length === 0" class="px-2 py-4 text-center text-sm text-foreground/70">
                {{ realUsersLoading ? '讀取中…' : '沒有符合的使用者' }}
              </p>
            </div>
          </div>
        </section>

        <section class="space-y-4 rounded-2xl border border-border p-5">
          <h2 class="text-sm font-semibold">何時送出</h2>

          <div class="flex gap-2">
            <Button
              type="button"
              size="sm"
              :variant="when === 'now' ? 'default' : 'outline'"
              @click="when = 'now'"
            >
              立即發送
            </Button>
            <Button
              type="button"
              size="sm"
              :variant="when === 'schedule' ? 'default' : 'outline'"
              @click="when = 'schedule'"
            >
              排程
            </Button>
          </div>

          <!--
            這段是整頁最重要的一句話。兩種送法走的是完全不同的路徑，
            連「收件人是誰」都不一樣 —— 不寫出來的話管理員不可能知道。
          -->
          <div class="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-foreground/70">
            <template v-if="isSchedule">
              <span class="font-medium text-foreground">排程由後端執行</span>，到時間會自己寄出，
              不需要開著後台。收件人是<span class="font-medium text-foreground">資料庫裡真正註冊過的帳號</span>，
              而且在送出當下才計算。只送得出 Email：站內收件匣存在瀏覽器，後端寫不進去。
            </template>
            <template v-else>
              <span class="font-medium text-foreground">立即發送寫進瀏覽器的收件匣</span>，
              收件人是後台這份示範資料。站內會立刻出現；Email 與推播後端還沒接，會標成「待接通」。
            </template>
          </div>

          <div v-if="isSchedule" class="space-y-2">
            <Label for="c-at">預定時間</Label>
            <Input id="c-at" v-model="scheduledAt" type="datetime-local" :min="minValue" :max="maxValue" />
            <p class="text-xs text-foreground/70">後端每 20 秒檢查一次，實際寄出會落在預定時間之後幾十秒內。</p>
          </div>
        </section>
      </div>

      <!-- ============ 右：預覽與送出（釘住） ============ -->
      <div class="lg:sticky lg:top-4 lg:self-start">
        <div class="space-y-4 rounded-2xl border border-border p-5">
          <div>
            <h2 class="text-sm font-semibold">租客會看到</h2>
            <p class="mt-1 text-xs text-foreground/70">未讀狀態的樣子。時間以實際送出為準。</p>
          </div>

          <NotifPreviewCard
            :title="renderedTitle"
            :body="renderedBody"
            :action-url="actionUrl"
            :action-label="actionLabel"
            :now="now"
          />

          <p v-if="missingVars.length > 0" class="text-xs text-foreground/70">
            還有 {{ missingVars.length }} 個變數沒填：{{ missingVars.join('、') }}
          </p>

          <div class="flex flex-wrap gap-1">
            <Badge v-for="ch in channels" :key="ch" variant="outline">{{ CHANNEL_LABELS[ch] }}</Badge>
          </div>

          <!-- 收件人：人數 + 可展開的前幾位 -->
          <div class="rounded-xl border border-border p-3">
            <div v-if="audienceUnavailable" class="text-sm">
              <p class="font-medium text-destructive">讀不到後端的帳號清單。</p>
              <p class="mt-1 text-xs text-foreground/70">
                可能是後端沒有啟動或登入已失效。在確認收件人之前不能排程。
              </p>
            </div>
            <template v-else>
              <button
                type="button"
                class="flex w-full items-center gap-1.5 text-left text-sm font-medium"
                @click="audienceOpen = !audienceOpen"
              >
                <component :is="audienceOpen ? ChevronDown : ChevronRight" class="h-4 w-4 shrink-0" />
                {{ realUsersLoading ? '讀取中…' : audienceSummary(audience, recipientLabel) }}
              </button>
              <p v-if="audienceOpen && audience.total > 0" class="mt-2 text-xs leading-relaxed text-foreground/70">
                {{ audiencePreviewText(audience) }}
              </p>
            </template>
          </div>

          <p v-if="blockingIssue" class="text-xs text-foreground/70">{{ blockingIssue }}</p>
          <p v-if="error" class="text-sm font-medium text-destructive">{{ error }}</p>
          <p v-if="success" class="text-sm font-medium text-success">{{ success }}</p>

          <div class="space-y-2">
            <Button class="w-full" :disabled="!canSend" @click="confirmOpen = true">
              <Send class="mr-2 h-4 w-4" />
              {{ isSchedule ? '排程發送' : '發送' }}
            </Button>
            <Button
              variant="outline"
              class="w-full"
              :disabled="sending || renderedTitle.trim() === '' || renderedBody.trim() === ''"
              @click="sendToSelf"
            >
              先寄給我自己
            </Button>
            <p class="text-xs text-foreground/70">
              測試發送走跟正式發送一樣的路徑，會標成「測試發送」，發送紀錄預設不顯示。
              它驗的是「資料送得出去」，不是租客端畫面 —— 那要用租客帳號才看得到。
            </p>
          </div>
        </div>
      </div>
    </div>

    <Dialog :open="confirmOpen" @update:open="(o: boolean) => (confirmOpen = o)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ isSchedule ? '確認排程' : '確認發送' }}</DialogTitle>
          <DialogDescription>
            {{
              isSchedule
                ? `到了預定時間，後端會寄給 ${confirmCount} 位使用者。送出前可以取消。`
                : `這則通知會立刻送給 ${confirmCount} 位使用者，送出後無法收回。`
            }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3 text-sm">
          <div class="flex items-center justify-between rounded-xl border border-border px-3 py-2">
            <span class="text-foreground/70">收件人</span>
            <span class="font-semibold">{{ recipientLabel }} · {{ confirmCount }} 人</span>
          </div>
          <div v-if="isSchedule" class="flex items-center justify-between rounded-xl border border-border px-3 py-2">
            <span class="text-foreground/70">預定時間</span>
            <span class="font-semibold">{{ scheduledAt.replace('T', ' ') }}</span>
          </div>
          <NotifPreviewCard
            :title="renderedTitle"
            :body="renderedBody"
            :action-url="actionUrl"
            :action-label="actionLabel"
            :now="now"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button :disabled="sending" @click="performSend">
            {{ isSchedule ? '確認排程' : '確認發送' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
