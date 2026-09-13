<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card/index'
import { Button } from '@/components/ui/button/index'
import { Badge } from '@/components/ui/badge/index'
import { Separator } from '@/components/ui/separator/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog/index'
import {
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Download,
  Eye,
  Minus,
  Plus,
  CheckCircle,
  MessageSquareText,
  Copy,
  Check,
  RotateCcw,
  Loader2,
  Sparkles,
  Scale,
  Info,
  BookOpen,
  Handshake,
  Shield,
  ShieldAlert,
  ShieldCheck,
  FileText,
  ThumbsUp,
  Printer,
} from 'lucide-vue-next'

// ─────────────────────────────────────────────
// 契約基本資訊 & 整體分數（ContractResult）
// ─────────────────────────────────────────────
const contractInfo = ref({
  fileName: '租賃契約書_陳大明_林小明.pdf',
  analyzedAt: '2026-05-21 14:32',
  totalClauses: 7,
  landlord: '陳大明',
  tenant: '林小明',
  address: '台北市大安區 忠孝路一段 120 號 5 樓',
  period: '114/03/01 ~ 116/02/28',
  rent: 'NT$18,000 / 月',
})

// ─────────────────────────────────────────────
// 契約頁面瀏覽（左欄）
// ─────────────────────────────────────────────
interface ContractLine {
  text: string
  highlight?: 'danger' | 'warning' | null
  redMark?: string
}

interface ContractPage {
  pageNum: number
  lines: ContractLine[]
}

const contractPages = ref<ContractPage[]>([
  {
    pageNum: 1,
    lines: [
      { text: '房屋租賃契約書', highlight: null },
      { text: '' },
      { text: '立契約書人：出租人 陳大明（以下簡稱甲方）' },
      { text: '　　　　　　承租人 林小明（以下簡稱乙方）' },
      { text: '' },
      { text: '第一條　租賃標的：台北市大安區忠孝路一段…' },
      { text: '' },
      { text: '第二條　租賃期間：自民國 114 年 3 月 1 日起' },
      { text: '　　　　至 116 年 2 月 28 日止。' },
      { text: '' },
      { text: '第三條　租金：每月租金新台幣壹萬捌仟元整。' },
      { text: '' },
      { text: '第四條　押金：乙方應於簽約時繳納押金新台幣參萬陸仟元整（NT$36,000），' },
      { text: '　　　　即兩個月租金。租約屆滿一交還房屋後，甲方無息返還。', highlight: 'warning', redMark: '交還房屋後' },
      { text: '' },
      { text: '第五條　提前終止：任一方如需提前終止合約，應於一個月前書面通知對方，', highlight: 'warning' },
      { text: '　　　　並由提前終止之一方支付相當於一個月租金之違約金。', highlight: 'warning', redMark: '一個月租金之違約金' },
    ],
  },
  {
    pageNum: 2,
    lines: [
      { text: '第六條　修繕責任：房屋結構性損壞由甲方負責修繕，' },
      { text: '　　　　乙方使用不當造成之損壞由乙方負擔。' },
      { text: '' },
      { text: '第七條　其他約定：', highlight: 'danger' },
      { text: '　　　　（一）乙方不得將房屋轉租或分租予第三人。' },
      { text: '　　　　（二）乙方同意不申請租屋補貼。', highlight: 'danger', redMark: '不申請租屋補貼' },
      { text: '' },
      { text: '第八條　本契約如有未盡事宜，依民法及相關法規辦理。' },
      { text: '' },
      { text: '甲方簽章：＿＿＿＿＿＿' },
      { text: '乙方簽章：＿＿＿＿＿＿' },
      { text: '' },
      { text: '中華民國　114　年　2　月　25　日' },
    ],
  },
])

const currentPage = ref(1)
const totalPages = computed(() => contractPages.value.length)
const currentPageData = computed(() =>
  contractPages.value.find(p => p.pageNum === currentPage.value),
)
const zoomLevel = ref(100)

function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}
function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}
function zoomIn() {
  if (zoomLevel.value < 150) zoomLevel.value += 10
}
function zoomOut() {
  if (zoomLevel.value > 70) zoomLevel.value -= 10
}

