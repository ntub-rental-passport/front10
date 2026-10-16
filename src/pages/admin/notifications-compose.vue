<script setup lang="ts">
import InfoTip from '@/src/components/admin/InfoTip.vue'
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

/** 發送通知的編輯器，提供立即發送、排程與預覽。 */

const route = useRoute()
const router = useRouter()
const now = useNow()

const { templates, sendComposed } = useAdminNotifications()

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

// immediate watcher 會在 setup 讀取 when.value，必須放在相關 ref 宣告之後以免觸發 TDZ。
useRegisterAdminPageTitle(
  computed(() => route.path),
  computed(() => (when.value === 'schedule' ? '排程發送' : '發送通知')),
)

const enabledTemplates = computed(() => templates.value.filter((item) => item.enabled))

const appliedTemplate = computed(
  () => enabledTemplates.value.find((item) => item.id === templateId.value) ?? null,
)

/** 套用模板會將內容複製到本次訊息，後續編輯不影響原模板。 */
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

/** 路由的 catch-all 會將無效連結導回首頁，須用實際 router 驗證連結以免無聲跳轉。 */
const actionIssue = computed(() => {
  const url = actionUrl.value.trim()
  const matched = url === '' ? [] : router.resolve(url).matched.map((record) => record.path)
  return actionLinkError(url, actionLabel.value, matched)
})

const realUsers = ref<AdminAccount[] | null>(null)
const realUsersLoading = ref(false)
let realUsersController: AbortController | undefined

// 立即發送與排程都由後端 users 表計算收件人，畫面必須使用同一份真實帳號名單。
watch(
  when,
  async (value) => {
    if (realUsers.value !== null) return
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

/** 候選人：後端的真實帳號，轉成 notif-audience 認得的格式 */
const candidates = computed<AudienceCandidate[]>(() =>
  (realUsers.value ?? []).map((row) => ({
    email: row.email,
    name: row.displayName,
    roles: row.roles,
    active: row.status === 'active',
  })),
)

const audienceUnavailable = computed(() => realUsers.value === null && !realUsersLoading.value)

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

function channelOn(channel: NotifChannel): boolean {
  return channels.value.includes(channel)
}

function setChannel(channel: NotifChannel, on: boolean): void {
  channels.value = on
    ? [...new Set([...channels.value, channel])]
    : channels.value.filter((item) => item !== channel)
}

const presetTemplate = typeof route.query.template === 'string' ? route.query.template : ''
// ?to= 可以是一個 email，也可以是逗號分隔的好幾個（使用者管理的批次發通知）。
// 重複的、空白的都去掉，不然收件人清單會出現同一個人兩次。
const presetTo = route.query.to
const presetEmails = [
  ...new Set(
    (Array.isArray(presetTo) ? presetTo : [presetTo])
      .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  ),
]
const presetSchedule = route.query.when === 'schedule'

/** 帶有明確 query 意圖時不還原草稿，避免舊草稿混入本次內容或清掉指定收件人。 */
const hasPreset = presetTemplate !== '' || presetEmails.length > 0 || presetSchedule

const restored = hasPreset ? null : readDraft()
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

if (presetTemplate !== '') applyTemplate(presetTemplate)
if (presetEmails.length > 0) {
  recipientKind.value = 'users'
  recipientEmails.value = presetEmails
}
if (presetSchedule) {
  when.value = 'schedule'
  channels.value = ['email']
}

if (scheduledAt.value === '') {
  const next = new Date(now.value.getTime() + 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  scheduledAt.value = toDateTimeLocal(next)
}

// watcher 必須在草稿與 query 初始化後註冊，避免初始化 when 時清掉剛帶入的收件人。
watch(when, () => {
  if (recipientEmails.value.length > 0) recipientEmails.value = []
})

/** 切到排程時只保留 Email，避免不支援且已停用的管道開關阻擋發送。 */
watch(when, (value) => {
  if (value === 'schedule') channels.value = ['email']
})


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

const minValue = computed(() => minScheduleValue(now.value))
const maxValue = computed(() => maxScheduleValue(now.value))

const blockingIssue = computed<string | null>(() => {
  if (renderedTitle.value.trim() === '' || renderedBody.value.trim() === '') {
    return '標題與內文都要填。'
  }
  if (actionIssue.value) return actionIssue.value
  if (channels.value.length === 0) return '請至少選擇一種管道。'
  if (isSchedule.value) {
    // 推播需要每位使用者的裝置訂閱，後端到時間送不出去
    if (channels.value.includes('push')) return '排程不支援推播，請把推播管道關掉。'
    if (scheduledAt.value === '') return '請選擇預定時間。'
  }
  if (audienceUnavailable.value) return '讀不到後端的帳號清單，無法確認會送給誰。'
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

/** 試寄會建立正式通知與發送紀錄，但管理員無權開啟租客收件匣，後台通知中心也不會顯示這筆。 */
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
  recipientKind.value === 'users' ? recipientEmails.value.length : audience.value.total,
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

    <div
      v-if="restoredAt"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm"
    >
      <span>已回復上次未送出的內容。</span>
      <Button variant="outline" size="sm" class="ml-auto" @click="discardDraft">清空重寫</Button>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div class="space-y-6">
        <section class="space-y-4 rounded-2xl border border-border p-5">
          <h2 class="text-sm font-semibold">內容</h2>

          <div class="space-y-2">
            <div class="inline-flex items-center gap-1.5">
              <Label>套用模板（可不選）</Label>
              <InfoTip text="套用後文字可以再改 —— 改的是這一次要送的內容，不會動到模板本身。" />
            </div>
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
            <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold">
              操作按鈕
              <InfoTip text="租客點了會直接到那一頁。不加的話這則通知只能讀，沒有下一步。" />
            </h2>
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
          <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold">
            何時送出
            <InfoTip text="">
              <template v-if="isSchedule">
                <span class="font-medium text-foreground">排程由系統執行</span>，到時間會自己寄出，
                不需要開著後台。收件人是<span class="font-medium text-foreground">已註冊的帳號</span>，
                而且在送出當下才計算。排程可以送站內與 Email，不能送推播。
              </template>
              <template v-else>
                <span class="font-medium text-foreground">立即發送會馬上送進收件人的站內收件匣</span>，
                勾了 Email 的話後端會接著寄信。推播還沒接通，會標成「待接通」。
              </template>
            </InfoTip>
          </h2>

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

          <div v-if="isSchedule" class="space-y-2">
            <div class="inline-flex items-center gap-1.5">
              <Label for="c-at">預定時間</Label>
              <InfoTip text="系統每 20 秒檢查一次，實際寄出會落在預定時間之後幾十秒內。" />
            </div>
            <Input id="c-at" v-model="scheduledAt" type="datetime-local" :min="minValue" :max="maxValue" />
          </div>
        </section>
      </div>

      <div class="lg:sticky lg:top-4 lg:self-start">
        <div class="space-y-4 rounded-2xl border border-border p-5">
          <div>
            <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold">
              租客會看到
              <InfoTip text="未讀狀態的樣子。時間以實際送出為準。" />
            </h2>
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
            <div class="flex items-center gap-1.5">
              <Button
                variant="outline"
                class="flex-1"
                :disabled="sending || renderedTitle.trim() === '' || renderedBody.trim() === ''"
                @click="sendToSelf"
              >
                先寄給我自己
              </Button>
              <InfoTip text="測試發送走跟正式發送一樣的路徑，會標成「測試發送」，發送紀錄預設不顯示。 它驗的是「資料送得出去」，不是租客端畫面 —— 那要用租客帳號才看得到。" />
            </div>
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
