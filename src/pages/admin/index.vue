<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { ClipboardCheck, RotateCcw, ScrollText, Sparkles, Users } from 'lucide-vue-next'
import { useAdminAudit } from '@/src/composables/admin/useAdminAudit'
import { useAdminAiQuality } from '@/src/composables/admin/useAdminAiQuality'
import { useAdminReview } from '@/src/composables/admin/useAdminReview'
import { useAdminUsers } from '@/src/composables/admin/useAdminUsers'
import { resetAdminData } from '@/src/composables/admin/useAdminStore'
import { formatDateTime } from '@/src/utils/admin-format'

const { users } = useAdminUsers()
const { pendingListings, pendingRatings } = useAdminReview()
const { needsReviewCount } = useAdminAiQuality()
const { events, logAction } = useAdminAudit()

const resetOpen = ref(false)

const todayEventCount = computed(() => {
  const today = new Date().toDateString()
  return events.value.filter((event) => new Date(event.at).toDateString() === today).length
})

const statCards = computed(() => [
  {
    title: '待審核項目',
    value: pendingListings.value.length + pendingRatings.value.length,
    note: `物件 ${pendingListings.value.length} 筆、評價 ${pendingRatings.value.length} 筆`,
    icon: ClipboardCheck,
    to: '/admin/review',
  },
  {
    title: '使用者總數',
    value: users.value.length,
    note: `停用中 ${users.value.filter((user) => user.status === 'suspended').length} 筆`,
    icon: Users,
    to: '/admin/users',
  },
  {
    title: 'AI 品質警示',
    value: needsReviewCount.value,
    note: '低分產出待人工複核',
    icon: Sparkles,
    to: '/admin/ai-quality',
  },
  {
    title: '今日稽核事件',
    value: todayEventCount.value,
    note: '含管理操作與系統事件',
    icon: ScrollText,
    to: '/admin/audit',
  },
])

const queueItems = computed(() => [
  ...pendingListings.value.map((listing) => ({
    id: listing.id,
    label: `物件審核：${listing.title}`,
    to: '/admin/review',
    tag: '審核',
  })),
  ...pendingRatings.value.map((rating) => ({
    id: rating.id,
    label: `評價審核：${rating.listingTitle}`,
    to: '/admin/review',
    tag: '審核',
  })),
  ...(needsReviewCount.value > 0
    ? [
        {
          id: 'ai-review',
          label: `AI 低分產出人工複核（${needsReviewCount.value} 筆）`,
          to: '/admin/ai-quality',
          tag: 'AI品質',
        },
      ]
    : []),
])

function confirmReset(): void {
  resetAdminData()
  logAction('系統', '示範資料', '重置所有後台示範資料')
  resetOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-3">
        <Badge variant="outline" class="rounded-full border-primary/20 bg-primary/5 px-4 py-1.5 text-primary">
          Admin Console
        </Badge>
        <div>
          <h1 class="text-4xl font-black tracking-tight">後台總覽</h1>
          <p class="mt-2 text-muted-foreground">
            集中掌握審核佇列、使用者狀態、AI 品質與稽核事件。
          </p>
        </div>
      </div>
      <Button variant="outline" @click="resetOpen = true">
        <RotateCcw class="mr-1 h-4 w-4" />
        重置示範資料
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <RouterLink v-for="item in statCards" :key="item.title" :to="item.to" class="block">
        <Card class="h-full rounded-[1.5rem] border-border/70 bg-background/90 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">{{ item.title }}</CardTitle>
            <component :is="item.icon" class="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent class="space-y-1">
            <div class="text-3xl font-black">{{ item.value }}</div>
            <p class="text-sm text-muted-foreground">{{ item.note }}</p>
          </CardContent>
        </Card>
      </RouterLink>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>待辦佇列</CardTitle>
          <CardDescription>需要管理員處理的項目，點擊前往對應模組。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <RouterLink
            v-for="item in queueItems"
            :key="item.id"
            :to="item.to"
            class="flex items-center justify-between rounded-2xl border bg-muted/20 p-4 text-sm transition-colors hover:bg-muted/40"
          >
            <span>{{ item.label }}</span>
            <Badge variant="outline">{{ item.tag }}</Badge>
          </RouterLink>
          <p v-if="queueItems.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            目前沒有待辦事項 🎉
          </p>
        </CardContent>
      </Card>

      <Card class="rounded-[1.75rem]">
        <CardHeader>
          <CardTitle>最新稽核事件</CardTitle>
          <CardDescription>最近 5 筆，完整紀錄請到稽核紀錄查詢。</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <div v-for="event in events.slice(0, 5)" :key="event.id" class="rounded-2xl border bg-muted/20 p-3">
            <p class="font-medium">{{ event.detail }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatDateTime(event.at) }}｜{{ event.actor }}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="resetOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置示範資料？</DialogTitle>
          <DialogDescription>
            所有後台模組的資料會還原成種子狀態，先前的操作紀錄將被清除。此動作無法復原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="resetOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmReset">確認重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
