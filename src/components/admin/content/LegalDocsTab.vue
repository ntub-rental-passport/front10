<script setup lang="ts">
import { reactive } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import { formatDateTime } from '@/src/utils/admin-format'

const { legalDocs, saveLegalDoc } = useAdminContent()

const drafts = reactive<Record<string, { title: string; body: string }>>({})

for (const doc of legalDocs.value) {
  drafts[doc.id] = { title: doc.title, body: doc.body }
}

function isDirty(id: string, title: string, body: string): boolean {
  return drafts[id] && (drafts[id].title !== title || drafts[id].body !== body)
}

function save(id: string): void {
  saveLegalDoc(id, drafts[id].title, drafts[id].body)
}
</script>

<template>
  <div class="space-y-6">
    <Card v-for="doc in legalDocs" :key="doc.id" class="rounded-3xl">
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>{{ doc.title }}</CardTitle>
            <CardDescription>目前版本 v{{ doc.version }}｜最後更新 {{ formatDateTime(doc.updatedAt) }}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label :for="`legal-title-${doc.id}`">標題</Label>
          <Input :id="`legal-title-${doc.id}`" v-model="drafts[doc.id].title" />
        </div>
        <div class="space-y-2">
          <Label :for="`legal-body-${doc.id}`">內容</Label>
          <Textarea :id="`legal-body-${doc.id}`" v-model="drafts[doc.id].body" rows="6" />
        </div>
        <div class="flex justify-end">
          <Button :disabled="!isDirty(doc.id, doc.title, doc.body)" @click="save(doc.id)">
            儲存並發布新版本
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
