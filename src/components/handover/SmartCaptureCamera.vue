<script setup lang="ts">
/**
 * SmartCaptureCamera.vue
 * ----------------------------------------------------------
 * 引導式智慧拍照元件
 *
 * 作用：
 *   1. 開啟手機 / 筆電鏡頭，顯示即時影像。
 *   2. 在影像上疊一個「引導框」，告訴使用者該怎麼擺位置。
 *   3. 每隔一段時間（預設 500ms）抓一張畫面，丟給已經訓練好的
 *      Teachable Machine（TM）影像分類模型，判斷照片品質好不好
 *      （清晰 / 模糊 / 過暗 / 角度偏）。
 *   4. 只有當模型判定為「clear」且信心分數 >= 門檻（預設 0.8）時，
 *      使用者按下「拍攝」按鈕才會真的把圖傳回父元件。
 *   5. 信心分數不足時，按鈕會被禁用，並顯示模型給的提示。
 *
 * 用法（在父元件中）：
 *   <SmartCaptureCamera
 *     model-url="https://teachablemachine.withgoogle.com/models/<你的模型ID>/"
 *     :min-confidence="0.8"
 *     @captured="onCaptured" />
 *
 *   function onCaptured(payload: {
 *     dataUrl: string;          // 拍下來的 JPEG (base64)
 *     aiLabel: string;          // 'clear' | 'blur' | 'dark' | 'angle_off'
 *     aiConfidence: number;     // 0 ~ 1
 *     capturedAt: string;       // ISO 8601 時間戳
 *   }) { ... }
 *
 * 依賴套件（需要先安裝）：
 *   npm install @tensorflow/tfjs @teachablemachine/image
 *
 * 訓練自己的模型：
 *   1. 前往 https://teachablemachine.withgoogle.com → 選 Image Project
 *      → Standard image model
 *   2. 建立 4 個類別：clear、blur、dark、angle_off
 *      每個類別用手機拍 50 ~ 200 張照片上傳
 *   3. 點 Train Model → Export Model → Upload (shareable link)
 *   4. 拿到一個 URL，貼到此元件的 model-url prop 即可
 *
 * 為什麼用 Teachable Machine：
 *   - 不需要寫 Python，不需要 GPU，瀏覽器即可訓練。
 *   - 匯出的模型可以離線在前端推論（保護隱私 + 即時回應）。
 *   - 完全符合論文 3-1「TensorFlow.js 於瀏覽器端載入 Teachable
 *     Machine 匯出之影像分類模型」的設定。
 */

import { onBeforeUnmount, onMounted, ref, computed } from 'vue'

// 注意：因為 Teachable Machine 的 npm 套件型別宣告不完整，
// 我們宣告一個極簡的型別讓 TypeScript 不會抱怨。
// 真實 import 時請改成：
//   import * as tmImage from '@teachablemachine/image'
// 並把下方的型別宣告刪掉。
declare const tmImage: {
  load(modelURL: string, metadataURL: string): Promise<TmModel>
}
interface TmModel {
  predict(canvas: HTMLCanvasElement | HTMLVideoElement): Promise<TmPrediction[]>
  getTotalClasses(): number
}
interface TmPrediction {
  className: string
  probability: number
}

// ---------- Props / Emits ---------- //

const props = withDefaults(
  defineProps<{
    /** Teachable Machine 上傳模型後拿到的 URL，**結尾要有斜線** */
    modelUrl: string
    /** 信心分數門檻，低於此值不允許拍攝 */
    minConfidence?: number
    /** 推論間隔（毫秒） */
    inferenceIntervalMs?: number
  }>(),
  {
    minConfidence: 0.8,
    inferenceIntervalMs: 500,
  }
)

const emit = defineEmits<{
  (e: 'captured', payload: {
    dataUrl: string
    aiLabel: string
    aiConfidence: number
    capturedAt: string
  }): void
  (e: 'cancel'): void
}>()

// ---------- DOM 參考 ---------- //

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

// ---------- 內部狀態 ---------- //

const isLoadingModel = ref(true)
const isCameraReady = ref(false)
const errorMessage = ref<string | null>(null)

/** 當前推論結果（每 inferenceIntervalMs ms 更新一次） */
const currentPrediction = ref<TmPrediction | null>(null)

let model: TmModel | null = null
let stream: MediaStream | null = null
let inferenceTimer: number | null = null

// ---------- 衍生狀態 ---------- //

/** 推論到的最佳標籤是 'clear' 且信心 >= 門檻？ */
const canCapture = computed(() => {
  const p = currentPrediction.value
  return p?.className === 'clear' && p.probability >= props.minConfidence
})