// ─────────────────────────────────────────────
// 風險條款資料（合併 ContractAnalysis + ContractResult）
// ─────────────────────────────────────────────
interface LegalRef {
  law: string
  content: string
}

interface RiskClause {
  id: string
  article: string
  title: string
  riskLevel: 'high' | 'medium' | 'low' | 'safe'
  riskLabel: string
  originalText: string
  riskDescription: string
  plainExplanation: string
  suggestion: string
  negotiationTip: string
  legalBasis?: string
  legalRefs: LegalRef[]
  expanded: boolean
  legalExpanded: boolean
}

const riskClauses = ref<RiskClause[]>([
  {
    id: '1',
    article: '第七條',
    title: '禁止申請租屋補貼',
    riskLevel: 'high',
    riskLabel: '高風險',
    originalText: '乙方同意不申請租屋補貼。',
    riskDescription: '此條款嚴重損害承租人權益。依租賃住宅法規定，出租人不得禁止承租人申報租金支出或申請租屋補貼，該條款依法無效。',
    plainExplanation: '房東在契約中禁止你申請租屋補貼，但這在法律上是無效的。即使你簽了這份契約，你仍然有權依法申請補貼，不受此條款限制。',
    suggestion: '此條款違法，建議直接刪除。即使簽署了此條款，承租人仍可依法申請租屋補貼。建議與房東溝通刪除此一條文。',
    negotiationTip: '「依據租賃住宅法第 15 條規定，此類限制條款本身無效，建議雙方刪除，避免日後爭議，對房東申請公益房東補助也較有利。」',
    legalBasis: '租賃住宅市場發展及管理條例 §15、所得稅法 §17',
    legalRefs: [
      { law: '租賃住宅市場發展及管理條例 §15', content: '出租人不得限制承租人申報租金支出或申請租屋補貼，違反者條款無效。' },
      { law: '所得稅法 §17', content: '承租人依法得申報租金支出扣除，出租人不得以契約限制。' },
    ],
    expanded: true,
    legalExpanded: false,
  },
  {
    id: '2',
    article: '第五條',
    title: '提前終止違約金',
    riskLevel: 'medium',
    riskLabel: '注意風險',
    originalText: '任一方如需提前終止合約，應於一個月前書面通知對方，並由提前終止之一方支付相當於一個月租金之違約金。',
    riskDescription: '違約金額度為一個月租金，符合租賃住宅法下限規定，但條文中「書面通知」的方式與起算點未明確定義，可能產生爭議。',
    plainExplanation: '違約金金額本身合法，但「書面通知」沒有定義怎樣算書面、從哪天起算，萬一發生爭議很難舉證，建議補充細節。',
    suggestion: '建議加註「書面通知以掛號郵件、電子郵件或通訊軟體訊息為之，以對方收到之日起算」，以避免通知爭議。',
    negotiationTip: '「為了讓雙方都清楚起算點，建議我們在條文中加一行說明通知方式，例如掛號或 LINE 訊息都算，以對方收到當天起算，這樣往後都不會有誤解。」',
    legalBasis: '租賃住宅市場發展及管理條例 §11',
    legalRefs: [
      { law: '租賃住宅市場發展及管理條例 §11', content: '提前終止之違約金不得超過一個月租金，且應明確約定通知方式。' },
    ],
    expanded: false,
    legalExpanded: false,
  },
  {
    id: '3',
    article: '第四條',
    title: '押金返還期限',
    riskLevel: 'low',
    riskLabel: '低風險',
    originalText: '乙方應於簽約時繳納押金新台幣參萬陸仟元整（NT$36,000），即兩個月租金。租約屆滿一交還房屋後，甲方無息返還。',
    riskDescription: '押金金額為兩個月租金，符合法定上限。但條文中「交還房屋後」未明確返還期限，實際上容易遭房東以點交未完成為由拖延返還押金。',
    plainExplanation: '押金金額兩個月沒問題，但「交還房屋後」沒有說幾天內要還，建議加上具體天數保障自己。',
    suggestion: '建議加註「甲方應於乙方交還房屋後 14 天內返還押金，如有損壞應提供費用明細」，以保障雙方權益。',
    negotiationTip: '「為了讓交屋流程更清楚，建議加上返還期限如 14 天，並附損壞明細，雙方都比較有保障。」',
    legalBasis: '土地法 §99、租賃住宅市場發展及管理條例 §7',
    legalRefs: [
      { law: '土地法 §99', content: '押金不得超過兩個月租金，超收部分得抵充租金。' },
      { law: '租賃住宅市場發展及管理條例 §7', content: '押金應於租期屆滿並無損壞後合理期限內返還。' },
    ],
    expanded: false,
    legalExpanded: false,
  },
  {
    id: '4',
    article: '第六條',
    title: '修繕責任',
    riskLevel: 'low',
    riskLabel: '低風險',
    originalText: '房屋結構性損壞由甲方負責修繕，乙方使用不當造成之損壞由乙方負擔。',
    riskDescription: '修繕責任劃分大致合理，但未載明修繕通知流程與期限，也未約定甲方未於合理期限內修繕時乙方的應對方式。',
    plainExplanation: '責任分配合理，但缺少通知流程和期限，若房東遲不修繕你也沒有明確依據自行處理。',
    suggestion: '建議補充「乙方發現需修繕事項應書面通知甲方，甲方應於 14 日內處理；逾期未修繕者，乙方得自行委工修繕，費用由甲方負擔」。',
    negotiationTip: '「為了避免修繕久等的困擾，建議加上通知期限，逾期可自行委工費用由甲方負擔，雙方都更有保障。」',
    legalBasis: '民法 §429、§430',
    legalRefs: [
      { law: '民法 §429', content: '出租人應以合於所約定使用收益之狀態，交付租賃物，並應於租賃關係存續中保持其狀態。' },
      { law: '民法 §430', content: '租賃關係存續中，租賃物如有修繕之必要，應由出租人負擔者，承租人得定相當期限，催告出租人修繕。' },
    ],
    expanded: false,
    legalExpanded: false,
  },
  {
    id: '5',
    article: '第七條',
    title: '禁止轉租',
    riskLevel: 'safe',
    riskLabel: '安全',
    originalText: '乙方不得將房屋轉租或分租予第三人。',
    riskDescription: '此為常見且合理的約定，符合一般租賃慣例，法律上出租人有權限制承租人轉租行為。',
    plainExplanation: '禁止轉租是合法且常見的條款，沒有問題。',
    suggestion: '此條款合理，無需修改。',
    negotiationTip: '',
    legalBasis: '民法 §443',
    legalRefs: [
      { law: '民法 §443', content: '承租人非經出租人承諾，不得將租賃物轉租於他人。' },
    ],
    expanded: false,
    legalExpanded: false,
  },
])

