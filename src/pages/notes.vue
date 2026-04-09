<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trash2, Calendar, Clock, User } from 'lucide-vue-next'
import { Button } from '@/components/ui/button/index'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/index'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog/index'
import { Input } from '@/components/ui/input/index'
import { Label } from '@/components/ui/label/index'
import { Textarea } from '@/components/ui/textarea/index'

type PersonalTag = '匯款' | '提醒' | '維護' | '生活' | '其他'
type RoommateTag = '輪值' | '提醒' | '公告'
type Filter = 'all' | 'pending' | 'done'
type MainTab = 'personal' | 'roommate'
type RoommateView = 'list' | 'calendar'

// ── 個人記事資料 ──────────────────────────────────────────
const personalNotes = ref([
  { id: 1, title: '繳交三月房租', content: '記得 ATM 轉帳給陳大文，帳號末四碼 5678', date: '2026-03-10', time: '09:00', tag: '匯款' as PersonalTag, done: false },
  { id: 2, title: '外出前確認事項', content: '帶鑰匙、悠遊卡、雨傘（週末有雨）', date: '2026-03-15', time: '08:30', tag: '提醒' as PersonalTag, done: false },
  { id: 3, title: '冷氣濾網清洗', content: '上次清洗是一月，建議每三個月一次', date: '2026-03-20', time: '', tag: '維護' as PersonalTag, done: true },
])

// ── 室友協作資料 ──────────────────────────────────────────
const roommateTasks = ref([
  { id: 1, title: '倒垃圾', content: '週四晚上 20:30 前，記得分類廚餘', date: '2026-03-13', tag: '輪值' as RoommateTag, assignee: '小林', creator: '小林', updatedDate: '03/12', done: false },
  { id: 2, title: '清潔廁所', content: '每週六早上輪流清潔，請確認清潔劑夠用', date: '2026-03-16', tag: '輪值' as RoommateTag, assignee: '阿明', creator: '小林', updatedDate: '03/10', done: false },
  { id: 3, title: '房東來訪通知', content: '3/18 下午 2 點房東要來檢查熱水器，請保持客廳整潔', date: '2026-03-18', tag: '公告' as RoommateTag, assignee: '全體', creator: '小林', updatedDate: '03/11', done: false },
  { id: 4, title: '繳水電費', content: '三月份水費 $420、電費 $1,240，請各自匯款給小林', date: '2026-03-14', tag: '提醒' as RoommateTag, assignee: '全體', creator: '阿明', updatedDate: '03/09', done: false },
  { id: 5, title: '申請晾衣架', content: '陽台晾衣架已壞，小美已完成申請修繕', date: '2026-03-10', tag: '輪值' as RoommateTag, assignee: '小美', creator: '小美', updatedDate: '03/10', done: true },
])

// ── 週曆靜態資料 ──────────────────────────────────────────
const weekDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
const weekDates = [8, 9, 10, 11, 12, 13, 14]
const todayIndex = 5 // 週五 = 13

// ── UI 狀態 ───────────────────────────────────────────────
const activeTab = ref<MainTab>('personal')
const personalFilter = ref<Filter>('all')
const roommateFilter = ref<Filter>('all')
const roommateView = ref<RoommateView>('list')
const showRoommateSection = ref(true) // 協作區開關
const showDialog = ref(false)

// ── Dialog 表單 ───────────────────────────────────────────
const personalTags: PersonalTag[] = ['匯款', '提醒', '維護', '生活', '其他']
const dialogForm = ref({ title: '', content: '', date: '2026-03-13', time: '', tag: '' as PersonalTag | '' })

function resetDialog() {
  dialogForm.value = { title: '', content: '', date: '2026-03-13', time: '', tag: '' }
}

function saveNote() {
  if (!dialogForm.value.title.trim()) return
  personalNotes.value.push({
    id: Date.now(),
    title: dialogForm.value.title,
    content: dialogForm.value.content,
    date: dialogForm.value.date,
    time: dialogForm.value.time,
    tag: (dialogForm.value.tag || '其他') as PersonalTag,
    done: false,
  })
  showDialog.value = false
  resetDialog()
}

