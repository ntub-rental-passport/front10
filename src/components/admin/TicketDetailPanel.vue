<script setup lang="ts">
/**
 * 工單詳情與操作。
 *
 * 工單頁與使用者詳情頁共用同一份操作邏輯 —— 兩邊寫的是同一個 collection，
 * 任一邊推進狀態，另一邊的畫面會直接跟著更新。
 */
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  useAdminMaintenance,
  type MaintenanceTicketView,
} from '@/src/composables/admin/useAdminMaintenance'
import {
  adminQueueReason,
  adminQueueReasonLabels,
  isInAdminQueue,
  isStatusDrivenQueueReason,
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTone,
  maintenanceTransitions,
  type AdminQueueReason,
  type MaintenanceStatus,
} from '@/src/utils/admin-maintenance'
import { formatDate, formatDateTime } from '@/src/utils/admin-format'
import StatusDot from './StatusDot.vue'
import { STATUS_CHIP_CLASS } from './status-dot'

const props = defineProps<{ ticket: MaintenanceTicketView }>()

const { advanceStatus, saveAdminNote, queueTicket, dequeueTicket, error } = useAdminMaintenance()

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

// 只有在待處理佇列裡的工單才能推進狀態，日常流程本來就該由租客與房東自己走完
const inQueue = computed(() => isInAdminQueue(props.ticket))
const queueReason = computed<AdminQueueReason | null>(() => adminQueueReason(props.ticket))

/**
 * 待處理原因的樣式。
 *
 * 爭議與逾期是系統判定的異常，要比管理員自己標記的更顯眼。
 *
 * 不用 Badge 的 destructive variant：它靠 text-destructive-foreground 上色，
 * 而那個 class 產不出任何 CSS（index.css 的 @theme 漏註冊），深色模式下
 * 實測只有 2.70。STATUS_CHIP_CLASS 的前景色是跟填色配對設計的。
 */
function queueReasonClass(reason: AdminQueueReason): string {
  return isStatusDrivenQueueReason(reason) ? STATUS_CHIP_CLASS.danger : STATUS_CHIP_CLASS.idle
}

function handleAdvance(next: MaintenanceStatus): void {
  if (advanceStatus(props.ticket.id, next, changeNote.value)) {
    changeNote.value = ''
  }
}

function handleSaveNote(): void {
  saveAdminNote(props.ticket.id, adminNoteDraft.value)
}

function handleQueue(): void {
  queueTicket(props.ticket.id)
}

function handleDequeue(): void {
  dequeueTicket(props.ticket.id)
}
</script>

