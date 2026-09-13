<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Send } from 'lucide-vue-next'
import { Button } from '@/components/ui/button/index'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import TemplatesTab from '@/src/components/admin/notifications/TemplatesTab.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'
import SendNotificationDialog from '@/src/components/admin/notifications/SendNotificationDialog.vue'

// 與內容管理頁同樣的單層分頁樣式，兩個獨立頁面各自維持一致的視覺語言。
const TAB_TRIGGER =
  'rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm'

const route = useRoute()
const router = useRouter()

// 從批次詳情頁按返回會帶著 ?tab=log，回到這頁時要停在發送紀錄分頁，
// 不然每次看完一筆紀錄都得重新切一次頁籤。其餘情境維持預設的通知模板分頁。
const activeTab = computed<'templates' | 'log'>(() => (route.query.tab === 'log' ? 'log' : 'templates'))

function handleTabChange(value: unknown): void {
  const tab = value as 'templates' | 'log'
  void router.replace({ query: tab === 'log' ? { tab: 'log' } : {} })
}

/*
 * 頁面層級的「發送通知」：不帶模板開啟對話框，所以裡面才會出現「自由撰寫」切換。
 * 模板列上的發送鈕會鎖定該列的模板，等於在這一頁沒有任何路徑可以發一則
 * 一次性通知——只能繞到使用者管理挑一個人才看得到那個切換鈕。這顆補上那條路徑。
 * 放在頁首而非某個分頁裡，是因為兩個分頁都該看得到它。
 */
const sendDialogOpen = ref(false)
const sentMessage = ref('')

function onSent(payload: { count: number; recipientNames: string[] }): void {
  sentMessage.value = `已成功發送給 ${payload.count} 位使用者。`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black tracking-tight">通知管理</h1>
        <p class="mt-1 text-muted-foreground">
          管理發送給使用者的通知模板，並查詢歷史發送紀錄。
        </p>
        <p v-if="sentMessage" class="mt-2 text-sm font-medium text-emerald-600">
          {{ sentMessage }}
        </p>
      </div>
      <Button @click="sendDialogOpen = true">
        <Send class="mr-2 h-4 w-4" />
        發送通知
      </Button>
    </div>

    <Tabs :model-value="activeTab" @update:model-value="handleTabChange">
      <TabsList class="rounded-full bg-muted/60">
        <TabsTrigger value="templates" :class="TAB_TRIGGER">通知模板</TabsTrigger>
        <TabsTrigger value="log" :class="TAB_TRIGGER">發送紀錄</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" class="mt-4"><TemplatesTab /></TabsContent>
      <TabsContent value="log" class="mt-4"><SentLogTab /></TabsContent>
    </Tabs>

    <SendNotificationDialog v-model:open="sendDialogOpen" @sent="onSent" />
  </div>
</template>