// ── Computed ──────────────────────────────────────────────
const filteredPersonal = computed(() => {
  if (personalFilter.value === 'pending') return personalNotes.value.filter(n => !n.done)
  if (personalFilter.value === 'done') return personalNotes.value.filter(n => n.done)
  return personalNotes.value
})

const filteredRoommate = computed(() => {
  if (roommateFilter.value === 'pending') return roommateTasks.value.filter(n => !n.done)
  if (roommateFilter.value === 'done') return roommateTasks.value.filter(n => n.done)
  return roommateTasks.value
})

const personalStats = computed(() => ({
  pending: personalNotes.value.filter(n => !n.done).length,
  todayReminder: 0,
  done: personalNotes.value.filter(n => n.done).length,
}))

const personalTagStats = computed(() => {
  const counts: Record<string, number> = {}
  personalNotes.value.forEach(n => { counts[n.tag] = (counts[n.tag] || 0) + 1 })
  return Object.entries(counts)
})

const roommateStats = computed(() => ({
  pending: roommateTasks.value.filter(n => !n.done).length,
  done: roommateTasks.value.filter(n => n.done).length,
}))

const assigneeList = ['小林', '阿明', '小美']
const roommateAssigneeStats = computed(() =>
  assigneeList.map(name => {
    const mine = roommateTasks.value.filter(t => t.assignee === name)
    return { name, done: mine.filter(t => t.done).length, total: mine.length }
  })
)

const roommateTagStats = computed(() => {
  const counts: Record<string, number> = {}
  roommateTasks.value.forEach(t => { counts[t.tag] = (counts[t.tag] || 0) + 1 })
  return Object.entries(counts)
})

// ── 工具函式 ──────────────────────────────────────────────
function tagClass(tag: string): string {
  const m: Record<string, string> = {
    匯款: 'bg-red-100 text-red-700',
    提醒: 'bg-blue-100 text-blue-700',
    維護: 'bg-green-100 text-green-700',
    輪值: 'bg-sky-100 text-sky-700',
    公告: 'bg-orange-100 text-orange-700',
    生活: 'bg-teal-100 text-teal-700',
    其他: 'bg-gray-100 text-gray-600',
  }
  return m[tag] ?? 'bg-gray-100 text-gray-600'
}

function tagBarColor(tag: string): string {
  const m: Record<string, string> = {
    匯款: '#f87171', 提醒: '#60a5fa', 維護: '#4ade80',
    輪值: '#38bdf8', 公告: '#fb923c', 生活: '#2dd4bf',
  }
  return m[tag] ?? '#9ca3af'
}

function calendarCardBg(tag: string): string {
  const m: Record<string, string> = {
    輪值: '#dbeafe', 提醒: '#fef9c3', 公告: '#ffedd5',
  }
  return m[tag] ?? '#f3f4f6'
}

function calendarCardText(tag: string): string {
  const m: Record<string, string> = {
    輪值: '#1d4ed8', 提醒: '#92400e', 公告: '#c2410c',
  }
  return m[tag] ?? '#374151'
}

function getTasksForDay(date: number) {
  return roommateTasks.value.filter(t => parseInt(t.date.split('-')[2]) === date)
}

function togglePersonalDone(id: number) {
  const n = personalNotes.value.find(n => n.id === id)
  if (n) n.done = !n.done
}
function deletePersonal(id: number) {
  const i = personalNotes.value.findIndex(n => n.id === id)
  if (i !== -1) personalNotes.value.splice(i, 1)
}
function toggleRoommateDone(id: number) {
  const t = roommateTasks.value.find(t => t.id === id)
  if (t) t.done = !t.done
}
function deleteRoommate(id: number) {
  const i = roommateTasks.value.findIndex(t => t.id === id)
  if (i !== -1) roommateTasks.value.splice(i, 1)
}
</script>

