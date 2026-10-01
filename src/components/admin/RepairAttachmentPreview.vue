<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchAdminRepairMedia, type AdminRepairMedia } from '@/src/services/adminRepairApi'
const props = defineProps<{ media: AdminRepairMedia
  /** 附件端點在工單底下，要同時給工單的流水號 */
  ticketId: string
}>()
const url = ref('')
const error = ref('')
let request = 0
function release(): void {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}
async function load(): Promise<void> {
  const current = ++request
  release()
  error.value = ''
  try {
    const blob = await fetchAdminRepairMedia(props.ticketId, props.media)
    if (current !== request) return
    url.value = URL.createObjectURL(blob)
  } catch (cause) {
    if (current === request) error.value = cause instanceof Error ? cause.message : '讀不到附件。'
  }
}
watch(() => props.media.id, load, { immediate: true })
onBeforeUnmount(() => { request += 1; release() })
</script>

<template>
  <div class="rounded-xl border border-border p-2">
    <a v-if="url" :href="url" :download="media.name" class="block break-all text-sm underline underline-offset-2">
      <img v-if="media.type.startsWith('image/')" :src="url" :alt="media.name" class="mb-2 h-28 w-full rounded-lg object-contain" />
      {{ media.name }}
    </a>
    <p v-else-if="error" role="alert" class="text-sm">
      {{ error }} <button class="underline" @click="load">重新讀取</button>
    </p>
    <p v-else class="text-sm text-muted-foreground">正在讀取 {{ media.name }}…</p>
  </div>
</template>