<template>
  <div class="space-y-5 text-sm">
    <!--
      用 <dl> 而不是一堆 div：這就是「名稱／數值」的定義清單，語意對了
      螢幕閱讀器才唸得出配對關係。標籤用 foreground/70 —— muted-foreground
      在這塊 bg-muted/40 上對比不夠。
    -->
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/40 p-5">
      <div>
        <dt class="text-xs text-foreground/70">租客</dt>
        <dd class="mt-0.5 font-medium">{{ ticket.tenantName }}</dd>
      </div>
      <div>
        <dt class="text-xs text-foreground/70">房東</dt>
        <dd class="mt-0.5 font-medium">{{ ticket.landlordName }}</dd>
      </div>
      <div>
        <dt class="text-xs text-foreground/70">分類</dt>
        <dd class="mt-0.5 font-medium">{{ maintenanceCategoryLabels[ticket.category] }}</dd>
      </div>
      <div>
        <dt class="text-xs text-foreground/70">狀態</dt>
        <!-- 與工單表格共用同一套顏色對應，見 maintenanceStatusTone -->
        <dd class="mt-0.5">
          <StatusDot
            :tone="maintenanceStatusTone(ticket.status)"
            :label="maintenanceStatusLabels[ticket.status]"
          />
        </dd>
      </div>
      <div>
        <dt class="text-xs text-foreground/70">建立日</dt>
        <dd class="mt-0.5 font-medium">{{ formatDate(ticket.createdAt) }}</dd>
      </div>
      <div>
        <dt class="text-xs text-foreground/70">已經過</dt>
        <!--
          逾期時用實心 chip 而不是紅字。--destructive 是 oklch(0.7 0.18 40)，
          偏亮，當文字踩在淺色底上只有 2.6 左右，遠低於 AA —— 填色版本的
          前景色才是跟它配對設計的（實測 6.35）。
        -->
        <dd class="mt-0.5">
          <span
            v-if="ticket.status === 'overdue'"
            :class="['inline-flex rounded-full px-2 py-0.5 font-bold', STATUS_CHIP_CLASS.danger]"
          >
            {{ ticket.elapsed }} 天
          </span>
          <span v-else class="font-medium">{{ ticket.elapsed }} 天</span>
        </dd>
      </div>
    </dl>

    <div>
      <p class="mb-1 font-semibold">問題描述</p>
      <p class="text-muted-foreground">{{ ticket.description }}</p>
    </div>

    <div>
      <p class="mb-2 font-semibold">狀態時間軸</p>
      <!--
        每一筆的「轉移到哪個狀態」用同一套顏色對應。時間軸本來全是黑字，
        要逐行讀才知道哪一步開始出問題；上了色之後，紅點出現在哪一行
        一眼就看得到。
      -->
      <ol class="space-y-3 border-l border-border pl-4">
        <li v-for="(event, index) in ticket.timeline" :key="index">
          <p class="text-xs text-foreground/70">
            {{ formatDateTime(event.at) }} · {{ event.actor }}
          </p>
          <p class="flex flex-wrap items-center gap-1.5">
            <span class="text-foreground/70">
              {{ event.from ? maintenanceStatusLabels[event.from] : '建立' }}
            </span>
            <span class="text-foreground/70" aria-hidden="true">→</span>
            <StatusDot
              :tone="maintenanceStatusTone(event.to)"
              :label="maintenanceStatusLabels[event.to]"
            />
          </p>
          <p v-if="event.note" class="text-foreground/70">備註：{{ event.note }}</p>
        </li>
      </ol>
    </div>

    <div>
      <p class="mb-2 font-semibold">狀態推進</p>
      <template v-if="inQueue">
        <p
          v-if="queueReason"
          :class="[
            'mb-2 inline-flex rounded-full px-3 py-1 text-xs font-medium',
            queueReasonClass(queueReason),
          ]"
        >
          待處理原因：{{ adminQueueReasonLabels[queueReason] }}
        </p>
        <Textarea v-model="changeNote" placeholder="變更備註（選填）" class="mb-2" />
        <div v-if="nextStatuses.length > 0" class="flex flex-wrap gap-2">
          <Button v-for="next in nextStatuses" :key="next" size="sm" @click="handleAdvance(next)">
            推進至「{{ maintenanceStatusLabels[next] }}」
          </Button>
        </div>
        <p v-else class="text-muted-foreground">已是終態</p>
        <!-- 爭議中與逾期是由狀態決定的，得靠推進狀態才離得開佇列，這顆在那兩種情況不會有效果 -->
        <Button
          v-if="!isStatusDrivenQueueReason(queueReason)"
          variant="outline"
          size="sm"
          class="mt-2"
          @click="handleDequeue"
        >
          移出待處理
        </Button>
      </template>
      <template v-else>
        <p class="mb-2 text-muted-foreground">
          此工單不在待處理佇列中，租客與房東的報修流程由雙方自行走完，管理員不主動推進狀態。
        </p>
        <Button size="sm" @click="handleQueue">加入待處理</Button>
      </template>
      <!--
        錯誤訊息不用紅字：--destructive 當文字色在淺色底上只有 2.6 左右。
        改成淡紅底的方框 —— 容器帶語意、文字用正常前景色，兩件事都成立。
      -->
      <p
        v-if="error"
        class="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
      >
        {{ error }}
      </p>
    </div>

    <div>
      <p class="mb-2 font-semibold">管理員註記</p>
      <Textarea v-model="adminNoteDraft" placeholder="填寫僅供內部檢視的備註" class="mb-2" />
      <Button variant="outline" size="sm" @click="handleSaveNote">儲存管理員註記</Button>
    </div>
  </div>
</template>
