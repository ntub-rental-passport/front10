<script setup lang="ts">
import { ref, computed } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const emit = defineEmits<{ next: [] }>()

const criteria = [
  { id: 'residency', label: '設籍於申請縣市且實際居住於租屋處' },
  { id: 'age', label: '年齡20歲以上' },
  { id: 'income', label: '家庭年所得符合規定（依縣市公告）' },
  { id: 'contract', label: '租屋契約合法有效' },
  { id: 'noother', label: '未享有其他住宅補貼' },
]

const checked = ref<Record<string, boolean>>({})
const allChecked = computed(() => criteria.every(c => checked.value[c.id]))
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold">資格確認</h2>
      <p class="text-sm text-muted-foreground mt-1">請確認您符合以下所有申請資格</p>
    </div>
    <div class="space-y-3">
      <div v-for="criterion in criteria" :key="criterion.id" class="flex items-start gap-3">
        <Checkbox
          :id="criterion.id"
          v-model="checked[criterion.id]"
          class="mt-0.5"
        />
        <Label :for="criterion.id" class="text-sm leading-relaxed cursor-pointer">
          {{ criterion.label }}
        </Label>
      </div>
    </div>
    <Button class="w-full" :disabled="!allChecked" @click="emit('next')">
      下一步
    </Button>
  </div>
</template>
