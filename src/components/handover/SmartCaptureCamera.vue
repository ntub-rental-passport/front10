<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type CapturePayload = {
  dataUrl: string
  aiLabel: string
  aiConfidence: number
  capturedAt: string
}

type TmPrediction = {
  className: string
  probability: number
}

interface TmModel {
  predict(canvas: HTMLCanvasElement | HTMLVideoElement): Promise<TmPrediction[]>
  getTotalClasses(): number
}

declare const tmImage: {
  load(modelURL: string, metadataURL: string): Promise<TmModel>
}

const props = withDefaults(
  defineProps<{
    modelUrl: string
    minConfidence?: number
    inferenceIntervalMs?: number
  }>(),
  {
    minConfidence: 0.8,
    inferenceIntervalMs: 500,
  }
)

const emit = defineEmits<{
  (event: 'captured', payload: CapturePayload): void
  (event: 'cancel'): void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const isLoadingModel = ref(true)
const isCameraReady = ref(false)
const errorMessage = ref<string | null>(null)
const currentPrediction = ref<TmPrediction | null>(null)

let model: TmModel | null = null
let stream: MediaStream | null = null
let inferenceTimer: number | null = null

function buildModelAssetUrl(baseUrl: string, filename: 'model.json' | 'metadata.json') {
  return `${baseUrl.replace(/\/?$/, '/')}${filename}`
}

function getTopPrediction(predictions: TmPrediction[]): TmPrediction | null {
  if (predictions.length === 0) return null
  return [...predictions].sort((left, right) => right.probability - left.probability)[0] ?? null
}

function formatHintText(prediction: TmPrediction | null, minConfidence: number): string {
  if (!prediction) return '正在分析畫面品質...'

  const percent = `${Math.round(prediction.probability * 100)}%`
  if (prediction.className === 'clear') {
    return prediction.probability >= minConfidence
      ? `畫面清晰 (${percent})，可以拍攝`
      : `畫面已接近可拍攝狀態 (${percent})，再稍微對準一點`
  }
  if (prediction.className === 'blur') return `目前偏模糊 (${percent})，請先穩定手部或重新對焦`
  if (prediction.className === 'dark') return `目前偏暗 (${percent})，建議補光後再拍攝`
  if (prediction.className === 'angle_off') return `角度不理想 (${percent})，請把鏡頭對正物件`
  return `辨識結果：${prediction.className} (${percent})`
}

const canCapture = computed(() => {
  const prediction = currentPrediction.value
  return prediction?.className === 'clear' && prediction.probability >= props.minConfidence
})

const hintText = computed(() =>
  formatHintText(currentPrediction.value, props.minConfidence)
)

async function loadModel() {
  try {
    isLoadingModel.value = true
    model = await tmImage.load(
      buildModelAssetUrl(props.modelUrl, 'model.json'),
      buildModelAssetUrl(props.modelUrl, 'metadata.json')
    )
  } catch (error) {
    errorMessage.value = `AI 模型載入失敗：${(error as Error).message}`
  } finally {
    isLoadingModel.value = false
  }
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: 640,
        height: 480,
      },
      audio: false,
    })

    if (!videoEl.value) return

    videoEl.value.srcObject = stream
    await videoEl.value.play()
    isCameraReady.value = true
  } catch (error) {
    errorMessage.value = `相機啟動失敗：${(error as Error).message}`
  }
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  isCameraReady.value = false
}

function startInferenceLoop() {
  if (inferenceTimer !== null) return
  inferenceTimer = window.setInterval(runInference, props.inferenceIntervalMs)
}

function stopInferenceLoop() {
  if (inferenceTimer === null) return
  window.clearInterval(inferenceTimer)
  inferenceTimer = null
}

async function runInference() {
  if (!model || !videoEl.value || !isCameraReady.value) return

  try {
    currentPrediction.value = getTopPrediction(await model.predict(videoEl.value))
  } catch (error) {
    console.warn('Teachable Machine inference failed', error)
  }
}

function captureCurrentFrame(): string | null {
  if (!videoEl.value || !canvasEl.value) return null

  const video = videoEl.value
  const canvas = canvasEl.value
  const context = canvas.getContext('2d')
  if (!context) return null

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

function onClickCapture() {
  if (!canCapture.value) return

  const dataUrl = captureCurrentFrame()
  if (!dataUrl) return

  emit('captured', {
    dataUrl,
    aiLabel: currentPrediction.value?.className ?? 'unknown',
    aiConfidence: currentPrediction.value?.probability ?? 0,
    capturedAt: new Date().toISOString(),
  })
}

onMounted(async () => {
  await Promise.all([loadModel(), startCamera()])
  startInferenceLoop()
})

onBeforeUnmount(() => {
  stopInferenceLoop()
  stopCamera()
})
</script>

<template>
  <div class="space-y-3">
    <div class="relative aspect-video overflow-hidden rounded-md bg-black">
      <video ref="videoEl" class="h-full w-full object-cover" muted playsinline></video>

      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div
          class="h-3/4 w-3/4 rounded-md border-2 border-dashed transition-colors"
          :class="canCapture ? 'border-green-400' : 'border-yellow-400'"
        ></div>
      </div>

      <div
        v-if="isLoadingModel || errorMessage"
        class="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white"
      >
        <span v-if="errorMessage">{{ errorMessage }}</span>
        <span v-else>正在載入 AI 模型...</span>
      </div>
    </div>

    <div
      class="rounded-md p-2 text-center text-sm font-medium"
      :class="canCapture ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
    >
      {{ hintText }}
    </div>

    <div class="flex gap-2">
      <button
        class="h-10 flex-1 rounded-md border bg-background text-sm font-medium hover:bg-muted"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="h-10 flex-1 rounded-md text-sm font-medium transition-colors"
        :class="
          canCapture
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'cursor-not-allowed bg-muted text-muted-foreground'
        "
        :disabled="!canCapture"
        @click="onClickCapture"
      >
        {{ canCapture ? '拍攝' : '請先對準畫面' }}
      </button>
    </div>

    <canvas ref="canvasEl" class="hidden"></canvas>
  </div>
</template>
