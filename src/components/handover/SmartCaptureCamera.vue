<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <!-- 關鍵：加入 w-full h-[90vh] sm:h-auto，手機上直接占滿大部分螢幕 -->
    <DialogContent class="w-full h-[92vh] sm:h-auto sm:max-w-2xl p-0 overflow-hidden bg-slate-950 text-white border-slate-800 flex flex-col">
      <DialogHeader class="p-4 pb-2 bg-slate-900/90 border-b border-slate-800 shrink-0">
        <DialogTitle class="flex items-center gap-2 text-base text-slate-100">
          <Camera class="h-4 w-4 text-emerald-400" />
          AR 智慧點交拍攝 — {{ itemName }}
          <Badge variant="outline" class="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            {{ roomName }}
          </Badge>
        </DialogTitle>
        <DialogDescription class="text-xs text-slate-400">
          依 AR 水平指標與光線提示對準物品，畫面清晰時點擊拍攝存證。
        </DialogDescription>
      </DialogHeader>

      <!-- 相機預覽視窗：flex-1 讓它在手機上自動吃滿上下高度 -->
      <div class="relative w-full flex-1 bg-black overflow-hidden flex items-center justify-center">
        <video
          ref="videoEl"
          autoplay
          playsinline
          webkit-playsinline
          muted
          class="w-full h-full object-cover"
        ></video>

        <!-- 錯誤提示 -->
        <div v-if="cameraError" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 z-20">
          <AlertCircle class="h-10 w-10 text-amber-400 mb-2" />
          <p class="text-sm font-medium text-slate-200 mb-1">無法啟動鏡頭</p>
          <p class="text-xs text-slate-400 mb-4 max-w-sm">{{ cameraError }}</p>
          <Button size="sm" variant="secondary" @click="triggerFileInput">
            <Upload class="h-3.5 w-3.5 mr-1.5" /> 改用檔案上傳
          </Button>
        </div>

        <!-- AR HUD 視覺引導層 -->
        <div v-if="isCameraReady" class="absolute inset-0 pointer-events-none z-10 select-none">
          <!-- 九宮格輔助線 -->
          <div class="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
            <div class="border-r border-b border-white/20"></div>
            <div class="border-r border-b border-white/20"></div>
            <div class="border-b border-white/20"></div>
            <div class="border-r border-b border-white/20"></div>
            <div class="border-r border-b border-white/20"></div>
            <div class="border-b border-white/20"></div>
            <div class="border-r border-b border-white/20"></div>
            <div class="border-r border-b border-white/20"></div>
            <div></div>
          </div>

          <!-- 中央目標對齊框：手機上保留大面積對焦範圍 -->
          <div class="absolute inset-x-8 inset-y-12 sm:inset-[15%] flex items-center justify-center">
            <div
              class="relative w-full h-full rounded-lg transition-all duration-200"
              :class="isIdealState ? 'border-2 border-emerald-400 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'border-2 border-dashed border-white/30'"
            >
              <span class="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 transition-colors" :class="isIdealState ? 'border-emerald-400' : 'border-white/60'"></span>
              <span class="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 transition-colors" :class="isIdealState ? 'border-emerald-400' : 'border-white/60'"></span>
              <span class="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 transition-colors" :class="isIdealState ? 'border-emerald-400' : 'border-white/60'"></span>
              <span class="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 transition-colors" :class="isIdealState ? 'border-emerald-400' : 'border-white/60'"></span>

              <div
                class="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-100 ease-out"
                :style="{ transform: `rotate(${tiltAngle}deg)` }"
              >
                <div class="w-16 h-0.5" :class="Math.abs(tiltAngle) < 5 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400/80'"></div>
                <div class="h-3 w-0.5 absolute" :class="Math.abs(tiltAngle) < 5 ? 'bg-emerald-400' : 'bg-amber-400/80'"></div>
              </div>

              <div class="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span
                  class="text-xs px-3 py-1 rounded-full font-medium shadow-md backdrop-blur-md transition-colors"
                  :class="isIdealState ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-black/70 text-slate-200 border border-white/10'"
                >
                  {{ hudStatusText }}
                </span>
              </div>
            </div>
          </div>

          <!-- 頂部環境指標 HUD -->
          <div class="absolute top-3 left-3 right-3 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
              <Sun class="h-3.5 w-3.5" :class="lightStatus.color" />
              <span>光線：{{ lightStatus.label }}</span>
            </div>

            <div class="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
              <Activity class="h-3.5 w-3.5" :class="sharpnessStatus.color" />
              <span>清晰度：{{ sharpnessStatus.label }}</span>
            </div>

            <div class="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
              <Compass class="h-3.5 w-3.5" :class="Math.abs(tiltAngle) < 5 ? 'text-emerald-400' : 'text-amber-400'" />
              <span>水平：{{ tiltAngle.toFixed(0) }}°</span>
            </div>
          </div>
        </div>
      </div>
      <!-- 底部控制列 -->
      <div class="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
        <Button variant="ghost" size="sm" class="text-slate-400 hover:text-white" @click="triggerFileInput">
          <Upload class="h-4 w-4 mr-1.5" /> 上傳
        </Button>

        <Button
          size="lg"
          class="rounded-full px-6 font-semibold shadow-lg transition-all"
          :class="isIdealState ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 scale-105' : 'bg-slate-700 hover:bg-slate-600 text-white'"
          :disabled="!isCameraReady"
          @click="onClickCapture"
        >
          <Camera class="h-5 w-5 mr-2" /> {{ isIdealState ? '拍攝存證' : '建議調整後拍攝' }}
        </Button>

        <Button variant="ghost" size="sm" class="text-slate-400 hover:text-white" @click="handleOpenChange(false)">
          取消
        </Button>
      </div>

      <!-- 隱藏的檔案上傳 input -->
      <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import { Camera, AlertCircle, Upload, Sun, Compass, Activity } from 'lucide-vue-next'

