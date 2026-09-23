<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Send } from 'lucide-vue-next'
import { Button } from '@/components/ui/button/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import TemplatesTab from '@/src/components/admin/notifications/TemplatesTab.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'
import ScheduleTab from '@/src/components/admin/notifications/ScheduleTab.vue'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'

// 與內容管理頁同樣的單層分頁樣式，兩個獨立頁面各自維持一致的視覺語言。
const route = useRoute()
const router = useRouter()

// 從批次詳情頁按返回會帶著 ?tab=log，回到這頁時要停在發送紀錄分頁，
// 不然每次看完一筆紀錄都得重新切一次頁籤。其餘情境維持預設的通知模板分頁。
type NotifTab = 'templates' | 'log' | 'schedule'

const TAB_QUERY: NotifTab[] = ['log', 'schedule']

const activeTab = computed<NotifTab>(() =>
  TAB_QUERY.includes(route.query.tab as NotifTab) ? (route.query.tab as NotifTab) : 'templates',
)

function handleTabChange(value: unknown): void {
  const tab = value as NotifTab
  void router.replace({ query: TAB_QUERY.includes(tab) ? { tab } : {} })
}

/*
 * 發送改成整頁編輯器（/admin/notifications/compose）。
 * 原本是一顆按鈕開一個 max-h-[85vh] 的捲動對話框，預覽在摺線以下 ——
 * 套個有變數的模板就等於盲寫。
 *
 * 送完會帶著 ?sent=N 導回來，在這裡回報一次結果。
 */
const sentMessage = computed(() => {
  const count = route.query.sent
  return typeof count === 'string' && count !== '' ? `已成功發送給 ${count} 位使用者。` : ''
})
</script>

<template>
  <div class="space-y-6">
    <!-- 標題移到頂部列（見 src/utils/admin-page-title.ts），這裡只剩動作與提示 -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p v-if="sentMessage" class="text-sm font-medium text-success">
        {{ sentMessage }}
      </p>
      <Button class="ml-auto" @click="router.push('/admin/notifications/compose')">
        <Send class="mr-2 h-4 w-4" />
        發送通知
      </Button>
    </div>

    <Tabs :model-value="activeTab" @update:model-value="handleTabChange">
      <TabsList :class="ADMIN_TAB_LIST">
        <TabsTrigger value="templates" :class="ADMIN_TAB_TRIGGER">通知模板</TabsTrigger>
        <TabsTrigger value="log" :class="ADMIN_TAB_TRIGGER">發送紀錄</TabsTrigger>
        <TabsTrigger value="schedule" :class="ADMIN_TAB_TRIGGER">排程</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" class="mt-4"><TemplatesTab /></TabsContent>
      <TabsContent value="log" class="mt-4"><SentLogTab /></TabsContent>
      <TabsContent value="schedule" class="mt-4"><ScheduleTab /></TabsContent>
    </Tabs>

  </div>
</template>
