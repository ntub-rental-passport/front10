<script setup lang="ts">
/**
 * 退租前點交與比對（Checkout + Diff）
 * ---------------------------------------------------------
 * 職責：
 *   1. 顯示每個點交項目的「搬入照（左、唯讀）」對照「退租照（右、可拍）」
 *   2. 提供工具列按鈕：執行自動差異比對、匯出 PDF 證據包
 *   3. 在每張卡片顯示 diff 結果 Badge（狀態相同 / 使用痕跡 / 新增瑕疵）
 *
 * 不允許在這頁編輯搬入照，避免使用者退租時誤把搬入基準改掉
 * （那會讓比對失去意義）。要修搬入照請回 baseline 頁。
 */

import { useMediaQuery } from '@vueuse/core'
import { computed, ref } from 'vue'
import HandoverOverviewHeader from '@/src/components/handover/HandoverOverviewHeader.vue'
import HandoverAddItemsDialog from '@/src/components/handover/HandoverAddItemsDialog.vue'
import { Input } from '@/components/ui/input'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Sparkles,
  Clock,
  Building2,
  Search,
  ArrowLeftRight,
  Lock,
} from 'lucide-vue-next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import { useHandover, type HandoverDiff } from '@/src/composables/useHandover'
import {
  firstEvidenceOfPhase,
  formatHandoverTimestamp,
  hasEvidenceInPhase,
} from '@/src/utils/handover'

const router = useRouter()
const {
  properties,
  currentProperty,
  selectProperty,
  itemsOfCurrentProperty,
  addEvidence,
  addItems,
  runAutoDiff,
  retryAnalysis,
  busy,
  error,
  reload,
} = useHandover()

// ---------- 上傳退租存證---------- //

function resizeImage(file: File, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('image read failed'))
    reader.onload = (event) => {
      const img = new Image()
      img.onerror = () => reject(new Error('image decode failed'))
      img.onload = () => {
        let width = img.naturalWidth
        let height = img.naturalHeight

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas context unavailable'))
          return
        }

        context.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }

      img.src = event.target?.result as string
    }

    reader.readAsDataURL(file)
  })
}

async function capturePhoto(itemId: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  document.body.appendChild(input)

  input.onchange = async () => {
    const file = input.files?.[0]
    document.body.removeChild(input)
    if (!file) return

    try {
      const dataUrl = await resizeImage(file)
      await addEvidence(itemId, 'checkout', { url: dataUrl, source: 'file', quality: null })
    } catch (cause) {
      error.value = '無法讀取圖片，請重新選擇圖片檔案。'
      console.error('圖片處理失敗', cause)
    }
  }

  input.click()
}

// ---------- 過濾：只顯示「搬入已存證」的項目 ---------- //
// 沒拍搬入照的項目在退租階段不參與比對，避免誤導使用者。
const itemsWithBaseline = computed(() =>
  itemsOfCurrentProperty.value.filter((it) => hasEvidenceInPhase(it, 'baseline')),
)

const itemsWithoutBaseline = computed(() =>
  itemsOfCurrentProperty.value.filter((it) => !hasEvidenceInPhase(it, 'baseline')),
)

const keyword = ref('')
const filteredItems = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return itemsWithBaseline.value.filter(
    (item) =>
      !query ||
      [
        item.name,
        item.room,
        ...item.evidences.flatMap((e) => [e.note ?? '', e.userNote ?? '']),
      ].some((value) => value.toLowerCase().includes(query)),
  )
})

// ---------- 統計 ---------- //

const stats = computed(() => {
  const total = itemsWithBaseline.value.length
  const checkoutDone = itemsWithBaseline.value.filter((it) =>
    hasEvidenceInPhase(it, 'checkout'),
  ).length
  const diffDone = itemsWithBaseline.value.filter((it) => it.diff).length
  return { total, checkoutDone, diffDone }
})

// ---------- 工具 ---------- //

function firstEvidence(
  item: (typeof itemsOfCurrentProperty.value)[number],
  phase: 'baseline' | 'checkout',
) {
  return firstEvidenceOfPhase(item, phase)
}