export type CapturePayload = {
  dataUrl: string
  quality: {
    brightness: number
    sharpness: number
    isLevel: boolean
  }
}

const props = withDefaults(
  defineProps<{
    open: boolean
    itemId: string
    itemName?: string
    roomName?: string
  }>(),
  {
    itemName: '未命名項目',
    roomName: '未指定房間',
  }
)

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'captured', payload: CapturePayload): void
  (e: 'cancel'): void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const isCameraReady = ref(false)
const cameraError = ref<string | null>(null)

// AR 感測狀態
const tiltAngle = ref(0)
const brightnessValue = ref(128)
const sharpnessScore = ref(100)

let stream: MediaStream | null = null
let analysisTimer: number | null = null

// 光線判斷
const lightStatus = computed(() => {
  if (brightnessValue.value < 65) return { label: '偏暗', color: 'text-amber-400', isOk: false }
  if (brightnessValue.value > 215) return { label: '過曝', color: 'text-amber-400', isOk: false }
  return { label: '充足', color: 'text-emerald-400', isOk: true }
})

// 清晰度判斷
const sharpnessStatus = computed(() => {
  if (sharpnessScore.value < 40) return { label: '晃動中', color: 'text-amber-400', isOk: false }
  return { label: '清晰', color: 'text-emerald-400', isOk: true }
})

// 最佳拍攝狀態
const isIdealState = computed(() => {
  const isAngleOk = Math.abs(tiltAngle.value) < 8
  return lightStatus.value.isOk && sharpnessStatus.value.isOk && isAngleOk && isCameraReady.value
})

const hudStatusText = computed(() => {
  if (!lightStatus.value.isOk) return brightnessValue.value < 65 ? '⚠️ 光線不足，建議補光' : '⚠️ 畫面過曝，請避開反光'
  if (Math.abs(tiltAngle.value) >= 8) return '📐 請調整手機角度至水平'
  if (!sharpnessStatus.value.isOk) return '✋ 請握穩手機，減少晃動'
  return '🟢 畫面清晰，可點擊拍攝'
})

// ---------- 相機啟動與生命週期 ---------- //