// ─────────────────────────────────────────────
// 整體風險評分（ContractResult 邏輯）
// ─────────────────────────────────────────────
const riskStats = computed(() => {
  const counts = { high: 0, medium: 0, low: 0, safe: 0 }
  riskClauses.value.forEach(c => counts[c.riskLevel]++)
  return counts
})

const overallScore = computed(() => {
  const scoreMap = { safe: 100, low: 70, medium: 40, high: 10 }
  const total = riskClauses.value.reduce((sum, c) => sum + scoreMap[c.riskLevel], 0)
  return Math.round(total / riskClauses.value.length)
})

const scoreColor = computed(() => {
  if (overallScore.value >= 80) return 'text-green-600'
  if (overallScore.value >= 60) return 'text-amber-600'
  return 'text-red-600'
})

const scoreLabel = computed(() => {
  if (overallScore.value >= 80) return '安全'
  if (overallScore.value >= 60) return '中等風險'
  if (overallScore.value >= 40) return '偏高風險'
  return '高風險'
})

const onlyHighRisk = ref(false)

const filteredClauses = computed(() => {
  if (!onlyHighRisk.value) return riskClauses.value
  return riskClauses.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'medium')
})

const riskCount = computed(() =>
  riskClauses.value.filter(c => c.riskLevel === 'high' || c.riskLevel === 'medium').length,
)

function toggleExpand(clause: RiskClause) {
  clause.expanded = !clause.expanded
}

function toggleLegal(clause: RiskClause) {
  clause.legalExpanded = !clause.legalExpanded
}

