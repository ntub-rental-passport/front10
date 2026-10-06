<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import StatusDot from './StatusDot.vue'
import { useAdminSettings } from '@/src/composables/admin/useAdminSettings'
import { isMaintenanceActive } from '@/src/utils/maintenance'

/**
 * 全站維護狀態。原本長在總覽頁的標題區，搬到導覽列之後每一頁都看得到 ——
 * 維護模式是全站狀態，只在總覽看得到其實不合理。
 *
 * ## 措辭範圍
 *
 * 這顆 chip 只反映 settings.maintenanceMode，它不知道資料庫、API 或 LLM 的
 * 狀況。所以文案是「服務中」而不是「運作正常」：後者是個它擔不起的全域宣告。
 * 真正的系統健康在總覽頁的健康條。
 *
 * ## 導覽列不顯示細節句
 *
 * 「一般使用者可正常進入」這類說明留在 title 屬性裡。導覽列的水平空間要留給
 * 導覽本身，一句完整的話塞進去會把工具列擠掉。
 */
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
    <!-- 正常時是安靜的圓點，維護中整顆變實心警示 chip（見 status-dot.ts） -->
    <StatusDot
      :tone="active ? 'danger' : 'ok'"
      :label="active ? '維護中' : '服務中'"
      emphasize
    />
  </RouterLink>
</template>
