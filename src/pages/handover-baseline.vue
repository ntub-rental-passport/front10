<script setup lang="ts">
/**
 * 入住前點交（合併操作 + 彙整 + 雙格式匯出）
 * ---------------------------------------------------------
 * 這頁同時負責：
 *   1. 操作：新增點交項目、拍攝搬入照、重拍、刪除
 *   2. 彙整：依房間自動分組、搜尋、篩選
 *   3. 匯出：兩種格式二選一
 *      - 條列清單：每項一行，含勾選框與空白備註欄，列印帶去現場用
 *      - 完整證據包：每項含縮圖、AI 信心、時間、備註，作為退租依據存檔
 *
 * 匯出機制：把對應的 print-only 區塊用 v-if 渲染後呼叫 window.print()，
 * 瀏覽器列印對話框可以選擇實體列印或「另存 PDF」，兩種需求一次滿足。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
  Clock,
  Building2,
  ArrowLeft,
  Trash2,
  Search,
  FileDown,
  FileText,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'

import { useHandover, type HandoverItem } from '@/src/composables/useHandover'

const router = useRouter()
const {
  properties,
  currentProperty,
  selectProperty,
  itemsOfCurrentProperty,
  addItem,
  removeItem,
  addEvidence,
  removeEvidence,
} = useHandover()

// ---------- 新增點交項目 ---------- //

const showAddItemDialog = ref(false)
const newItem = ref({ room: '', name: '' })

function submitAddItem() {
  if (!currentProperty.value) return
  if (!newItem.value.room || !newItem.value.name) return
  addItem({ room: newItem.value.room, name: newItem.value.name })
  newItem.value = { room: '', name: '' }
  showAddItemDialog.value = false
}

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
      addEvidence(itemId, 'baseline', {
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

// ---------- 搜尋 / 篩選 ---------- //

const keyword = ref('')
const onlyDone = ref(false)

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return itemsOfCurrentProperty.value.filter((it) => {
    const baselineEv = it.evidences.find((e) => e.phase === 'baseline')
    if (onlyDone.value && !baselineEv) return false
    if (!kw) return true
    return (
      it.name.toLowerCase().includes(kw) ||
      it.room.toLowerCase().includes(kw) ||
      (baselineEv?.note ?? '').toLowerCase().includes(kw)
    )
  })
})

// ---------- 依房間分組（用於主畫面 + 完整匯出） ---------- //

type Grouped = { room: string; items: HandoverItem[] }
const groupedByRoom = computed<Grouped[]>(() => {
  const map = new Map<string, HandoverItem[]>()
  filteredItems.value.forEach((it) => {
    const arr = map.get(it.room) ?? []
    arr.push(it)
    map.set(it.room, arr)
  })
  return Array.from(map.entries())
    .sort(([, a], [, b]) => (a[0].createdAt < b[0].createdAt ? -1 : 1))
    .map(([room, items]) => ({ room, items }))
})

/** 條列清單匯出：用「所有項目」而不是 filteredItems，避免使用者忘記重置篩選 */
const allGroupedByRoom = computed<Grouped[]>(() => {
  const map = new Map<string, HandoverItem[]>()
  itemsOfCurrentProperty.value.forEach((it) => {
    const arr = map.get(it.room) ?? []
    arr.push(it)
    map.set(it.room, arr)
  })
  return Array.from(map.entries())
    .sort(([, a], [, b]) => (a[0].createdAt < b[0].createdAt ? -1 : 1))
    .map(([room, items]) => ({ room, items }))
})

// ---------- 統計 ---------- //

const stats = computed(() => {
  const all = itemsOfCurrentProperty.value
  return {
    total: all.length,
    done: all.filter((it) => it.evidences.some((e) => e.phase === 'baseline')).length,
    rooms: new Set(all.map((it) => it.room)).size,
  }
})

// ---------- 匯出（雙格式）---------- //

type PrintMode = 'checklist' | 'full' | null
const printMode = ref<PrintMode>(null)

