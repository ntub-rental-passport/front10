<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import TemplatesTab from '@/src/components/admin/notifications/TemplatesTab.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'

// 與內容管理頁同樣的單層分頁樣式，兩個獨立頁面各自維持一致的視覺語言。
const TAB_TRIGGER =
  'rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">通知管理</h1>
      <p class="mt-1 text-muted-foreground">
        管理發送給使用者的通知模板，並查詢歷史發送紀錄。
      </p>
    </div>

    <Tabs default-value="templates">
      <TabsList class="rounded-full bg-muted/60">
        <TabsTrigger value="templates" :class="TAB_TRIGGER">通知模板</TabsTrigger>
        <TabsTrigger value="log" :class="TAB_TRIGGER">發送紀錄</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" class="mt-4"><TemplatesTab /></TabsContent>
      <TabsContent value="log" class="mt-4"><SentLogTab /></TabsContent>
    </Tabs>
  </div>
</template>
