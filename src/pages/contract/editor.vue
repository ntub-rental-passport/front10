<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import { Separator } from '@/components/ui/separator/index'
import {
  FileText,
  Save,
  AlertTriangle,
  CheckCircle,
  Edit3,
  ArrowRight,
  Eye,
  PenLine,
} from 'lucide-vue-next'

const ocrFullText = ref(
  `房屋租賃契約書

立契約書人：
出租人（以下簡稱甲方）：陳大明
承租人（以下簡稱乙方）：林小明

第一條 租賃標的
甲方將其所有坐落於 台北市大安區 忠孝路一段 120 號 5 樓 之房屋，
出租乙方作住宅用途使用。

第二條 租賃期間
自民國 114 年 3 月 1 日起至民國 116 年 2 月 28 日止，共計 2 年。

第三條 租金
每月租金為新台幣 壹萬捌仟元整（NT$18,000），
乙方應於每月 5 日前繳納。

第四條 押金
乙方應於簽約時繳納押金新台幣 參萬陸仟元整（NT$36,000），
即兩個月租金。租約屆滿一交還房屋後，甲方無息返還。

第五條 提前終止
任一方如需提前終止合約，應於一個月前書面通知對方，
並由提前終止之一方支付相當於一個月租金之違約金。

第六條 修繕責任
房屋結構性損壞由甲方負責修繕，乙方使用不當造成之損壞由乙方負擔。

第七條 其他約定
乙方不得將房屋轉租或分租予第三人。
乙方同意不申請租屋補貼。`
)

interface ContractField {
  id: string
  label: string
  value: string
  confidence: 'high' | 'medium' | 'low'
  editing: boolean
}

const fields = ref<ContractField[]>([
  { id: 'landlord',   label: '出租人（甲方）', value: '陳大明',                              confidence: 'high',   editing: false },
  { id: 'tenant',     label: '承租人（乙方）', value: '林小明',                              confidence: 'high',   editing: false },
  { id: 'address',    label: '租屋地址',       value: '台北市大安區 忠孝路一段 120 號 5 樓', confidence: 'high',   editing: false },
  { id: 'start_date', label: '租期起始',       value: '114 年 3 月 1 日',                   confidence: 'high',   editing: false },
  { id: 'end_date',   label: '租期結束',       value: '116 年 2 月 28 日',                  confidence: 'high',   editing: false },
  { id: 'rent',       label: '每月租金',       value: 'NT$18,000',                          confidence: 'high',   editing: false },
  { id: 'due_day',    label: '繳租日',         value: '每月 5 日前',                        confidence: 'medium', editing: false },
  { id: 'deposit',    label: '押金',           value: 'NT$36,000',                          confidence: 'medium', editing: false },
  { id: 'penalty',    label: '違約金',         value: '一個月租金',                         confidence: 'low',    editing: false },
])

const isEditing = ref(false)
const isSaved = ref(false)

const uncertainCount = computed(() =>
  fields.value.filter(f => f.confidence !== 'high').length
)

const confidenceStyle = (level: string) => {
  switch (level) {
    case 'high':   return 'border-green-200 bg-green-50'
    case 'medium': return 'border-amber-300 bg-amber-50'
    case 'low':    return 'border-red-300 bg-red-50'
    default:       return ''
  }
}

const confidenceBadge = (level: string) => {
  switch (level) {
    case 'high':   return { text: '辨識正常',   class: 'bg-green-100 text-green-700' }
    case 'medium': return { text: '待確認',     class: 'bg-amber-100 text-amber-700' }
    case 'low':    return { text: '模糊不確定', class: 'bg-red-100 text-red-700' }
    default:       return { text: '', class: '' }
  }
}

function toggleEdit(field: ContractField) {
  field.editing = !field.editing
}

function handleSave() {
  isSaved.value = true
}

const router = useRouter()
function goToAnalysis() {
  router.push('/app/contract/analysis')
}
</script>

<template>
  <div class="contract-editor-page">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText class="text-primary" />
          契約電子檔編輯
        </h1>
        <p class="text-muted-foreground mt-1">
          以下為 OCR 辨識結果，請確認各欄位內容是否正確。模糊或不確定的欄位已標示，請手動修正。
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Button variant="outline" @click="isEditing = !isEditing">
          <PenLine v-if="!isEditing" data-icon="inline-start" />
          <Eye v-else data-icon="inline-start" />
          {{ isEditing ? '預覽模式' : '編輯模式' }}
        </Button>
        <Button @click="handleSave" :disabled="isSaved">
          <Save data-icon="inline-start" />
          確認儲存
        </Button>
      </div>
    </div>

    <div
      v-if="uncertainCount > 0 && !isSaved"
      class="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <AlertTriangle class="text-amber-600 shrink-0" :size="20" />
      <span class="text-amber-800 text-sm">
        系統偵測到 <strong>{{ uncertainCount }}</strong> 個欄位辨識結果可能不準確，已以顏色標示，請逐一確認或修正。
      </span>
    </div>

    <div
      v-if="isSaved"
      class="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-3"
    >
      <div class="flex items-center gap-3">
        <CheckCircle class="text-green-600 shrink-0" :size="20" />
        <span class="text-green-800 text-sm">
          契約資料已儲存成功，您可以繼續進行條文風險分析。
        </span>
      </div>
      <Button size="sm" @click="goToAnalysis">
        條文風險分析
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card class="lg:col-span-3">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-lg">
            <FileText :size="18" />
            契約全文
          </CardTitle>
          <CardDescription>OCR 辨識後的完整文字內容，可直接修改</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            v-if="isEditing"
            v-model="ocrFullText"
            class="w-full min-h-[600px] rounded-lg border border-border bg-background p-4 text-sm leading-7 font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
          <div
            v-else
            class="w-full min-h-[600px] rounded-lg border border-border bg-muted/30 p-4 text-sm leading-7 whitespace-pre-wrap break-words font-mono"
          >
            {{ ocrFullText }}
          </div>
        </CardContent>
      </Card>

      <div class="lg:col-span-2 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <Edit3 :size="18" />
              關鍵欄位
            </CardTitle>
            <CardDescription>系統自動擷取的欄位，點擊可修改</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <div
              v-for="field in fields"
              :key="field.id"
              class="rounded-lg border p-3 transition-colors"
              :class="confidenceStyle(field.confidence)"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ field.label }}
                </span>
                <Badge
                  variant="secondary"
                  class="text-xs"
                  :class="confidenceBadge(field.confidence).class"
                >
                  {{ confidenceBadge(field.confidence).text }}
                </Badge>
              </div>

              <div v-if="field.editing" class="flex items-center gap-2">
                <input
                  v-model="field.value"
                  class="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  @keyup.enter="field.editing = false"
                />
                <Button size="sm" variant="ghost" @click="field.editing = false">
                  <CheckCircle :size="16" class="text-green-600" />
                </Button>
              </div>
              <div
                v-else
                class="flex items-center justify-between cursor-pointer group"
                @click="toggleEdit(field)"
              >
                <span class="text-sm font-semibold text-foreground">
                  {{ field.value }}
                </span>
                <PenLine
                  :size="14"
                  class="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="pt-4">
            <p class="text-xs font-medium text-muted-foreground mb-3">辨識信心度圖例</p>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-green-500" />
                <span class="text-xs text-muted-foreground">辨識正常 — 無需修改</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-amber-500" />
                <span class="text-xs text-muted-foreground">待確認 — 建議核對原件</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full bg-red-500" />
                <span class="text-xs text-muted-foreground">模糊不確定 — 請手動修正</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped src="./editor.css"></style>