/** 觸發瀏覽器列印對話框；user 可選實體印或「另存為 PDF」。 */
async function triggerPrint(mode: Exclude<PrintMode, null>) {
  printMode.value = mode
  // 等 v-if 把對應的 print-only 區塊渲染進 DOM 後再列印
  await nextTick()
  window.print()
  // window.print() 在大多數瀏覽器是同步的，但保險起見也聽 afterprint
}

function resetPrintMode() {
  printMode.value = null
}

// 列印結束（或使用者取消）時把畫面回復成正常檢視
onMounted(() => {
  window.addEventListener('afterprint', resetPrintMode)
})
onBeforeUnmount(() => {
  window.removeEventListener('afterprint', resetPrintMode)
})

// ---------- 工具 ---------- //

function firstBaseline(it: HandoverItem) {
  return it.evidences.find((e) => e.phase === 'baseline') ?? null
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- =================== 螢幕檢視（列印時隱藏） =================== -->
    <div class="screen-only space-y-6">
      <!-- 麵包屑 + 標題 -->
      <div class="space-y-2">
        <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/app/handover')">
          <ArrowLeft class="mr-1 h-4 w-4" /> 返回點交總覽
        </Button>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">入住前點交</h1>
          <p class="text-muted-foreground">
            搬入時建立家具與設備清單、逐項拍攝，並可匯出條列清單或完整證據包。
          </p>
        </div>
      </div>

      <!-- 租屋處選擇 + 統計 -->
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

          <div v-if="currentProperty" class="mt-4 grid grid-cols-3 gap-2 text-sm">
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">已存證</div>
              <div class="font-semibold">{{ stats.done }} / {{ stats.total }} 項</div>
            </div>
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">涵蓋房間</div>
              <div class="font-semibold">{{ stats.rooms }} 個</div>
            </div>
            <div class="rounded-md border p-2">
              <div class="text-xs text-muted-foreground">總點交項目</div>
              <div class="font-semibold">{{ stats.total }} 項</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 工具列：新增 / 搜尋 / 篩選 / 兩種匯出 -->
      <div v-if="currentProperty" class="flex flex-wrap items-end gap-3 border-b pb-3">
        <Dialog v-model:open="showAddItemDialog">
          <DialogTrigger as-child>
            <Button size="sm">
              <Plus class="mr-1 h-4 w-4" /> 新增點交項目
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增點交項目</DialogTitle>
              <DialogDescription>填入物品所在房間與名稱。</DialogDescription>
            </DialogHeader>
            <div class="space-y-3 py-2">
              <div class="space-y-1">
                <Label>房間</Label>
                <Input v-model="newItem.room" placeholder="例如：廚房" />
              </div>
              <div class="space-y-1">
                <Label>物品名稱</Label>
                <Input v-model="newItem.name" placeholder="例如：抽油煙機" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" @click="showAddItemDialog = false">取消</Button>
              <Button @click="submitAddItem">新增</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div class="flex-1 min-w-[200px] space-y-1">
          <Label class="text-xs">搜尋</Label>
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input v-model="keyword" placeholder="搜尋物品、房間或備註" class="pl-8" />
          </div>
        </div>

        <Button variant="outline" size="sm" @click="onlyDone = !onlyDone">
          {{ onlyDone ? '只看已存證' : '顯示全部' }}
        </Button>

        <!-- 兩種匯出：給使用者明確選擇 -->
        <Button variant="outline" size="sm" @click="triggerPrint('checklist')">
          <FileText class="mr-1 h-4 w-4" /> 匯出條列清單
        </Button>
        <Button size="sm" @click="triggerPrint('full')">
          <FileDown class="mr-1 h-4 w-4" /> 匯出完整證據包
        </Button>
      </div>

      <!-- 主內容：依房間分組，每組內以卡片網格呈現 -->
      <section v-if="currentProperty" class="space-y-6">
        <p v-if="groupedByRoom.length === 0" class="text-sm text-muted-foreground">
          <span v-if="itemsOfCurrentProperty.length === 0">
            這個租屋處還沒有任何點交項目，請按上方「新增點交項目」開始建立清單。
          </span>
          <span v-else>沒有符合條件的項目，請調整搜尋或篩選。</span>
        </p>

        <div v-for="group in groupedByRoom" :key="group.room" class="space-y-3">
          <h2 class="text-lg font-semibold border-l-4 border-primary pl-2">
            {{ group.room }}
            <span class="text-sm font-normal text-muted-foreground">
              （{{ group.items.length }} 項）
            </span>
          </h2>

          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card v-for="it in group.items" :key="it.id">
              <CardHeader class="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle class="text-lg">{{ it.name }}</CardTitle>
                  <CardDescription>{{ it.room }}</CardDescription>
                </div>
                <div class="flex items-center gap-1">
                  <Badge
                    v-if="firstBaseline(it)"
                    variant="secondary"
                    class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                  >
                    <CheckCircle2 class="mr-1 h-3 w-3" /> 已存證
                  </Badge>
                  <Badge v-else variant="destructive">
                    <AlertCircle class="mr-1 h-3 w-3" /> 待拍攝
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    @click="removeItem(it.id)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent class="space-y-2">
                <div v-if="firstBaseline(it)" class="space-y-2">
                  <div class="aspect-video bg-muted rounded-md overflow-hidden">
                    <img
                      :src="firstBaseline(it)!.url"
                      :alt="it.name"
                      class="object-cover w-full h-full"
                      referrerpolicy="no-referrer"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs flex-wrap">
                    <Badge variant="outline" class="gap-1">
                      <Sparkles class="h-3 w-3" />
                      AI 清晰度
                      {{ ((firstBaseline(it)!.aiConfidence ?? 0) * 100).toFixed(0) }}%
                    </Badge>
                    <span class="text-muted-foreground flex items-center gap-1">
                      <Clock class="h-3 w-3" />
                      {{ fmtDate(firstBaseline(it)!.capturedAt) }}
                    </span>
                  </div>
                  <p v-if="firstBaseline(it)!.note" class="text-sm">{{ firstBaseline(it)!.note }}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    class="w-full"
                    @click="removeEvidence(it.id, firstBaseline(it)!.id)"
                  >
                    重拍
                  </Button>
                </div>

                <button
                  v-else
                  class="aspect-video w-full bg-muted/50 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                  @click="capturePhoto(it.id)"
                >
                  <Camera class="h-8 w-8 mb-2" />
                  <span class="text-sm font-medium">點擊拍攝或上傳</span>
                  <span class="text-xs mt-1">系統會 AI 把關清晰度</span>
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Card v-else>
        <CardContent class="pt-6 text-center text-muted-foreground space-y-2">
          <Building2 class="h-8 w-8 mx-auto" />
          <p>請先選擇或新增一個租屋處。</p>
        </CardContent>
      </Card>
    </div>

    <!-- =================== 匯出版面：條列清單 =================== -->
    <!-- 平時 display:none，由 @media print 啟用顯示。內容刻意極簡，
         一頁可塞多項，附勾選框與空白備註欄供現場手寫。 -->
    <div v-if="printMode === 'checklist'" class="print-only print-checklist">
      <div class="print-header">
        <h1 class="text-2xl font-bold">入住點交條列清單</h1>
        <div v-if="currentProperty" class="text-sm mt-1">
          租屋處：{{ currentProperty.alias }}（{{ currentProperty.address }}）
        </div>
        <div class="text-xs">匯出時間：{{ fmtDate(new Date().toISOString()) }}</div>
        <div class="text-xs mt-2 text-gray-600">
          說明：請於點交當天逐項勾選並於備註欄記錄物品現況，回家後再對照拍攝存證。
        </div>
      </div>

      <div
        v-for="group in allGroupedByRoom"
        :key="group.room"
        class="checklist-room"
      >
        <h2 class="checklist-room-title">{{ group.room }}</h2>
        <table class="checklist-table">
          <thead>
            <tr>
              <th style="width: 24px">☐</th>
              <th style="width: 30%">物品</th>
              <th>現況備註</th>
              <th style="width: 18%">已拍攝</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in group.items" :key="it.id">
              <td>☐</td>
              <td>{{ it.name }}</td>
              <td>&nbsp;</td>
              <td>{{ firstBaseline(it) ? '✓' : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="print-signature">
        <div>租客簽名：__________________________</div>
        <div>房東簽名：__________________________</div>
        <div>日期：______年______月______日</div>
      </div>
    </div>

    <!-- =================== 匯出版面：完整證據包 =================== -->
    <!-- 每項一個區塊，含縮圖、AI 信心、時間、備註，作為退租依據存檔。 -->
    <div v-if="printMode === 'full'" class="print-only print-full">
      <div class="print-header">
        <h1 class="text-2xl font-bold">入住點交完整證據包</h1>
        <div v-if="currentProperty" class="text-sm mt-1">
          租屋處：{{ currentProperty.alias }}（{{ currentProperty.address }}）
        </div>
        <div class="text-xs">匯出時間：{{ fmtDate(new Date().toISOString()) }}</div>
        <div class="text-xs mt-1">
          共 {{ stats.total }} 項，其中 {{ stats.done }} 項已存證，涵蓋
          {{ stats.rooms }} 個房間。
        </div>
      </div>

      <div v-for="group in allGroupedByRoom" :key="group.room" class="full-room">
        <h2 class="full-room-title">{{ group.room }}</h2>
        <div class="full-items">
          <div v-for="it in group.items" :key="it.id" class="full-item">
            <div class="full-item-photo">
              <img
                v-if="firstBaseline(it)"
                :src="firstBaseline(it)!.url"
                :alt="it.name"
                referrerpolicy="no-referrer"
              />
              <div v-else class="full-item-no-photo">（未拍攝）</div>
            </div>
            <div class="full-item-meta">
              <div class="full-item-name">{{ it.name }}</div>
              <div v-if="firstBaseline(it)" class="full-item-line">
                拍攝時間：{{ fmtDate(firstBaseline(it)!.capturedAt) }}
              </div>
              <div v-if="firstBaseline(it)?.aiConfidence" class="full-item-line">
                AI 清晰度：{{ ((firstBaseline(it)!.aiConfidence ?? 0) * 100).toFixed(0) }}%
              </div>
              <div v-if="firstBaseline(it)?.note" class="full-item-note">
                備註：{{ firstBaseline(it)!.note }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 預設：螢幕顯示時，print-only 區塊隱藏 ---------- */
.print-only {
  display: none;
}

/* ---------- 列印 ---------- */
@media print {
  /* 列印時：原本的螢幕內容隱藏，只留 print-only */
  :deep(.screen-only) {
    display: none !important;
  }
  .screen-only {
    display: none !important;
  }
  .print-only {
    display: block !important;
  }

  /* 統一字級與邊距，避免瀏覽器預設過大 */
  .print-header {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #999;
  }
}

/* ---------- 條列清單版面 ---------- */
.print-checklist .checklist-room {
  margin-top: 1rem;
  page-break-inside: avoid;
}
.print-checklist .checklist-room-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  background: #f0f0f0;
  padding: 0.25rem 0.5rem;
}
.print-checklist .checklist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.print-checklist .checklist-table th,
.print-checklist .checklist-table td {
  border: 1px solid #999;
  padding: 0.4rem 0.5rem;
  text-align: left;
}
.print-checklist .checklist-table th {
  background: #fafafa;
  font-weight: 600;
}
.print-signature {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-size: 0.9rem;
  page-break-inside: avoid;
}

/* ---------- 完整證據包版面 ---------- */
.print-full .full-room {
  margin-top: 1rem;
  page-break-inside: avoid;
}
.print-full .full-room-title {
  font-size: 1.1rem;
  font-weight: 700;
  border-left: 4px solid #444;
  padding-left: 0.5rem;
  margin-bottom: 0.5rem;
}
.print-full .full-item {
  display: flex;
  gap: 0.75rem;
  border: 1px solid #ccc;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  page-break-inside: avoid;
}
.print-full .full-item-photo {
  width: 140px;
  height: 100px;
  flex-shrink: 0;
  border: 1px solid #ddd;
  background: #f4f4f4;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.print-full .full-item-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.print-full .full-item-no-photo {
  font-size: 0.8rem;
  color: #999;
}
.print-full .full-item-meta {
  flex: 1;
  font-size: 0.85rem;
}
.print-full .full-item-name {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}
.print-full .full-item-line {
  color: #555;
  font-size: 0.8rem;
}
.print-full .full-item-note {
  margin-top: 0.25rem;
}
</style>
