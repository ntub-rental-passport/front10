<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  busy: boolean
  addItems: (room: string, names: string[]) => Promise<string[] | undefined>
}>()
const open = ref(false)
const room = ref('')
const names = ref<string[]>([])
const draft = ref('')
const pending = computed(() =>
  draft.value.trim() ? [...names.value, draft.value.trim()] : names.value,
)
function addDraft() {
  if (!draft.value.trim()) return
  names.value.push(draft.value.trim())
  draft.value = ''
}
async function submit() {
  if (props.busy || !room.value.trim() || !pending.value.length) return
  const failed = await props.addItems(room.value.trim(), pending.value)
  if (!failed) return
  names.value = failed
  draft.value = ''
  if (!failed.length) {
    room.value = ''
    open.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child
      ><Button variant="outline" class="w-full" :disabled="busy"
        ><Plus class="mr-1 h-4 w-4" />新增項目</Button
      ></DialogTrigger
    >
    <DialogContent>
      <DialogHeader
        ><DialogTitle>新增點交項目</DialogTitle
        ><DialogDescription
          >先填房間，再列出這個房間的所有物品，最後一次新增。</DialogDescription
        ></DialogHeader
      >
      <div class="space-y-3 py-2">
        <div class="space-y-1">
          <Label for="handover-new-room">房間</Label
          ><Input id="handover-new-room" v-model="room" placeholder="例如：客廳" :disabled="busy" />
        </div>
        <div class="space-y-2">
          <Label for="handover-new-name">物品名稱</Label>
          <div class="flex items-center gap-2">
            <Input
              id="handover-new-name"
              v-model="draft"
              placeholder="例如：沙發，按 + 或 Enter 加入"
              :disabled="busy"
              @keydown.enter.prevent="addDraft"
            /><Button
              size="icon"
              variant="outline"
              aria-label="加入這項物品"
              :disabled="busy || !draft.trim()"
              @click="addDraft"
              ><Plus class="h-4 w-4"
            /></Button>
          </div>
          <div v-for="(name, index) in names" :key="index" class="flex items-center gap-2">
            <Input :model-value="name" readonly tabindex="-1" /><Button
              size="icon"
              variant="outline"
              :aria-label="`移除 ${name}`"
              :disabled="busy"
              @click="names.splice(index, 1)"
              ><X class="h-4 w-4"
            /></Button>
          </div>
        </div>
      </div>
      <DialogFooter
        ><Button variant="outline" @click="open = false">取消</Button
        ><Button :disabled="busy || !room.trim() || !pending.length" @click="submit"
          >新增 {{ pending.length || '' }} 項</Button
        ></DialogFooter
      >
    </DialogContent>
  </Dialog>
</template>
