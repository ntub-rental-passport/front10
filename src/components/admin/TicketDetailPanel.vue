<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Textarea } from '@/components/ui/textarea/index'
import { useAdminMaintenance, type MaintenanceTicketView } from '@/src/composables/admin/useAdminMaintenance'
import { adminQueueReason, adminQueueReasonLabels, isInAdminQueue, maintenanceCategoryLabels, maintenanceStatusLabels } from '@/src/utils/admin-maintenance'
import { formatDateTime } from '@/src/utils/admin-format'
import type { AdminRepairMedia } from '@/src/services/adminRepairApi'
import StatusDot from './StatusDot.vue'
import ActionError from './ActionError.vue'
import RepairAttachmentPreview from './RepairAttachmentPreview.vue'

const props = defineProps<{ ticket: MaintenanceTicketView }>()
const { saveAdminNote, queueTicket, dequeueTicket, setIntervention, error, saving } = useAdminMaintenance()
const adminNoteDraft = ref(props.ticket.adminNote)
const saved = ref(false)
watch(() => props.ticket.id, () => {
  adminNoteDraft.value = props.ticket.adminNote
  error.value = ''
  saved.value = false
})
const queueReason = computed(() => adminQueueReason(props.ticket))
const inQueue = computed(() => isInAdminQueue(props.ticket))
const files = computed(() => {
  const source = props.ticket.source
  const all: AdminRepairMedia[] = [
    ...source.photos, ...(source.completionPhotos ?? []), ...(source.unresolvedPhotos ?? []),
    ...(source.supplements ?? []).flatMap((item) => item.photos),
    ...(source.receipt ? [source.receipt] : []),
  ]
  return [...new Map(all.map((item) => [item.id, item])).values()]
})
const actorLabels: Record<string, string> = { tenant: '租客', landlord: '房東', admin: '管理員', system: '系統' }
async function handleSaveNote(): Promise<void> {
  saved.value = await saveAdminNote(props.ticket.id, adminNoteDraft.value)
}
</script>

<template>
  <div data-real="true" class="divide-y divide-border text-sm [&>section]:py-5 [&>section:last-child]:pb-0">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/40 p-5">
      <div><dt class="text-xs text-foreground/70">租客</dt><dd>{{ ticket.tenantName }}</dd></div>
      <div><dt class="text-xs text-foreground/70">房東</dt><dd>{{ ticket.landlordName }}</dd></div>
      <div><dt class="text-xs text-foreground/70">分類</dt><dd>{{ maintenanceCategoryLabels[ticket.category] }}</dd></div>
      <div>
        <dt class="text-xs text-foreground/70">狀態</dt>
        <dd><StatusDot :tone="ticket.status === 'completed' ? 'ok' : 'idle'" :label="ticket.awaitingInspection ? '待租客複驗' : maintenanceStatusLabels[ticket.status]" /></dd>
      </div>
      <div><dt class="text-xs text-foreground/70">建立時間</dt><dd>{{ formatDateTime(ticket.createdAt) }}</dd></div>
      <div><dt class="text-xs text-foreground/70">已經過</dt><dd>{{ ticket.elapsed }} 天</dd></div>
      <div v-if="ticket.overdue"><StatusDot tone="danger" label="逾期未回應" /></div>
      <div v-if="ticket.disputed"><StatusDot tone="danger" label="爭議中" /></div>
    </dl>
    <section>
      <h3 class="mb-2 text-xs font-semibold text-foreground/70">問題描述</h3>
      <p>{{ ticket.source.location }} · {{ ticket.source.equipment }}</p>
      <p class="mt-1 whitespace-pre-wrap">{{ ticket.description }}</p>
      <p v-if="ticket.source.completionNote" class="mt-3">完工說明：{{ ticket.source.completionNote }}</p>
      <p v-if="ticket.source.unresolvedNote" class="mt-3">租客複驗回覆：{{ ticket.source.unresolvedNote }}</p>
      <p v-if="ticket.source.responsibilityQuestion" class="mt-3">責任疑問：{{ ticket.source.responsibilityQuestion }}</p>
      <dl class="mt-3 grid grid-cols-2 gap-2">
        <div><dt class="text-foreground/70">維修廠商</dt><dd>{{ ticket.source.vendorName || '尚未指派' }}</dd></div>
        <div><dt class="text-foreground/70">預約時間</dt><dd>{{ ticket.source.scheduledAt ? formatDateTime(ticket.source.scheduledAt) : '尚未排程' }}</dd></div>
        <div><dt class="text-foreground/70">估價</dt><dd>{{ ticket.source.estimatedCost == null ? '尚未提供' : `${ticket.source.estimatedCost.toLocaleString()} 元` }}</dd></div>
        <div><dt class="text-foreground/70">實際金額</dt><dd>{{ ticket.source.actualCost == null ? '尚未提供' : `${ticket.source.actualCost.toLocaleString()} 元` }}</dd></div>
      </dl>
    </section>
    <section v-if="files.length">
      <h3 class="mb-2 text-xs font-semibold text-foreground/70">照片與附件</h3>
      <div class="grid grid-cols-2 gap-3"><RepairAttachmentPreview v-for="media in files" :key="media.id" :ticket-id="ticket.source.id" :media="media" /></div>
    </section>
    <section>
      <h3 class="mb-2 text-xs font-semibold text-foreground/70">工單時間軸</h3>
      <ol class="space-y-4 border-l-2 border-border pl-4">
        <li v-for="event in ticket.source.timeline" :key="event.id">
          <p class="text-xs text-foreground/70">{{ formatDateTime(event.at) }} · {{ actorLabels[event.actorRole ?? 'system'] ?? '系統' }}</p>
          <p class="font-medium">{{ event.title }}</p>
          <p v-if="event.detail" class="whitespace-pre-wrap text-foreground/70">{{ event.detail }}</p>
        </li>
      </ol>
    </section>
    <section>
      <h3 class="mb-2 text-xs font-semibold text-foreground/70">平台處理</h3>
      <p class="mb-3 text-foreground/70">房東回報完工後，由租客複驗確認結案。</p>
      <p v-if="queueReason" class="mb-3">待處理原因：{{ adminQueueReasonLabels[queueReason] }}</p>
      <div class="flex flex-wrap gap-2">
        <Button v-if="!inQueue" size="sm" :disabled="saving" @click="queueTicket(ticket.id)">加入待處理</Button>
        <Button v-if="ticket.manuallyQueued || ticket.interventionRequested" variant="outline" size="sm" :disabled="saving" @click="dequeueTicket(ticket.id)">清除人工介入標記</Button>
        <Button v-if="!ticket.interventionRequested" variant="outline" size="sm" :disabled="saving" @click="setIntervention(ticket.id, true)">標記平台介入</Button>
      </div>
      <p v-if="ticket.overdue || ticket.source.responsibilityAgreement === 'questioned'" class="mt-2 text-xs text-foreground/70">逾期與責任異議會依案件進度重新判斷，清除人工標記後仍可能留在待處理。</p>
      <ActionError v-if="error" :message="error" class="mt-3" @dismiss="error = ''" />
    </section>
    <section>
      <h3 class="mb-2 text-xs font-semibold text-foreground/70">管理員註記</h3>
      <Textarea v-model="adminNoteDraft" placeholder="填寫僅供內部檢視的備註" class="mb-2" @input="saved = false" />
      <Button variant="outline" size="sm" :disabled="saving" @click="handleSaveNote">{{ saving ? '儲存中…' : '儲存管理員註記' }}</Button>
      <p v-if="saved" role="status" class="mt-2 text-foreground/70">已儲存。</p>
    </section>
  </div>
</template>
