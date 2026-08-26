<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import AnnouncementsTab from '@/src/components/admin/content/AnnouncementsTab.vue'
import BannersTab from '@/src/components/admin/content/BannersTab.vue'

// 通知已拆到獨立頁面，這裡只剩一層分頁，膠囊樣式就夠用，不用再分兩層。
const TAB_TRIGGER =
  'rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">內容管理</h1>
      <p class="mt-1 text-muted-foreground">管理平台對外呈現的公告與首頁輪播。</p>
    </div>

    <Tabs default-value="announcements">
      <TabsList class="rounded-full bg-muted/60">
        <TabsTrigger value="announcements" :class="TAB_TRIGGER">公告</TabsTrigger>
        <TabsTrigger value="banner" :class="TAB_TRIGGER">首頁輪播</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements" class="mt-4"><AnnouncementsTab /></TabsContent>
      <TabsContent value="banner" class="mt-4"><BannersTab /></TabsContent>
    </Tabs>
  </div>
</template>
