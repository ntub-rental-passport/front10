<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  Calculator,
  ClipboardList,
  FilePlus2,
  ListChecks,
  UploadCloud,
  Users,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'

type TabGroup = 'subsidy' | 'notes'

const props = defineProps<{
  group: TabGroup
}>()

const route = useRoute()

const tabs = computed(() => {
  if (props.group === 'subsidy') {
    return [
      { label: '租補試算', path: '/app/subsidy', icon: Calculator },
      { label: '租補申請', path: '/app/subsidy/apply', icon: FilePlus2 },
      { label: '申請進度', path: '/app/subsidy/progress', icon: ListChecks },
      { label: '補件上傳', path: '/app/subsidy/upload', icon: UploadCloud },
    ]
  }

  return [
    { label: '個人備忘', path: '/app/notes', icon: ClipboardList },
    { label: '室友協作', path: '/app/notes/roommates', icon: Users },
  ]
})
</script>

<template>
  <div class="mb-5 overflow-x-auto rounded-full border bg-white p-1 shadow-sm">
    <nav class="flex min-w-max items-center gap-1">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        :class="cn(
          'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
          route.path === tab.path
            ? 'bg-[#4845A5] text-white shadow-sm'
            : 'text-slate-600 hover:bg-[#F0EFFE] hover:text-[#4845A5]',
        )"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        <span>{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
