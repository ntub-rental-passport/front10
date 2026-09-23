<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { useAdminNotifications } from '@/src/composables/admin/useAdminNotifications'
import { useNow } from '@/src/composables/useNow'
import { createScheduled } from '@/src/services/scheduledNotificationApi'
import {
  fromDateTimeLocal,
  maxScheduleValue,
  minScheduleValue,
  toDateTimeLocal,
} from '@/src/utils/notif-schedule'
import type { NotifCategory } from '@/src/mocks/admin-seed'

/**
 * 排程發送。
 *
 * 刻意**不**沿用 SendNotificationDialog：那個對話框可以挑個別使用者，
 * 挑的是後台前端那份 localStorage 的示範資料。排程是後端在寄真的 Email，
 * 收件人來自資料庫裡真正註冊過的帳號 —— 兩份名單不是同一批人。
 * 讓管理員在這裡挑示範資料裡的「王小明」，然後後端找不到這個人，
 * 是最糟的那種失敗：畫面上看起來成功了。
 *
 * 所以這裡只提供角色條件，而且在畫面上把這件事寫出來。
 */

const props = defineProps<{ open: boolean; emailAvailable: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; created: [] }>()

const { templates } = useAdminNotifications()
const now = useNow()

const CATEGORY_OPTIONS: NotifCategory[] = ['系統', '租約', '補貼', '帳務']

/** 放在 script 而不是直接寫進 template：雙大括號會被 Vue 當成插值語法。 */
const VARIABLE_EXAMPLE = '{{姓名}}'

const ROLE_OPTIONS = [
  { value: 'all', label: '全部使用者' },
  { value: 'user', label: '全部租客' },
  { value: 'landlord', label: '全部房東' },
] as const

const templateId = ref('')
const title = ref('')
const body = ref('')
const category = ref<NotifCategory>('系統')
const role = ref<'all' | 'user' | 'landlord'>('all')
const scheduledAt = ref('')
const submitting = ref(false)
const error = ref('')

const minValue = computed(() => minScheduleValue(now.value))
const maxValue = computed(() => maxScheduleValue(now.value))

const roleLabel = computed(
  () => ROLE_OPTIONS.find((option) => option.value === role.value)?.label ?? '全部使用者',
)

/** 只有啟用中的模板能當範本 —— 停用的模板不該從別的入口繞回來。 */
const enabledTemplates = computed(() => templates.value.filter((item) => item.enabled))

// 套模板只是「把文字填進來」，填完之後管理員還可以改。
// 不存 templateId 到後端：排程當下看到什麼就寄什麼，模板之後被改不該影響已排的那一則。
watch(templateId, (id) => {
  const template = enabledTemplates.value.find((item) => item.id === id)
  if (!template) return
  title.value = template.title
  body.value = template.body
  category.value = template.category
})

function reset(): void {
  templateId.value = ''
  title.value = ''
  body.value = ''
  category.value = '系統'
  role.value = 'all'
  // 預設排到一小時後的整點，管理員通常只會微調而不是從零填起
  const next = new Date(now.value.getTime() + 60 * 60 * 1000)
  next.setMinutes(0, 0, 0)
  scheduledAt.value = toDateTimeLocal(next)
  submitting.value = false
  error.value = ''
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) reset()
  },
)

const canSubmit = computed(
  () =>
    props.emailAvailable &&
    title.value.trim() !== '' &&
    body.value.trim() !== '' &&
    scheduledAt.value !== '' &&
    !submitting.value,
)

async function submit(): Promise<void> {
  error.value = ''
  submitting.value = true
  try {
    await createScheduled({
      title: title.value.trim(),
      body: body.value.trim(),
      category: category.value,
      channels: ['email'],
      recipient: { kind: 'role', role: role.value },
      recipientLabel: roleLabel.value,
      sourceLabel:
        enabledTemplates.value.find((item) => item.id === templateId.value)?.name ?? '一次性撰寫',
      scheduledAt: fromDateTimeLocal(scheduledAt.value),
    })
    emit('created')
    emit('update:open', false)
  } catch (failure) {
    // 後端的訊息是寫給管理員看的（時間在過去、超過一年、SMTP 沒設定…），原樣顯示
    error.value = failure instanceof Error ? failure.message : '排程失敗。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>排程發送</DialogTitle>
        <DialogDescription>
          到了預定時間，後端會自己把 Email 寄出去，不需要有人開著後台。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div v-if="!emailAvailable" class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          後端尚未設定 Gmail 寄信服務（SMTP），現在無法排程。
        </div>

        <div class="space-y-2">
          <Label>套用模板（可不選）</Label>
          <Select v-model="templateId">
            <SelectTrigger><SelectValue placeholder="自由撰寫" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in enabledTemplates" :key="item.id" :value="item.id">
                {{ item.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-foreground/70">
            套用後文字可以再改。排程存的是當下這段文字 —— 模板之後被改或被刪，不會影響已排好的通知。
          </p>
        </div>

        <div class="space-y-2">
          <Label for="sched-title">標題</Label>
          <Input id="sched-title" v-model="title" placeholder="例如：系統維護預告" />
        </div>

        <div class="space-y-2">
          <Label for="sched-body">內文</Label>
          <Textarea id="sched-body" v-model="body" rows="5" />
          <p class="text-xs text-foreground/70">
            這封信會照這段文字原樣寄出，不會代入 {{ VARIABLE_EXAMPLE }} 這類變數 ——
            排程是整批寄同一封，後端沒有逐人代入的資料。
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label>分類</Label>
            <Select v-model="category">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in CATEGORY_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>對象</Label>
            <Select v-model="role">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!--
          這句必須留著。後台「使用者管理」那份名單是前端的示範資料，
          排程寄的是資料庫裡真正註冊過的帳號，兩邊人數本來就會不一樣。
        -->
        <p class="rounded-lg bg-muted/50 p-3 text-xs text-foreground/70">
          收件人在<span class="font-medium text-foreground">送出當下</span>才從資料庫算出來，
          指的是那一刻真正註冊、且未被停用的帳號 —— 不是「使用者管理」頁的示範資料。
          排程期間新註冊的人也會收到。
        </p>

        <div class="space-y-2">
          <Label for="sched-at">預定時間</Label>
          <Input
            id="sched-at"
            v-model="scheduledAt"
            type="datetime-local"
            :min="minValue"
            :max="maxValue"
          />
          <p class="text-xs text-foreground/70">
            後端每 20 秒檢查一次，所以實際寄出時間會落在預定時間之後幾十秒內。
          </p>
        </div>

        <p v-if="error" class="text-sm font-medium text-destructive">{{ error }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!canSubmit" @click="submit">
          {{ submitting ? '排程中…' : '確認排程' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
