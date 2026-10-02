import { onUnmounted, ref, type Ref } from 'vue'
import {
  shouldBlockAdminSurface,
  supportsFieldCapture,
  type DeviceSnapshot,
} from '@/src/utils/device-policy'

const POINTER_QUERY = '(pointer: coarse)'

export interface GateWindow {
  innerWidth: number
  matchMedia?: (query: string) => {
    matches: boolean
    addEventListener?: (type: 'change', listener: () => void) => void
    removeEventListener?: (type: 'change', listener: () => void) => void
  }
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export interface DeviceGate {
  blocked: Ref<boolean>
  fieldCapture: Ref<boolean>
  /** 原始訊號：主要指標裝置是不是手指。 */
  coarsePointer: Ref<boolean>
  stop: () => void
}

export function readSnapshot(win: GateWindow | undefined): DeviceSnapshot {
  if (!win) return { coarsePointer: false, viewportWidth: Number.MAX_SAFE_INTEGER }
  return {
    coarsePointer: win.matchMedia?.(POINTER_QUERY).matches ?? false,
    viewportWidth: win.innerWidth,
  }
}

/**
 * 攔截放在 layout 層而不是 router guard：guard 只在導覽那一刻跑一次，使用者把
 * 平板轉成橫向、或把桌機視窗拉大，都不會重新判斷。這裡監聽 resize 與指標變化，
 * 所以狀態會跟著裝置即時更新。
 */
export function createDeviceGate(win: GateWindow | undefined): DeviceGate {
  const blocked = ref(false)
  const fieldCapture = ref(false)
  const coarsePointer = ref(false)
  const evaluate = () => {
    const snapshot = readSnapshot(win)
    blocked.value = shouldBlockAdminSurface(snapshot)
    fieldCapture.value = supportsFieldCapture(snapshot)
    coarsePointer.value = snapshot.coarsePointer
  }
  evaluate()
  if (!win) return { blocked, fieldCapture, coarsePointer, stop: () => {} }

  const query = win.matchMedia?.(POINTER_QUERY)
  query?.addEventListener?.('change', evaluate)
  win.addEventListener('resize', evaluate)
  return {
    blocked,
    fieldCapture,
    coarsePointer,
    stop: () => {
      query?.removeEventListener?.('change', evaluate)
      win.removeEventListener('resize', evaluate)
    },
  }
}

export function useAdminDeviceGate(): Pick<DeviceGate, 'blocked'> {
  const gate = createDeviceGate(typeof window === 'undefined' ? undefined : window)
  onUnmounted(gate.stop)
  return { blocked: gate.blocked }
}

export function useFieldCaptureSupport(): Pick<DeviceGate, 'fieldCapture' | 'coarsePointer'> {
  const gate = createDeviceGate(typeof window === 'undefined' ? undefined : window)
  onUnmounted(gate.stop)
  return { fieldCapture: gate.fieldCapture, coarsePointer: gate.coarsePointer }
}
