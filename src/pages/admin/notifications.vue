<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import TemplatesTab from '@/src/components/admin/notifications/TemplatesTab.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">通知模板</h1>
      <p class="mt-1 text-muted-foreground">管理通知模板內容與變數，並發送給指定對象。</p>
    </div>

    <Tabs default-value="templates">
      <TabsList>
        <TabsTrigger value="templates">通知模板</TabsTrigger>
        <TabsTrigger value="log">發送紀錄</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" class="mt-4"><TemplatesTab /></TabsContent>
      <TabsContent value="log" class="mt-4"><SentLogTab /></TabsContent>
    </Tabs>
  </div>
</template>