const diffLabels: Record<HandoverDiff['type'], { text: string; cls: string }> = {
  uncertain: { text: '無法判定', cls: 'bg-gray-100 text-gray-800' },
  unchanged: {
    text: '狀態相同',
    cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  },
  new_damage: {
    text: '新增瑕疵',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  },
  missing: { text: '物品消失', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
  degraded: {
    text: '使用痕跡',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  },
}

function fmtDate(iso: string) {
  return formatHandoverTimestamp(iso)
}

// ---------- 匯出 PDF ---------- //

const lastDiffRunAt = computed(
  () =>
    itemsOfCurrentProperty.value
      .map((item) => item.diff?.computedAt)
      .filter((value): value is string => !!value)
      .sort()
      .slice(-1)[0] ?? null,
)
async function handleRunDiff() {
  await runAutoDiff()
}

function exportPdf() {
  window.alert(
    `（示意）將匯出「${currentProperty.value?.alias}」之退租證據包 PDF。\n` +
      `已比對項目：${stats.value.diffDone} / ${stats.value.total}`,
  )
}
const desktop = useMediaQuery('(min-width: 640px)')
</script>

<template>
  <div class="space-y-6" :aria-busy="busy">
    <p v-if="busy" role="status" class="text-sm text-muted-foreground">
      正在載入或儲存點交資料，AI 分析可能需要一分鐘…
    </p>
    <div
      v-if="error"
      role="alert"
      class="rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      {{ error }}
      <Button variant="outline" size="sm" :disabled="busy" @click="reload">重新載入</Button>
    </div>
    <HandoverOverviewHeader
      phase="checkout"
      title="退租前點交與比對"
      :properties="properties"
      :property="currentProperty"
      :total="stats.total"
      :done="stats.checkoutDone"
      :busy="busy"
      @select="selectProperty"
      @back="router.push('/app/handover')"
    >
      <template #actions><HandoverAddItemsDialog :busy="busy" :add-items="addItems" /></template>
    </HandoverOverviewHeader>

    <!-- 工具列 -->
    <div v-if="currentProperty" class="flex flex-wrap items-center gap-2 border-b pb-3">
      <div class="relative min-w-[200px] flex-1">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="keyword"
          aria-label="搜尋物品、房間或備註"
          placeholder="搜尋物品、房間或備註"
          class="pl-8"
        />
      </div>
      <Button size="sm" @click="handleRunDiff" :disabled="busy || stats.checkoutDone === 0">
        <ArrowLeftRight class="mr-1 h-4 w-4" /> 執行自動差異比對
      </Button>
      <Button variant="outline" size="sm" @click="exportPdf" :disabled="stats.diffDone === 0">
        <FileDown class="mr-1 h-4 w-4" /> 匯出退租證據包
      </Button>
      <span v-if="lastDiffRunAt" class="text-xs text-muted-foreground ml-2">
        上次比對：{{ fmtDate(lastDiffRunAt) }}
      </span>
    </div>

    <!-- 對照清單 -->
    <section v-if="currentProperty" class="space-y-3">
      <p v-if="itemsWithBaseline.length === 0" class="text-sm text-muted-foreground">
        這個租屋處還沒有任何「已建立搬入存證」的項目。請先到
        <button class="underline" @click="router.push('/app/handover/baseline')">
          入住前點交頁
        </button>
        建立搬入照。
      </p>

      <p
        v-if="itemsWithBaseline.length && !filteredItems.length"
        class="text-sm text-muted-foreground"
      >
        沒有符合條件的項目，請調整搜尋。
      </p>
      <Card v-for="it in filteredItems" :key="it.id">
        <details class="checkout-item" :open="desktop">
          <summary class="flex cursor-pointer items-center gap-3 p-3 sm:hidden">
            <img
              :src="firstEvidence(it, 'checkout')?.url || firstEvidence(it, 'baseline')?.url"
              alt=""
              class="h-20 w-20 rounded-lg object-cover"
            />
            <span class="min-w-0 flex-1"
              ><strong>{{ it.name }}</strong
              ><span class="block text-xs text-muted-foreground"
                >{{ it.room }} ·
                {{ firstEvidence(it, 'checkout') ? '已拍攝退租照' : '待拍攝' }}</span
              ></span
            >
            <span class="text-xs text-primary">查看比對</span>
          </summary>
          <CardHeader class="hidden pb-2 sm:block">
            <div class="flex items-start justify-between">
              <div>
                <CardTitle class="text-lg">{{ it.name }}</CardTitle>
                <CardDescription>{{ it.room }}</CardDescription>
              </div>
              <Badge v-if="it.diff" :class="diffLabels[it.diff.type].cls">
                {{ diffLabels[it.diff.type].text }}
                <span class="ml-1 opacity-70">({{ (it.diff.confidence * 100).toFixed(0) }}%)</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p v-if="it.diff" class="mb-3 text-sm">{{ it.diff.summary }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- 左：搬入（唯讀） -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium">搬入存證</span>
                  <Badge variant="outline" class="gap-1"> <Lock class="h-3 w-3" /> 唯讀 </Badge>
                </div>
                <div class="aspect-video bg-muted rounded-md overflow-hidden">
                  <img
                    :src="firstEvidence(it, 'baseline')!.url"
                    class="object-cover w-full h-full"
                    referrerpolicy="no-referrer"
                  />
                </div>
                <div class="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock class="h-3 w-3" /> {{ fmtDate(firstEvidence(it, 'baseline')!.capturedAt) }}
                </div>
              </div>

              <!-- 右：退租（可拍） -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium">退租存證</span>
                  <Badge
                    v-if="firstEvidence(it, 'checkout')"
                    variant="secondary"
                    class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  >
                    <CheckCircle2 class="mr-1 h-3 w-3" /> 已存證
                  </Badge>
                  <Badge v-else variant="destructive">
                    <AlertCircle class="mr-1 h-3 w-3" /> 待拍攝
                  </Badge>
                </div>

                <div v-if="firstEvidence(it, 'checkout')" class="space-y-1">
                  <div class="aspect-video bg-muted rounded-md overflow-hidden">
                    <img
                      :src="firstEvidence(it, 'checkout')!.url"
                      class="object-cover w-full h-full"
                      referrerpolicy="no-referrer"
                    />
                  </div>
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-muted-foreground flex items-center gap-1">
                      <Clock class="h-3 w-3" />
                      {{ fmtDate(firstEvidence(it, 'checkout')!.capturedAt) }}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-destructive"
                      :disabled="busy"
                      @click="capturePhoto(it.id)"
                    >
                      重拍
                    </Button>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ firstEvidence(it, 'checkout')!.note }}
                  </p>
                  <Button
                    v-if="!firstEvidence(it, 'checkout')!.vlmResult"
                    variant="outline"
                    size="sm"
                    :disabled="busy"
                    @click="retryAnalysis(it.id, firstEvidence(it, 'checkout')!.id)"
                    >重新辨識</Button
                  >
                  <Badge
                    v-if="firstEvidence(it, 'checkout')!.aiConfidence"
                    variant="outline"
                    class="gap-1"
                  >
                    <Sparkles class="h-3 w-3" />
                    AI 清晰度
                    {{ (firstEvidence(it, 'checkout')!.aiConfidence! * 100).toFixed(0) }}%
                  </Badge>
                </div>

                <button
                  v-else
                  class="aspect-video w-full bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                  :disabled="busy"
                  @click="capturePhoto(it.id)"
                >
                  <Camera class="h-6 w-6 mb-1" />
                  <span class="text-xs">拍攝退租照</span>
                </button>
              </div>
            </div>
          </CardContent>
        </details>
      </Card>

      <!-- 提示：沒搬入照的項目 -->
      <Card v-if="itemsWithoutBaseline.length > 0">
        <CardContent class="pt-6 text-sm text-muted-foreground">
          <p class="mb-2">以下 {{ itemsWithoutBaseline.length }} 項缺少搬入存證，無法進行比對：</p>
          <ul class="list-disc pl-5">
            <li v-for="it in itemsWithoutBaseline" :key="it.id">{{ it.room }} · {{ it.name }}</li>
          </ul>
          <Button
            variant="link"
            size="sm"
            class="px-0 mt-2"
            @click="router.push('/app/handover/baseline')"
          >
            前往入住前點交頁補拍 →
          </Button>
        </CardContent>
      </Card>
    </section>

    <Card v-else-if="!busy && !error">
      <CardContent class="pt-6 text-center text-muted-foreground space-y-2">
        <Building2 class="h-8 w-8 mx-auto" />
        <p>目前沒有可用的租客合約，請先建立租約後再進行點交。</p>
      </CardContent>
    </Card>
  </div>
</template>
