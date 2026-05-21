<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Textarea } from '@/components/ui/textarea/index'
import { Badge } from '@/components/ui/badge/index'
import { 
  AlertTriangle, 
  Scale, 
  Sparkles, 
  Copy, 
  Undo2, 
  ChevronRight,
  FileText
} from 'lucide-vue-next'

const fullText = ref('')
const activeRiskId = ref<number | null>(null)
const negotiationScript = ref('')
const isGenerating = ref(false)

// 模擬 RAG 比對結果
const risks = ref([
  { 
    id: 1, 
    title: '押金金額違反上限', 
    severity: 'high',
    law: '應記載事項第 5 點',
    description: '契約書第三條約定押金為「三個月」，依法最高僅能收取「二個月」。',
    aiAdvice: '房東您好，關於合約中押金的部分，依內政部規定最高不得超過二個月租金。目前合約寫三個月似乎不符規範，是否能修正為二個月呢？'
  },
  { 
    id: 2, 
    title: '電費計價方式不明確', 
    severity: 'medium',
    law: '應記載事項第 6 點',
    description: '未註明每度電費，且公共設施電費分攤方式未與台電帳單掛鉤。',
    aiAdvice: '房東您好，想請教關於電費的計算方式，是否能依規定在合約註明「每度電費不得超過台電當期平均電價」？這樣對雙方都比較有保障。'
  }
])

onMounted(() => {
  fullText.value = sessionStorage.getItem('pending_contract_text') || '尚未獲取契約內容，請重新上傳檔案。'
})

function handleAIAssist(risk: any) {
  activeRiskId.value = risk.id
  isGenerating.value = true
  
  // 模擬 AI 生成延遲
  setTimeout(() => {
    negotiationScript.value = risk.aiAdvice
    isGenerating.value = false
  }, 800)
}

function copyToClipboard() {
  navigator.clipboard.writeText(negotiationScript.value)
  // 這裡可以串接你的 Toast 通知組件
  alert('談判建議已複製！')
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground p-6 md:p-10 font-sans">
    <div class="max-w-7xl mx-auto space-y-8">
      
      <header class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 class="text-4xl font-bold tracking-tight text-primary">契約診斷分析</h1>
          <p class="text-muted-foreground mt-2 flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-accent" /> 法律人工智慧已根據最新租賃法規完成比對
          </p>
        </div>
        <div class="flex gap-3">
          <Button variant="outline" @click="$router.push('/contract')">
            <Undo2 class="w-4 h-4 mr-2" /> 重新上傳
          </Button>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        <section class="lg:col-span-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <FileText class="w-5 h-5 text-primary" /> 原始契約預覽
            </h2>
          </div>
          <Card class="border-border shadow-sm bg-card/50 backdrop-blur">
            <CardContent class="p-0">
              <div class="h-[650px] overflow-y-auto p-6 text-sm leading-relaxed whitespace-pre-wrap font-mono scrollbar-thin scrollbar-thumb-muted">
                {{ fullText }}
              </div>
            </CardContent>
          </Card>
        </section>

        <section class="lg:col-span-7 space-y-6">
          <h2 class="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle class="w-5 h-5 text-destructive" /> 偵測到的風險項次
          </h2>

          <div class="space-y-4">
            <Card 
              v-for="risk in risks" 
              :key="risk.id"
              :class="[
                'transition-all duration-300 border-l-4',
                activeRiskId === risk.id ? 'border-primary ring-2 ring-primary/10 shadow-md' : 'border-destructive'
              ]"
            >
              <CardHeader class="pb-2">
                <div class="flex justify-between items-start">
                  <div>
                    <CardTitle class="text-xl font-bold">{{ risk.title }}</CardTitle>
                    <Badge variant="secondary" class="mt-1 bg-secondary text-secondary-foreground">
                      {{ risk.law }}
                    </Badge>
                  </div>
                  <Badge 
                    :class="risk.severity === 'high' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground'"
                  >
                    {{ risk.severity === 'high' ? '高風險' : '中風險' }}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p class="text-muted-foreground">{{ risk.description }}</p>
              </CardContent>
              <CardFooter class="pt-0">
                <Button 
                  @click="handleAIAssist(risk)" 
                  class="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-sm transition-transform active:scale-95"
                >
                  <Sparkles class="w-4 h-4 mr-2" /> AI 談判輔助
                </Button>
              </CardFooter>
            </Card>
          </div>

          <transition 
            enter-active-class="transition duration-500 ease-out" 
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
          >
            <Card v-if="activeRiskId" class="bg-primary/5 border-primary/20 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
              <div class="bg-primary px-6 py-3 flex items-center justify-between">
                <div class="flex items-center gap-2 text-primary-foreground font-medium">
                  <Sparkles class="w-4 h-4" /> 談判建議草稿
                </div>
                <div class="text-[10px] uppercase tracking-widest text-primary-foreground/70 font-bold">
                  Editable Content
                </div>
              </div>
              <CardContent class="p-6">
                <div v-if="isGenerating" class="flex items-center justify-center py-10 space-x-2">
                  <div class="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div class="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                </div>
                <div v-else class="space-y-4">
                  <p class="text-xs text-primary/60 font-medium italic">您可以直接點擊下方區域進行手動編修：</p>
                  <Textarea 
                    v-model="negotiationScript" 
                    rows="6"
                    class="bg-background border-primary/20 focus:border-primary focus:ring-primary text-foreground text-md p-4 leading-relaxed resize-none"
                  />
                </div>
              </CardContent>
              <CardFooter class="flex justify-between border-t border-primary/10 bg-primary/5 p-4">
                <Button variant="ghost" size="sm" @click="activeRiskId = null">
                  取消
                </Button>
                <Button @click="copyToClipboard" class="bg-primary text-primary-foreground">
                  <Copy class="w-4 h-4 mr-2" /> 複製建議文字
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
/* 針對 Webkit 瀏覽器優化捲軸 */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: var(--muted);
  border-radius: 10px;
}
</style>