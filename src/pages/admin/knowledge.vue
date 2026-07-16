<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent } from '@/components/ui/card/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Switch } from '@/components/ui/switch/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Plus } from 'lucide-vue-next'
import {
  knowledgeCategories,
  useAdminKnowledge,
} from '@/src/composables/admin/useAdminKnowledge'
import { formatDate } from '@/src/utils/admin-format'
import type { KnowledgeCategory, KnowledgeEntry } from '@/src/mocks/admin-seed'

const { entries, saveEntry, toggleEnabled } = useAdminKnowledge()

const editorOpen = ref(false)
const form = reactive({
  id: undefined as string | undefined,
  title: '',
  category: '租賃專法' as KnowledgeCategory,
  content: '',
})

function openCreate(): void {
  form.id = undefined
  form.title = ''
  form.category = '租賃專法'
  form.content = ''
  editorOpen.value = true
}

function openEdit(entry: KnowledgeEntry): void {
  form.id = entry.id
  form.title = entry.title
  form.category = entry.category
  form.content = entry.content
  editorOpen.value = true
}

function submit(): void {
  if (!form.title.trim() || !form.content.trim()) return
  saveEntry({
    id: form.id,
    title: form.title.trim(),
    category: form.category,
    content: form.content.trim(),
  })
  editorOpen.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl font-black tracking-tight">法規知識庫維護</h1>
        <p class="mt-1 text-muted-foreground">
          管理 RAG 契約分析引用的法規條目；停用的條目不會進入檢索。
        </p>
      </div>
      <Button @click="openCreate">
        <Plus class="mr-1 h-4 w-4" />
        新增條目
      </Button>
    </div>

    <Card class="rounded-[1.5rem]">
      <CardContent class="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>標題</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>更新日</TableHead>
              <TableHead>啟用</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="entry in entries" :key="entry.id">
              <TableCell class="max-w-96 font-medium">{{ entry.title }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{ entry.category }}</Badge>
              </TableCell>
              <TableCell>v{{ entry.version }}</TableCell>
              <TableCell>{{ formatDate(entry.updatedAt) }}</TableCell>
              <TableCell>
                <Switch
                  :model-value="entry.enabled"
                  @update:model-value="toggleEnabled(entry.id)"
                />
              </TableCell>
              <TableCell class="text-right">
                <Button variant="outline" size="sm" @click="openEdit(entry)">編輯</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog v-model:open="editorOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ form.id ? '編輯條目' : '新增條目' }}</DialogTitle>
          <DialogDescription>
            {{ form.id ? '儲存後版本號會加一。' : '新條目建立後預設為啟用。' }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="kb-title">標題</Label>
            <Input id="kb-title" v-model="form.title" placeholder="例如：民法第 429 條－出租人修繕義務" />
          </div>
          <div class="space-y-2">
            <Label>分類</Label>
            <Select v-model="form.category">
              <SelectTrigger class="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="category in knowledgeCategories" :key="category" :value="category">
                  {{ category }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="kb-content">內文</Label>
            <Textarea id="kb-content" v-model="form.content" rows="6" placeholder="條文內容或白話說明" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editorOpen = false">取消</Button>
          <Button :disabled="!form.title.trim() || !form.content.trim()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