/** 給使用者看的中文提示 */
const hintText = computed(() => {
  const p = currentPrediction.value
  if (!p) return '正在分析畫面…'
  const pct = (p.probability * 100).toFixed(0)
  switch (p.className) {
    case 'clear':
      return p.probability >= props.minConfidence
        ? `畫面清晰（${pct}%），可以拍攝`
        : `清晰度不足（${pct}%），請靠近一點`
    case 'blur':
      return `畫面模糊（${pct}%），請手持穩定後再拍`
    case 'dark':
      return `光線不足（${pct}%），請打開電燈或靠近窗戶`
    case 'angle_off':
      return `角度偏斜（${pct}%），請正對物品`
    default:
      return `偵測中…（${p.className} ${pct}%）`
  }
})

// ---------- 生命週期 ---------- //

onMounted(async () => {
  await Promise.all([loadModel(), startCamera()])
  startInferenceLoop()
})

onBeforeUnmount(() => {
  stopInferenceLoop()
  stopCamera()
})

// ---------- 模型載入 ---------- //

async function loadModel() {
  try {
    isLoadingModel.value = true
    // TM 模型 URL 結尾要加斜線，後面拼上兩個固定檔名
    const modelURL = props.modelUrl + 'model.json'
    const metadataURL = props.modelUrl + 'metadata.json'

    // tmImage.load 內部會自動載 TF.js 並反序列化 Keras 模型
    model = await tmImage.load(modelURL, metadataURL)
  } catch (e) {
    errorMessage.value = `模型載入失敗：${(e as Error).message}`
  } finally {
    isLoadingModel.value = false
  }
}

// ---------- 鏡頭啟動 ---------- //

async function startCamera() {
  try {
    // 優先用後置鏡頭（手機點交較合適），桌機沒有就退回前鏡頭
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: 640, height: 480 },
      audio: false,
    })
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
      isCameraReady.value = true
    }
  } catch (e) {
    errorMessage.value = `無法存取鏡頭：${(e as Error).message}`
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

// ---------- 推論迴圈 ---------- //

function startInferenceLoop() {
  inferenceTimer = window.setInterval(runInference, props.inferenceIntervalMs)
}

function stopInferenceLoop() {
  if (inferenceTimer !== null) {
    clearInterval(inferenceTimer)
    inferenceTimer = null
  }
}

async function runInference() {
  if (!model || !videoEl.value || !isCameraReady.value) return
  try {
    // 把 <video> 當前畫面交給模型推論。
    // TM 的 predict() 回傳一個陣列，每筆包含 className + probability。
    const predictions = await model.predict(videoEl.value)
    // 取機率最大的那一筆
    predictions.sort((a, b) => b.probability - a.probability)
    currentPrediction.value = predictions[0]
  } catch (e) {
    // 推論失敗不擋使用者，僅在 console 記錄
    console.warn('TM inference failed', e)
  }
}

// ---------- 按下拍攝 ---------- //

function onClickCapture() {
  if (!canCapture.value || !videoEl.value || !canvasEl.value) return

  const video = videoEl.value
  const canvas = canvasEl.value
  // 把 video 當前幀畫到 canvas 上，再轉成 JPEG dataURL
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

  // 把結果丟給父元件，由父元件呼叫 POST /handover/evidences 上傳
  emit('captured', {
    dataUrl,
    aiLabel: currentPrediction.value?.className ?? 'unknown',
    aiConfidence: currentPrediction.value?.probability ?? 0,
    capturedAt: new Date().toISOString(),
  })
}
</script>

<template>
  <div class="space-y-3">
    <!-- 攝影機畫面 + 引導框疊層 -->
    <div class="relative aspect-video bg-black rounded-md overflow-hidden">
      <video ref="videoEl" class="w-full h-full object-cover" muted playsinline></video>

      <!-- 引導框：提示使用者把物品擺在框內 -->
      <div
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div
          class="border-2 border-dashed rounded-md w-3/4 h-3/4 transition-colors"
          :class="canCapture ? 'border-green-400' : 'border-yellow-400'"
        ></div>
      </div>

      <!-- 載入中 / 錯誤訊息覆蓋 -->
      <div
        v-if="isLoadingModel || errorMessage"
        class="absolute inset-0 bg-black/70 text-white flex items-center justify-center text-sm"
      >
        <span v-if="errorMessage">{{ errorMessage }}</span>
        <span v-else>正在載入 AI 模型…</span>
      </div>
    </div>

    <!-- 即時提示文字 -->
    <div
      class="text-sm font-medium rounded-md p-2 text-center"
      :class="canCapture ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
    >
      {{ hintText }}
    </div>

    <!-- 操作按鈕 -->
    <div class="flex gap-2">
      <button
        class="flex-1 h-10 rounded-md border bg-background hover:bg-muted text-sm font-medium"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="flex-1 h-10 rounded-md text-sm font-medium transition-colors"
        :class="
          canCapture
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        "
        :disabled="!canCapture"
        @click="onClickCapture"
      >
        {{ canCapture ? '拍攝' : '不符品質，無法拍攝' }}
      </button>
    </div>

    <!-- 拍攝用的隱形 canvas（不顯示） -->
    <canvas ref="canvasEl" class="hidden"></canvas>
  </div>
</template>
