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

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Sparkles,
  Clock,
  Building2,
  ArrowLeft,
  ArrowLeftRight,
  Lock,
} from 'lucide-vue-next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/index'
import { Label } from '@/components/ui/label/index'

import { useHandover, type HandoverDiff } from '@/src/composables/useHandover'

const router = useRouter()
const {
  properties,
  currentProperty,
  selectProperty,
  itemsOfCurrentProperty,
  addEvidence,
  removeEvidence,
  runAutoDiff,
} = useHandover()

// ---------- 拍照 / 上傳 ---------- //

/** 將選取的圖片壓縮至最大寬度後回傳 dataURL */
function resizeImage(file: File, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let w = img.naturalWidth
        let h = img.naturalHeight
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w)
          w = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** 開啟相機 / 相簿選取，壓縮後存入存證 */
async function capturePhoto(itemId: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'      // 手機上會彈出「相機 / 相簿」選單
  input.style.display = 'none'
  document.body.appendChild(input)

  input.onchange = async () => {
    const file = input.files?.[0]
    document.body.removeChild(input)
    if (!file) return
    try {
      const dataUrl = await resizeImage(file)
      addEvidence(itemId, 'checkout', {
        url: dataUrl,
        aiLabel: 'clear',
        aiConfidence: 0.9,
      })
    } catch (err) {
      console.error('圖片處理失敗', err)
    }
  }

  input.click()
}

// ---------- 過濾：只顯示「搬入已存證」的項目 ---------- //
// 沒拍搬入照的項目在退租階段不參與比對，避免誤導使用者。
const itemsWithBaseline = computed(() =>
  itemsOfCurrentProperty.value.filter((it) => it.evidences.some((e) => e.phase === 'baseline'))
)

const itemsWithoutBaseline = computed(() =>
  itemsOfCurrentProperty.value.filter((it) => !it.evidences.some((e) => e.phase === 'baseline'))
)

// ---------- 統計 ---------- //

const stats = computed(() => {
  const total = itemsWithBaseline.value.length
  const checkoutDone = itemsWithBaseline.value.filter((it) =>
    it.evidences.some((e) => e.phase === 'checkout')
  ).length
  const diffDone = itemsWithBaseline.value.filter((it) => it.diff).length
  return { total, checkoutDone, diffDone }
})

// ---------- 工具 ---------- //

function firstEvidence(
  item: (typeof itemsOfCurrentProperty.value)[number],
  phase: 'baseline' | 'checkout'
) {
  return item.evidences.find((e) => e.phase === phase) ?? null
}

const diffLabels: Record<HandoverDiff['type'], { text: string; cls: string }> = {
  unchanged: { text: '狀態相同', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' },
  new_damage: { text: '新增瑕疵', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
  missing: { text: '物品消失', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
  degraded: { text: '使用痕跡', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' },
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------- 匯出 PDF ---------- //

const lastDiffRunAt = ref<string | null>(null)
function handleRunDiff() {
  runAutoDiff()
  lastDiffRunAt.value = new Date().toISOString()
}

function exportPdf() {
  window.alert(
    `（示意）將匯出「${currentProperty.value?.alias}」之退租證據包 PDF。\n` +
      `已比對項目：${stats.value.diffDone} / ${stats.value.total}`
  )
}
</script>

<template>
  <div class="space-y-6">
    <!-- 麵包屑 + 標題 -->
    <div class="space-y-2">
      <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/app/handover')">
        <ArrowLeft class="mr-1 h-4 w-4" /> 返回點交總覽
      </Button>
      <div>
        <h1 class="text-3xl font-bold tracking-tight">退租前點交與比對</h1>
        <p class="text-muted-foreground">
          對照搬入時的存證照重新拍攝，系統自動比對差異並產出 PDF 證據包。
        </p>
      </div>
    </div>

    <!-- 租屋處選擇器 -->
    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[240px] space-y-1">
            <Label class="flex items-center gap-1 text-xs">
              <Building2 class="h-3 w-3" /> 目前租屋處
            </Label>
            <Select
              :model-value="currentProperty?.id ?? ''"
              @update:model-value="(v) => selectProperty(String(v))"
            >
              <SelectTrigger>
                <SelectValue placeholder="請選擇租屋處" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in properties" :key="p.id" :value="p.id">
                  {{ p.alias }}（{{ p.address }}）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <!-- 統計 -->
        <div v-if="currentProperty" class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">可比對項目（搬入已存證）</div>
            <div class="font-semibold">{{ stats.total }} 項</div>
          </div>
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">退租已存證</div>
            <div class="font-semibold">{{ stats.checkoutDone }} / {{ stats.total }}</div>
          </div>
          <div class="rounded-md border p-2">
            <div class="text-xs text-muted-foreground">已完成比對</div>
            <div class="font-semibold">{{ stats.diffDone }} / {{ stats.total }}</div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 工具列 -->
    <div v-if="currentProperty" class="flex flex-wrap items-center gap-2 border-b pb-3">
      <Button size="sm" @click="handleRunDiff" :disabled="stats.checkoutDone === 0">
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

      <Card v-for="it in itemsWithBaseline" :key="it.id">
        <CardHeader class="pb-2">
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
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- 左：搬入（唯讀） -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium">搬入存證</span>
                <Badge variant="outline" class="gap-1">
                  <Lock class="h-3 w-3" /> 唯讀
                </Badge>
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
                    @click="removeEvidence(it.id, firstEvidence(it, 'checkout')!.id)"
                  >
                    重拍
                  </Button>
                </div>
                <Badge v-if="firstEvidence(it, 'checkout')!.aiConfidence" variant="outline" class="gap-1">
                  <Sparkles class="h-3 w-3" />
                  AI 清晰度
                  {{ (firstEvidence(it, 'checkout')!.aiConfidence! * 100).toFixed(0) }}%
                </Badge>
              </div>

              <button
                v-else
                class="aspect-video w-full bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                @click="capturePhoto(it.id)"
              >
                <Camera class="h-6 w-6 mb-1" />
                <span class="text-xs">拍攝退租照</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 提示：沒搬入照的項目 -->
      <Card v-if="itemsWithoutBaseline.length > 0">
        <CardContent class="pt-6 text-sm text-muted-foreground">
          <p class="mb-2">
            以下 {{ itemsWithoutBaseline.length }} 項缺少搬入存證，無法進行比對：
          </p>
          <ul class="list-disc pl-5">
            <li v-for="it in itemsWithoutBaseline" :key="it.id">
              {{ it.room }} · {{ it.name }}
            </li>
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

    <Card v-else>
      <CardContent class="pt-6 text-center text-muted-foreground space-y-2">
        <Building2 class="h-8 w-8 mx-auto" />
        <p>請先選擇或新增一個租屋處。</p>
      </CardContent>
    </Card>
  </div>
</template>
