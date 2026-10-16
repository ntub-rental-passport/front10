<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import StatusDot from './StatusDot.vue'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { isMaintenanceActive } from '@/src/utils/maintenance'

/** 全站維護狀態僅反映 settings.maintenanceMode，不代表資料庫、API 或 LLM 的健康狀況。 */
const { settings } = useAdminSettings()

// 開關打開不代表此刻生效，排程可能尚未開始或已結束
const active = computed(() => isMaintenanceActive(settings.value))

const detail = computed(() => {
  if (active.value) return '一般使用者目前看到維護頁'
  if (settings.value.maintenanceMode) return '維護模式已開啟，依排程此刻尚未生效'
  // 個別功能可以被功能開關單獨關掉，所以不能說「所有功能開放中」
  return '一般使用者可正常進入'
})
</script>

<template>
  <RouterLink
    to="/admin/settings"
    :title="detail"
    class="hidden items-center rounded-full transition-colors lg:inline-flex"
    :class="active ? undefined : 'px-1 hover:bg-muted'"
  >
    <StatusDot
      :tone="active ? 'danger' : 'ok'"
      :label="active ? '維護中' : '服務中'"
      emphasize
    />
  </RouterLink>
</template>
