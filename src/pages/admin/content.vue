<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import AnnouncementsTab from '@/src/components/admin/content/AnnouncementsTab.vue'
import BannersTab from '@/src/components/admin/content/BannersTab.vue'
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/src/components/admin/admin-tabs'

// 通知已拆到獨立頁面，這裡只剩一層分頁，膠囊樣式就夠用，不用再分兩層。
</script>

<template>
  <div class="space-y-6">
    <Tabs default-value="announcements">
      <TabsList :class="ADMIN_TAB_LIST">
        <TabsTrigger value="announcements" :class="ADMIN_TAB_TRIGGER">公告</TabsTrigger>
        <TabsTrigger value="banner" :class="ADMIN_TAB_TRIGGER">首頁輪播</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements" class="mt-4"><AnnouncementsTab /></TabsContent>
      <TabsContent value="banner" class="mt-4"><BannersTab /></TabsContent>
    </Tabs>
  </div>
</template>