const riskBorderColor = (level: string) => {
  switch (level) {
    case 'high':   return 'border-red-400'
    case 'medium': return 'border-orange-400'
    case 'low':    return 'border-blue-300'
    default:       return 'border-gray-200'
  }
}

const riskBadgeStyle = (level: string) => {
  switch (level) {
    case 'high':   return 'bg-red-500 text-white'
    case 'medium': return 'bg-orange-500 text-white'
    case 'low':    return 'bg-blue-500 text-white'
    default:       return 'bg-gray-100 text-gray-600'
  }
}

const riskCardBg = (level: string) => {
  switch (level) {
    case 'high':   return 'bg-red-50/40'
    case 'medium': return 'bg-orange-50/40'
    default:       return ''
  }
}

const riskIcon = (level: string) => {
  switch (level) {
    case 'high':   return AlertOctagon
    case 'medium': return AlertTriangle
    case 'low':    return ShieldAlert
    default:       return ShieldCheck
  }
}

const riskIconColor = (level: string) => {
  switch (level) {
    case 'high':   return 'text-red-500'
    case 'medium': return 'text-amber-500'
    case 'low':    return 'text-blue-500'
    default:       return 'text-green-500'
  }
}

// ─────────────────────────────────────────────
// AI 談判腳本 Dialog（合併 ContractNegotiation）
// ─────────────────────────────────────────────
const showNegotiationDialog = ref(false)
const negotiationTarget = ref<RiskClause | null>(null)
const isGenerating = ref(false)
const isCopied = ref(false)
const generatedScript = ref('')

type ToneType = 'polite' | 'neutral' | 'firm'
const selectedTone = ref<ToneType>('polite')
const tones: { value: ToneType; label: string; desc: string }[] = [
  { value: 'polite',  label: '禮貌溫和', desc: '適合維持良好房客關係' },
  { value: 'neutral', label: '中性客觀', desc: '就事論事，引用法規' },
  { value: 'firm',    label: '堅定明確', desc: '強調法律權益與底線' },
]

const scriptTemplates: Record<string, Record<ToneType, string>> = {
  '1': {
    polite: `陳先生您好：

我是您的租客林小明，感謝您這段時間以來的照顧。我近來仔細閱讀了我們的租賃契約，關於第七條「不申請租屋補貼」這一部分，想和您友善地討論一下。

根據「租賃住宅市場發展及管理條例」第 15 條，此類限制條款在法律上其實是無效的，即使簽了我仍可依法申請。不過我更希望我們能好好溝通，刪除這一條款，讓契約更加完善，對雙方都有保障。

如果您方便的話，我們可以找個時間聊聊。謝謝您！

林小明 敬上`,
    neutral: `陳先生您好：

依據「租賃住宅市場發展及管理條例」第 15 條規定，出租人不得限制承租人申報租金支出或申請租屋補貼，違反者條款無效。

本人注意到契約第七條（二）之「乙方同意不申請租屋補貼」不符合上述規定，建議雙方合意刪除，以避免日後爭議。

請您參考，謝謝。

林小明`,
    firm: `陳先生：

依法告知：契約第七條（二）「乙方同意不申請租屋補貼」違反租賃住宅市場發展及管理條例第 15 條，屬無效條款。本人已諮詢法律意見，無論契約是否保留此條，本人均可依法申請租屋補貼。

請於一週內確認刪除此條款，否則本人將依法主張權益。

林小明`,
  },
  '2': {
    polite: `陳先生您好：

關於契約第五條提前終止的通知方式，目前條文只寫「書面通知」，但沒有說明什麼算書面通知、從哪天起算。

為了避免日後雙方對認定不同而產生誤解，我想建議加上一句：「書面通知以掛號郵件、電子郵件或通訊軟體訊息為之，以對方收到之日起算。」

這樣雙方都比較清楚，也更有保障，麻煩您考慮一下，謝謝！

林小明 敬上`,
    neutral: `陳先生您好：

契約第五條「書面通知」未定義通知方式與起算點，建議補充：「以掛號郵件、電子郵件或通訊軟體訊息為之，以對方收到之日起算」，以避免爭議。

謝謝。

林小明`,
    firm: `陳先生：

契約第五條通知方式定義不明，依民事訴訟舉證原則，模糊條款對雙方均不利。建議明確補充通知方式與起算點，否則日後爭議將難以釐清。

請確認修改，謝謝。

林小明`,
  },
  '3': {
    polite: `陳先生您好：

關於契約第四條押金返還，目前寫「交還房屋後」返還，沒有明確的天數。為了讓我們交屋流程更順暢，我想建議加上「甲方應於乙方交還房屋後 14 天內返還押金，如有損壞應提供費用明細」，這樣雙方都更清楚，麻煩您考慮，謝謝！

林小明 敬上`,
    neutral: `陳先生：

契約第四條押金返還未定期限，依土地法第 99 條，押金應於合理期限內返還。建議加註「14 天內返還並附損壞明細」，謝謝。

林小明`,
    firm: `陳先生：

契約第四條押金返還期限不明，依法押金應於合理期限內返還，否則承租人得向主管機關申訴。請明確補充返還期限與程序。

林小明`,
  },
}

