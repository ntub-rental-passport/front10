<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs/index'
import AnnouncementsTab from '@/src/components/admin/content/AnnouncementsTab.vue'
import FaqTab from '@/src/components/admin/content/FaqTab.vue'
import LegalDocsTab from '@/src/components/admin/content/LegalDocsTab.vue'
import BannersTab from '@/src/components/admin/content/BannersTab.vue'
import TemplatesTab from '@/src/components/admin/notifications/TemplatesTab.vue'
import SentLogTab from '@/src/components/admin/notifications/SentLogTab.vue'

// 上層分頁用實心大按鈕、下層用膠囊，避免兩排外觀相同的分頁難以分辨層級。
const SECTION_TRIGGER =
  'px-6 py-2.5 text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
const SUB_TRIGGER =
  'rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-black tracking-tight">內容與通知</h1>
      <p class="mt-1 text-muted-foreground">
        管理平台對外呈現的內容，以及發送給使用者的通知。
      </p>
    </div>

    <Tabs default-value="content">
      <TabsList class="rounded-xl p-1.5">
        <TabsTrigger value="content" :class="SECTION_TRIGGER">內容</TabsTrigger>
        <TabsTrigger value="notifications" :class="SECTION_TRIGGER">通知</TabsTrigger>
      </TabsList>

      <TabsContent value="content" class="mt-5">
        <Tabs default-value="announcements">
          <TabsList class="rounded-full bg-muted/60">
            <TabsTrigger value="announcements" :class="SUB_TRIGGER">公告</TabsTrigger>
            <TabsTrigger value="faq" :class="SUB_TRIGGER">常見問題</TabsTrigger>
            <TabsTrigger value="legal" :class="SUB_TRIGGER">法律文件</TabsTrigger>
            <TabsTrigger value="banner" :class="SUB_TRIGGER">首頁輪播</TabsTrigger>
          </TabsList>
          <TabsContent value="announcements" class="mt-4"><AnnouncementsTab /></TabsContent>
          <TabsContent value="faq" class="mt-4"><FaqTab /></TabsContent>
          <TabsContent value="legal" class="mt-4"><LegalDocsTab /></TabsContent>
          <TabsContent value="banner" class="mt-4"><BannersTab /></TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="notifications" class="mt-5">
        <Tabs default-value="templates">
          <TabsList class="rounded-full bg-muted/60">
            <TabsTrigger value="templates" :class="SUB_TRIGGER">通知模板</TabsTrigger>
            <TabsTrigger value="log" :class="SUB_TRIGGER">發送紀錄</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" class="mt-4"><TemplatesTab /></TabsContent>
          <TabsContent value="log" class="mt-4"><SentLogTab /></TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  </div>
</template>
