<script setup lang="ts">
/**
 * 工單詳情與操作。
 *
 * 工單頁與使用者詳情頁共用同一份操作邏輯 —— 兩邊寫的是同一個 collection，
 * 任一邊推進狀態，另一邊的畫面會直接跟著更新。
 */
import { computed, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import {
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceTransitions,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'

const props = defineProps<{ ticket: MaintenanceTicketView }>()

const { advanceStatus, saveAdminNote, error } = useAdminMaintenance()

const changeNote = ref('')
const adminNoteDraft = ref(props.ticket.adminNote)

// 切換到另一張工單時把草稿換掉，否則會把前一張的註記帶過去
watch(
  () => props.ticket.id,
  () => {
    changeNote.value = ''
    adminNoteDraft.value = props.ticket.adminNote
    error.value = ''
  },
)

const nextStatuses = computed<MaintenanceStatus[]>(
  () => maintenanceTransitions[props.ticket.status],
)

function statusBadgeVariant(status: MaintenanceStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'overdue' || status === 'disputed') return 'destructive'
  if (status === 'completed' || status === 'closed') return 'secondary'
  return 'default'
}

function handleAdvance(next: MaintenanceStatus): void {
  if (advanceStatus(props.ticket.id, next, changeNote.value)) {
    changeNote.value = ''
  }
}

function handleSaveNote(): void {
  saveAdminNote(props.ticket.id, adminNoteDraft.value)
}
</script>

<template>
  <div class="space-y-5 text-sm">
    <div class="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4">
      <div>
        <p class="text-muted-foreground">租客</p>
        <p class="font-medium">{{ ticket.tenantName }}</p>
      </div>
      <div>
        <p class="text-muted-foreground">房東</p>
        <p class="font-medium">{{ ticket.landlordName }}</p>
      </div>
      <div>
        <p class="text-muted-foreground">分類</p>
        <p class="font-medium">{{ maintenanceCategoryLabels[ticket.category] }}</p>
      </div>
      <div>
        <p class="text-muted-foreground">狀態</p>
        <Badge :variant="statusBadgeVariant(ticket.status)">
          {{ maintenanceStatusLabels[ticket.status] }}
        </Badge>
      </div>
      <div>
        <p class="text-muted-foreground">建立日</p>
        <p class="font-medium">{{ formatDate(ticket.createdAt) }}</p>
      </div>
      <div>
        <p class="text-muted-foreground">已經過</p>
        <p class="font-medium" :class="ticket.status === 'overdue' ? 'text-destructive' : ''">
          {{ ticket.elapsed }} 天
        </p>
      </div>
    </div>

    <div>
      <p class="mb-1 font-semibold">問題描述</p>
      <p class="text-muted-foreground">{{ ticket.description }}</p>
    </div>

    <div>
      <p class="mb-2 font-semibold">狀態時間軸</p>
      <ol class="space-y-3 border-l border-border pl-4">
        <li v-for="(event, index) in ticket.timeline" :key="index">
          <p class="text-xs text-muted-foreground">
            {{ formatDateTime(event.at) }} · {{ event.actor }}
          </p>
          <p>
            {{ event.from ? maintenanceStatusLabels[event.from] : '建立' }}
            <span class="text-muted-foreground">→</span>
            {{ maintenanceStatusLabels[event.to] }}
          </p>
          <p v-if="event.note" class="text-muted-foreground">備註：{{ event.note }}</p>
        </li>
      </ol>
    </div>

    <div>
      <p class="mb-2 font-semibold">狀態推進</p>
      <Textarea v-model="changeNote" placeholder="變更備註（選填）" class="mb-2" />
      <div v-if="nextStatuses.length > 0" class="flex flex-wrap gap-2">
        <Button v-for="next in nextStatuses" :key="next" size="sm" @click="handleAdvance(next)">
          推進至「{{ maintenanceStatusLabels[next] }}」
        </Button>
      </div>
      <p v-else class="text-muted-foreground">已是終態</p>
      <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
    </div>

    <div>
      <p class="mb-2 font-semibold">管理員註記</p>
      <Textarea v-model="adminNoteDraft" placeholder="填寫僅供內部檢視的備註" class="mb-2" />
      <Button variant="outline" size="sm" @click="handleSaveNote">儲存管理員註記</Button>
    </div>
  </div>
</template>
