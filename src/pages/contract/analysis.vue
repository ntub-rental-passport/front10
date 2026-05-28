<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge/index'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card/index'
import { Textarea } from '@/components/ui/textarea/index'
import {
  AlertTriangle,
  Copy,
  FileText,
  Sparkles,
  Undo2,
} from 'lucide-vue-next'

type RiskItem = {
  id: number
  title: string
  severity: 'high' | 'medium'
  law: string
  description: string
  aiAdvice: string
}

const router = useRouter()

const fullText = ref('')
const activeRiskId = ref<number | null>(null)
const negotiationScript = ref('')
const isGenerating = ref(false)

const risks = ref<RiskItem[]>([
  {
    id: 1,
    title: '押金扣留條款不明確',
    severity: 'high',
    law: '住宅租賃定型化契約應記載及不得記載事項',
    description: '契約未清楚說明押金扣留條件，可能造成退租時爭議，對承租人較不利。',
    aiAdvice:
      '可以請房東補充押金扣留的具體情境、計算方式與檢附證明，並明列正常使用耗損不得任意扣抵。',
  },
  {
    id: 2,
    title: '修繕責任分配偏向房客',
    severity: 'medium',
    law: '民法租賃相關規定',
    description: '條文將多數設備修繕責任直接轉由承租人負擔，可能超出一般合理使用範圍。',
    aiAdvice:
      '建議與房東確認大型設備、管線與自然耗損的責任歸屬，將非人為損壞的修繕責任回歸出租人。',
  },
])

onMounted(() => {
  fullText.value =
    sessionStorage.getItem('pending_contract_text') ||
    '目前沒有可分析的契約文字，請先回上一頁重新上傳檔案。'
})

function handleAIAssist(risk: RiskItem) {
  activeRiskId.value = risk.id
  isGenerating.value = true

  window.setTimeout(() => {
    negotiationScript.value = risk.aiAdvice
    isGenerating.value = false
  }, 800)
}

function copyToClipboard() {
  navigator.clipboard.writeText(negotiationScript.value)
  alert('談判建議已複製')
}
</script>

<template>
  <div class="min-h-screen bg-background p-4 font-sans text-foreground sm:p-6 md:p-10">
    <div class="mx-auto max-w-7xl space-y-6 sm:space-y-8">
      <header class="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:pb-6">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-primary sm:text-3xl md:text-4xl">契約診斷分析</h1>
          <p class="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground sm:mt-2 sm:text-base">
            <Sparkles class="h-3.5 w-3.5 shrink-0 text-accent sm:h-4 sm:w-4" />
            法規比對與風險提示已完成，可直接查看重點條文與談判建議。
          </p>
        </div>

        <div class="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            class="sm:h-10 sm:px-4 sm:py-2"
            @click="router.push('/app/contract')"
          >
            <Undo2 class="mr-2 h-4 w-4" />
            重新上傳
          </Button>
        </div>
      </header>

      <div class="grid grid-cols-1 items-start gap-5 sm:gap-8 lg:grid-cols-12">
        <section class="space-y-3 sm:space-y-4 lg:col-span-5">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <FileText class="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              原始契約預覽
            </h2>
          </div>

          <Card class="border-border bg-card/50 shadow-sm backdrop-blur">
            <CardContent class="p-0">
              <div class="h-[280px] overflow-y-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap scrollbar-thin scrollbar-thumb-muted sm:h-[420px] sm:p-6 lg:h-[650px]">
                {{ fullText }}
              </div>
            </CardContent>
          </Card>
        </section>

        <section class="space-y-4 sm:space-y-6 lg:col-span-7">
          <h2 class="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <AlertTriangle class="h-4 w-4 text-destructive sm:h-5 sm:w-5" />
            偵測到的風險項次
          </h2>

          <div class="space-y-3 sm:space-y-4">
            <Card
              v-for="risk in risks"
              :key="risk.id"
              :class="[
                'border-l-4 transition-all duration-300',
                activeRiskId === risk.id ? 'border-primary ring-2 ring-primary/10 shadow-md' : 'border-destructive',
              ]"
            >
              <CardHeader class="px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <CardTitle class="text-base font-bold leading-snug sm:text-xl">{{ risk.title }}</CardTitle>
                    <Badge variant="secondary" class="mt-1 bg-secondary text-xs text-secondary-foreground">
                      {{ risk.law }}
                    </Badge>
                  </div>

                  <Badge
                    class="shrink-0 text-xs"
                    :class="risk.severity === 'high' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground'"
                  >
                    {{ risk.severity === 'high' ? '高風險' : '中風險' }}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent class="px-4 sm:px-6">
                <p class="text-sm text-muted-foreground sm:text-base">{{ risk.description }}</p>
              </CardContent>

              <CardFooter class="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
                <Button
                  size="sm"
                  class="bg-accent text-xs font-semibold text-accent-foreground shadow-sm transition-transform hover:bg-accent/90 active:scale-95 sm:text-sm"
                  @click="handleAIAssist(risk)"
                >
                  <Sparkles class="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  AI 談判輔助
                </Button>
              </CardFooter>
            </Card>
          </div>

          <transition
            enter-active-class="transition duration-500 ease-out"
            enter-from-class="translate-y-4 opacity-0"
            enter-to-class="translate-y-0 opacity-100"
          >
            <Card
              v-if="activeRiskId"
              class="overflow-hidden border-primary/20 bg-primary/5 shadow-xl animate-in fade-in zoom-in duration-300"
            >
              <div class="flex items-center justify-between bg-primary px-4 py-2.5 sm:px-6 sm:py-3">
                <div class="flex items-center gap-2 text-sm font-medium text-primary-foreground sm:text-base">
                  <Sparkles class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  談判建議草稿
                </div>
                <div class="text-[9px] font-bold uppercase tracking-widest text-primary-foreground/70 sm:text-[10px]">
                  Editable
                </div>
              </div>

              <CardContent class="p-4 sm:p-6">
                <div v-if="isGenerating" class="flex items-center justify-center space-x-2 py-8 sm:py-10">
                  <div class="h-2 w-2 animate-bounce rounded-full bg-primary"></div>
                  <div class="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
                  <div class="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
                </div>

                <div v-else class="space-y-3 sm:space-y-4">
                  <p class="text-xs font-medium italic text-primary/60">可以直接在下方文字區塊手動編修後再複製使用。</p>
                  <Textarea
                    v-model="negotiationScript"
                    :rows="4"
                    class="resize-none border-primary/20 bg-background p-3 text-sm leading-relaxed text-foreground focus:border-primary focus:ring-primary sm:p-4 sm:text-base"
                  />
                </div>
              </CardContent>

              <CardFooter class="flex justify-between border-t border-primary/10 bg-primary/5 p-3 sm:p-4">
                <Button variant="ghost" size="sm" @click="activeRiskId = null">
                  取消
                </Button>
                <Button size="sm" class="bg-primary text-xs text-primary-foreground sm:text-sm" @click="copyToClipboard">
                  <Copy class="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  複製建議文字
                </Button>
              </CardFooter>
            </Card>
          </transition>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: var(--muted);
  border-radius: 10px;
}
</style>