async function openNegotiationDialog(clause: RiskClause) {
  negotiationTarget.value = clause
  showNegotiationDialog.value = true
  isCopied.value = false
  await generateForClause(clause)
}

async function generateForClause(clause: RiskClause) {
  isGenerating.value = true
  await new Promise(resolve => setTimeout(resolve, 1500))
  const templates = scriptTemplates[clause.id]
  generatedScript.value = templates
    ? templates[selectedTone.value]
    : `關於${clause.article}「${clause.title}」的談判腳本正在產生中...`
  isGenerating.value = false
}

async function regenerateScript() {
  if (!negotiationTarget.value) return
  isCopied.value = false
  await generateForClause(negotiationTarget.value)
}

async function copyScript() {
  try {
    await navigator.clipboard.writeText(generatedScript.value)
    isCopied.value = true
    setTimeout(() => { isCopied.value = false }, 2000)
  } catch {
    // fallback: silent fail
  }
}
</script>

<template>
  <div class="contract-combined-page">

    <!-- ─── 頁首 ─── -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground">契約風險完整報告</h1>
        <p class="text-sm text-muted-foreground mt-1">
          分析時間：{{ contractInfo.analyzedAt }}　｜　檔案：{{ contractInfo.fileName }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline">
          <Printer data-icon="inline-start" />
          列印
        </Button>
        <Button variant="outline">
          <Download data-icon="inline-start" />
          匯出報告
        </Button>
      </div>
    </div>

    <!-- ─── 整體摘要列 ─── -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <!-- 圓形評分 -->
      <Card>
        <CardContent class="pt-6 flex flex-col items-center justify-center">
          <div class="relative size-28 flex items-center justify-center">
            <svg class="absolute inset-0" viewBox="0 0 144 144">
              <circle cx="72" cy="72" r="64" fill="none" stroke="currentColor" stroke-width="8" class="text-muted/30" />
              <circle
                cx="72" cy="72" r="64"
                fill="none"
                stroke="currentColor"
                stroke-width="8"
                stroke-linecap="round"
                :stroke-dasharray="`${overallScore * 4.02} 402`"
                transform="rotate(-90 72 72)"
                :class="scoreColor"
              />
            </svg>
            <div class="text-center">
              <p class="text-3xl font-bold" :class="scoreColor">{{ overallScore }}</p>
              <p class="text-xs text-muted-foreground">/ 100</p>
            </div>
          </div>
          <p class="mt-2 text-sm font-semibold" :class="scoreColor">{{ scoreLabel }}</p>
          <p class="text-xs text-muted-foreground">當前風險評分</p>
        </CardContent>
      </Card>

      <!-- 風險分佈 -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm text-muted-foreground">風險分佈</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-end gap-2 h-16">
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-xs font-bold text-red-600">{{ riskStats.high }}</span>
              <div class="w-full rounded-t bg-red-500 transition-all" :style="{ height: `${Math.max(riskStats.high * 18, 4)}px` }" />
              <span class="text-xs text-muted-foreground">高</span>
            </div>
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-xs font-bold text-amber-600">{{ riskStats.medium }}</span>
              <div class="w-full rounded-t bg-amber-500 transition-all" :style="{ height: `${Math.max(riskStats.medium * 18, 4)}px` }" />
              <span class="text-xs text-muted-foreground">中</span>
            </div>
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-xs font-bold text-blue-600">{{ riskStats.low }}</span>
              <div class="w-full rounded-t bg-blue-500 transition-all" :style="{ height: `${Math.max(riskStats.low * 18, 4)}px` }" />
              <span class="text-xs text-muted-foreground">低</span>
            </div>
            <div class="flex-1 flex flex-col items-center gap-1">
              <span class="text-xs font-bold text-green-600">{{ riskStats.safe }}</span>
              <div class="w-full rounded-t bg-green-500 transition-all" :style="{ height: `${Math.max(riskStats.safe * 18, 4)}px` }" />
              <span class="text-xs text-muted-foreground">安全</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 契約基本資訊 -->
      <Card class="md:col-span-2">
        <CardHeader class="pb-2">
          <CardTitle class="text-sm text-muted-foreground">契約基本資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p class="text-xs text-muted-foreground">出租人</p>
              <p class="font-medium">{{ contractInfo.landlord }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">承租人</p>
              <p class="font-medium">{{ contractInfo.tenant }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">租屋地址</p>
              <p class="font-medium text-xs">{{ contractInfo.address }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">租賃期間</p>
              <p class="font-medium text-xs">{{ contractInfo.period }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">每月租金</p>
              <p class="font-medium">{{ contractInfo.rent }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">條款總數</p>
              <p class="font-medium">{{ contractInfo.totalClauses }} 條</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- ─── 主要兩欄 ─── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      <!-- ─────── 左欄：契約內容瀏覽 ─────── -->
      <Card class="sticky top-6">
        <CardHeader class="flex flex-row items-center justify-between pb-3">
          <CardTitle class="text-lg">原始契約內容</CardTitle>
          <Badge variant="outline" class="gap-1 text-green-700 border-green-300 bg-green-50">
            <CheckCircle :size="12" />
            OCR 辨識完成
          </Badge>
        </CardHeader>
        <CardContent>
          <!-- 契約內容 -->
          <div
            class="rounded-lg border bg-white p-8 min-h-[520px] overflow-auto"
            :style="{ fontSize: `${zoomLevel * 0.14}px`, lineHeight: '2' }"
          >
            <div v-if="currentPageData">
              <template v-for="(line, idx) in currentPageData.lines" :key="idx">
                <p
                  v-if="idx === 0 && currentPage === 1"
                  class="text-center font-bold mb-4"
                  :style="{ fontSize: `${zoomLevel * 0.18}px` }"
                >
                  {{ line.text }}
                </p>
                <div v-else-if="!line.text" class="h-3" />
                <p
                  v-else-if="line.highlight"
                  class="rounded px-2 py-0.5 -mx-2"
                  :class="{
                    'bg-red-50 border border-red-200': line.highlight === 'danger',
                    'bg-amber-50 border border-amber-200': line.highlight === 'warning',
                  }"
                >
                  <template v-if="line.redMark">
                    {{ line.text.split(line.redMark)[0] }}<span
                      class="font-bold"
                      :class="{
                        'text-red-600': line.highlight === 'danger',
                        'text-amber-700': line.highlight === 'warning',
                      }"
                    >{{ line.redMark }}</span>{{ line.text.split(line.redMark).slice(1).join(line.redMark) }}
                  </template>
                  <template v-else>{{ line.text }}</template>
                </p>
                <p v-else class="text-foreground">{{ line.text }}</p>
              </template>
            </div>
          </div>

          <!-- 翻頁 & 縮放 -->
          <div class="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="sm" :disabled="currentPage <= 1" @click="prevPage">
                <ChevronLeft :size="16" />
              </Button>
              <span class="px-2">{{ currentPage }} / {{ totalPages }}</span>
              <Button variant="ghost" size="sm" :disabled="currentPage >= totalPages" @click="nextPage">
                <ChevronRight :size="16" />
              </Button>
            </div>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="sm" @click="zoomOut">
                <Minus :size="14" />
              </Button>
              <span class="w-12 text-center">{{ zoomLevel }}%</span>
              <Button variant="ghost" size="sm" @click="zoomIn">
                <Plus :size="14" />
              </Button>
            </div>
          </div>
          <p class="text-xs text-muted-foreground mt-2">
            文件識別來源：OCR 辨識結果，可能含有誤差，僅供參考。
          </p>
        </CardContent>
      </Card>

      <!-- ─────── 右欄：風險分析卡片 ─────── -->
      <div class="flex flex-col gap-4">
        <!-- 小標題列 -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <AlertTriangle :size="20" class="text-amber-600" />
            <div>
              <h2 class="text-lg font-bold text-foreground">
                發現 {{ riskCount }} 項需關注的條款
              </h2>
              <p class="text-sm text-muted-foreground">
                根據分析結果，以下條款可能影響您的權益。
              </p>
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            僅顯示高風險
            <button
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              :class="onlyHighRisk ? 'bg-primary' : 'bg-gray-200'"
              @click="onlyHighRisk = !onlyHighRisk"
            >
              <span
                class="inline-block size-4 rounded-full bg-white shadow transition-transform"
                :class="onlyHighRisk ? 'translate-x-[18px]' : 'translate-x-[2px]'"
              />
            </button>
          </label>
        </div>

        <!-- 風險卡片列表 -->
        <div
          v-for="clause in filteredClauses"
          :key="clause.id"
          class="rounded-xl border transition-all overflow-hidden"
          :class="[riskBorderColor(clause.riskLevel), riskCardBg(clause.riskLevel)]"
        >
          <!-- 卡片標題列 -->
          <div
            class="flex items-center justify-between p-4 cursor-pointer"
            @click="toggleExpand(clause)"
          >
            <div class="flex items-center gap-3">
              <component :is="riskIcon(clause.riskLevel)" :size="18" :class="riskIconColor(clause.riskLevel)" class="shrink-0" />
              <Badge
                class="text-xs font-bold px-2.5 py-0.5 rounded-md"
                :class="riskBadgeStyle(clause.riskLevel)"
              >
                {{ clause.riskLabel }}
              </Badge>
              <span class="font-semibold text-foreground">
                {{ clause.article }}・{{ clause.title }}
              </span>
            </div>
            <ChevronDown
              :size="18"
              class="text-muted-foreground transition-transform shrink-0"
              :class="clause.expanded ? 'rotate-180' : ''"
            />
          </div>

          <!-- 收合時的摘要 -->
          <div v-if="!clause.expanded" class="px-4 pb-4 -mt-1">
            <p class="text-sm text-muted-foreground">{{ clause.riskDescription }}</p>
          </div>

          <!-- 展開的完整內容 -->
          <div v-if="clause.expanded" class="px-4 pb-4">
            <!-- 原文條款 -->
            <div class="mb-3">
              <p class="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <FileText :size="12" />
                原文條款
              </p>
              <div class="rounded-md bg-muted/50 p-3 text-sm leading-relaxed italic text-foreground">
                {{ clause.originalText }}
              </div>
            </div>

            <!-- 白話解釋 + 修改建議（兩欄） -->
            <div
              v-if="clause.riskLevel !== 'safe'"
              class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3"
            >
              <div class="rounded-lg border bg-white p-4">
                <div class="flex items-center gap-2 mb-2">
                  <BookOpen :size="14" class="text-muted-foreground" />
                  <span class="text-sm font-semibold text-foreground">白話解釋</span>
                </div>
                <p class="text-sm text-muted-foreground leading-relaxed">{{ clause.plainExplanation }}</p>
              </div>

              <div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div class="flex items-center gap-2 mb-2">
                  <Handshake :size="14" class="text-primary" />
                  <span class="text-sm font-semibold text-primary">建議應對話術</span>
                </div>
                <p class="text-sm text-muted-foreground leading-relaxed italic">{{ clause.negotiationTip }}</p>
              </div>
            </div>

            <!-- safe 等級的簡單說明 -->
            <div v-else class="mb-3">
              <p class="text-sm text-muted-foreground">{{ clause.plainExplanation }}</p>
            </div>

            <!-- 修改建議 -->
            <div v-if="clause.riskLevel !== 'safe'" class="mb-3">
              <p class="text-xs font-medium text-muted-foreground mb-1">修改建議</p>
              <div class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
                {{ clause.suggestion }}
              </div>
            </div>

            <!-- 法律依據（可展開） -->
            <div
              v-if="clause.legalRefs.length > 0"
              class="rounded-lg border bg-muted/30 overflow-hidden mb-3"
            >
              <button
                class="flex items-center justify-between w-full p-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                @click.stop="toggleLegal(clause)"
              >
                <div class="flex items-center gap-2">
                  <Scale :size="14" class="text-primary" />
                  完整法律依據
                </div>
                <ChevronDown
                  :size="14"
                  class="text-muted-foreground transition-transform"
                  :class="clause.legalExpanded ? 'rotate-180' : ''"
                />
              </button>
              <div v-if="clause.legalExpanded" class="px-3 pb-3">
                <ul class="flex flex-col gap-2">
                  <li v-for="(ref, idx) in clause.legalRefs" :key="idx" class="text-sm">
                    <span class="font-medium text-foreground">{{ ref.law }}：</span>
                    <span class="text-muted-foreground">{{ ref.content }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div v-else-if="clause.legalBasis" class="mb-3">
              <Badge variant="outline" class="text-xs">{{ clause.legalBasis }}</Badge>
            </div>

            <!-- 底部操作按鈕 -->
            <div v-if="clause.riskLevel !== 'safe'" class="flex items-center justify-end">
              <Button size="sm" @click.stop="openNegotiationDialog(clause)">
                <MessageSquareText data-icon="inline-start" />
                AI 談判腳本
              </Button>
            </div>
          </div>
        </div>

        <!-- 底部免責聲明 -->
        <div class="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <Info :size="16" class="text-muted-foreground shrink-0" />
          <p class="text-xs text-muted-foreground">
            以上分析結果僅供參考，實際法律問題建議諮詢專業律師。
          </p>
        </div>
      </div>
    </div>

    <!-- ─── AI 談判腳本 Dialog ─── -->
    <Dialog v-model:open="showNegotiationDialog">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <MessageSquareText :size="20" class="text-primary" />
            AI 談判腳本產生
          </DialogTitle>
          <DialogDescription v-if="negotiationTarget">
            針對「{{ negotiationTarget.article }}・{{ negotiationTarget.title }}」的溝通建議
          </DialogDescription>
        </DialogHeader>

        <!-- 語氣選擇 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm text-muted-foreground shrink-0">溝通語氣：</span>
          <label
            v-for="tone in tones"
            :key="tone.value"
            class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors text-sm"
            :class="selectedTone === tone.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'hover:bg-muted/50'"
          >
            <input
              type="radio"
              name="dialog-tone"
              :value="tone.value"
              v-model="selectedTone"
              class="sr-only"
              @change="regenerateScript"
            />
            {{ tone.label }}
            <span class="text-xs text-muted-foreground">{{ tone.desc }}</span>
          </label>
        </div>

        <!-- 產生中 -->
        <div v-if="isGenerating" class="flex flex-col items-center justify-center py-12">
          <Loader2 :size="32" class="animate-spin text-primary mb-3" />
          <p class="text-muted-foreground text-sm">AI 正在產生談判腳本...</p>
        </div>

        <!-- 已產生 -->
        <div v-else class="flex flex-col gap-4">
          <div class="rounded-lg border bg-muted/20 p-5 text-sm leading-7 whitespace-pre-wrap">
            {{ generatedScript }}
          </div>

          <!-- 使用建議 -->
          <div class="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <ThumbsUp :size="16" class="text-primary shrink-0 mt-0.5" />
            <p class="text-xs text-muted-foreground">
              此腳本僅供參考，建議您根據與房東的實際關係適度調整用語。可透過 LINE 或 Email 直接傳送，或面對面溝通時更口語化使用。
            </p>
          </div>

          <!-- 操作按鈕 -->
          <div class="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" @click="regenerateScript">
              <RotateCcw data-icon="inline-start" />
              重新產生
            </Button>
            <Button size="sm" @click="copyScript">
              <Check v-if="isCopied" data-icon="inline-start" class="text-green-600" />
              <Copy v-else data-icon="inline-start" />
              {{ isCopied ? '已複製' : '複製腳本' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

  </div>
</template>

<style scoped src="./combined.css"></style>
