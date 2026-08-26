<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Progress } from '@/components/ui/progress/index'
import { ArrowLeft } from 'lucide-vue-next'
import { useAdminNotifications } from '@/src/composables/admin/useAdminNotifications'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { groupIntoBatches } from '@/src/utils/notif-batch'
import { formatDateTime } from '@/src/utils/admin-format'
import type { NotifChannel, NotifDeliveryStatus } from '@/src/mocks/admin/notifications'

const route = useRoute()
const router = useRouter()

const { messages } = useAdminNotifications()
const { users } = useAdminUsers()

const batchId = computed(() => String(route.params.batchId ?? ''))

// 跟列表頁用同一個聚合函式，保證「列表看到的批次」跟「詳情頁打開的批次」是同一份定義，
// 不會因為兩邊各自寫一套判斷邏輯而兜不起來。
const batch = computed(() => groupIntoBatches(messages.value).find((item) => item.batchId === batchId.value) ?? null)

function backToLog(): void {
  void router.push('/admin/notifications?tab=log')
}

function nicknameOf(email: string): string | null {
  return users.value.find((user) => user.email === email)?.nickname ?? null
}

const channelLabels: Record<NotifChannel, string> = {
  inapp: '站內',
  email: 'Email',
  push: '推播',
}

// pending 代表後端還沒接、實際上沒寄出去，樣式必須跟真的送達明顯不同，否則等於謊報已送達。
function channelClass(status: NotifDeliveryStatus | undefined): string {
  return status === 'sent'
    ? 'border-transparent bg-primary/10 text-primary'
    : 'border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground'
}

function channelText(channel: NotifChannel, status: NotifDeliveryStatus | undefined): string {
  return status === 'sent' ? channelLabels[channel] : `${channelLabels[channel]} · 待接通`
}

// 舊資料的 sourceLabel 是補上去的空字串——不知道當初是不是套模板，
// 顯示成「一次性撰寫」等於偽造來源，用「—」老實標示「不知道」。
const sourceLabel = computed(() => {
  const value = batch.value?.recipients[0]?.sourceLabel
  return value && value.trim() !== '' ? value : '—'
})

const readCount = computed(() => batch.value?.recipients.filter((item) => item.read).length ?? 0)
const totalCount = computed(() => batch.value?.recipients.length ?? 0)
const readPercent = computed(() => (totalCount.value === 0 ? 0 : Math.round((readCount.value / totalCount.value) * 100)))

/* -------------------- 收件人清單：可搜尋 -------------------- */

const recipientSearch = ref('')

const filteredRecipients = computed(() => {
  const keyword = recipientSearch.value.trim().toLowerCase()
  const recipients = batch.value?.recipients ?? []
  if (keyword === '') return recipients
  return recipients.filter((item) => {
    const nickname = nicknameOf(item.userEmail) ?? ''
    return item.userEmail.toLowerCase().includes(keyword) || nickname.toLowerCase().includes(keyword)
  })
})
</script>

<template>
  <div v-if="batch" class="space-y-6">
    <Button variant="ghost" size="sm" class="-ml-2" @click="backToLog">
      <ArrowLeft class="mr-1 h-4 w-4" />
      返回發送紀錄
    </Button>

    <div>
      <h1 class="text-2xl font-black tracking-tight">{{ batch.title }}</h1>
      <p class="mt-1 text-muted-foreground">{{ formatDateTime(batch.createdAt) }} 發送</p>
    </div>

    <!-- 通知內容 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>通知內容</CardTitle></CardHeader>
      <CardContent class="space-y-3">
        <div>
          <p class="text-xs font-medium text-muted-foreground">標題</p>
          <p class="font-medium">{{ batch.title }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-muted-foreground">內文</p>
          <p class="whitespace-pre-wrap text-sm text-muted-foreground">{{ batch.recipients[0].body }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-muted-foreground">來源</p>
          <p class="text-sm">{{ sourceLabel }}</p>
        </div>
      </CardContent>
    </Card>

    <!-- 發送資訊 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>發送資訊</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-3">
          <div>
            <p class="text-xs font-medium text-muted-foreground">收件人條件</p>
            <p class="font-medium">{{ batch.recipientLabel }}</p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted-foreground">人數</p>
            <p class="font-medium">{{ totalCount }} 人</p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted-foreground">發送時間</p>
            <p class="font-medium">{{ formatDateTime(batch.createdAt) }}</p>
          </div>
        </div>
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">管道送達狀態</p>
          <div class="flex flex-wrap gap-1.5">
            <Badge
              v-for="ch in batch.channels"
              :key="ch"
              variant="outline"
              :class="channelClass(batch.recipients[0].deliveryStatus[ch])"
            >
              {{ channelText(ch, batch.recipients[0].deliveryStatus[ch]) }}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 已讀統計 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>已讀統計</CardTitle></CardHeader>
      <CardContent class="space-y-2">
        <p class="text-2xl font-black">{{ readCount }} / {{ totalCount }} 已讀</p>
        <Progress :model-value="readPercent" />
      </CardContent>
    </Card>

    <!-- 收件人清單 -->
    <Card class="rounded-3xl">
      <CardHeader><CardTitle>收件人清單（{{ totalCount }} 位）</CardTitle></CardHeader>
      <CardContent class="space-y-3">
        <Input v-model="recipientSearch" placeholder="搜尋 Email 或暱稱" />
        <div class="divide-y rounded-xl border">
          <div
            v-for="item in filteredRecipients"
            :key="item.id"
            class="flex items-center justify-between px-3 py-2 text-sm"
          >
            <div>
              <p class="font-medium">{{ nicknameOf(item.userEmail) ?? item.userEmail }}</p>
              <p v-if="nicknameOf(item.userEmail)" class="text-xs text-muted-foreground">
                {{ item.userEmail }}
              </p>
            </div>
            <Badge :variant="item.read ? 'secondary' : 'default'">
              {{ item.read ? '已讀' : '未讀' }}
            </Badge>
          </div>
          <p v-if="filteredRecipients.length === 0" class="px-3 py-6 text-center text-sm text-muted-foreground">
            沒有符合的收件人
          </p>
        </div>
      </CardContent>
    </Card>
  </div>

  <div v-else class="space-y-4 py-16 text-center">
    <p class="text-muted-foreground">找不到這筆發送紀錄。</p>
    <Button variant="outline" @click="backToLog">返回發送紀錄</Button>
  </div>
</template>