<template>
  <div class="pb-20 md:pb-0">
    <!-- 頁面標題列 -->
    <div class="flex items-start justify-between mb-5">
      <div>
        <p class="text-xs text-muted-foreground">租屋護照</p>
        <h1 class="text-2xl font-bold tracking-tight">記事板</h1>
      </div>
      <div class="flex items-center gap-2 mt-1">
        <span class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-green-600 font-medium">
          <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
          資料安全
        </span>
        <Button size="sm" variant="outline" class="rounded-full text-xs h-7">+ AI 就緒</Button>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <!-- ── 左側主內容 ─────────────────────────────────── -->
      <div class="flex-1 min-w-0">

        <!-- Tab 切換 -->
        <div class="flex items-center gap-2 mb-3">
          <button
            :class="[
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === 'personal' ? 'bg-sky-100 text-sky-700' : 'text-muted-foreground hover:bg-muted'
            ]"
            @click="activeTab = 'personal'"
          >
            個人記事
            <span :class="['rounded-full px-1.5 py-0.5 text-xs leading-none', activeTab === 'personal' ? 'bg-sky-200 text-sky-800' : 'bg-muted text-muted-foreground']">
              {{ personalNotes.filter(n => !n.done).length }}
            </span>
          </button>

          <template v-if="showRoommateSection">
            <button
              :class="[
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                activeTab === 'roommate' ? 'bg-sky-100 text-sky-700' : 'text-muted-foreground hover:bg-muted'
              ]"
              @click="activeTab = 'roommate'"
            >
              室友協作
              <span :class="['rounded-full px-1.5 py-0.5 text-xs leading-none', activeTab === 'roommate' ? 'bg-sky-200 text-sky-800' : 'bg-muted text-muted-foreground']">
                {{ roommateTasks.filter(t => !t.done).length }}
              </span>
            </button>
            <!-- 關閉協作區 -->
            <button
              class="h-5 w-5 rounded-full text-muted-foreground hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-xs transition-colors"
              title="關閉室友協作區"
              @click="showRoommateSection = false; activeTab = 'personal'"
            >✕</button>
          </template>
          <button
            v-else
            class="rounded-full px-3 py-1 text-xs text-muted-foreground border hover:bg-muted transition-colors"
            @click="showRoommateSection = true"
          >+ 啟用協作</button>
        </div>

        <!-- 篩選列 + 新增按鈕 -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex gap-1">
            <template v-if="activeTab === 'personal'">
              <button
                v-for="[val, label] in [['all','全部'],['pending','待辦'],['done','完成']]"
                :key="val"
                :class="['rounded-full px-3 py-1 text-sm transition-colors', personalFilter === val ? 'bg-muted font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted']"
                @click="personalFilter = val as Filter"
              >{{ label }}</button>
            </template>
            <template v-else>
              <button
                v-for="[val, label] in [['all','全部'],['pending','待辦'],['done','完成']]"
                :key="val"
                :class="['rounded-full px-3 py-1 text-sm transition-colors', roommateFilter === val ? 'bg-muted font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted']"
                @click="roommateFilter = val as Filter"
              >{{ label }}</button>
              <button
                :class="['rounded-md px-2 py-1 text-base leading-none transition-colors', roommateView === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted']"
                title="清單視圖"
                @click="roommateView = 'list'"
              >≡</button>
              <button
                :class="['rounded-md px-2 py-1 text-base leading-none transition-colors', roommateView === 'calendar' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted']"
                title="週曆視圖"
                @click="roommateView = 'calendar'"
              >▦</button>
            </template>
          </div>
          <Button
            size="sm"
            class="rounded-full bg-sky-500 hover:bg-sky-600 text-white px-4 h-8"
            @click="showDialog = true"
          >+ 新增</Button>
        </div>

        <!-- ── 個人記事列表 ──────────────────────────── -->
        <div v-if="activeTab === 'personal'" class="space-y-3">
          <div
            v-for="note in filteredPersonal"
            :key="note.id"
            class="rounded-2xl bg-white shadow-sm border border-gray-100 p-4 flex items-start gap-3"
          >
            <!-- Checkbox -->
            <button
              :class="[
                'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors flex items-center justify-center',
                note.done ? 'bg-sky-400 border-sky-400 text-white' : 'border-gray-300 hover:border-sky-400'
              ]"
              @click="togglePersonalDone(note.id)"
            >
              <svg v-if="note.done" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <!-- 內容 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span :class="['font-medium', note.done ? 'line-through text-muted-foreground' : 'text-gray-800']">
                  {{ note.title }}
                </span>
                <span :class="['rounded-full px-2 py-0.5 text-xs font-medium shrink-0', tagClass(note.tag)]">
                  {{ note.tag }}
                </span>
              </div>
              <p :class="['text-sm mb-2', note.done ? 'text-muted-foreground' : 'text-gray-500']">{{ note.content }}</p>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span class="flex items-center gap-1"><Calendar class="h-3 w-3" />{{ note.date }}</span>
                <span v-if="note.time" class="flex items-center gap-1"><Clock class="h-3 w-3" />{{ note.time }}</span>
              </div>
            </div>
            <!-- 刪除 -->
            <button class="text-gray-300 hover:text-red-400 transition-colors mt-0.5 shrink-0" @click="deletePersonal(note.id)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>

          <p v-if="filteredPersonal.length === 0" class="text-center text-sm text-muted-foreground py-8">
            沒有符合條件的記事
          </p>
        </div>

        <!-- ── 室友協作：清單視圖 ─────────────────────── -->
        <div v-else-if="roommateView === 'list'" class="space-y-3">
          <div
            v-for="task in filteredRoommate"
            :key="task.id"
            class="rounded-2xl bg-white shadow-sm border border-gray-100 p-4 flex items-start gap-3"
          >
            <button
              :class="[
                'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors flex items-center justify-center',
                task.done ? 'bg-sky-400 border-sky-400 text-white' : 'border-gray-300 hover:border-sky-400'
              ]"
              @click="toggleRoommateDone(task.id)"
            >
              <svg v-if="task.done" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span :class="['font-medium', task.done ? 'line-through text-muted-foreground' : 'text-gray-800']">
                  {{ task.title }}
                </span>
                <span :class="['rounded-full px-2 py-0.5 text-xs font-medium shrink-0', tagClass(task.tag)]">
                  {{ task.tag }}
                </span>
              </div>
              <p class="text-sm text-gray-500 mb-2">{{ task.content }}</p>
              <div class="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span class="flex items-center gap-1"><Calendar class="h-3 w-3" />{{ task.date }}</span>
                <span class="flex items-center gap-1"><User class="h-3 w-3" />負責：{{ task.assignee }}</span>
                <span>建立：{{ task.creator }}</span>
                <span>更新 {{ task.updatedDate }}</span>
              </div>
            </div>
            <button class="text-gray-300 hover:text-red-400 transition-colors mt-0.5 shrink-0" @click="deleteRoommate(task.id)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>

          <p v-if="filteredRoommate.length === 0" class="text-center text-sm text-muted-foreground py-8">
            沒有符合條件的協作事項
          </p>
        </div>

        <!-- ── 室友協作：週曆視圖 ─────────────────────── -->
        <div v-else class="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
          <h3 class="text-base font-semibold mb-5">本週分工排程</h3>
          <div class="grid grid-cols-7 gap-2">
            <div v-for="(day, idx) in weekDays" :key="'cal-' + idx" class="text-center">
              <p class="text-xs text-muted-foreground mb-2">{{ day }}</p>
              <div :class="[
                'w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm font-semibold mb-2',
                idx === todayIndex ? 'bg-sky-500 text-white' : 'text-gray-700'
              ]">{{ weekDates[idx] }}</div>
              <div class="space-y-1">
                <div
                  v-for="t in getTasksForDay(weekDates[idx])"
                  :key="t.id"
                  class="rounded-lg px-1.5 py-1.5 text-xs text-left"
                  :style="{ background: calendarCardBg(t.tag), color: calendarCardText(t.tag) }"
                >
                  <div class="font-medium truncate">{{ t.title }}</div>
                  <div class="truncate opacity-70 text-[10px]">{{ t.assignee }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 圖例 -->
          <div class="flex gap-2 mt-5 flex-wrap">
            <span
              v-for="[tag] in roommateTagStats"
              :key="tag"
              :class="['rounded-full px-3 py-1 text-xs font-medium', tagClass(tag)]"
            >{{ tag }}</span>
          </div>
        </div>

      </div>

      <!-- ── 右側摘要 ───────────────────────────────────── -->
      <div class="w-full lg:w-68 shrink-0 space-y-3">

        <!-- 個人摘要 -->
        <template v-if="activeTab === 'personal'">
          <Card class="shadow-sm rounded-2xl">
            <CardHeader class="pb-2 pt-4 px-5">
              <CardTitle class="text-sm">個人摘要</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3 pb-4 px-5">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">待辦事項</span>
                <span class="text-xl font-bold text-sky-500">{{ personalStats.pending }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">今日提醒</span>
                <span class="text-xl font-bold text-amber-500">{{ personalStats.todayReminder }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">已完成</span>
                <span class="text-xl font-bold text-green-500">{{ personalStats.done }}</span>
              </div>
            </CardContent>
          </Card>

          <Card class="shadow-sm rounded-2xl">
            <CardHeader class="pb-2 pt-4 px-5">
              <CardTitle class="text-sm">標籤分佈</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2.5 pb-4 px-5">
              <div v-for="[tag, count] in personalTagStats" :key="tag" class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground w-8 shrink-0">{{ tag }}</span>
                <div class="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :style="{ width: (count / personalNotes.length * 100) + '%', background: tagBarColor(tag) }"
                  />
                </div>
                <span class="text-xs text-muted-foreground w-3 text-right">{{ count }}</span>
              </div>
            </CardContent>
          </Card>
        </template>

        <!-- 協作摘要 -->
        <template v-else>
          <Card class="shadow-sm rounded-2xl">
            <CardHeader class="pb-2 pt-4 px-5">
              <CardTitle class="text-sm">協作摘要</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3 pb-4 px-5">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">待處理</span>
                <span class="text-xl font-bold text-sky-500">{{ roommateStats.pending }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">已完成</span>
                <span class="text-xl font-bold text-green-500">{{ roommateStats.done }}</span>
              </div>
            </CardContent>
          </Card>

          <Card class="shadow-sm rounded-2xl">
            <CardHeader class="pb-2 pt-4 px-5">
              <CardTitle class="text-sm">室友負責分佈</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3 pb-4 px-5">
              <div v-for="p in roommateAssigneeStats" :key="p.name" class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium text-gray-700">{{ p.name }}</span>
                  <span class="text-muted-foreground">{{ p.done }}/{{ p.total }} 完成</span>
                </div>
                <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-sky-400 transition-all"
                    :style="{ width: p.total ? (p.done / p.total * 100) + '%' : '0%' }"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="shadow-sm rounded-2xl">
            <CardHeader class="pb-2 pt-4 px-5">
              <CardTitle class="text-sm">事項類型</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2 pb-4 px-5">
              <div v-for="[tag, count] in roommateTagStats" :key="tag" class="flex items-center justify-between">
                <span :class="['rounded-full px-2.5 py-0.5 text-xs font-medium', tagClass(tag)]">{{ tag }}</span>
                <span class="text-sm text-muted-foreground">{{ count }} 項</span>
              </div>
            </CardContent>
          </Card>
        </template>

      </div>
    </div>

    <!-- ── 新增記事 Dialog ─────────────────────────────── -->
    <Dialog v-model:open="showDialog">
      <DialogContent class="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-base">
            <span>✏️</span> 新增個人記事
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-4 mt-1">
          <div class="space-y-1.5">
            <Label class="text-sm text-muted-foreground">標題</Label>
            <Input v-model="dialogForm.title" placeholder="輸入事項標題…" class="rounded-xl" />
          </div>
          <div class="space-y-1.5">
            <Label class="text-sm text-muted-foreground">內容備註</Label>
            <Textarea v-model="dialogForm.content" placeholder="補充說明（可空白）" class="min-h-[80px] rounded-xl" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-sm text-muted-foreground">日期</Label>
              <Input v-model="dialogForm.date" type="date" class="rounded-xl" />
            </div>
            <div class="space-y-1.5">
              <Label class="text-sm text-muted-foreground">提醒時間</Label>
              <Input v-model="dialogForm.time" type="time" class="rounded-xl" />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label class="text-sm text-muted-foreground">標籤</Label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tag in personalTags"
                :key="tag"
                :class="[
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  dialogForm.tag === tag
                    ? tagClass(tag) + ' border-transparent'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                ]"
                @click="dialogForm.tag = tag"
              >{{ tag }}</button>
            </div>
          </div>
          <div class="flex gap-3 pt-1">
            <Button variant="outline" class="flex-1 rounded-xl" @click="showDialog = false; resetDialog()">取消</Button>
            <Button class="flex-1 rounded-xl bg-sky-500 hover:bg-sky-600" @click="saveNote">儲存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
