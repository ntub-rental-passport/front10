<script setup lang="ts">
/**
 * 右下角浮出提示容器。
 *
 * 掛在 layout.vue 最外層，整個 /app 只會有一個實例——useMaintenanceToasts
 * 的 watch 因此也只會建立一次，不會因為多個元件實例各自 watch 同一份
 * outages 而讓同一次維護事件跳出兩則一樣的提示。
 */
import { useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, PauseCircle, X } from 'lucide-vue-next'
import { useMaintenanceToasts, type MaintenanceToast } from '@/src/composables/useMaintenanceToasts'

const { toasts, dismiss } = useMaintenanceToasts()
const router = useRouter()

const kindIcon: Record<MaintenanceToast['kind'], typeof AlertTriangle> = {
  closed: AlertTriangle,
  summary: PauseCircle,
  reopened: CheckCircle2,
}

// reopened 是好消息用正向的 emerald 系；closed／summary 都是壞消息（服務
// 正在中斷／目前有幾項在維護），沿用專案既有的警示色 amber 系。
const kindWrapClass: Record<MaintenanceToast['kind'], string> = {
  closed: 'border-amber-300 bg-amber-50 text-amber-900',
  summary: 'border-amber-300 bg-amber-50 text-amber-900',
  reopened: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}
const kindIconClass: Record<MaintenanceToast['kind'], string> = {
  closed: 'text-amber-600',
  summary: 'text-amber-600',
  reopened: 'text-emerald-600',
}

// 完整說明與預計恢復時間都在通知中心，點提示本體直接帶過去。
function openNotifications(): void {
  router.push('/app/notifications')
}

// 關閉鈕要停止冒泡，否則點「關閉」會連帶觸發外層卡片的導航。
function handleDismiss(id: string, event: MouseEvent): void {
  event.stopPropagation()
  dismiss(id)
}
</script>

<template>
  <div
    v-if="toasts.length > 0"
    class="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96"
  >
    <TransitionGroup name="maint-toast" tag="div" class="flex flex-col gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        role="status"
        tabindex="0"
        :class="[
          'pointer-events-auto flex cursor-pointer items-start gap-3 rounded-xl border p-3 shadow-lg',
          kindWrapClass[toast.kind],
        ]"
        @click="openNotifications"
        @keydown.enter="openNotifications"
      >
        <component
          :is="kindIcon[toast.kind]"
          :class="['mt-0.5 h-5 w-5 shrink-0', kindIconClass[toast.kind]]"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="min-w-0 text-sm font-semibold">{{ toast.title }}</p>
          <p class="mt-0.5 min-w-0 text-sm opacity-90">{{ toast.body }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="關閉提示"
          @click="handleDismiss(toast.id, $event)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.maint-toast-enter-active,
.maint-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.maint-toast-enter-from,
.maint-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.maint-toast-move {
  transition: transform 0.2s ease;
}
</style>