async function startCamera() {
  cameraError.value = null
  await nextTick()

  // 若 Dialog 剛開啟動畫中尚未抓到 videoEl，再等一個 tick
  if (!videoEl.value) {
    await nextTick()
  }

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })

    stream = mediaStream

    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream
      // 確保影片播放成功
      await videoEl.value.play()
      isCameraReady.value = true

      startAnalysisLoop()
      requestOrientationPermission()
    }
  } catch (error: any) {
    console.error('相機啟動失敗:', error)
    isCameraReady.value = false
    cameraError.value = `無法開啟鏡頭：${error?.message || '請確認權限'}`
  }
}

function stopCamera() {
  if (analysisTimer !== null) {
    window.clearInterval(analysisTimer)
    analysisTimer = null
  }
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  isCameraReady.value = false
}

// ---------- 即時亮度與模糊分析迴圈 (極輕量計算) ---------- //

function startAnalysisLoop() {
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = 64
  sampleCanvas.height = 48
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })

  analysisTimer = window.setInterval(() => {
    if (!videoEl.value || !isCameraReady.value || !ctx) return
    try {
      ctx.drawImage(videoEl.value, 0, 0, 64, 48)
      const imgData = ctx.getImageData(0, 0, 64, 48).data

      let totalLuma = 0
      const grayArr = new Float32Array(64 * 48)

      for (let i = 0, j = 0; i < imgData.length; i += 4, j++) {
        const luma = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]
        totalLuma += luma
        grayArr[j] = luma
      }
      brightnessValue.value = totalLuma / (64 * 48)

      let variance = 0
      for (let y = 1; y < 47; y++) {
        for (let x = 1; x < 63; x++) {
          const idx = y * 64 + x
          const laplacian =
            grayArr[idx - 64] +
            grayArr[idx + 64] +
            grayArr[idx - 1] +
            grayArr[idx + 1] -
            4 * grayArr[idx]
          variance += Math.abs(laplacian)
        }
      }
      sharpnessScore.value = Math.min(100, Math.round((variance / (62 * 46)) * 4))
    } catch {}
  }, 250)
}

// ---------- iOS / Android 陀螺儀感測授權 ---------- //

function requestOrientationPermission() {
  const handleOrientation = (e: DeviceOrientationEvent) => {
    if (e.gamma !== null) {
      tiltAngle.value = e.gamma
    }
  }

  if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
    (DeviceOrientationEvent as any).requestPermission()
      .then((response: string) => {
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation)
        }
      })
      .catch(() => {})
  } else if (typeof window !== 'undefined') {
    window.addEventListener('deviceorientation', handleOrientation)
  }
}

// ---------- 拍攝高清照片 ---------- //

function onClickCapture() {
  if (!videoEl.value) return
  const video = videoEl.value
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 1920
  canvas.height = video.videoHeight || 1080
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 截取未壓縮的完整相機幀，供後端 VLM 進行清晰判讀
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95)

  emit('captured', {
    dataUrl,
    quality: {
      brightness: Math.round(brightnessValue.value),
      sharpness: sharpnessScore.value,
      isLevel: Math.abs(tiltAngle.value) < 8
    }
  })
  handleOpenChange(false)
}

// ---------- 檔案上傳備援 ---------- //

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    const dataUrl = event.target?.result as string
    emit('captured', {
      dataUrl,
      quality: {
        brightness: 128,
        sharpness: 100,
        isLevel: true
      }
    })
    handleOpenChange(false)
  }
  reader.readAsDataURL(file)
}

function handleOpenChange(val: boolean) {
  emit('update:open', val)
  if (!val) {
    stopCamera()
    emit('cancel')
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      // 等待 Dialog 完全渲染進 DOM，且不使用計時器避免打斷點擊信任
      await nextTick()
      startCamera()
    } else {
      stopCamera()
    }
  },
  { flush: 'post' } // 確保在 DOM 更新完成後才執行
)

onBeforeUnmount(() => {
  stopCamera()
})
</script>