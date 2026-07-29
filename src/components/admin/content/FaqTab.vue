<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
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
import { Switch } from '@/components/ui/switch/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useAdminContent } from '@/src/composables/admin/useAdminContent'
import type { FaqCategory, FaqEntry } from '@/src/mocks/admin/content'

const { faqs, saveFaq, removeFaq, moveFaq } = useAdminContent()

const categories: FaqCategory[] = ['租屋流程', '契約分析', '租金補貼', '帳號問題']

const grouped = computed(() =>
  categories.map((category) => ({
    category,
    items: faqs.value
      .filter((item) => item.category === category)
      .sort((a, b) => a.order - b.order),
  })),
)

const dialogOpen = ref(false)
const deleteTarget = ref<FaqEntry | null>(null)

interface DraftState {
  id?: string
  question: string
  answer: string
  category: FaqCategory
  published: boolean
}

const draft = ref<DraftState>(emptyDraft())

function emptyDraft(): DraftState {
  return { question: '', answer: '', category: '租屋流程', published: true }
}

function openCreate(): void {
  draft.value = emptyDraft()
  dialogOpen.value = true
}

function openEdit(item: FaqEntry): void {
  draft.value = {
    id: item.id,
    question: item.question,
    answer: item.answer,
    category: item.category,
    published: item.published,
  }
  dialogOpen.value = true
}

function submit(): void {
  saveFaq({ ...draft.value })
  dialogOpen.value = false
}

function confirmDelete(): void {
  if (deleteTarget.value) removeFaq(deleteTarget.value.id)
  deleteTarget.value = null
}

const canSubmit = () => draft.value.question.trim() !== '' && draft.value.answer.trim() !== ''
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-end">
      <Button @click="openCreate">新增問答</Button>
    </div>

    <div v-for="group in grouped" :key="group.category" class="space-y-2">
      <h3 class="text-sm font-semibold text-muted-foreground">{{ group.category }}</h3>
      <div v-if="group.items.length === 0" class="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        此分類尚無問答。
      </div>
      <div
        v-for="(item, index) in group.items"
        :key="item.id"
        class="flex items-start justify-between gap-3 rounded-2xl border bg-muted/10 p-4"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-medium">{{ item.question }}</p>
            <Badge :variant="item.published ? 'default' : 'secondary'">
              {{ item.published ? '已發布' : '未發布' }}
            </Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">{{ item.answer }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" :disabled="index === 0" @click="moveFaq(item.id, 'up')">
            <ChevronUp class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" :disabled="index === group.items.length - 1" @click="moveFaq(item.id, 'down')">
            <ChevronDown class="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" @click="openEdit(item)">編輯</Button>
          <Button variant="destructive" size="sm" @click="deleteTarget = item">刪除</Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ draft.id ? '編輯問答' : '新增問答' }}</DialogTitle>
          <DialogDescription>常見問題會顯示於使用者說明頁。</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="faq-q">問題</Label>
            <Input id="faq-q" v-model="draft.question" />
          </div>
          <div class="space-y-2">
            <Label for="faq-a">回答</Label>
            <Textarea id="faq-a" v-model="draft.answer" rows="3" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>分類</Label>
              <Select v-model="draft.category">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in categories" :key="c" :value="c">{{ c }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex items-center justify-between rounded-xl border px-3">
              <Label class="mb-0">發布</Label>
              <Switch v-model="draft.published" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="!canSubmit()" @click="submit">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>刪除問答？</DialogTitle>
          <DialogDescription>「{{ deleteTarget?.question }}」將被永久刪除。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="confirmDelete">確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
